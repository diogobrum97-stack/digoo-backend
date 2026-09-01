const CLIENT_ID     = process.env.BLING_CLIENT_ID;
const CLIENT_SECRET = process.env.BLING_CLIENT_SECRET;
const FIREBASE_URL  = process.env.FIREBASE_URL;
const REDIRECT_URI  = "https://digoo-backend.vercel.app/api/bling-auth";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { code, error } = req.query;

  // Passo 2: callback com o código
  if (code) {
    try {
      const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");

      const tokenRes = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
        method: "POST",
        headers: {
          "Authorization": `Basic ${creds}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });

      if (!tokenRes.ok) {
        const txt = await tokenRes.text();
        throw new Error(`Bling token error: ${txt.slice(0, 200)}`);
      }

      const tokenData = await tokenRes.json();
      tokenData.saved_at = Date.now();

      await fetch(`${FIREBASE_URL}/bling_token.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokenData),
      });

      return res.send(`
        <html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <div style="font-size:48px;margin-bottom:16px;">✓</div>
            <h2 style="color:#3dd68c;margin-bottom:8px;">Token Bling renovado!</h2>
            <p style="color:#888;">Pode fechar esta aba e voltar ao painel.</p>
          </div>
        </body></html>
      `);
    } catch (e) {
      return res.send(`
        <html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <div style="font-size:48px;margin-bottom:16px;">✗</div>
            <h2 style="color:#f87171;margin-bottom:8px;">Erro ao salvar token</h2>
            <p style="color:#888;">${e.message}</p>
          </div>
        </body></html>
      `);
    }
  }

  if (error) {
    return res.send(`<html><body style="font-family:sans-serif;color:#f87171;padding:40px;">Erro: ${error}</body></html>`);
  }

  // Refresh automático do token
  if (req.query.action === 'refresh') {
    try {
      const tokenSnap = await fetch(`${FIREBASE_URL}/bling_token.json`);
      const token = await tokenSnap.json();
      if (!token?.refresh_token) {
        return res.status(400).json({ ok: false, erro: 'Sem refresh_token salvo' });
      }
      const creds = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
      const refreshRes = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${creds}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: token.refresh_token,
        }),
      });
      if (!refreshRes.ok) {
        const txt = await refreshRes.text();
        return res.status(400).json({ ok: false, erro: `Bling refresh falhou: ${txt.slice(0,200)}` });
      }
      const newToken = await refreshRes.json();
      newToken.saved_at = Date.now();
      await fetch(`${FIREBASE_URL}/bling_token.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newToken),
      });
      return res.json({ ok: true, expires_in: newToken.expires_in });
    } catch(e) {
      return res.status(500).json({ ok: false, erro: e.message });
    }
  }

  // Passo 1: redireciona para o Bling
  const authUrl = `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=digoo`;
  return res.redirect(authUrl);
}
