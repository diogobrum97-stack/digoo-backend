function addBusinessDays(date, days) {
  let count = 0;
  const d = new Date(date);
  while (count < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++; // pula sábado e domingo
  }
  return d;
}

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

    const r1 = await fetch(
      `https://api.mercadolibre.com/post-purchase/v1/claims/search?players.user_id=${userId}&players.role=respondent&claim_type=RETURNS&status=opened&limit=50`,
      { headers }
    );
    const d1 = await r1.json();
    const allClaims = d1.data || [];

    if (allClaims.length === 0) {
      return res.json({ ok: true, data: [], pendingReview: [], total: 0, updated_at: new Date().toISOString() });
    }

    // Só pendentes com action explícita do ML
    const pendingReview = allClaims.filter(c => {
      const seller = (c.players || []).find(p => p.role === "respondent" && p.type === "seller");
      return (seller?.available_actions || []).some(a =>
        a.action === "return_review_ok" || a.action === "return_review_unified_ok" ||
        a.action === "return_review_fail" || a.action === "return_review_unified_fail"
      );
    });

    // Enriquece em lotes de 5
    const BATCH = 5;
    const enriched = [];

    for (let i = 0; i < Math.min(allClaims.length, 30); i += BATCH) {
      const batch = allClaims.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(async (c) => {
        let productTitle = "—", buyerNickname = "—";

        try {
          const orderId = c.resource_id;
          if (orderId) {
            const orRes = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers });
            const od = await orRes.json();
            if (od.order_items?.[0]) productTitle = od.order_items[0].item?.title || "—";
            if (od.buyer) buyerNickname = od.buyer.nickname || "—";
          }
        } catch {}

        const seller = (c.players || []).find(p => p.role === "respondent" && p.type === "seller");
        const sellerActionsEarly = seller?.available_actions || [];
        const isPendingReview = sellerActionsEarly.some(a =>
          a.action === "return_review_ok" || a.action === "return_review_unified_ok" ||
          a.action === "return_review_fail" || a.action === "return_review_unified_fail"
        );

        // Busca detalhes da devolução (prazo e quantidade) — só para pendentes de revisão
        let returnQty = null, returnDueDate = null;
        if (isPendingReview) {
          try {
            const retRes = await fetch(
              `https://api.mercadolibre.com/post-purchase/v2/claims/${c.id}/returns`,
              { headers }
            );
            const ret = await retRes.json();
            const order = ret.orders?.[0];
            if (order?.return_quantity) returnQty = order.return_quantity;
            const shipment = ret.shipments?.[0];
            if (shipment?.status === "delivered" && shipment?.last_updated) {
              returnDueDate = addBusinessDays(new Date(shipment.last_updated), 3).toISOString();
            }
          } catch {}
        }
        const sellerActions = seller?.available_actions || [];
        const hasReviewOk = sellerActions.some(a =>
          a.action === "return_review_ok" || a.action === "return_review_unified_ok"
        );
        const hasReviewFail = sellerActions.some(a =>
          a.action === "return_review_fail" || a.action === "return_review_unified_fail"
        );
        // Também considera revisão pendente se type=returns e stage=claim


        // Prazo da ação
        let dueDate = null;
        sellerActions.forEach(a => { if (a.due_date) dueDate = a.due_date; });

        // Status/label
        let returnStatusLabel, returnStatusKey;
        const stage = (c.stage || "").toLowerCase();

        if (hasReviewOk || hasReviewFail) {
          returnStatusLabel = "Revisão pendente";
          returnStatusKey = "review";
        } else if (stage === "dispute") {
          returnStatusLabel = "Em disputa";
          returnStatusKey = "dispute";
        } else if (stage === "claim") {
          returnStatusLabel = "A caminho";
          returnStatusKey = "transit";
        } else {
          returnStatusLabel = "Em andamento";
          returnStatusKey = "default";
        }

        return {
          id: c.id,
          status: c.status || "opened",
          type: c.type || "devolução",
          reason: c.reason_id || "—",
          stage: c.stage || "claim",
          returnStatusLabel,
          returnStatusKey,
          needsReview: hasReviewOk || hasReviewFail,
          hasReviewOk,
          hasReviewFail,
          dueDate: returnDueDate || dueDate || null,
          returnQty,
          product: productTitle,
          buyer: buyerNickname,
          valor: c.resolution?.amount_to_return || null,
          created: c.date_created,
          permalink: `https://www.mercadolivre.com.br/reclamacao/${c.id}`,
        };
      }));
      enriched.push(...results);
    }

    return res.json({
      ok: true,
      data: enriched,
      pendingReviewCount: pendingReview.length,
      total: enriched.length,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error("ERROR:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
