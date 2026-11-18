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

// Mesmos padrões da tela Config › Notificações
const PADRAO = { promo_caiu: true, promo_vence: true, promo_proposta: false, token_ml: true, sync_parado: true, nao_perturbe: true };
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
async function avisar(tipo, chave, aviso, urgente = false) {
  const k = chaveOk(chave);
  const ref = db.ref(`/push_enviados/${k}`);
  if ((await ref.once("value")).exists()) return;
  await ref.set(Date.now());
  aviso.tag = aviso.tag || k.slice(0, 60);
  for (const usuario of Object.keys(vivo.inscricoes)) {
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
  await liberarAdiados();
}

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
