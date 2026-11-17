// ════════════════════════════════════════════════════════════════════════════
// Previsão de faturamento do dia — roda na VPS (PM2: "previsao-vendas").
//
// 1. Guarda o faturamento por hora de cada dia em /vendas_hora/{conta}/{AAAA-MM-DD}
//    (24 posições, em reais; pedidos não cancelados, horário de Brasília — mesma
//    regra do "Total hoje" do painel). Na primeira vez busca as últimas 8 semanas.
// 2. A cada 5 min calcula a previsão do dia e grava em /previsao_dia/{filial|matriz|total}:
//    { previsto, min, max, faturado, gerado_em }.
//
// Como prevê: compara o que já entrou hoje com o "ritmo" dos mesmos dias da semana
// (quanto do dia costuma ter entrado até essa hora) e mistura com a média desses dias
// ajustada pela tendência da última semana. De manhã pesa mais a média; ao longo do
// dia pesa mais o ritmo de hoje. A faixa sai de quanto essa conta errou nos dias passados.
//
// Instalação: mesma pasta do sincronizador de ofertas (/opt/digoo-ofertas-ml), usa o
// ofertas-ml-core.mjs de lá e o firebase-admin + chave do digoo-picking-sync.
//   pm2 start /opt/digoo-ofertas-ml/previsao.mjs --name previsao-vendas && pm2 save
// ════════════════════════════════════════════════════════════════════════════
import { createRequire } from "module";
import { mlFetch, esperar } from "./ofertas-ml-core.mjs";

const PICKING = "/opt/digoo-picking-sync";
const require = createRequire(`${PICKING}/package.json`);
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.cert(require(`${PICKING}/serviceAccount.json`)),
  databaseURL: "https://digoo-equipe-default-rtdb.firebaseio.com",
}, "previsao");
const db = admin.app("previsao").database();

const BACKEND = "https://digoo-backend.vercel.app";
const CONTAS = ["filial", "matriz"];
const DIAS_HIST = 56;                  // 8 semanas
const CICLO_MS = 5 * 60 * 1000;
const log = (...a) => console.log(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), ...a);

