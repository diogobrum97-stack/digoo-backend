export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    const r = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
    const token = await r.json();
    if (!token || !token.access_token) throw new Error("Não conectado ao Mercado Livre");

    // Refresh if needed
    if (token.expires_at && Date.now() > token.expires_at - 600000) {
      await fetch(`${process.env.VERCEL_URL}/api/ml-refresh`);
      const r2 = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
      const fresh = await r2.json();
      token.access_token = fresh.access_token;
      token.user_id = fresh.user_id;
    }

    const userId = token.user_id;
    const headers = { Authorization: `Bearer ${token.access_token}` };

    // Try claims API first
    let cases = [];
    try {
      const r1 = await fetch(
        `https://api.mercadolibre.com/post-purchase/v1/cases/search?seller_id=${userId}&status=opened&limit=50`,
        { headers }
      );
      const d1 = await r1.json();
      cases = d1.data || d1.cases || [];
    } catch {}

    // Fallback: try orders with returns
    if (cases.length === 0) {
      try {
        const r2 = await fetch(
          `https://api.mercadolibre.com/orders/search?seller=${userId}&order.status=cancelled&limit=20`,
          { headers }
        );
        const d2 = await r2.json();
        const orders = d2.results || [];
        cases = orders.map(o => ({
          id: o.id,
          status: "opened",
          type: "devolução",
          reason_id: o.cancel_detail?.reason || "cancelado",
          stage: "waiting_seller",
          resource_id: o.id,
          date_created: o.date_created,
          _order: o,
        }));
      } catch {}
    }

    const enriched = await Promise.all(cases.slice(0, 20).map(async (c) => {
      let productTitle = "—", buyerNickname = "—";
      try {
        const orderId = c.resource_id || c.id;
        const or = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers });
        const od = await or.json();
        if (od.order_items?.[0]) productTitle = od.order_items[0].item?.title || "—";
        if (od.buyer) buyerNickname = od.buyer.nickname || "—";
      } catch {}
      return {
        id: c.id,
        status: c.status || "opened",
        type: c.type || "reclamação",
        reason: c.reason_id || "—",
        stage: c.stage || "waiting_seller",
        product: productTitle,
        buyer: buyerNickname,
        valor: c.resolution?.amount_to_return || null,
        prazo: c.resolution?.due_date || c.date_created,
        created: c.date_created,
        permalink: `https://www.mercadolivre.com.br/reclamacao/${c.id}`,
      };
    }));

    return res.json({ ok: true, data: enriched, total: enriched.length, updated_at: new Date().toISOString() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
