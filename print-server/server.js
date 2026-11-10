/**
 * digoo-print-server — v2.0
 * Observa /fila_impressao no Firebase em tempo real.
 * Quando chega um item com status "aguardando", imprime via SumatraPDF
 * e atualiza o status para "impresso" ou "erro".
 * Envia heartbeat a /print_server_status a cada 5 segundos.
 */

import { initializeApp } from "firebase/app";
import { getDatabase, ref, onChildAdded, onChildChanged, update, set } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Configuração ──────────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBbaxrk7TXl9BiAZJzHwnJ6vI_LA5g-zzk",
  authDomain: "digoo-equipe.firebaseapp.com",
  databaseURL: "https://digoo-equipe-default-rtdb.firebaseio.com",
  projectId: "digoo-equipe",
  storageBucket: "digoo-equipe.firebasestorage.app",
  messagingSenderId: "152821168439",
  appId: "1:152821168439:web:6712b7821b1de4517782b2",
};

const VERSION  = "2.1.1";
const PRINTER  = "A82pro";
const SUMATRA  = path.join(__dirname, "SumatraPDF.exe");
const TEMP_DIR = os.tmpdir();

// ── Firebase ──────────────────────────────────────────────────────────────────
const app = initializeApp(FIREBASE_CONFIG);
const db  = getDatabase(app);

console.log(`[digoo-print-server ${VERSION}] Iniciando…`);
console.log(`  Impressora : ${PRINTER}`);
console.log(`  SumatraPDF : ${SUMATRA}`);
console.log(`  Temp dir   : ${TEMP_DIR}`);

if (!fs.existsSync(SUMATRA)) {
  console.error(`ERRO: SumatraPDF não encontrado em ${SUMATRA}`);
  process.exit(1);
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
let queueSize = 0;

async function sendHeartbeat() {
  try {
    await set(ref(db, "/print_server_status"), {
      ts: Date.now(),
      printer: PRINTER,
      version: VERSION,
      queue_size: queueSize,
      hostname: os.hostname(),
    });
  } catch (e) {
    console.warn("[heartbeat] Erro:", e.message);
  }
}

// Regras do Firebase exigem auth != null — entra anônimo antes de tudo
try {
  await signInAnonymously(getAuth(app));
  console.log("[auth] Login anônimo OK");
} catch (e) {
  console.error("[auth] Falha no login anônimo:", e.message);
  process.exit(1);
}

sendHeartbeat();
setInterval(sendHeartbeat, 5000);

// ── Impressão ─────────────────────────────────────────────────────────────────
async function imprimirPDF(pdf_base64, order_id) {
  const pdfPath = path.join(TEMP_DIR, `etiqueta_${order_id}_${Date.now()}.pdf`);
  fs.writeFileSync(pdfPath, Buffer.from(pdf_base64, "base64"));

  return new Promise((resolve, reject) => {
    execFile(
      SUMATRA,
      ["-print-to", PRINTER, "-print-settings", "fit", "-silent", pdfPath],
      { timeout: 30000 },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(pdfPath); } catch {}
        if (err) reject(new Error(stderr || err.message));
        else resolve();
      }
    );
  });
}

// ── Processar item da fila ────────────────────────────────────────────────────
const processando = new Set();

async function processarItem(order_id, data) {
  if (data.status !== "aguardando") return;
  if (processando.has(order_id)) return;
  processando.add(order_id);
  queueSize++;

  console.log(`[fila] Processando pedido ${order_id} (operador: ${data.operador || "—"})`);

  try {
    if (!data.pdf_base64) throw new Error("pdf_base64 ausente no payload");
    await imprimirPDF(data.pdf_base64, order_id);
    await update(ref(db, `/fila_impressao/${order_id}`), { status: "impresso", impresso_em: Date.now() });
    console.log(`[fila] ✓ Pedido ${order_id} impresso com sucesso`);
  } catch (e) {
    console.error(`[fila] ✗ Erro ao imprimir pedido ${order_id}:`, e.message);
    await update(ref(db, `/fila_impressao/${order_id}`), { status: "erro", erro_msg: e.message, erro_em: Date.now() }).catch(() => {});
  } finally {
    queueSize = Math.max(0, queueSize - 1);
    processando.delete(order_id);
  }
}

// ── Ouvir a fila em tempo real ────────────────────────────────────────────────
const filaRef = ref(db, "/fila_impressao");
onChildAdded(filaRef, (snap) => processarItem(snap.key, snap.val()));
onChildChanged(filaRef, (snap) => processarItem(snap.key, snap.val()));

console.log("[digoo-print-server] Ouvindo /fila_impressao… (Ctrl+C para sair)");
