/**
 * digoo-print-server — v2.0
 * Observa /fila_impressao no Firebase em tempo real.
 * Quando chega um item com status "aguardando", imprime via SumatraPDF
 * e atualiza o status para "impresso" ou "erro".
 * Envia heartbeat a /print_server_status a cada 5 segundos.
 *
 * Instalar dependências (uma vez):
 *   cd C:\digoo-print-server
 *   npm install firebase node-fetch
 *
 * Iniciar / reiniciar com PM2:
 *   pm2 delete digoo-print-server
 *   pm2 start server.js --name digoo-print-server
 *   pm2 save
 */

const { initializeApp } = require("firebase/app");
const { getDatabase, ref, onChildAdded, onChildChanged, update, set, get } = require("firebase/database");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// ── Configuração ──────────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDnZXDmxrsBYIHSR8vqbX5hRVS1B_k0glY",
  authDomain: "digoo-equipe.firebaseapp.com",
  databaseURL: "https://digoo-equipe-default-rtdb.firebaseio.com",
  projectId: "digoo-equipe",
  storageBucket: "digoo-equipe.appspot.com",
  messagingSenderId: "246513516738",
  appId: "1:246513516738:web:4ddb07b2a5c4a9e7b86123",
};

const VERSION   = "2.0.0";
const PRINTER   = "A82pro";
const SUMATRA   = path.join(__dirname, "SumatraPDF.exe");
const TEMP_DIR  = os.tmpdir();

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
// Atualiza /print_server_status a cada 5 segundos com hora, impressora e versão
let queueSize = 0; // atualizado durante o processamento

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

sendHeartbeat();
setInterval(sendHeartbeat, 5000);

// ── Impressão ─────────────────────────────────────────────────────────────────
async function imprimirPDF(pdf_base64, order_id) {
  const pdfPath = path.join(TEMP_DIR, `etiqueta_${order_id}_${Date.now()}.pdf`);

  // Salva o PDF em arquivo temporário
  const buf = Buffer.from(pdf_base64, "base64");
  fs.writeFileSync(pdfPath, buf);

  return new Promise((resolve, reject) => {
    execFile(
      SUMATRA,
      ["-print-to", PRINTER, "-print-settings", "fit", "-silent", pdfPath],
      { timeout: 30000 },
      (err, stdout, stderr) => {
        // Limpa o arquivo temporário
        try { fs.unlinkSync(pdfPath); } catch {}

        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve();
        }
      }
    );
  });
}

// ── Processar item da fila ────────────────────────────────────────────────────
const processando = new Set(); // evita processar o mesmo pedido duas vezes

async function processarItem(order_id, data) {
  if (data.status !== "aguardando") return;
  if (processando.has(order_id)) return;
  processando.add(order_id);

  queueSize++;
  console.log(`[fila] Processando pedido ${order_id} (operador: ${data.operador || "—"})`);

  try {
    if (!data.pdf_base64) throw new Error("pdf_base64 ausente no payload");
    await imprimirPDF(data.pdf_base64, order_id);

    // Marca como impresso
    await update(ref(db, `/fila_impressao/${order_id}`), {
      status: "impresso",
      impresso_em: Date.now(),
    });
    console.log(`[fila] ✓ Pedido ${order_id} impresso com sucesso`);
  } catch (e) {
    console.error(`[fila] ✗ Erro ao imprimir pedido ${order_id}:`, e.message);
    await update(ref(db, `/fila_impressao/${order_id}`), {
      status: "erro",
      erro_msg: e.message,
      erro_em: Date.now(),
    }).catch(() => {});
  } finally {
    queueSize = Math.max(0, queueSize - 1);
    processando.delete(order_id);
  }
}

// ── Ouvir a fila em tempo real ────────────────────────────────────────────────
// onChildAdded: dispara para cada filho existente + novos que chegarem
// onChildChanged: dispara quando um filho muda (ex: status volta para "aguardando")
const filaRef = ref(db, "/fila_impressao");

onChildAdded(filaRef, (snap) => {
  processarItem(snap.key, snap.val());
});

onChildChanged(filaRef, (snap) => {
  processarItem(snap.key, snap.val());
});

console.log("[digoo-print-server] Ouvindo /fila_impressao… (Ctrl+C para sair)");
