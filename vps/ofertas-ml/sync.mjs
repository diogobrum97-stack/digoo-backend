// ════════════════════════════════════════════════════════════════════════════
// Sincronizador das Ofertas do ML — roda na VPS sem parar (PM2: "ofertas-ml").
// A cada volta: varre as promoções das duas contas direto do ML e grava no
// Firebase só o que mudou. O OPS escuta o Firebase e troca os números na hora.
//
// Instalação (pasta /opt/digoo-ofertas-ml):
//   sync.mjs + ofertas-ml-core.mjs (cópia de lib/ofertas-ml-core.js)
//   pm2 start /opt/digoo-ofertas-ml/sync.mjs --name ofertas-ml
// Usa o firebase-admin e a chave do digoo-picking-sync (nenhum segredo neste arquivo).
// ════════════════════════════════════════════════════════════════════════════
import { createRequire } from "module";
import { montarOfertasML, gravarOfertas, esperar } from "./ofertas-ml-core.mjs";

const PICKING = "/opt/digoo-picking-sync";
const require = createRequire(`${PICKING}/package.json`);
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.cert(require(`${PICKING}/serviceAccount.json`)),
  databaseURL: "https://digoo-equipe-default-rtdb.firebaseio.com",
});
const db = admin.database();

const BACKEND = "https://digoo-backend.vercel.app";
const CONTAS = ["filial", "matriz"];
const PAUSA_MS = 20 * 1000;          // descanso entre uma volta completa e a próxima
const log = (...a) => console.log(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), ...a);

// Lê o token salvo; se estiver perto de vencer, pede pro backend renovar (o segredo do app fica só na Vercel)
async function tokenDa(conta, forcarRenovar = false) {
  const path = conta === "filial" ? "ml_token_filial" : "ml_token";
  let tk = (await db.ref(path).once("value")).val();
  if (!tk?.access_token) return null;
  if (forcarRenovar || (tk.expires_at && tk.expires_at - Date.now() < 9 * 60 * 1000)) {
    try {
      const r = await fetch(`${BACKEND}/api/ml-vendas?action=renovar-token-ml&conta=${conta}`);
      const d = await r.json();
      if (!d.ok) log(`[${conta}] renovar token falhou:`, d.error);
    } catch (e) { log(`[${conta}] renovar token falhou:`, e.message); }
    tk = (await db.ref(path).once("value")).val();
  }
  return tk?.access_token || null;
}

// ── Promoções que caíram ──────────────────────────────────────────────────────
// Compara com a volta anterior: o anúncio tinha promoção valendo (started) e agora não tem
// → grava em /promo_alertas/{conta}/caidas/{item}. Some sozinho quando volta a ter promoção.
// Saídas feitas pelo próprio OPS (botão Sair) ficam em /promo_alertas/{conta}/saida_manual e não viram alerta.
const listaOf = it => Array.isArray(it?.ofertas) ? it.ofertas : Object.values(it?.ofertas || {});
const valendo = it => listaOf(it).some(o => o?.status === "started");
async function registrarCaidas(conta, anteriores, dados) {
  if (!anteriores) return;
  const base = db.ref(`/promo_alertas/${conta}`);
  const atual = (await base.once("value")).val() || {};
  const caidas = atual.caidas || {}, manual = atual.saida_manual || {};
  const falhou = new Set(dados.meta?.falhas?.promocoes || []);
  const ativos = new Set([...Object.keys(dados.info || {}), ...Object.keys(dados.itens || {})]);
  const agoraMs = Date.now();
  const upd = {};
  for (const [id, ant] of Object.entries(anteriores)) {
    if (falhou.has(id) || caidas[id]) continue;
    const agora = dados.itens[id];
    if (!valendo(ant) || valendo(agora)) continue;
    if (manual[id] && agoraMs - manual[id] < 30 * 60 * 1000) continue;
    const ini = listaOf(ant).filter(o => o?.status === "started");
    const p = ini.reduce((a, b) => ((b.preco || Infinity) < (a.preco || Infinity) ? b : a), ini[0]);
    const inf = agora || dados.info?.[id] || ant;
    upd[`caidas/${id}`] = {
      item_id: id, titulo: inf.titulo || ant.titulo || null, sku: inf.sku || ant.sku || null,
      foto: inf.foto || ant.foto || null, catalogo: !!(inf.catalogo ?? ant.catalogo),
      preco: inf.preco ?? ant.preco ?? null, estoque: inf.estoque ?? null,
      promo_nome: p?.nome || null, promo_tipo: p?.tipo || null, promo_preco: p?.preco || null,
      caiu_em: agoraMs,
      motivo: !ativos.has(id) ? "inativo" : inf.estoque === 0 ? "sem_estoque" : null,
    };
    log(`[${conta}] promoção caiu: ${id} (${p?.nome || p?.tipo || "?"})`);
  }
  for (const [id, c] of Object.entries(caidas)) {
    if (valendo(dados.itens[id]) || agoraMs - (c.caiu_em || 0) > 14 * 24 * 3600e3) upd[`caidas/${id}`] = null;
  }
  for (const [id, t] of Object.entries(manual)) if (agoraMs - t > 30 * 60 * 1000) upd[`saida_manual/${id}`] = null;
  if (Object.keys(upd).length) await base.update(JSON.parse(JSON.stringify(upd)));
}

