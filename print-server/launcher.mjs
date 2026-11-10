/**
 * launcher.mjs — instalado UMA vez no PC da impressora. Não precisa mexer de novo.
 *
 * 1. Baixa a versão mais nova do server.js do GitHub (se mudou e não tem erro de sintaxe)
 * 2. Roda o server.js e reinicia se ele cair
 * 3. Se a versão nova cair 3x seguidas logo ao iniciar, volta para a anterior
 *
 * Código de saída do server.js: 0 = reiniciar, 10 = atualizar e reiniciar.
 */
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(DIR, "server.js");
const PREV = path.join(DIR, "server.prev.js");
const NOVO = path.join(DIR, "server.new.js");
const RUIM = path.join(DIR, "versao-ruim.txt");
const URL = "https://api.github.com/repos/diogobrum97-stack/digoo-backend/contents/print-server/server.js?ref=main";

const log = (...a) => console.log(`[launcher ${new Date().toLocaleTimeString("pt-BR", { hour12: false })}]`, ...a);
const hash = s => crypto.createHash("sha1").update(s).digest("hex");
const sleep = ms => new Promise(r => setTimeout(r, ms));
process.on("SIGINT", () => log("Ctrl+C ignorado — feche a janela para parar."));

async function atualizar() {
  try {
    const r = await fetch(URL, { headers: { Accept: "application/vnd.github.raw", "User-Agent": "digoo-print-launcher" } });
    if (!r.ok) { log(`GitHub respondeu ${r.status} — mantendo versão local`); return; }
    const codigo = await r.text();
    const atual = fs.existsSync(SERVER) ? fs.readFileSync(SERVER, "utf8") : "";
    if (codigo === atual) { log("Código já está na versão mais nova"); return; }
    if (fs.existsSync(RUIM) && fs.readFileSync(RUIM, "utf8").trim() === hash(codigo)) {
      log("Versão do GitHub já falhou antes — mantendo a atual"); return;
    }
    fs.writeFileSync(NOVO, codigo);
    const chk = spawnSync(process.execPath, ["--check", NOVO], { encoding: "utf8" });
    if (chk.status !== 0) { log("Versão nova tem erro de sintaxe — ignorada:\n" + chk.stderr); fs.unlinkSync(NOVO); return; }
    if (atual) fs.writeFileSync(PREV, atual);
    fs.renameSync(NOVO, SERVER);
    log("server.js atualizado do GitHub");
  } catch (e) {
    log("Sem internet / erro ao atualizar — mantendo versão local:", e.message);
  }
}

let falhasRapidas = 0;
let atualizarAgora = true;
while (true) {
  if (atualizarAgora) await atualizar();
  atualizarAgora = true; // sempre confere no próximo início
  const inicio = Date.now();
  log("Iniciando server.js…");
  const code = await new Promise(res => {
    const p = spawn(process.execPath, [SERVER], { stdio: "inherit", cwd: DIR });
    p.on("exit", c => res(c));
    p.on("error", e => { log("Erro ao iniciar:", e.message); res(1); });
  });
  const durou = Date.now() - inicio;
  log(`server.js saiu (código ${code}) após ${Math.round(durou / 1000)}s`);

  if (code !== 0 && code !== 10 && durou < 30000) falhasRapidas++; else falhasRapidas = 0;
  if (falhasRapidas >= 3 && fs.existsSync(PREV)) {
    log("Caiu 3x seguidas ao iniciar — voltando para a versão anterior");
    fs.writeFileSync(RUIM, hash(fs.readFileSync(SERVER, "utf8")));
    fs.copyFileSync(PREV, SERVER);
    falhasRapidas = 0;
    atualizarAgora = false;
  }
  await sleep(code === 0 || code === 10 ? 1000 : 5000);
}
