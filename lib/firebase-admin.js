/**
 * Firebase Admin SDK — inicialização singleton
 *
 * No Vercel (serverless), o módulo pode ser carregado várias vezes;
 * o check de `getApps()` garante que só inicializamos uma vez.
 *
 * Variáveis de ambiente necessárias no Vercel:
 *   FIREBASE_SERVICE_ACCOUNT  — conteúdo do serviceAccount.json em JSON string
 *   FIREBASE_DATABASE_URL     — ex: https://digoo-equipe-default-rtdb.firebaseio.com
 *
 * No VPS, o serviceAccount.json fica em /opt/digoo-picking-sync/serviceAccount.json
 * e é referenciado via FIREBASE_SERVICE_ACCOUNT_PATH (fallback para ambientes locais).
 */

import admin from "firebase-admin";

let db = null;

function getDb() {
  if (db) return db;

  if (!admin.apps.length) {
    let credential;

    // 1. Variável de ambiente com o JSON completo (Vercel)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(serviceAccount);
    }
    // 2. Caminho para o arquivo no disco (VPS / local)
    else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const serviceAccount = require(process.env.FIREBASE_SERVICE_ACCOUNT_PATH);
      credential = admin.credential.cert(serviceAccount);
    } else {
      throw new Error(
        "Firebase Admin: defina FIREBASE_SERVICE_ACCOUNT (JSON string) ou FIREBASE_SERVICE_ACCOUNT_PATH"
      );
    }

    admin.initializeApp({
      credential,
      databaseURL:
        process.env.FIREBASE_DATABASE_URL ||
        process.env.FIREBASE_URL ||
        "https://digoo-equipe-default-rtdb.firebaseio.com",
    });
  }

  db = admin.database();
  return db;
}

export { getDb };
export default admin;
