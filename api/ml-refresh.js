export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    const r = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
    const token = await r.json();
    if (!token || !token.refresh_token) throw new Error("Sem token salvo");
    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        refresh_token: token.refresh_token,
      }),
    });
    const data = await tokenRes.json();
    if (data.error) throw new Error(data.error);
    const expires_at = Date.now() + (data.expires_in * 1000);
    await fetch(`${process.env.FIREBASE_URL}/ml_token.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at, user_id: data.user_id }),
    });
    return res.json({ ok: true, expires_at });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
