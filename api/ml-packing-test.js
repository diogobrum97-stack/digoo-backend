module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Busca token do Firebase automaticamente
  let token = req.query.token;
  const conta = req.query.conta === "matriz" ? "ml_token" : "ml_token_filial";

  if (!token && process.env.FIREBASE_URL) {
    try {
      const tR = await fetch(`${process.env.FIREBASE_URL}/${conta}.json`);
      const tData = await tR.json();
      token = tData?.access_token;
    } catch (e) { /* segue */ }
  }

  if (!token) return res.status(400).json({ error: "Token ausente — conecte o ML primeiro" });

  try {
    // 1. Pegar user_id
    const meRes = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    const me = await meRes.json();
    if (!me.id) return res.status(401).json({ error: "Token inválido", detail: me });
    const userId = me.id;

    // 2. Testar endpoints de packing/fulfillment
    const endpoints = [
      { label: "packing_requests (v1)",     url: `https://api.mercadolibre.com/packing_requests?seller_id=${userId}&status=open&limit=5` },
      { label: "packing_requests (v2)",     url: `https://api.mercadolibre.com/v2/packing_requests?seller_id=${userId}&status=open&limit=5` },
      { label: "fulfillment/inbound",       url: `https://api.mercadolibre.com/fulfillment/inbound/orders?seller_id=${userId}&limit=5` },
      { label: "logistics/shipments/full",  url: `https://api.mercadolibre.com/logistics/shipments?seller_id=${userId}&type=fulfillment&limit=5` },
      { label: "inventory (warehouses)",    url: `https://api.mercadolibre.com/fulfillment/stock/seller_product_stock_details?seller_id=${userId}&limit=5` },
    ];

    const results = await Promise.all(endpoints.map(async ({ label, url }) => {
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await r.json();
        return { label, url: url.replace("https://api.mercadolibre.com", ""), status: r.status, data };
      } catch(e) {
        return { label, status: "fetch_error", error: e.message };
      }
    }));

    return res.json({ ok: true, userId, nickname: me.nickname, results });
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
