// ════════════════════════════════════════════════════════════════════════════
// Avisos no celular (Web Push) — roda na VPS sem parar (PM2: "avisos").
// A cada minuto confere as situações abaixo e manda cada aviso uma vez só,
// pra quem ligou aquele aviso em Config › Notificações do OPS.
//
// Instalação (pasta /opt/digoo-ofertas-ml, a mesma do sincronizador):
//   npm install web-push
//   pm2 start /opt/digoo-ofertas-ml/avisos.mjs --name avisos
// Na primeira vez cria vapid.json (chave de envio) nesta pasta — ela NUNCA sai da VPS.
// Só a chave pública vai pro Firebase (/push_config/vapid_public), pro OPS conseguir se inscrever.
// ════════════════════════════════════════════════════════════════════════════
import { createRequire } from "module";
import fs from "fs";

const PICKING = "/opt/digoo-picking-sync";
const requirePicking = createRequire(`${PICKING}/package.json`);
const requireLocal = createRequire(import.meta.url);
const admin = requirePicking("firebase-admin");
const webpush = requireLocal("web-push");
admin.initializeApp({
  credential: admin.credential.cert(requirePicking(`${PICKING}/serviceAccount.json`)),
  databaseURL: "https://digoo-equipe-default-rtdb.firebaseio.com",
});
const db = admin.database();
const log = (...a) => console.log(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), ...a);

// ── Chave de envio (VAPID) ────────────────────────────────────────────────────
const VAPID_FILE = new URL("./vapid.json", import.meta.url);
let vapid;
if (fs.existsSync(VAPID_FILE)) vapid = JSON.parse(fs.readFileSync(VAPID_FILE, "utf8"));
else {
  vapid = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapid), { mode: 0o600 });
  log("Chave de envio criada em", VAPID_FILE.pathname);
}
webpush.setVapidDetails("https://diogobrum97-stack.github.io/digoo-equipe/", vapid.publicKey, vapid.privateKey);
await db.ref("/push_config/vapid_public").set(vapid.publicKey);

// ── Estado ao vivo (o Firebase manda só o que muda) ───────────────────────────
const vivo = { inscricoes: {}, prefs: {}, ofertas: { filial: {}, matriz: {} }, meta: { filial: null, matriz: null }, caidas: { filial: {}, matriz: {} }, tokens: {} };
db.ref("/push_inscricoes").on("value", s => { vivo.inscricoes = s.val() || {}; });
db.ref("/push_prefs").on("value", s => { vivo.prefs = s.val() || {}; });
for (const conta of ["filial", "matriz"]) {
  db.ref(`/ofertas_ml_cache/${conta}/itens`).on("value", s => { vivo.ofertas[conta] = s.val() || {}; });
  db.ref(`/ofertas_ml_cache/${conta}/meta`).on("value", s => { vivo.meta[conta] = s.val(); });
  db.ref(`/promo_alertas/${conta}/caidas`).on("value", s => { vivo.caidas[conta] = s.val() || {}; });
}
for (const p of ["ml_token", "ml_token_filial"]) db.ref(p).on("value", s => { vivo.tokens[p] = s.val(); });
vivo.semEstoque = { filial: {}, matriz: {} };
for (const conta of ["filial", "matriz"]) db.ref(`/promo_alertas/${conta}/sem_estoque`).on("value", s => { vivo.semEstoque[conta] = s.val() || {}; });