// ── Anúncio pausado por falta de estoque ──────────────────────────────────────
// Estava ativo na volta anterior e saiu da lista de ativos: pergunta ao ML o motivo.
// Se foi pausado por estoque zerado → /promo_alertas/{conta}/sem_estoque/{item} (o processo "avisos" manda o aviso).
async function registrarSemEstoque(conta, token, infoAnterior, dados) {
  if (!infoAnterior || !dados.info) return;
  const agora = new Set(Object.keys(dados.info));
  const sairam = Object.keys(infoAnterior).filter(id => !agora.has(id));
  const base = db.ref(`/promo_alertas/${conta}/sem_estoque`);
  const upd = {};
  for (let i = 0; i < sairam.length; i += 20) {
    const ids = sairam.slice(i, i + 20).join(",");
    const r = await fetch(`https://api.mercadolibre.com/items?ids=${ids}&attributes=id,title,status,sub_status,available_quantity,seller_custom_field`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) continue;
    for (const e of await r.json()) {
      const b = e?.body; if (e?.code !== 200 || !b?.id) continue;
      const semEstoque = b.status === "paused" && ((b.sub_status || []).includes("out_of_stock") || b.available_quantity === 0);
      if (semEstoque) { upd[b.id] = { item_id: b.id, titulo: b.title || infoAnterior[b.id]?.titulo || null, sku: infoAnterior[b.id]?.sku || b.seller_custom_field || null, em: Date.now() }; log(`[${conta}] pausado sem estoque: ${b.id}`); }
    }
  }
  // limpa os que voltaram a ficar ativos ou são antigos (7 dias)
  const atuais = (await base.once("value")).val() || {};
  for (const [id, a] of Object.entries(atuais)) if (agora.has(id) || Date.now() - (a.em || 0) > 7 * 864e5) upd[id] = null;
  if (Object.keys(upd).length) await base.update(upd);
}

const memoria = { filial: { itens: null, info: null }, matriz: { itens: null, info: null } };

async function sincronizar(conta) {
  const ref = db.ref(`/ofertas_ml_cache/${conta}`);
  const mem = memoria[conta];
  if (!mem.itens) mem.itens = (await ref.child("itens").once("value")).val() || {};
  let token = await tokenDa(conta);
  if (!token) { log(`[${conta}] sem token do ML no Firebase — pulando`); return; }
  let dados;
  try {
    dados = await montarOfertasML(token, mem.info);
  } catch (e) {
    if (!/token/i.test(e.message)) throw e;
    token = await tokenDa(conta, true);           // token recusado: renova e tenta uma vez
    dados = await montarOfertasML(token, mem.info);
  }
  const mudaram = await gravarOfertas(ref, dados, mem.itens, "vps");
  try { await registrarCaidas(conta, mem.itens, dados); } catch (e) { log(`[${conta}] alertas de promoção:`, e.message); }
  try { await registrarSemEstoque(conta, token, mem.info, dados); } catch (e) { log(`[${conta}] alerta sem estoque:`, e.message); }
  mem.itens = dados.itens;
  mem.info = dados.info;
  const f = dados.meta.falhas;
  log(`[${conta}] ${Object.keys(dados.itens).length} anúncios com oferta · ${mudaram} mudaram · ${Math.round(dados.meta.duracao_ms / 1000)}s` +
      (f.promocoes.length ? ` · ${f.promocoes.length} falharam` : ""));
}

let errosSeguidos = 0;
log("Sincronizador de ofertas do ML iniciado");
for (;;) {
  let teveErro = false;
  for (const conta of CONTAS) {
    try { await sincronizar(conta); }
    catch (e) {
      teveErro = true;
      log(`[${conta}] erro:`, e.message);
      try { await db.ref(`/ofertas_ml_cache/${conta}/ultimo_erro`).set({ msg: e.message, em: Date.now(), origem: "vps" }); } catch (_) {}
    }
  }
  errosSeguidos = teveErro ? errosSeguidos + 1 : 0;
  // se o ML estiver recusando, espera mais (até 5 min) antes de tentar de novo
  await esperar(Math.min(PAUSA_MS * 2 ** errosSeguidos, 5 * 60 * 1000));
}
