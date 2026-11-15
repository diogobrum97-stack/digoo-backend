// ════════════════════════════════════════════════════════════════════════════
// Sincronizador das Ofertas do ML — roda na VPS sem parar (PM2: "ofertas-ml").
// A cada volta: varre as promoções das duas contas direto do ML e grava no
// Firebase só o que mudou. O OPS escuta o Firebase e troca os números na hora.
//
// Instalação (pasta /opt/digoo-ofertas-ml):
//   sync.mjs + ofertas-ml-core.mjs (cópia de lib/ofertas-ml-core.mjs)
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