// Mesmos padrões da tela Config › Notificações
const PADRAO = {
  promo_caiu: true, promo_vence: true, promo_proposta: false,
  pergunta_nova: false, pergunta_1h: true, reclamacao: true, experiencia: true,
  vendas_baixo: true, resumo_dia: true, sem_estoque: true,
  tarefa_nova: true, tarefa_concluida: true, conta_vence: true,
  token_ml: true, bling: true, sync_parado: true, nao_perturbe: true,
};
const quer = (usuario, tipo) => { const p = vivo.prefs[usuario] || {}; return tipo in p ? !!p[tipo] : !!PADRAO[tipo]; };
const CONTA = { filial: "Filial SP", matriz: "Matriz RS" };
const TIPOS = { PRICE_DISCOUNT: "Desconto por porcentagem", DEAL: "Campanha do ML", SMART: "Campanha com redução", SELLER_CAMPAIGN: "Campanha própria", LIGHTNING: "Oferta relâmpago", SMART_LIGHTNING: "Oferta relâmpago", DOD: "Oferta do dia", MARKETPLACE_CAMPAIGN: "Campanha do ML", PRE_NEGOTIATED: "Desconto negociado", VOLUME: "Desconto por volume" };
const nomePromo = o => o?.nome || o?.promo_nome || TIPOS[o?.tipo || o?.promo_tipo] || "promoção";
const curto = (t, n = 60) => !t ? "" : t.length > n ? t.slice(0, n - 1) + "…" : t;
const listaOf = it => Array.isArray(it?.ofertas) ? it.ofertas : Object.values(it?.ofertas || {});
const finalDe = o => o?.preco || o?.preco_sugerido || 0;
const brt = (t = Date.now()) => new Date(t - 3 * 3600e3);
const horaBRT = () => brt().getUTCHours();
const diaBRT = () => brt().toISOString().slice(0, 10);
const silencio = () => { const h = horaBRT(); return h >= 22 || h < 8; };
const chaveOk = k => k.replace(/[.#$/[\]]/g, "_").slice(0, 700);

// ── Envio ─────────────────────────────────────────────────────────────────────
async function mandarPara(usuario, aviso) {
  const subs = vivo.inscricoes[usuario] || {};
  let ok = 0;
  for (const [id, s] of Object.entries(subs)) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(aviso), { TTL: 12 * 3600 });
      ok++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { await db.ref(`/push_inscricoes/${usuario}/${id}`).remove(); log(`[${usuario}] aparelho saiu das notificações — removido`); }
      else log(`[${usuario}] falha ao enviar:`, e.statusCode || "", e.body || e.message);
    }
  }
  return ok;
}

// Manda um aviso uma vez só (chave), pra cada usuário que ligou esse tipo.
// Avisos não urgentes, no horário de silêncio, ficam guardados e chegam às 8h.
async function avisar(tipo, chave, aviso, urgente = false, para = null) {
  const k = chaveOk(chave);
  const ref = db.ref(`/push_enviados/${k}`);
  if ((await ref.once("value")).exists()) return;
  await ref.set(Date.now());
  aviso.tag = aviso.tag || k.slice(0, 60);
  for (const usuario of Object.keys(vivo.inscricoes)) {
    if (para && !para.includes(usuario)) continue;
    if (!quer(usuario, tipo)) continue;
    if (!urgente && silencio() && quer(usuario, "nao_perturbe")) {
      await db.ref(`/push_adiados/${usuario}/${k}`).set({ ...aviso, em: Date.now() });
      continue;
    }
    const n = await mandarPara(usuario, aviso);
    if (n) log(`[${usuario}] ${tipo}: ${aviso.title} — ${aviso.body}`);
  }
}

async function liberarAdiados() {
  if (silencio()) return;
  const tudo = (await db.ref("/push_adiados").once("value")).val() || {};
  for (const [usuario, lista] of Object.entries(tudo)) {
    const avisos = Object.values(lista).sort((a, b) => a.em - b.em);
    if (avisos.length > 4) {
      await mandarPara(usuario, { title: `${avisos.length} avisos da noite`, body: avisos.slice(0, 3).map(a => a.title).join(" · ") + " …", abrir: { tela: "dashboard" }, tag: "noite" });
    } else for (const a of avisos) { delete a.em; await mandarPara(usuario, a); }
    await db.ref(`/push_adiados/${usuario}`).remove();
    log(`[${usuario}] ${avisos.length} aviso(s) da noite enviados`);
  }
}

