export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    const r = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
    const token = await r.json();
    if (!token || !token.access_token) throw new Error("Não conectado ao Mercado Livre");
    if (token.expires_at && Date.now() > token.expires_at - 600000) {
      await fetch(`${process.env.VERCEL_URL}/api/ml-refresh`);
      const r2 = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
      const fresh = await r2.json();
      token.access_token = fresh.access_token;
      token.user_id = fresh.user_id;
    }
    const userId = token.user_id;
    const headers = { Authorization: `Bearer ${token.access_token}` };
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 60);
    const dateFromStr = dateFrom.toISOString().split("T")[0] + "T00:00:00.000-03:00";
    const r2 = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${userId}&order.status=cancelled&order.date_created.from=${encodeURIComponent(dateFromStr)}&limit=50&sort=date_desc`,
      { headers }
    );
    const d2 = await r2.json();
    const orders = d2.results || [];
    const enriched = orders.slice(0, 30).map(o => ({
      id: o.id, status: "cancelado", type: "pedido cancelado",
      reason: (o.cancel_detail?.reason || "—").replace(/_/g, " "),
      stage: "waiting_seller",
      product: o.order_items?.[0]?.item?.title || "—",
      buyer: o.buyer?.nickname || "—",
      valor: o.total_amount || null,
      created: o.date_created,
      permalink: `https://www.mercadolivre.com.br/vendas/${o.id}/detalhe`,
    }));
    return res.json({ ok: true, data: enriched, total: enriched.length, updated_at: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
