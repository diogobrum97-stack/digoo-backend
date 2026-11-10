/**
 * digoo-print-server — servidor de impressão de etiquetas (Windows)
 *
 * Tudo é controlado remotamente pelo OPS (Config → Impressão) via Firebase:
 *   /fila_impressao/{id}        fila de etiquetas (status: aguardando → impresso | erro | expirado)
 *   /print_server_status        heartbeat a cada 5s (+ lista de impressoras instaladas)
 *   /print_server/config        { printer, print_settings, paused, max_idade_h }
 *   /print_server/cmd           { acao, status:"pendente", ts }  → restart | update | test | printers | limpar_antigos
 *   /print_server/logs          últimas linhas de log
 *
 * Este arquivo é baixado do GitHub pelo launcher.mjs a cada início.
 * Para mudar o comportamento: edite aqui, faça push, e clique "Atualizar código" no OPS.
 */
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onChildAdded, onChildChanged, onValue, update, set, get } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VERSION = "3.0.0";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBbaxrk7TXl9BiAZJzHwnJ6vI_LA5g-zzk",
  authDomain: "digoo-equipe.firebaseapp.com",
  databaseURL: "https://digoo-equipe-default-rtdb.firebaseio.com",
  projectId: "digoo-equipe",
  storageBucket: "digoo-equipe.firebasestorage.app",
  messagingSenderId: "152821168439",
  appId: "1:152821168439:web:6712b7821b1de4517782b2",
};
const SUMATRA = path.join(__dirname, "SumatraPDF.exe");
const TEMP_DIR = os.tmpdir();
const STARTED_AT = Date.now();

// Config padrão — sobrescrita por /print_server/config
const config = { printer: "A82pro", print_settings: "fit", paused: false, max_idade_h: 3 };