// ── Situações conferidas a cada minuto ────────────────────────────────────────
async function conferir() {
  const agora = Date.now();
  for (const conta of ["filial", "matriz"]) {
    // Promoção caiu (a lista é montada pelo sincronizador "ofertas-ml")
    for (const a of Object.values(vivo.caidas[conta] || {})) {
      if (!a?.caiu_em || agora - a.caiu_em > 6 * 3600e3) continue;
      const extra = a.motivo === "inativo" ? " Anúncio pausado ou inativo." : a.estoque === 0 ? " Estoque zerado." : "";
      await avisar("promo_caiu", `caiu_${conta}_${a.item_id}_${a.caiu_em}`, {
        title: `Promoção caiu · ${CONTA[conta]}`,
        body: `${curto(a.titulo || a.item_id)} ficou sem promoção (${nomePromo(a)}).${extra}`,
        abrir: { tela: "ofertas", conta, item: a.item_id },
      });
    }
    // Promoção vence em até 24 h sem outra programada depois
    for (const it of Object.values(vivo.ofertas[conta] || {})) {
      const ofs = listaOf(it);
      const ini = ofs.filter(o => o?.status === "started" && finalDe(o) > 0);
      if (!ini.length) continue;
      const v = ini.reduce((x, y) => finalDe(y) < finalDe(x) ? y : x);
      const fim = v.fim ? new Date(v.fim).getTime() : null;
      if (!fim || fim < agora || fim - agora > 24 * 3600e3) continue;
      if (ofs.some(o => o !== v && (o?.status === "started" || o?.status === "pending") && (!o.fim || new Date(o.fim).getTime() > fim))) continue;
      const d = brt(fim), hora = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
      const quando = d.toISOString().slice(0, 10) === diaBRT() ? `hoje às ${hora}` : `amanhã às ${hora}`;
      await avisar("promo_vence", `vence_${conta}_${it.item_id}_${v.promotion_id || v.tipo}_${fim}`, {
        title: `Promoção vence ${quando.split(" ")[0]} · ${CONTA[conta]}`,
        body: `${curto(it.titulo || it.item_id)}: ${nomePromo(v)} acaba ${quando}.`,
        abrir: { tela: "ofertas", conta, item: it.item_id },
      });
    }
    // Anúncio pausado por falta de estoque (detectado pelo sincronizador)
    for (const a of Object.values(vivo.semEstoque[conta] || {})) {
      if (!a?.em || agora - a.em > 6 * 3600e3) continue;
      await avisar("sem_estoque", `semest_${conta}_${a.item_id}_${a.em}`, {
        title: `Anúncio pausado sem estoque · ${CONTA[conta]}`,
        body: `${curto(a.titulo || a.item_id)}${a.sku ? ` (${a.sku})` : ""} foi pausado pelo ML por estoque zerado.`,
        abrir: { tela: "estoque" },
      });
    }
    // Sincronização parada
    const g = vivo.meta[conta]?.gerado_em;
    if (g && agora - g > 15 * 60 * 1000) {
      await avisar("sync_parado", `sync_${conta}_${g}`, {
        title: `Ofertas paradas · ${CONTA[conta]}`,
        body: `As ofertas do ML não atualizam há ${Math.round((agora - g) / 60000)} min. Confira o processo ofertas-ml na VPS.`,
        abrir: { tela: "ofertas", conta },
      }, true);
    }
  }
  // Token do ML vencido há mais de 15 min (o sincronizador renova sozinho; se venceu, a renovação falhou)
  for (const [p, conta] of [["ml_token", "matriz"], ["ml_token_filial", "filial"]]) {
    const t = vivo.tokens[p];
    if (t?.access_token && t.expires_at && agora - t.expires_at > 15 * 60 * 1000) {
      await avisar("token_ml", `token_${conta}_${t.expires_at}`, {
        title: `Token do ML expirou · ${CONTA[conta]}`,
        body: "A renovação automática falhou. Reconecte em Config › APIs.",
        abrir: { tela: "apis" },
      }, true);
    }
  }
  // Resumo das propostas com redução de tarifa — 1x por dia, a partir das 9h
  const h = horaBRT();
  if (h >= 9 && h < 12) {
    const n = {};
    for (const conta of ["filial", "matriz"]) n[conta] = Object.values(vivo.ofertas[conta] || {}).reduce((s, it) => s + listaOf(it).filter(o => o?.status === "candidate" && o.meli_pct > 0).length, 0);
    if (n.filial + n.matriz > 0) {
      await avisar("promo_proposta", `proposta_${diaBRT()}`, {
        title: `${n.filial + n.matriz} propostas com redução de tarifa`,
        body: `Filial: ${n.filial} · Matriz: ${n.matriz}. O ML paga parte do desconto.`,
        abrir: { tela: "ofertas", conta: n.filial >= n.matriz ? "filial" : "matriz", filtro: "oportunidades" },
      });
    }
  }
  for (const [nome, fn] of [["vendas", conferirVendas], ["contas", conferirContas], ["perguntas", conferirPerguntasAtrasadas], ["bling", conferirBling], ["experiencia", conferirExperiencia]]) {
    try { await fn(); } catch (e) { log(`erro (${nome}):`, e.message); }
  }
  await liberarAdiados();
}


