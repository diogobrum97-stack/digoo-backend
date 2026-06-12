export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = req.query.token;
  if (!token) return res.status(400).json({ error: "Token ausente" });

  try {
    const headers = { Authorization: `Bearer ${token}` };

    // Busca o seller_id
    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers });
    const me = await meRes.json();
    if (!me.id) return res.status(401).json({ error: "Token inválido ou expirado" });
    const sellerId = me.id;

    // Endpoint correto: /claims/search com players.user_id e role=respondent (vendedor)
    const url = `https://api.mercadolibre.com/post-purchase/v1/claims/search?players.user_id=${sellerId}&players.role=respondent&status=opened&limit=50`;
    const claimsRes = await fetch(url, { headers });
    const claimsData = await claimsRes.json();

    console.log("claims search raw:", JSON.stringify(claimsData).slice(0, 800));

    const claims = claimsData.data || claimsData.results || (Array.isArray(claimsData) ? claimsData : []);

    if (!claims.length) {
      return res.json({ ok: true, data: [], total: 0, updated_at: new Date().toISOString() });
    }

    // Enriquece com dados do pedido
    const enriched = await Promise.all(claims.map(async (c) => {
      let productTitle = "—";
      let buyerNickname = "—";
      try {
        const orderId = c.order_id || c.resource_id || c.id;
        if (orderId && String(orderId).length > 6) {
          const orRes = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers });
          const od = await orRes.json();
          if (od.order_items?.[0]) productTitle = od.order_items[0].item?.title || "—";
          if (od.buyer) buyerNickname = od.buyer.nickname || "—";
        }
      } catch {}

      // Detecta stage a partir dos players
      let stage = c.stage || "waiting_seller";
      if (c.players) {
        const sellerPlayer = c.players.find(p => p.type === "seller");
        const hasSellerAction = sellerPlayer?.available_actions?.length > 0;
        if (hasSellerAction) stage = "waiting_seller";
        else {
          const buyerPlayer = c.players.find(p => p.type === "buyer");
          const hasBuyerAction = buyerPlayer?.available_actions?.length > 0;
          if (hasBuyerAction) stage = "buyer";
          else if (c.stage === "dispute") stage = "dispute";
          else stage = "buyer";
        }
      }

      return {
        id: c.id,
        status: c.status || "aberto",
        type: c.type || "reclamação",
        reason: c.reason_id || "—",
        stage,
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