// ── Log local + remoto ────────────────────────────────────────────────────────
const logBuffer = [];
let logsSujos = false;
function registrar(nivel, args) {
  const msg = args.map(a => (a instanceof Error ? a.stack || a.message : typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  const hora = new Date().toLocaleTimeString("pt-BR", { hour12: false });
  logBuffer.push(`${hora} ${nivel} ${msg}`.slice(0, 500));
  if (logBuffer.length > 150) logBuffer.shift();
  logsSujos = true;
}
for (const [fn, nivel] of [["log", "INFO"], ["warn", "AVISO"], ["error", "ERRO"]]) {
  const orig = console[fn].bind(console);
  console[fn] = (...args) => { orig(...args); registrar(nivel, args); };
}

process.on("uncaughtException", e => console.error("[não tratado]", e));
process.on("unhandledRejection", e => console.error("[promise rejeitada]", e));
process.on("SIGINT", () => console.warn("Ctrl+C ignorado — feche a janela para parar."));

console.log(`[digoo-print-server ${VERSION}] Iniciando em ${os.hostname()}`);
if (!fs.existsSync(SUMATRA)) console.error(`SumatraPDF não encontrado em ${SUMATRA} — impressão não vai funcionar`);

// ── Firebase ──────────────────────────────────────────────────────────────────
const app = initializeApp(FIREBASE_CONFIG);
const db = getDatabase(app);
try {
  await signInAnonymously(getAuth(app));
  console.log("Login anônimo OK");
} catch (e) {
  console.error("Falha no login anônimo:", e.message);
  process.exit(1); // launcher reinicia
}

// ── Impressoras instaladas ────────────────────────────────────────────────────
let impressoras = [];
let impressoraPadrao = null;
function sh(cmd, args) {
  return new Promise(res => execFile(cmd, args, { timeout: 20000, windowsHide: true }, (err, out) => res(err ? "" : String(out))));
}
async function listarImpressoras() {
  if (process.platform !== "win32") return;
  const out = await sh("powershell", ["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"]);
  let nomes = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!nomes.length) {
    const w = await sh("wmic", ["printer", "get", "name"]);
    nomes = w.split(/\r?\n/).map(s => s.trim()).filter(s => s && s !== "Name");
  }
  const pad = await sh("powershell", ["-NoProfile", "-Command",
    "(Get-CimInstance -ClassName Win32_Printer | Where-Object Default).Name"]);
  impressoras = nomes;
  impressoraPadrao = pad.trim() || null;
}
await listarImpressoras();
console.log(`Impressoras: ${impressoras.join(", ") || "(nenhuma encontrada)"}`);
setInterval(listarImpressoras, 5 * 60 * 1000);

// ── Heartbeat + logs ──────────────────────────────────────────────────────────
let queueSize = 0;
let ultimoErro = null;
let ultimaImpressao = null;
async function heartbeat() {
  try {
    await set(ref(db, "/print_server_status"), {
      ts: Date.now(),
      printer: config.printer,
      printer_instalada: impressoras.length ? impressoras.includes(config.printer) : null,
      printers: impressoras,
      printer_padrao: impressoraPadrao,
      paused: !!config.paused,
      version: VERSION,
      queue_size: queueSize,
      hostname: os.hostname(),
      started_at: STARTED_AT,
      sumatra_ok: fs.existsSync(SUMATRA),
      ultimo_erro: ultimoErro,
      ultima_impressao: ultimaImpressao,
    });
    if (logsSujos) {
      logsSujos = false;
      await set(ref(db, "/print_server/logs"), { ts: Date.now(), linhas: logBuffer.slice(-150) });
    }
  } catch (e) {
    process.stderr.write(`[heartbeat] ${e.message}\n`);
  }
}
heartbeat();
setInterval(heartbeat, 5000);

// ── Impressão ─────────────────────────────────────────────────────────────────
function imprimirArquivo(pdfPath) {
  return new Promise((resolve, reject) => {
    execFile(
      SUMATRA,
      ["-print-to", config.printer, "-print-settings", config.print_settings || "fit", "-silent", pdfPath],
      { timeout: 60000, windowsHide: true },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(pdfPath); } catch {}
        if (err) reject(new Error((stderr && String(stderr).trim()) || err.message));
        else resolve();
      }
    );
  });
}
async function imprimirPDF(buffer, nome) {
  if (impressoras.length && !impressoras.includes(config.printer)) {
    throw new Error(`Impressora "${config.printer}" não está instalada neste PC. Instaladas: ${impressoras.join(", ")}`);
  }
  const pdfPath = path.join(TEMP_DIR, `etiqueta_${nome}_${Date.now()}.pdf`);
  fs.writeFileSync(pdfPath, buffer);
  console.log(`Enviando ${nome} para ${config.printer}…`);
  await imprimirArquivo(pdfPath);
}