// ═════════════════════════ Etapa 2: atendimento, vendas, equipe, financeiro ═════
const BACKEND = "https://digoo-backend.vercel.app";
const TOKEN_PATH = { filial: "ml_token_filial", matriz: "ml_token" };
const tokenML = conta => vivo.tokens[TOKEN_PATH[conta]]?.access_token || null;
const contaDoSeller = uid => Object.keys(TOKEN_PATH).find(c => String(vivo.tokens[TOKEN_PATH[c]]?.user_id) === String(uid)) || null;
async function ml(url, conta) {
  const t = tokenML(conta); if (!t) throw new Error(`sem token do ML (${conta})`);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`ML HTTP ${r.status} em ${url.split("?")[0].replace("https://api.mercadolibre.com", "")}`);
  return r.json();
}
const fmtR = v => "R$ " + Math.round(v || 0).toLocaleString("pt-BR");
const minutoBRT = () => brt().getUTCMinutes();
const somaHoras = (h, ate) => (Array.isArray(h) ? h : Object.values(h || {})).slice(0, ate).reduce((s, v) => s + (Number(v) || 0), 0);
const diaMenos = (dia, n) => new Date(Date.parse(dia + "T12:00:00Z") - n * 864e5).toISOString().slice(0, 10);
const tituloItem = async (conta, id) => { try { return (await ml(`https://api.mercadolibre.com/items/${id}?attributes=title`, conta)).title || id; } catch { return id; } };
const inicio = Date.now();

// Pergunta nova (na hora, pelo webhook do ML)
db.ref("webhooks/messages").limitToLast(30).on("child_added", async s => {
  try {
    const ev = s.val() || {};
    if (!(ev.receivedAt >= inicio)) return;              // só o que chegou depois de ligar
    if (ev.topic !== "questions") return;
    const id = (ev.resource || "").match(/\/questions\/(\d+)/)?.[1]; if (!id) return;
    const conta = contaDoSeller(ev.userId); if (!conta) return;
    await new Promise(r => setTimeout(r, 3000));                 // dá tempo do ML publicar a pergunta
    const q = await ml(`https://api.mercadolibre.com/questions/${id}?api_version=4`, conta);
    if (q.status !== "UNANSWERED") return;
    const titulo = await tituloItem(conta, q.item_id);
    await avisar("pergunta_nova", `perg_${id}`, {
      title: `Pergunta nova · ${CONTA[conta]}`,
      body: `${curto(titulo, 45)}: "${curto(q.text, 110)}"`,
      abrir: { tela: "perguntas" },
    });
  } catch (e) { log("erro (pergunta nova):", e.message); }
});

// Reclamação ou mediação nova (na hora, pelo webhook do ML)
db.ref("webhooks/post_purchase").limitToLast(30).on("child_added", async s => {
  try {
    const ev = s.val() || {};
    if (!(ev.receivedAt >= inicio)) return;              // só o que chegou depois de ligar
    const id = (ev.resource || "").match(/\/claims\/(\d+)/)?.[1]; if (!id) return;
    const conta = contaDoSeller(ev.userId) || "filial";
    const c = await ml(`https://api.mercadolibre.com/post-purchase/v1/claims/${id}`, conta);
    if (!["opened", "running"].includes(c.status)) return;
    const mediacao = c.stage === "dispute";
    await avisar("reclamacao", `recl_${id}_${c.stage || "claim"}`, {
      title: `${mediacao ? "Mediação aberta" : "Reclamação nova"} · ${CONTA[conta]}`,
      body: `Pedido ${c.resource_id || ""}${c.reason_id ? ` · motivo ${c.reason_id}` : ""}. ${mediacao ? "O ML entrou na conversa." : "Responda pelo OPS."}`,
      abrir: { tela: "reclamacoes-ml" },
    });
  } catch (e) { log("erro (reclamação):", e.message); }
});

