const HOSTINGER_API = "https://api.mail.hostinger.com";
const MAILBOX = "diogo@digoo.com.br";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Buscar token do Firebase
  const fbUrl = process.env.FIREBASE_URL;
  let token = "";
  try {
    const tr = await fetch(`${fbUrl}/config/hostinger_mail_token.json`);
    token = (await tr.json()) || "";
  } catch(e) {}

  if (!token) return res.status(400).json({ ok: false, error: "Token Hostinger não configurado" });

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const action = req.query.action;

  // ── Listar mensagens ──
  if (action === "listar" && req.method === "GET") {
    try {
      const page = req.query.page || 1;
      const limit = req.query.limit || 20;
      const r = await fetch(`${HOSTINGER_API}/v1/messages?mailbox=${MAILBOX}&limit=${limit}&page=${page}`, { headers });
      const d = await r.json();
      return res.json({ ok: true, ...d });
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }); }
  }

  // ── Ler mensagem ──
  if (action === "ler" && req.method === "GET") {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ ok: false, error: "id obrigatório" });
      const r = await fetch(`${HOSTINGER_API}/v1/messages/${id}?mailbox=${MAILBOX}`, { headers });
      const d = await r.json();
      return res.json({ ok: true, message: d });
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }); }
  }

  // ── Responder mensagem ──
  if (action === "responder" && req.method === "POST") {
    try {
      const { id, texto, assunto } = req.body || {};
      if (!id || !texto) return res.status(400).json({ ok: false, error: "id e texto obrigatórios" });
      const r = await fetch(`${HOSTINGER_API}/v1/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          mailbox: MAILBOX,
          to: [{ address: req.body.para }],
          subject: assunto || "Re:",
          text: texto,
          in_reply_to: id,
        })
      });
      const d = await r.json();
      return res.json({ ok: r.ok, ...d });
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }); }
  }

  return res.status(404).json({ ok: false, error: "Action não encontrada" });
};

module.exports.config = { maxDuration: 30 };