// PDF de teste (10x15cm) gerado na hora
function pdfTeste() {
  const texto = `TESTE DIGOO - ${new Date().toLocaleString("pt-BR")} - ${config.printer}`.replace(/[()\\]/g, "");
  const stream = `BT /F1 12 Tf 15 380 Td (${texto.slice(0, 60)}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 283 425] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(pdf, "latin1")); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

// ── Fila ──────────────────────────────────────────────────────────────────────
const processando = new Set();
const pendentesPausa = new Map();

async function processarItem(order_id, data) {
  if (!data || data.status !== "aguardando") return;
  if (processando.has(order_id)) return;
  const maxIdade = (Number(config.max_idade_h) || 3) * 3600000;
  if (data.ts && Date.now() - data.ts > maxIdade) {
    console.log(`Ignorado ${order_id} — enviado há ${Math.round((Date.now() - data.ts) / 3600000)}h (use Reimprimir no OPS)`);
    await update(ref(db, `/fila_impressao/${order_id}`), { status: "expirado", expirado_em: Date.now() }).catch(() => {});
    return;
  }
  if (config.paused) { pendentesPausa.set(order_id, data); return; }

  processando.add(order_id);
  queueSize++;
  console.log(`Processando ${order_id} (operador: ${data.operador || "—"})`);
  try {
    if (!data.pdf_base64) throw new Error("pdf_base64 ausente no payload");
    await imprimirPDF(Buffer.from(data.pdf_base64, "base64"), order_id);
    await update(ref(db, `/fila_impressao/${order_id}`), { status: "impresso", impresso_em: Date.now(), impressora: config.printer, erro_msg: null });
    ultimaImpressao = { order_id, ts: Date.now() };
    console.log(`✓ ${order_id} impresso`);
  } catch (e) {
    ultimoErro = { msg: e.message, ts: Date.now(), order_id };
    console.error(`✗ Erro ao imprimir ${order_id}:`, e.message);
    await update(ref(db, `/fila_impressao/${order_id}`), { status: "erro", erro_msg: e.message, erro_em: Date.now() }).catch(() => {});
  } finally {
    queueSize = Math.max(0, queueSize - 1);
    processando.delete(order_id);
  }
}

// ── Config remota ─────────────────────────────────────────────────────────────
let filaIniciada = false;
onValue(ref(db, "/print_server/config"), snap => {
  const c = snap.val();
  if (!c) { set(ref(db, "/print_server/config"), config).catch(() => {}); }
  else {
    const antes = JSON.stringify(config);
    Object.assign(config, c);
    if (JSON.stringify(config) !== antes) console.log(`Config: impressora="${config.printer}" pausado=${!!config.paused} ajuste=${config.print_settings}`);
  }
  if (!config.paused && pendentesPausa.size) {
    const itens = [...pendentesPausa]; pendentesPausa.clear();
    itens.forEach(([k, v]) => processarItem(k, v));
  }
  if (!filaIniciada) {
    filaIniciada = true;
    const filaRef = ref(db, "/fila_impressao");
    onChildAdded(filaRef, s => processarItem(s.key, s.val()));
    onChildChanged(filaRef, s => processarItem(s.key, s.val()));
    console.log("Ouvindo /fila_impressao…");
  }
});

// ── Comandos remotos ──────────────────────────────────────────────────────────
onValue(ref(db, "/print_server/cmd"), async snap => {
  const cmd = snap.val();
  if (!cmd || cmd.status !== "pendente") return;
  const fim = (status, resultado) => update(ref(db, "/print_server/cmd"), { status, resultado: resultado || null, feito_em: Date.now(), hostname: os.hostname() });
  console.log(`Comando recebido: ${cmd.acao}`);
  try {
    if (cmd.acao === "restart") { await fim("feito", "Reiniciando…"); await heartbeat(); process.exit(0); }
    if (cmd.acao === "update") { await fim("feito", "Baixando código novo e reiniciando…"); await heartbeat(); process.exit(10); }
    if (cmd.acao === "printers") { await listarImpressoras(); await heartbeat(); return fim("feito", impressoras.join(", ") || "nenhuma"); }
    if (cmd.acao === "test") { await imprimirPDF(pdfTeste(), "teste"); console.log("✓ Página de teste impressa"); return fim("feito", `Teste enviado para ${config.printer}`); }
    if (cmd.acao === "limpar_antigos") {
      const fila = (await get(ref(db, "/fila_impressao"))).val() || {};
      let n = 0;
      for (const [k, v] of Object.entries(fila)) {
        if (v?.status === "aguardando" && !processando.has(k)) { await update(ref(db, `/fila_impressao/${k}`), { status: "expirado", expirado_em: Date.now() }); n++; }
      }
      return fim("feito", `${n} item(ns) marcados como expirado`);
    }
    return fim("erro", `Ação desconhecida: ${cmd.acao}`);
  } catch (e) {
    ultimoErro = { msg: e.message, ts: Date.now() };
    console.error(`Comando ${cmd.acao} falhou:`, e.message);
    return fim("erro", e.message);
  }
});