// Pergunta sem resposta há mais de 1 h — das 8h às 20h, conferido a cada 10 min
let ultPerg = 0;
async function conferirPerguntasAtrasadas() {
  const h = horaBRT();
  if (h < 8 || h >= 20 || Date.now() - ultPerg < 10 * 60 * 1000) return;
  ultPerg = Date.now();
  for (const conta of ["filial", "matriz"]) {
    const uid = vivo.tokens[TOKEN_PATH[conta]]?.user_id; if (!uid) continue;
    const d = await ml(`https://api.mercadolibre.com/questions/search?seller_id=${uid}&status=UNANSWERED&api_version=4&limit=50&sort_fields=date_created&sort_types=ASC`, conta);
    const atrasadas = (d.questions || []).filter(q => { const t = Date.parse(q.date_created); return Date.now() - t > 3600e3 && Date.now() - t < 2 * 864e5; });
    const novas = [];
    for (const q of atrasadas) if (!(await db.ref(`/push_enviados/perg1h_${q.id}`).once("value")).exists()) novas.push(q);
    if (!novas.length) continue;
    for (const q of novas.slice(1)) await db.ref(`/push_enviados/perg1h_${q.id}`).set(Date.now());
    const q0 = novas[0];
    await avisar("pergunta_1h", `perg1h_${q0.id}`, novas.length === 1
      ? { title: `Pergunta sem resposta há 1 h · ${CONTA[conta]}`, body: `"${curto(q0.text, 120)}"`, abrir: { tela: "perguntas" } }
      : { title: `${novas.length} perguntas sem resposta há mais de 1 h · ${CONTA[conta]}`, body: novas.slice(0, 3).map(q => `"${curto(q.text, 40)}"`).join(" · "), abrir: { tela: "perguntas" } });
  }
}

// Vendas: dia abaixo do normal (14h e 18h) e resumo do dia (22h)
const vendasDia = async (conta, dia) => (await db.ref(`/vendas_hora/${conta}/${dia}`).once("value")).val();
// O dia de hoje não fica em /vendas_hora (só os dias fechados): o faturado de hoje vem da previsão (atualizada a cada 5 min)
async function faturadoHoje(conta, hoje) {
  const p = (await db.ref(`/previsao_dia/${conta}`).once("value")).val();
  if (!p || p.dia !== hoje || !p.gerado_em || Date.now() - p.gerado_em > 20 * 60 * 1000 || typeof p.faturado !== "number") return null;
  return p.faturado;
}
async function conferirVendas() {
  const h = horaBRT(), hoje = diaBRT();
  // Abaixo do normal: compara o acumulado até agora com o mesmo horário das últimas 4 semanas (mesmo dia da semana)
  for (const slot of [14, 18]) {
    if (h !== slot) continue;
    let atual = 0, semDado = false; const hist = [0, 0, 0, 0];
    for (const conta of ["filial", "matriz"]) {
      const f = await faturadoHoje(conta, hoje);
      if (f == null) { semDado = true; break; }
      atual += f;
      for (let i = 0; i < 4; i++) hist[i] += somaHoras(await vendasDia(conta, diaMenos(hoje, 7 * (i + 1))), slot);
    }
    if (semDado) continue;                                          // sem o faturado de hoje confiável, não avisa
    const base = hist.filter(v => v > 0).sort((a, b) => a - b);
    if (base.length < 2) continue;
    const mediana = base.length % 2 ? base[(base.length - 1) / 2] : (base[base.length / 2 - 1] + base[base.length / 2]) / 2;
    if (atual < mediana * 0.75) {
      await avisar("vendas_baixo", `vbaixo_${hoje}_${slot}`, {
        title: `Vendas abaixo do normal até as ${slot}h`,
        body: `Hoje: ${fmtR(atual)}. Nesse horário costuma estar em ${fmtR(mediana)} (${Math.round((1 - atual / mediana) * 100)}% abaixo).`,
        abrir: { tela: "dashboard" },
      });
    }
  }
  // Resumo do dia às 22h (passa pelo "não perturbe", porque é o horário escolhido pra ele)
  if (h === 22 && minutoBRT() < 30) {
    const k = `resumo_${hoje}`;
    if ((await db.ref(`/push_enviados/${k}`).once("value")).exists()) return;
    const tot = {}; let semana = 0; const skus = {};
    for (const conta of ["filial", "matriz"]) {
      const f = await faturadoHoje(conta, hoje);
      if (f == null) return;                                         // sem o faturado de hoje: tenta de novo no próximo minuto (até 22:30)
      tot[conta] = f;
      semana += somaHoras(await vendasDia(conta, diaMenos(hoje, 7)), 24);
      try {
        const uid = vivo.tokens[TOKEN_PATH[conta]]?.user_id;
        const de = `${hoje}T00:00:00.000-03:00`, ate = `${hoje}T23:59:59.999-03:00`;
        for (let off = 0; off < 1000; off += 50) {
          const d = await ml(`https://api.mercadolibre.com/orders/search?seller=${uid}&order.date_created.from=${de}&order.date_created.to=${ate}&limit=50&offset=${off}`, conta);
          for (const o of d.results || []) if (o.status !== "cancelled") for (const it of o.order_items || []) {
            const sku = it.item?.seller_sku || it.item?.seller_custom_field || it.item?.id;
            skus[sku] = (skus[sku] || 0) + Number(it.unit_price || 0) * Number(it.quantity || 0);
          }
          if (!d.results || d.results.length < 50) break;
        }
      } catch (e) { log("resumo: mais vendidos", conta, e.message); }
    }
    const total = tot.filial + tot.matriz;
    const comp = semana > 0 ? ` (${total >= semana ? "+" : ""}${Math.round((total / semana - 1) * 100)}% vs semana passada)` : "";
    const top = Object.entries(skus).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s).join(", ");
    await avisar("resumo_dia", k, {
      title: `Resumo do dia: ${fmtR(total)}${comp}`,
      body: `Filial ${fmtR(tot.filial)} · Matriz ${fmtR(tot.matriz)}${top ? `. Mais vendidos: ${top}` : ""}`,
      abrir: { tela: "dashboard" },
    }, true);
  }
}

