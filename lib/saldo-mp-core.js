// ════════════════════════════════════════════════════════════════════════════
// Saldo MP (OPS → Mercado Livre → Saldo MP) — lê o relatório de liberações do
// Mercado Pago (extrato oficial do saldo disponível) e agrupa os movimentos.
// Sem dependências.
// ════════════════════════════════════════════════════════════════════════════

// Colunas do relatório (as mesmas que a Matriz já usava)
export const COLUNAS_RELATORIO = [
  "DATE", "TRANSACTION_APPROVAL_DATE", "SOURCE_ID", "DESCRIPTION", "NET_CREDIT_AMOUNT", "NET_DEBIT_AMOUNT",
  "GROSS_AMOUNT", "MP_FEE_AMOUNT", "TAXES_AMOUNT", "PAYMENT_METHOD", "BUSINESS_UNIT", "SUB_UNIT",
  "BALANCE_AMOUNT", "PAYMENT_METHOD_TYPE", "PURCHASE_ID",
];

const num = v => {
  let s = String(v ?? "").trim().replace(/^"|"$/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const r2 = v => Math.round(v * 100) / 100;

// Separa uma linha de CSV respeitando aspas
function dividir(linha, sep) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { if (q && linha[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === sep && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// Tipo de cada movimento (pela descrição e pela unidade de negócio)
export function categoria(desc, unidade, credito, debito) {
  const t = `${desc} ${unidade}`.toLowerCase();
  if (/initial_available_balance|saldo inicial|saldo_inicial/.test(t)) return "inicial";
  if (/payout|withdraw|retiro|saque|transfer/.test(t)) return "saques";
  if (/refund|chargeback|mediation|dispute|reclam|devolu|claim|cancel/.test(t)) return "devolucoes";
  if (/advertis|ads|publicid|anuncio/.test(t)) return "ads";
  if (/fulfillment|full|storage|armazen|inbound|stock|retirada/.test(t)) return "full";
  if (/reserve/.test(t)) return debito > 0 ? "outros_saida" : "outros_entrada";
  if (/payment|release|liberac|venda|sale/.test(t) && credito > 0) return "vendas";
  return credito > 0 ? "outros_entrada" : "outros_saida";
}

/**
 * Lê o CSV do relatório de liberações.
 * @param {string} csv
 * @param {string[]} colunasConfig  ordem das colunas na configuração (para cabeçalho traduzido)
 */
export function lerRelatorioLiberacoes(csv, colunasConfig = COLUNAS_RELATORIO) {
  const linhas = String(csv || "").replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) return null;
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ";" : ",";
  const cab = dividir(linhas[0], sep).map(c => c.toUpperCase().replace(/\s+/g, "_"));
  // cabeçalho em inglês → usa o nome; traduzido → usa a ordem da configuração
  const usarNome = cab.includes("DESCRIPTION") || cab.includes("NET_CREDIT_AMOUNT");
  const idx = k => usarNome ? cab.indexOf(k) : colunasConfig.indexOf(k);
  const I = Object.fromEntries(COLUNAS_RELATORIO.map(k => [k, idx(k)]));
  const pega = (cols, k) => I[k] >= 0 ? cols[I[k]] : "";

  const movs = [];
  let inicial = null;
  for (const l of linhas.slice(1)) {
    const c = dividir(l, sep);
    const desc = pega(c, "DESCRIPTION");
    const credito = num(pega(c, "NET_CREDIT_AMOUNT")), debito = num(pega(c, "NET_DEBIT_AMOUNT"));
    const saldo = I.BALANCE_AMOUNT >= 0 ? num(pega(c, "BALANCE_AMOUNT")) : null;
    const unidade = [pega(c, "BUSINESS_UNIT"), pega(c, "SUB_UNIT")].filter(Boolean).join(" ");
    const cat = categoria(desc, unidade, credito, debito);
    if (cat === "inicial") { inicial = saldo != null ? saldo : credito - debito; continue; }
    if (!credito && !debito && !desc) continue;
    movs.push({
      data: pega(c, "DATE") || null, descricao: desc || null, unidade: unidade || null, cat,
      credito: r2(credito), debito: r2(debito), saldo: saldo != null ? r2(saldo) : null,
      origem: pega(c, "SOURCE_ID") || null, compra: pega(c, "PURCHASE_ID") || null,
    });
  }
  if (inicial == null && movs.length && movs[0].saldo != null) inicial = r2(movs[0].saldo - movs[0].credito + movs[0].debito);

  const entradas = {}, saidas = {}, tipos = {};
  let somaC = 0, somaD = 0;
  for (const m of movs) {
    if (m.credito) entradas[m.cat] = r2((entradas[m.cat] || 0) + m.credito);
    if (m.debito) saidas[m.cat] = r2((saidas[m.cat] || 0) + m.debito);
    somaC += m.credito; somaD += m.debito;
    const k = `${m.descricao || "?"}${m.unidade ? " · " + m.unidade : ""}`.replace(/[.#$/\[\]]/g, "_").slice(0, 120);   // chave válida no Firebase
    const t = tipos[k] = tipos[k] || { n: 0, credito: 0, debito: 0, cat: m.cat };
    t.n++; t.credito = r2(t.credito + m.credito); t.debito = r2(t.debito + m.debito);
  }
  const ultimoSaldo = [...movs].reverse().find(m => m.saldo != null)?.saldo ?? null;
  const calculado = inicial != null ? r2(inicial + somaC - somaD) : null;
  return {
    inicial: inicial != null ? r2(inicial) : null, final: ultimoSaldo, calculado,
    bate: calculado != null && ultimoSaldo != null ? Math.abs(calculado - ultimoSaldo) < 0.05 : null,
    entrou: r2(somaC), saiu: r2(somaD), entradas, saidas, tipos,
    n: movs.length,
    movimentos: movs.slice(-400).reverse(),          // mais recentes primeiro
  };
}
