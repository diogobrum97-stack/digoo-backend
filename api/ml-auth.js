export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── Whoami: confirma qual conta está por trás de um token ─────────────────
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
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // ── Refresh: renova token salvo no Firebase ────────────────────────────────
  if (req.query.action === "refresh") {
    const conta      = req.query.conta === "filial" ? "filial" : "matriz";
    const firebasePath = conta === "filial" ? "ml_token_filial" : "ml_token";
    try {
      const r = await fetch(`${process.env.FIREBASE_URL}/${firebasePath}.json`);
      const token = await r.json();
      if (!token?.refresh_token) throw new Error("Sem refresh_token salvo");
      const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type:    "refresh_token",
          client_id:     process.env.ML_CLIENT_ID,
          client_secret: process.env.ML_CLIENT_SECRET,
          refresh_token: token.refresh_token,
        }),
      });
      const data = await tokenRes.json();
      if (data.error) throw new Error(data.error);
      const expires_at = Date.now() + data.expires_in * 1000;
      await fetch(`${process.env.FIREBASE_URL}/${firebasePath}.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at, user_id: data.user_id, nickname: token.nickname || null }),
      });
      return res.json({ ok: true, expires_at });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // ── OAuth passo 1: redireciona pro ML ─────────────────────────────────────
  const { code, error, state, conta } = req.query;
  if (error) return res.redirect(`${process.env.PANEL_URL}?ml_error=${error}`);

  if (!code) {
    const contaAlvo = conta === "filial" ? "filial" : "matriz";
    const authUrl = new URL("https://auth.mercadolivre.com.br/authorization");
    authUrl.searchParams.set("client_id",     process.env.ML_CLIENT_ID);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("redirect_uri",  process.env.ML_REDIRECT_URI);
    authUrl.searchParams.set("state",         contaAlvo);
    return res.redirect(authUrl.toString());
  }

  // ── OAuth passo 2: troca código por token e salva ─────────────────────────
  const contaAlvo    = state === "filial" ? "filial" : "matriz";
  const firebasePath = contaAlvo === "filial" ? "ml_token_filial" : "ml_token";
  const NICKNAME_ESPERADO = {
    matriz: (process.env.ML_NICKNAME_MATRIZ || "DIGOOBRASIL").trim().toUpperCase(),
    filial: (process.env.ML_NICKNAME_FILIAL || "DIGOOBRASILSP").trim().toUpperCase(),
  };

  try {
    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type:    "authorization_code",
        client_id:     process.env.ML_CLIENT_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        code,
        redirect_uri:  process.env.ML_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(tokenData.error);

    const meRes = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const me = await meRes.json();
    const nicknameRecebido = String(me.nickname || "").trim().toUpperCase();

    if (nicknameRecebido !== NICKNAME_ESPERADO[contaAlvo]) {
      const msg = `Conta errada! Era pra conectar "${NICKNAME_ESPERADO[contaAlvo]}" (${contaAlvo}), mas veio "${me.nickname || me.id}". Nada foi salvo.`;
      return res.redirect(`${process.env.PANEL_URL}?ml_error=${encodeURIComponent(msg)}`);
    }

    const expires_at = Date.now() + tokenData.expires_in * 1000;
    await fetch(`${process.env.FIREBASE_URL}/${firebasePath}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, expires_at, user_id: tokenData.user_id, nickname: me.nickname || null }),
    });
    return res.redirect(`${process.env.PANEL_URL}?ml_connected=1&conta=${contaAlvo}`);
  } catch(e) {
    return res.redirect(`${process.env.PANEL_URL}?ml_error=${encodeURIComponent(e.message)}`);
  }
}