// Contas a pagar que vencem amanhã — 1x por dia, a partir das 9h
async function conferirContas() {
  const h = horaBRT(); if (h < 9 || h >= 12) return;
  const amanha = diaMenos(diaBRT(), -1);
  const k = `contas_${amanha}`;
  if ((await db.ref(`/push_enviados/${k}`).once("value")).exists()) return;
  const lista = Object.values((await db.ref(`/contas_pagar/${amanha.slice(0, 4)}/${amanha.slice(5, 7)}`).once("value")).val() || {})
    .filter(c => c?.dataVencimento === amanha && c.situacao !== "pago" && c.situacao !== "cancelado");
  if (!lista.length) return;
  const total = lista.reduce((s, c) => s + Number(c.valor || 0), 0);
  await avisar("conta_vence", k, {
    title: `${lista.length} ${lista.length === 1 ? "conta vence" : "contas vencem"} amanhã · ${fmtR(total)}`,
    body: lista.slice(0, 4).map(c => `${curto(c.fornecedor || "—", 28)} ${fmtR(c.valor)}`).join(" · ") + (lista.length > 4 ? " …" : ""),
    abrir: { tela: "contas-pagar" },
  });
}

// Bling: testa a cada 30 min; avisa depois de 2 falhas seguidas
let ultBling = 0, falhasBling = 0, avisouBling = false;
async function conferirBling() {
  if (Date.now() - ultBling < 30 * 60 * 1000) return;
  ultBling = Date.now();
  let ok = false, erro = "";
  try { const r = await fetch(`${BACKEND}/api/bling-produtos?action=bling-status`); const d = await r.json().catch(() => ({})); ok = r.ok && d.ok; erro = d.erro || `HTTP ${r.status}`; }
  catch (e) { erro = e.message; }
  if (ok) { if (avisouBling) log("Bling voltou"); falhasBling = 0; avisouBling = false; return; }
  falhasBling++;
  log(`Bling falhou (${falhasBling}x): ${erro}`);
  if (falhasBling >= 2 && !avisouBling) {
    avisouBling = true;
    await avisar("bling", `bling_${Date.now()}`, { title: "Bling desconectado", body: `${curto(erro, 90)}. Custos e estoque do OPS ficam sem atualizar. Confira em Config › APIs.`, abrir: { tela: "apis" } }, true);
  }
}

