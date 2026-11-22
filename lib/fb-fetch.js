/**
 * fb-fetch.js — fetch() substituto que roteia chamadas REST do Firebase
 * Realtime Database pelo Admin SDK (bypass das regras `auth != null`).
 *
 * Uso: `import { fetch } from "../lib/fb-fetch.js";` no topo do arquivo.
 * O binding importado sombreia o fetch global só naquele módulo.
 * URLs que não são do Firebase passam direto para o fetch nativo.
 * Se o Admin SDK não inicializar, cai no fetch nativo (comportamento antigo).
 */
import { getDb } from "./firebase-admin.js";

const nativeFetch = globalThis.fetch.bind(globalThis);

function isFirebaseUrl(url) {
  const base = process.env.FIREBASE_URL || "";
  return (base && url.startsWith(base)) ||
    /\.firebaseio\.com\//.test(url) ||
    /\.firebasedatabase\.app\//.test(url);
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value === undefined ? null : value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseParam(v) {
  if (v == null) return undefined;
  try { return JSON.parse(v); } catch { return v; }
}

// ── Uso da IA (Anthropic): conta chamadas, tokens e custo estimado por função em /uso_ia/{AAAA-MM}/{funcao}
// A função vem do cabeçalho "x-ops-funcao" (tirado antes de enviar). Preço em US$ por milhão de tokens.
const PRECO_IA = { haiku: { in: 1, out: 5 }, sonnet: { in: 3, out: 15 }, opus: { in: 5, out: 25 } };
async function registrarUsoIA(funcao, modelo, usage) {
  try {
    if (!usage) return;
    const tipo = /haiku/.test(modelo || "") ? "haiku" : /opus/.test(modelo || "") ? "opus" : "sonnet";
    const inp = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
    const out = usage.output_tokens || 0;
    const usd = (inp * PRECO_IA[tipo].in + out * PRECO_IA[tipo].out) / 1e6;
    const mes = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7);
    await getDb().ref(`/uso_ia/${mes}/${funcao}`).transaction(v => {
      v = v || { chamadas: 0, entrada: 0, saida: 0, usd: 0 };
      v.chamadas += 1; v.entrada += inp; v.saida += out; v.usd = Math.round((v.usd + usd) * 1e6) / 1e6; v.modelo = tipo; v.ultima = Date.now();
      return v;
    });
  } catch (e) { console.warn("[uso-ia]", e.message); }
}
async function fetchAnthropic(input, options) {
  const headers = { ...(options.headers || {}) };
  const funcao = String(headers["x-ops-funcao"] || "outros").replace(/[.#$/[\]]/g, "_");
  delete headers["x-ops-funcao"];
  let modelo = "";
  try { modelo = JSON.parse(options.body || "{}").model || ""; } catch {}
  const r = await nativeFetch(input, { ...options, headers });
  try { r.clone().json().then(d => registrarUsoIA(funcao, modelo, d?.usage)).catch(() => {}); } catch {}
  return r;
}

export async function fetch(input, options = {}) {
  const url = typeof input === "string" ? input : input?.url || String(input);
  if (url.startsWith("https://api.anthropic.com/")) return fetchAnthropic(input, options);
  if (!isFirebaseUrl(url)) return nativeFetch(input, options);

  let db;
  try { db = getDb(); } catch (e) {
    console.warn("[fb-fetch] Admin SDK indisponível, usando REST:", e.message);
    return nativeFetch(input, options);
  }

  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname.replace(/\.json$/, "")) || "/";
    const method = (options.method || "GET").toUpperCase();
    const body = options.body != null
      ? (typeof options.body === "string" ? JSON.parse(options.body) : options.body)
      : null;
    const ref = db.ref(path);

    if (method === "GET") {
      const q = u.searchParams;
      if (q.get("shallow") === "true") {
        const snap = await ref.once("value");
        const v = snap.val();
        if (v && typeof v === "object") {
          const out = {}; Object.keys(v).forEach(k => { out[k] = true; });
          return jsonResponse(out);
        }
        return jsonResponse(v);
      }
      let query = ref;
      const orderBy = parseParam(q.get("orderBy"));
      if (orderBy === "$key") query = query.orderByKey();
      else if (orderBy === "$value") query = query.orderByValue();
      else if (orderBy === "$priority") query = query.orderByPriority();
      else if (orderBy) query = query.orderByChild(orderBy);
      if (q.has("equalTo")) query = query.equalTo(parseParam(q.get("equalTo")));
      if (q.has("startAt")) query = query.startAt(parseParam(q.get("startAt")));
      if (q.has("endAt")) query = query.endAt(parseParam(q.get("endAt")));
      if (q.has("limitToFirst")) query = query.limitToFirst(Number(q.get("limitToFirst")));
      if (q.has("limitToLast")) query = query.limitToLast(Number(q.get("limitToLast")));
      const snap = await query.once("value");
      return jsonResponse(snap.val());
    }
    if (method === "PUT") { await ref.set(body); return jsonResponse(body); }
    if (method === "PATCH") { await ref.update(body || {}); return jsonResponse(body); }
    if (method === "POST") { const p = await ref.push(body); return jsonResponse({ name: p.key }); }
    if (method === "DELETE") { await ref.remove(); return jsonResponse(null); }
    return nativeFetch(input, options);
  } catch (e) {
    console.error("[fb-fetch] erro:", e.message, url.split("?")[0]);
    return jsonResponse({ error: e.message }, 500);
  }
}
