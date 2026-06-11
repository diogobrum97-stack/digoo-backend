export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  const { code, error } = req.query;
  if (error) return res.redirect(`${process.env.PANEL_URL}?ml_error=${error}`);
  if (!code) {
    const authUrl = new URL("https://auth.mercadolivre.com.br/authorization");
    authUrl.searchParams.set("client_id", process.env.ML_CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", process.env.ML_REDIRECT_URI);
    return res.redirect(authUrl.toString());
  }
  try {
    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        code,
        redirect_uri: process.env.ML_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error);
    const expires_at = Date.now() + (tokenData.expires_in * 1000);
    await fetch(`${process.env.FIREBASE_URL}/ml_token.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, expires_at, user_id: tokenData.user_id }),
    });
    return res.redirect(`${process.env.PANEL_URL}?ml_connected=1`);
  } catch (e) {
    return res.redirect(`${process.env.PANEL_URL}?ml_error=${e.message}`);
  }
}
