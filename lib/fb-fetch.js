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

export async function fetch(input, options = {}) {
  const url = typeof input === "string" ? input : input?.url || String(input);
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
