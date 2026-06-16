module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const FIREBASE_URL = process.env.FIREBASE_URL; // ex: https://digoo-equipe-default-rtdb.firebaseio.com

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
