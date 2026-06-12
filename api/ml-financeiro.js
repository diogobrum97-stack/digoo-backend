export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = req.query.token;
  const month = req.query.month || new Date().toISOString().slice(0, 7); // "2026-06"
  if (!token) return res.status(400).json({ error: "Token ausente" });

  try {
    const headers = { Authorization: `Bearer ${token}` };

    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers });
    const me = await meRes.json();
    if (!me.id) return res.status(401).json({ error: "Token inválido" });
    const userId = me.id;

    // Monta range do mês
    const [year, mon] = month.split("-");
    const from = `${month}-01T00:00:00.000-03:00`;
    const lastDay = new Date(Number(year), Number(mon), 0).getDate();
    const to = `${month}-${lastDay}T23:59:59.000-03:00`;

    // Busca devoluções fechadas do mês
    const r1 = await fetch(
      `https://api.mercadolibre.com/post-purchase/v1/claims/search?players.user_id=${userId}&players.role=respondent&claim_type=RETURNS&status=closed&limit=50&range=date_created:after:${encodeURIComponent(from)},before:${encodeURIComponent(to)}`,
      { headers }
    );
    const d1 = await r1.json();
    const claims = (d1.data || []).filter(c => c.type === "returns" || c.type === "mediations");

    if (claims.length === 0) {
      return res.json({ ok: true, data: [], totalCost: 0, month, updated_at: new Date().toISOString() });
    }

    // Processa em lotes de 5
    const BATCH = 5;
    const results = [];

    for (let i = 0; i < Math.min(claims.length, 50); i += BATCH) {
      const batch = claims.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map(async (c) => {
        let productTitle = "—", buyerNickname = "—";
        let refundedAmount = 0, closedAt = c.last_updated || c.date_created;

        try {
          // Busca o pedido para pegar valor reembolsado
          const orderId = c.resource_id;
          if (orderId) {
            const orRes = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers });
            const od = await orRes.json();
            if (od.order_items?.[0]) productTitle = od.order_items[0].item?.title || "—";
            if (od.buyer) buyerNickname = od.buyer.nickname || "—";

            // Valor reembolsado ao comprador
            const payment = od.payments?.[0];
            if (payment?.transaction_amount_refunded) {
              refundedAmount = Number(payment.transaction_amount_refunded);
            } else if (od.total_amount) {
              // Se status refunded, considera o total
              if (od.status === "refunded") refundedAmount = Number(od.total_amount);
            }
            if (od.date_closed) closedAt = od.date_closed;
          }
        } catch {}

        return {
          id: c.id,
          orderId: c.resource_id,
          product: productTitle,
          buyer: buyerNickname,
          refundedAmount,
          closedAt,
          resolution: c.resolution?.reason || "—",
          permalink: `https://www.mercadolivre.com.br/reclamacao/${c.id}`,
        };
      }));
      results.push(...batchResults);
    }

    // Total de custo (soma dos reembolsados)
    const totalCost = results.reduce((sum, r) => sum + r.refundedAmount, 0);

    return res.json({
      ok: true,
      data: results.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt)),
      totalCost: Math.round(totalCost * 100) / 100,
      count: results.length,
      month,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error("ERROR:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
