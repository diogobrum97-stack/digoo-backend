export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Modo "whoami": não é parte do fluxo de OAuth, só confirma qual conta ML
  // está por trás de um token já salvo. Fica no mesmo arquivo/rota do ml-auth
  // pra não gastar mais uma Serverless Function (limite de 12 no plano Hobby).
  if (req.query.whoami) {
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: "Token ausente" });
    try {
      const r = await fetch("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!data.id) return res.status(401).json({ error: "Token inválido" });
      return res.json({ id: data.id, nickname: data.nickname || null, email: data.email || null, site_id: data.site_id || null });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  const { code, error, state, conta } = req.query;
  if (error) return res.redirect(`${process.env.PANEL_URL}?ml_error=${error}`);

  // Passo 1: sem "code" ainda -> redireciona pro Mercado Livre pra autorizar.
  // "conta" define qual conta estamos conectando (matriz | filial). Vira "state"
  // e o Mercado Livre devolve esse valor no callback, sem alterar nada.
  if (!code) {
    const contaAlvo = conta === "filial" ? "filial" : "matriz";
    const authUrl = new URL("https://auth.mercadolivre.com.br/authorization");
    authUrl.searchParams.set("client_id", process.env.ML_CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri", process.env.ML_REDIRECT_URI);
    authUrl.searchParams.set("state", contaAlvo);
    return res.redirect(authUrl.toString());
  }

  // Passo 2: já temos "code" -> troca por token e salva no Firebase.
  // "state" veio de volta do Mercado Livre com o valor que mandamos no passo 1.
  const contaAlvo = state === "filial" ? "filial" : "matriz";
  const firebasePath = contaAlvo === "filial" ? "ml_token_filial" : "ml_token";

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
    await fetch(`${process.env.FIREBASE_URL}/${firebasePath}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, expires_at, user_id: tokenData.user_id }),
    });
    return res.redirect(`${process.env.PANEL_URL}?ml_connected=1&conta=${contaAlvo}`);
  } catch (e) {
    return res.redirect(`${process.env.PANEL_URL}?ml_error=${e.message}`);
  }
}
