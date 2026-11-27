// ════════════════════════════════════════════════════════════════════════════
// Painel de Vendas — roda na VPS sem parar (PM2: "vendas").
// Mantém pronto no Firebase o resumo de cada dia (/vendas_dia/{conta}/{data}) que a aba
// Mercado Livre → Vendas do OPS lê direto, sem esperar ninguém:
//   • a cada 10 min: vendas de hoje
//   • de hora em hora: ontem (pagamentos/liberações ainda mudando)
//   • de madrugada (3h): confere de novo os últimos 30 dias (cancelamentos, reembolsos, liberações)
//
// Instalação (pasta /opt/digoo-ofertas-ml, junto do sync.mjs):
//   vendas.mjs + vendas-painel-core.mjs (cópia de lib/vendas-painel-core.js) + ofertas-ml-core.mjs (já existe)
//   pm2 start /opt/digoo-ofertas-ml/vendas.mjs --name vendas && pm2 save
// Usa o firebase-admin e a chave do digoo-picking-sync (nenhum segredo neste arquivo).
// ════════════════════════════════════════════════════════════════════════════
import { createRequire } from "module";
import { mlFetch, emParalelo, esperar } from "./ofertas-ml-core.mjs";
import { montarDiaVendas, hojeSP } from "./vendas-painel-core.mjs";

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
const log = (...a) => console.log(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), ...a);
const somaDias = (s, n) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10); };
const horaSP = () => new Date(Date.now() - 3 * 3600e3).getUTCHours();

// Token salvo no Firebase; perto de vencer, pede pro backend renovar (o segredo do app fica só na Vercel)
async function tokenDa(conta, forcar = false) {
  const path = conta === "filial" ? "ml_token_filial" : "ml_token";
  let tk = (await db.ref(path).once("value")).val();
  if (!tk?.access_token) return null;
  if (forcar || (tk.expires_at && tk.expires_at - Date.now() < 9 * 60 * 1000)) {
    try { await fetch(`${BACKEND}/api/ml-vendas?action=renovar-token-ml&conta=${conta}`); } catch (e) { log(`[${conta}] renovar token falhou:`, e.message); }
    tk = (await db.ref(path).once("value")).val();
  }
  return tk?.access_token ? { token: tk.access_token, uid: tk.user_id } : null;
}

async function uidDa(conta, token, uid) {
  if (uid) return uid;
  const me = await (await mlFetch("https://api.mercadolibre.com/users/me", token)).json();
  return me.id;
}

async function atualizarDia(conta, data, revalidarMs) {
  let t = await tokenDa(conta);
  if (!t) { log(`[${conta}] sem token do ML — pulando`); return; }
  const uid = await uidDa(conta, t.token, t.uid);
  let r;
  try {
    r = await montarDiaVendas({ db, token: t.token, uid, conta, data, mlFetch, emParalelo, revalidarMs, origem: "vps" });
  } catch (e) {
    if (!/40[13]/.test(e.message)) throw e;
    t = await tokenDa(conta, true);              // token recusado: renova e tenta uma vez
    r = await montarDiaVendas({ db, token: t.token, uid, conta, data, mlFetch, emParalelo, revalidarMs, origem: "vps" });
  }
  log(`[${conta}] ${data}: ${r.vendas.length} vendas · ${r.excecoes.length} exceções`);
}

let ultimaOntem = 0, ultimaMadrugada = "";
// Recalcular os últimos 30 dias agora e sair: RECALCULAR=1 node vendas.mjs
if (process.env.RECALCULAR) {
  const hoje = hojeSP();
  log("Recalculando os últimos 30 dias (uma vez)");
  for (const conta of CONTAS) for (let i = 0; i <= 30; i++) {
    try { await atualizarDia(conta, somaDias(hoje, -i), 20 * 3600e3); } catch (e) { log(`[${conta}] ${somaDias(hoje, -i)} erro:`, e.message); }
    await esperar(1500);
  }
  log("Pronto."); process.exit(0);
}
log("Painel de vendas iniciado");
for (;;) {
  const hoje = hojeSP();
  for (const conta of CONTAS) {
    try { await atualizarDia(conta, hoje); } catch (e) { log(`[${conta}] hoje erro:`, e.message); }
  }
  // ontem, de hora em hora
  if (Date.now() - ultimaOntem > 3600e3) {
    ultimaOntem = Date.now();
    for (const conta of CONTAS) {
      try { await atualizarDia(conta, somaDias(hoje, -1), 3600e3); } catch (e) { log(`[${conta}] ontem erro:`, e.message); }
    }
  }
  // madrugada: últimos 30 dias, rechecando pedidos com mais de 20h
  if (horaSP() === 3 && ultimaMadrugada !== hoje) {
    ultimaMadrugada = hoje;
    log("Conferência da madrugada: últimos 30 dias");
    for (const conta of CONTAS) for (let i = 2; i <= 30; i++) {
      try { await atualizarDia(conta, somaDias(hoje, -i), 20 * 3600e3); } catch (e) { log(`[${conta}] ${somaDias(hoje, -i)} erro:`, e.message); }
      await esperar(2000);
    }
  }
  await esperar(10 * 60 * 1000);
}
