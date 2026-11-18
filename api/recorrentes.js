// fetch que passa pelo Admin SDK nas chamadas ao Firebase (as regras exigem login)
import { fetch } from "../lib/fb-fetch.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const FIREBASE_URL = process.env.FIREBASE_URL; // ex: https://digoo-equipe-default-rtdb.firebaseio.com

  // Tarefa por voz (atalho da Siri) — POST ?action=tarefa-voz  { chave, texto }
  if (req.query?.action === "tarefa-voz") return tarefaVoz(req, res, FIREBASE_URL);

  try {
    // GET — lista todas
    if (req.method === "GET") {
      const r = await fetch(`${FIREBASE_URL}/recorrentes.json`);
      const data = await r.json() || {};
      const list = Object.entries(data).map(([id, rec]) => ({ id, ...rec }));
      return res.json({ ok: true, data: list });
    }

    // POST — cria nova
    if (req.method === "POST") {
      const { text, frequency, member, prio, dayOfWeek, dayOfMonth } = req.body;
      if (!text || !frequency) return res.status(400).json({ error: "text e frequency são obrigatórios" });

      const payload = {
        text,
        frequency,
        member: member || "Diogo",
        prio: prio || "importante",
        dayOfWeek: dayOfWeek ?? null,
        dayOfMonth: dayOfMonth ?? null,
        active: true,
        createdAt: new Date().toISOString(),
      };

      const r = await fetch(`${FIREBASE_URL}/recorrentes.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      return res.json({ ok: true, id: data.name, message: `Recorrente "${text}" salva` });
    }

    // DELETE — remove por id
    if (req.method === "DELETE") {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: "id é obrigatório" });
      await fetch(`${FIREBASE_URL}/recorrentes/${id}.json`, { method: "DELETE" });
      return res.json({ ok: true, message: "Removida" });
    }

    return res.status(405).json({ error: "Método não permitido" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};


// ════════════════════════════════════════════════════════════════════════════
// Tarefa por voz — o atalho "Tarefa no OPS" da Siri manda o texto ditado.
// Protegido pela chave gerada em Config › Geral › Tarefa por voz (/config_voz/chave).
// Entende pra quem é, prioridade e prazo (Haiku; se falhar, regras simples) e cria em /tasks.
// Responde { ok, fala } — o atalho lê "fala" em voz alta.
// ════════════════════════════════════════════════════════════════════════════
const MEMBROS_VOZ = ["Diogo", "Bruno", "Larissa"];
const PRIO_NOME = { superurgente: "Super urgente", urgente: "Urgente", importante: "Importante", normal: "Normal" };
const DIAS_SEM = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const hojeBRT = () => new Date(Date.now() - 3 * 3600e3);                      // data "de parede" em Brasília (UTC-3)
const isoDia = d => d.toISOString().slice(0, 10);
const somaDias = (d, n) => new Date(d.getTime() + n * 864e5);
const semAcento = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function interpretarRegras(texto) {
  let t = ` ${texto.trim()} `;
  const low = () => semAcento(t);
  let member = "Diogo";
  const m = low().match(/^\s*(?:pr[ao]|para)?\s*(?:o |a )?(bruno|larissa|diogo|mim)\b[\s,:-]*/);
  if (m) { member = m[1] === "mim" ? "Diogo" : m[1][0].toUpperCase() + m[1].slice(1); t = " " + t.trim().slice(m[0].trim().length).replace(/^[\s,:-]+/, "") + " "; }
  let prio = "importante";
  for (const [re, p] of [[/\bsuper ?urgente\b/, "superurgente"], [/\burgente\b/, "urgente"], [/\bimportante\b/, "importante"], [/\bnormal\b/, "normal"]]) {
    const mm = low().match(re); if (mm) { prio = p; t = t.slice(0, mm.index) + t.slice(mm.index + mm[0].length); break; }
  }
  const hoje = hojeBRT(); let prazo = null;
  const regras = [
    [/\b(?:ate |pra |para )?depois de amanha\b/, () => somaDias(hoje, 2)],
    [/\b(?:ate |pra |para )?amanha\b/, () => somaDias(hoje, 1)],
    [/\b(?:ate |pra |para )?hoje\b/, () => hoje],
    [/\b(?:ate |pra |para )?(?:o |a )?dia (\d{1,2})\b/, mm => { const n = +mm[1]; let d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), n)); if (d < somaDias(hoje, -0.5)) d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, n)); return d; }],
    [/\b(?:ate |pra |para )?(?:a |o |na |no )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira| feira)?\b/, mm => { const alvo = DIAS_SEM.map(semAcento).indexOf(mm[1]); let n = (alvo - hoje.getUTCDay() + 7) % 7 || 7; return somaDias(hoje, n); }],
  ];
  for (const [re, fn] of regras) { const mm = low().match(re); if (mm) { prazo = isoDia(fn(mm)); t = t.slice(0, mm.index) + t.slice(mm.index + mm[0].length); break; } }
  const texto2 = t.replace(/\s+/g, " ").replace(/^[\s,.-]+|[\s,.-]+$/g, "");
  return { member, prio, prazo, texto: texto2 ? texto2[0].toUpperCase() + texto2.slice(1) : texto.trim() };
}

async function interpretarHaiku(texto) {
  const hoje = hojeBRT();
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5", max_tokens: 200,
        system: `Você transforma uma frase ditada em uma tarefa. Hoje é ${DIAS_SEM[hoje.getUTCDay()]}, ${isoDia(hoje)} (Brasília).
Responda SÓ um JSON: {"member":"Diogo|Bruno|Larissa","prio":"superurgente|urgente|importante|normal","prazo":"AAAA-MM-DD ou null","texto":"..."}
- member: pra quem é a tarefa. "pra mim", sem nome ou outro nome → "Diogo".
- prio: só se a frase disser; senão "importante".
- prazo: hoje, amanhã, dia da semana (o próximo), "dia 25" (deste mês, ou do próximo se já passou). Sem prazo → null.
- texto: a tarefa em si, curta e clara, começando com verbo, sem o nome da pessoa, a prioridade nem o prazo. Corrija erros de ditado óbvios. Termos da empresa: Full, Bling, ML, Mercado Livre, Filial, Matriz, SKU, NF.`,
        messages: [{ role: "user", content: texto }],
      }),
    });
    const d = await r.json();
    const j = JSON.parse((d.content?.[0]?.text || "").match(/\{[\s\S]*\}/)?.[0] || "null");
    if (!j?.texto) return null;
    return {
      member: MEMBROS_VOZ.includes(j.member) ? j.member : "Diogo",
      prio: PRIO_NOME[j.prio] ? j.prio : "importante",
      prazo: /^\d{4}-\d{2}-\d{2}$/.test(j.prazo || "") ? j.prazo : null,
      texto: String(j.texto).slice(0, 300),
    };
  } catch (_) { return null; } finally { clearTimeout(to); }
}

async function tarefaVoz(req, res, FIREBASE_URL) {
  const fala = (status, ok, msg, extra = {}) => res.status(status).json({ ok, fala: msg, ...extra });
  if (req.method !== "POST") return fala(405, false, "Use o atalho Tarefa no OPS.");
  const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
  const chave = String(body.chave || "").trim(), texto = String(body.texto || "").trim();
  const cfg = await (await fetch(`${FIREBASE_URL}/config_voz.json`)).json().catch(() => null);
  if (!cfg?.chave || chave.length < 20 || chave !== cfg.chave) return fala(401, false, "Chave inválida. Copie a chave de novo no OPS, em Configurações.");
  if (texto.length < 3) return fala(400, false, "Não ouvi a tarefa. Tenta de novo.");

  const t = (await interpretarHaiku(texto)) || interpretarRegras(texto);
  let textoFinal = t.texto;
  let dueDate = null, prazoFala = "";
  if (t.prazo) {
    dueDate = `${t.prazo}T23:59:00-03:00`;
    const d = new Date(`${t.prazo}T12:00:00Z`);
    const diff = Math.round((d - new Date(isoDia(hojeBRT()) + "T12:00:00Z")) / 864e5);
    const ddmm = `${t.prazo.slice(8, 10)}/${t.prazo.slice(5, 7)}`;
    prazoFala = diff === 0 ? "prazo hoje" : diff === 1 ? "prazo amanhã" : `prazo ${DIAS_SEM[d.getUTCDay()]}, ${ddmm}`;
    textoFinal += ` (até ${DIAS_SEM[d.getUTCDay()].slice(0, 3)} ${ddmm})`;
  }
  const tarefa = { member: t.member, text: textoFinal, prio: t.prio, done: false, progress: false, delegatedBy: t.member === "Diogo" ? null : "Diogo", createdAt: Date.now(), origem: "voz", ...(dueDate ? { dueDate } : {}) };
  const r = await fetch(`${FIREBASE_URL}/tasks.json`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tarefa) });
  if (!r.ok) return fala(500, false, "Não consegui salvar a tarefa no OPS. Tenta de novo em instantes.");
  if (t.member !== "Diogo") await fetch(`${FIREBASE_URL}/flashes/${t.member}.json`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ts: Date.now(), msg: "Nova tarefa de Diogo!" }) }).catch(() => {});
  await fetch(`${FIREBASE_URL}/config_voz/ultima.json`, { method: "PUT", body: JSON.stringify(Date.now()) }).catch(() => {});
  const pra = t.member === "Diogo" ? "pra você" : `para ${t.member === "Larissa" ? "a" : "o"} ${t.member}`;
  return fala(200, true, `Tarefa criada ${pra} · ${PRIO_NOME[t.prio]}${prazoFala ? " · " + prazoFala : ""}.`, { tarefa: { para: t.member, texto: textoFinal, prioridade: t.prio, prazo: t.prazo } });
}

export { interpretarRegras };