// ── datas no horário de Brasília (UTC−3, sem horário de verão) ──
const BRT = 3 * 3600e3;
const diaBRT = (ms = Date.now()) => new Date(ms - BRT).toISOString().slice(0, 10);
const horaBRT = ms => new Date(ms - BRT).getUTCHours();
const somaDias = (dia, n) => new Date(Date.parse(dia + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const diaSemana = dia => new Date(dia + "T12:00:00Z").getUTCDay();

async function tokenDa(conta, forcar = false) {
  const path = conta === "filial" ? "ml_token_filial" : "ml_token";
  let tk = (await db.ref(path).once("value")).val();
  if (!tk?.access_token) return null;
  if (forcar || (tk.expires_at && tk.expires_at - Date.now() < 9 * 60 * 1000)) {
    try { await fetch(`${BACKEND}/api/ml-vendas?action=renovar-token-ml&conta=${conta}`); } catch (_) {}
    tk = (await db.ref(path).once("value")).val();
  }
  return tk?.access_token || null;
}

// Faturamento por hora de um dia (pedidos não cancelados, igual ao painel)
async function vendasPorHora(token, sellerId, dia) {
  const de = encodeURIComponent(`${dia}T00:00:00.000-03:00`);
  const ate = encodeURIComponent(`${dia}T23:59:59.999-03:00`);
  const horas = Array(24).fill(0);
  for (let off = 0; off < 10000; off += 50) {
    const r = await mlFetch(`https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.date_created.from=${de}&order.date_created.to=${ate}&sort=date_asc&limit=50&offset=${off}`, token);
    if (!r.ok) throw new Error(`pedidos ${dia}: HTTP ${r.status}`);
    const d = await r.json();
    const lista = d.results || [];
    for (const o of lista) {
      if (o.status === "cancelled") continue;
      const ms = Date.parse(o.date_created);
      if (!isNaN(ms)) horas[horaBRT(ms)] += Number(o.total_amount || 0);
    }
    if (lista.length < 50) break;
  }
  return horas.map(v => Math.round(v * 100) / 100);
}

const mediana = a => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const percentil = (a, p) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return 0; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
// quanto do dia já tinha entrado até o instante t (horas decimais), supondo vendas espalhadas dentro da hora
const acumulado = (horas, t) => { let s = 0; for (let h = 0; h < 24; h++) { if (h + 1 <= t) s += horas[h]; else if (h < t) s += horas[h] * (t - h); } return s; };
const total = horas => horas.reduce((a, b) => a + b, 0);

// Previsão de um dia a partir do que entrou até t e dos dias de referência
function prever(faturado, t, refs, tendencia) {
  const tot = refs.map(total).filter(v => v > 0);
  if (tot.length < 3) return null;
  const partes = refs.filter(h => total(h) > 0).map(h => acumulado(h, t) / total(h));
  const parte = mediana(partes);
  const base = mediana(tot) * tendencia;
  const peso = Math.max(0, Math.min(1, parte / 0.5)); // até metade do dia andado vai passando da média pro ritmo
  const ritmo = parte > 0.03 ? faturado / parte : base;
  return { previsto: Math.max(faturado, peso * ritmo + (1 - peso) * base), parte, base, peso };
}

async function previsaoDaConta(conta, hist, hoje, horasHoje, t) {
  const dias = Object.keys(hist).filter(d => d < hoje).sort();
  const mesmos = dias.filter(d => diaSemana(d) === diaSemana(hoje)).slice(-8);
  const refsDias = mesmos.length >= 4 ? mesmos : dias.slice(-14);
  // tendência: últimos 7 dias contra as 3 semanas anteriores, limitada pra não exagerar
  const ult7 = dias.slice(-7).reduce((s, d) => s + total(hist[d]), 0);
  const ant = dias.slice(-28, -7);
  const media7Ant = ant.length ? ant.reduce((s, d) => s + total(hist[d]), 0) / ant.length * 7 : 0;
  const tendencia = media7Ant > 0 ? Math.max(0.7, Math.min(1.5, ult7 / media7Ant)) : 1;
  const faturado = acumulado(horasHoje, t);
  const p = prever(faturado, t, refsDias.map(d => hist[d]), tendencia);
  if (!p) return null;
  // erro histórico na mesma hora: prevê cada dia de referência com os outros e compara com o real
  const erros = [];
  for (const d of refsDias) {
    const real = total(hist[d]);
    if (!real) continue;
    const outros = refsDias.filter(x => x !== d).map(x => hist[x]);
    const pd = prever(acumulado(hist[d], t), t, outros, tendencia);
    if (pd) erros.push(pd.previsto / real - 1);
  }
  const eBaixo = erros.length >= 3 ? percentil(erros, 0.8) : 0.15;   // previsão alta demais → mínimo menor
  const eAlto = erros.length >= 3 ? percentil(erros, 0.2) : -0.15;
  const min = Math.max(faturado, p.previsto / (1 + Math.max(eBaixo, 0.03)));
  const max = Math.max(min, p.previsto / (1 + Math.min(eAlto, -0.03)));
  return { previsto: Math.round(p.previsto), min: Math.round(min), max: Math.round(max), faturado: Math.round(faturado), parte_tipica: Math.round(p.parte * 1000) / 1000 };
}

const histMem = {};

async function cicloConta(conta) {
  let token = await tokenDa(conta);
  if (!token) { log(`[${conta}] sem token`); return null; }
  let me = await (await mlFetch("https://api.mercadolibre.com/users/me", token)).json();
  if (!me.id) { token = await tokenDa(conta, true); me = await (await mlFetch("https://api.mercadolibre.com/users/me", token)).json(); }
  if (!me.id) throw new Error("token recusado");
  const ref = db.ref(`/vendas_hora/${conta}`);
  if (!histMem[conta]) histMem[conta] = (await ref.once("value")).val() || {};
  const hist = histMem[conta];
  const hoje = diaBRT();
  // completa os dias que faltam (primeira vez: 8 semanas) e refaz ontem uma vez (pedidos da madrugada)
  for (let n = DIAS_HIST; n >= 1; n--) {
    const dia = somaDias(hoje, -n);
    const precisa = !hist[dia] || (n === 1 && !hist[dia + "_fechado"]);
    if (!precisa) continue;
    hist[dia] = await vendasPorHora(token, me.id, dia);
    await ref.child(dia).set(hist[dia]);
    if (n === 1) { hist[dia + "_fechado"] = true; }
  }
  // limpa dias antigos
  for (const d of Object.keys(hist)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < somaDias(hoje, -DIAS_HIST - 2)) { delete hist[d]; await ref.child(d).remove(); }
  const horasHoje = await vendasPorHora(token, me.id, hoje);
  const agora = Date.now();
  const t = (agora - BRT) % 864e5 / 3600e3;
  const histDias = Object.fromEntries(Object.entries(hist).filter(([d]) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  const prev = await previsaoDaConta(conta, histDias, hoje, horasHoje, t);
  if (prev) await db.ref(`/previsao_dia/${conta}`).set({ ...prev, dia: hoje, gerado_em: agora });
  return prev;
}

log("Previsão de vendas iniciada");
for (;;) {
  const res = {};
  for (const conta of CONTAS) {
    try { res[conta] = await cicloConta(conta); if (res[conta]) log(`[${conta}] previsto R$ ${res[conta].previsto} (${res[conta].min}–${res[conta].max}) · faturado R$ ${res[conta].faturado}`); }
    catch (e) { log(`[${conta}] erro:`, e.message); }
  }
  if (res.filial && res.matriz) {
    // soma das faixas é conservadora; aperta um pouco (erros das duas contas não andam sempre juntos)
    const prev = res.filial.previsto + res.matriz.previsto;
    const aperto = x => Math.round(prev + (x - prev) * 0.85);
    await db.ref("/previsao_dia/total").set({
      previsto: prev,
      min: Math.max(res.filial.faturado + res.matriz.faturado, aperto(res.filial.min + res.matriz.min)),
      max: aperto(res.filial.max + res.matriz.max),
      faturado: res.filial.faturado + res.matriz.faturado,
      dia: diaBRT(), gerado_em: Date.now(),
    });
  }
  await esperar(CICLO_MS);
}
