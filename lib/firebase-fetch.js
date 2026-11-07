/**
 * firebase-fetch.js
 *
 * Wrapper sobre fetch() para chamadas REST ao Firebase Realtime Database.
 * Adiciona automaticamente o parâmetro ?auth=DATABASE_SECRET a toda URL
 * do Firebase, permitindo que as regras com `auth != null` sejam satisfeitas.
 *
 * Variável de ambiente necessária no Vercel:
 *   FIREBASE_DATABASE_SECRET  — secret gerado em Firebase Console →
 *                               Configurações do projeto → Contas de serviço →
 *                               Secrets do banco de dados
 *
 * Uso (substitui fetch direto nas APIs):
 *   import { fbFetch } from "../lib/firebase-fetch.js";
 *   const r = await fbFetch(`${FIREBASE_URL}/ml_token.json`);
 *
 * Para outras chamadas (Mercado Livre, etc.) continua usando fetch() normal.
 */

const FIREBASE_SECRET = process.env.FIREBASE_DATABASE_SECRET;

/**
 * Faz fetch para o Firebase REST API com autenticação via Database Secret.
 * @param {string} url  URL completa terminada em .json
 * @param {RequestInit} [options]
 */
export async function fbFetch(url, options = {}) {
  if (!FIREBASE_SECRET) {
    console.warn(
      "[firebase-fetch] FIREBASE_DATABASE_SECRET não definido — chamada sem auth"
    );
    return fetch(url, options);
  }

  // Adiciona ?auth=SECRET ou &auth=SECRET dependendo se já há query string
  const separator = url.includes("?") ? "&" : "?";
  const authenticatedUrl = `${url}${separator}auth=${FIREBASE_SECRET}`;

  return fetch(authenticatedUrl, options);
}
