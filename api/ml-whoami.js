export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = req.query.token;
  if (!token) return res.status(400).json({ error: "Token ausente" });

  try {
    const r = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();
    if (!data.id) return res.status(401).json({ error: "Token inválido" });
    return res.json({
      id: data.id,
      nickname: data.nickname || null,
      email: data.email || null,
      site_id: data.site_id || null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
