const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const FIREBASE_URL  = process.env.FIREBASE_URL;
const REDIRECT_URI  = "https://digoo-backend.vercel.app/api/google-auth";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
].join(" ");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { code, error } = req.query;

  // Passo 2: callback com o código
  if (code) {
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) {
        const txt = await tokenRes.text();
        throw new Error(`Google token error: ${txt.slice(0, 200)}`);
      }
      const tokenData = await tokenRes.json();
      tokenData.saved_at = Date.now();

      // Salva no Firebase
      await fetch(`${FIREBASE_URL}/google_token.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokenData),
      });

      return res.send(`
        <html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <div style="font-size:48px;margin-bottom:16px;">✓</div>
            <h2 style="color:#3dd68c;margin-bottom:8px;">Google conectado!</h2>
            <p style="color:#888;">Gmail e Drive autorizados. Pode fechar esta aba.</p>
          </div>
        </body></html>
      `);
    } catch(e) {
      return res.send(`
        <html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
          <div style="text-align:center;">
            <div style="font-size:48px;margin-bottom:16px;">✗</div>
            <h2 style="color:#f87171;">Erro ao conectar</h2>
            <p style="color:#888;">${e.message}</p>
          </div>
        </body></html>
      `);
    }
  }

  if (error) {
    return res.send(`<html><body style="color:#f87171;padding:40px;">Erro: ${error}</body></html>`);
  }

  // Passo 1: redireciona para o Google
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent"); // força refresh_token
  authUrl.searchParams.set("state", "digoo");

  return res.redirect(authUrl.toString());
}