// Experiência de compra: a cada 6 h, avisa anúncios que passaram a ter problema (ou pioraram)
let ultExp = 0;
const NIVEL = { green: 0, light_green: 0, yellow: 1, orange: 2, red: 3 };
async function conferirExperiencia() {
  if (Date.now() - ultExp < 6 * 3600e3) return;
  ultExp = Date.now();
  for (const conta of ["filial", "matriz"]) {
    const uid = vivo.tokens[TOKEN_PATH[conta]]?.user_id; if (!uid) continue;
    const ids = []; let scroll = null;
    for (let i = 0; i < 40; i++) {
      const d = await ml(`https://api.mercadolibre.com/users/${uid}/items/search?status=active&search_type=scan&limit=100${scroll ? `&scroll_id=${scroll}` : ""}`, conta);
      if (!d.results?.length) break;
      ids.push(...d.results); scroll = d.scroll_id;
    }
    const ref = db.ref(`/push_estado/experiencia/${conta}`);
    const antes = (await ref.once("value")).val();
    const agora = {}, piores = [];
    for (let i = 0; i < ids.length; i += 5) {
      await Promise.all(ids.slice(i, i + 5).map(async id => {
        try {
          const d = await ml(`https://api.mercadolibre.com/reputation/items/${id}/purchase_experience/integrators?locale=pt_BR`, conta);
          const cor = d?.reputation?.color; if (!cor) return;
          agora[id] = cor;
          if (antes && (NIVEL[cor] ?? 0) > (NIVEL[antes[id]] ?? 0)) piores.push({ id, titulo: d.title?.text || id, nivel: d.reputation?.text || cor });
        } catch (_) {}
      }));
    }
    await ref.set(agora);
    if (!antes || !piores.length) continue;                       // 1ª vez só guarda a situação atual
    await avisar("experiencia", `exp_${conta}_${diaBRT()}_${piores.map(p => p.id).join("_").slice(0, 200)}`, piores.length === 1
      ? { title: `Problema na experiência de compra · ${CONTA[conta]}`, body: `${curto(piores[0].titulo)}: ${piores[0].nivel}.`, abrir: { tela: "experiencia" } }
      : { title: `${piores.length} anúncios com problema novo · ${CONTA[conta]}`, body: piores.slice(0, 3).map(p => curto(p.titulo, 35)).join(" · "), abrir: { tela: "experiencia" } });
  }
}

// Tarefas: nova pra mim e tarefa que passei foi concluída
const tarefasAntes = {};
db.ref("/tasks").once("value").then(s0 => {
  Object.entries(s0.val() || {}).forEach(([id, t]) => { if (t) tarefasAntes[id] = { done: !!t.done }; });
  db.ref("/tasks").on("child_added", async s => {
    const t = s.val(); if (!t || tarefasAntes[s.key]) return;
    tarefasAntes[s.key] = { done: !!t.done };
    const de = t.delegatedBy || "Diogo";
    if (!t.member || t.member === de || t.done) return;
    await avisar("tarefa_nova", `tarefa_${s.key}`, { title: `Tarefa nova de ${de}`, body: curto(t.text, 140), abrir: { tela: "tarefas" } }, false, [t.member]).catch(e => log("erro (tarefa):", e.message));
  });
  db.ref("/tasks").on("child_changed", async s => {
    const t = s.val(); if (!t) return;
    const antes = tarefasAntes[s.key]; tarefasAntes[s.key] = { done: !!t.done };
    if (!antes || antes.done || !t.done) return;
    const de = t.delegatedBy || "Diogo";
    if (t.member === de) return;
    await avisar("tarefa_concluida", `tconc_${s.key}`, { title: `${t.member} concluiu uma tarefa`, body: curto(t.text, 140), abrir: { tela: "tarefas" } }, false, [de]).catch(e => log("erro (tarefa concluída):", e.message));
  });
});

// Pedido de teste feito pelo botão "Testar" do OPS
db.ref("/push_fila").on("child_added", async s => {
  const p = s.val() || {};
  await s.ref.remove();
  if (p.tipo !== "teste" || !p.usuario) return;
  const n = await mandarPara(p.usuario, { title: "Digoo OPS", body: "Notificações funcionando neste aparelho.", abrir: { tela: "dashboard" }, tag: "teste" });
  log(`[${p.usuario}] teste enviado para ${n} aparelho(s)`);
});

// Limpa o histórico de avisos enviados com mais de 10 dias (1x por dia)
async function limpar() {
  const tudo = (await db.ref("/push_enviados").once("value")).val() || {};
  const upd = {};
  for (const [k, t] of Object.entries(tudo)) if (Date.now() - t > 10 * 864e5) upd[k] = null;
  if (Object.keys(upd).length) await db.ref("/push_enviados").update(upd);
}

log("Avisos no celular iniciado");
await new Promise(r => setTimeout(r, 5000));   // espera os dados do Firebase chegarem
for (let volta = 0; ; volta++) {
  try { await conferir(); } catch (e) { log("erro:", e.message); }
  if (volta % 1440 === 0) limpar().catch(() => {});
  await new Promise(r => setTimeout(r, 60 * 1000));
}
