export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = req.query.token;
  if (!token) return res.status(400).json({ error: "Token ausente" });

  try {
    const headers = { Authorization: `Bearer ${token}` };

    // Busca o seller_id
    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers });
    const me = await meRes.json();
    const sellerId = me.id;

    // Busca reclamações abertas onde sou o vendedor
    const claimsRes = await fetch(
      `https://api.mercadolibre.com/post-purchase/v1/claims?role=seller&status=opened&limit=50`,
      { headers }
    );
    const claimsData = await claimsRes.json();
    const claims = claimsData.data || claimsData.results || claimsData || [];

    if (!Array.isArray(claims) || claims.length === 0) {
      return res.json({ ok: true, data: [], total: 0, updated_at: new Date().toISOString() });
    }

    // Enriquece com dados do pedido
    const enriched = await Promise.all(claims.map(async (c) => {
      let productTitle = "—";
      let buyerNickname = "—";
      try {
        const orderId = c.resource_id || c.order_id || c.id;
        const orRes = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers });
        const od = await orRes.json();
        if (od.order_items?.[0]) productTitle = od.order_items[0].item?.title || "—";
        if (od.buyer) buyerNickname = od.buyer.nickname || "—";
      } catch {}

      return {
        id: c.id,
        status: c.status || "aberto",
        type: c.claim_type || c.type || "reclamação",
        reason: c.reason_id || c.reason || "—",
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
    return res.status(500).json({ error: e.message });
  }
}
