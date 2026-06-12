export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = req.query.token;
  if (!token) return res.status(400).json({ error: "Token ausente" });

  try {
    const headers = { Authorization: `Bearer ${token}` };

    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers });
    const me = await meRes.json();
    if (!me.id) return res.status(401).json({ error: "Token inválido ou expirado" });
    const userId = me.id;

    // Endpoint correto para devoluções no ML Brasil
    const r1 = await fetch(
      `https://api.mercadolibre.com/post-purchase/v1/claims/search?players.user_id=${userId}&players.role=respondent&claim_type=RETURNS&status=opened&limit=50`,
      { headers }
    );
    const d1 = await r1.json();
    const claims = d1.data || [];

    if (claims.length === 0) {
      return res.json({ ok: true, data: [], total: 0, updated_at: new Date().toISOString() });
    }

    // Enriquece em lotes de 5 para não estourar timeout
    const BATCH = 5;
    const enriched = [];

    for (let i = 0; i < Math.min(claims.length, 30); i += BATCH) {
      const batch = claims.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(async (c) => {
        let productTitle = "—", buyerNickname = "—";

        // Busca dados do pedido
        try {
          const orderId = c.resource_id;
          if (orderId) {
            const orRes = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers });
            const od = await orRes.json();
            if (od.order_items?.[0]) productTitle = od.order_items[0].item?.title || "—";
            if (od.buyer) buyerNickname = od.buyer.nickname || "—";
          }
        } catch {}

        // Status real vem do stage + available_actions do vendedor
        const sellerPlayer = (c.players || []).find(p => p.role === "respondent" && p.type === "seller");
        const sellerActions = sellerPlayer?.available_actions || [];
        const hasSellerAction = sellerActions.length > 0;

        // Detecta se é devolução a caminho pelo stage e actions
        let returnStatusLabel, returnStatusKey;

        const stage = (c.stage || "").toLowerCase();

        if (stage === "dispute") {
          returnStatusLabel = "Em disputa";
          returnStatusKey = "dispute";
        } else if (stage === "claim") {
          // Verifica se tem ação de return_review (produto a caminho/devolvido)
          const hasReturnReview = sellerActions.some(a =>
            a.action?.includes("return_review") || a.action?.includes("refund")
          );
          if (hasReturnReview) {
            returnStatusLabel = "Devolvido";
            returnStatusKey = "delivered";
          } else {
            returnStatusLabel = "A caminho";
            returnStatusKey = "transit";
          }
        } else if (stage === "waiting_seller" || (hasSellerAction && stage !== "dispute")) {
          returnStatusLabel = "Aguarda você";
          returnStatusKey = "waiting";
        } else if (stage === "buyer") {
          returnStatusLabel = "Aguarda comprador";
          returnStatusKey = "default";
        } else if (stage === "resolved") {
          returnStatusLabel = "Resolvida";
          returnStatusKey = "delivered";
        } else {
          returnStatusLabel = "Em andamento";
          returnStatusKey = "default";
        }

        // Prazo: pega a ação com due_date mais próxima
        let dueDate = null;
        sellerActions.forEach(a => { if (a.due_date) dueDate = a.due_date; });
        if (!dueDate) {
          (c.players || []).forEach(p => {
            (p.available_actions || []).forEach(a => { if (a.due_date) dueDate = a.due_date; });
          });
        }

        return {
          id: c.id,
          status: c.status || "opened",
          type: c.type || "devolução",
          reason: c.reason_id || "—",
          stage: c.stage || "claim",
          returnStatusLabel,
          returnStatusKey,
          dueDate,
          product: productTitle,
          buyer: buyerNickname,
          valor: c.resolution?.amount_to_return || null,
          created: c.date_created,
          permalink: `https://www.mercadolivre.com.br/reclamacao/${c.id}`,
        };
      }));
      enriched.push(...results);
    }

    return res.json({ ok: true, data: enriched, total: enriched.length, updated_at: new Date().toISOString() });
  } catch (e) {
    console.error("ERROR:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
