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

    // Separa os que precisam de revisão:
    // 1. Têm return_review_ok nas actions, OU
    // 2. São type=returns com stage=claim (produto chegou, aguarda revisão manual)
    const pendingReview = allClaims.filter(c => {
      const seller = (c.players || []).find(p => p.role === "respondent" && p.type === "seller");
      const hasReviewAction = (seller?.available_actions || []).some(a =>
        a.action === "return_review_ok" || a.action === "return_review_unified_ok" ||
        a.action === "return_review_fail" || a.action === "return_review_unified_fail"
      );
      const isReturnInClaim = c.type === "returns" && c.stage === "claim";
      return hasReviewAction || isReturnInClaim;
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
        const sellerActions = seller?.available_actions || [];
        const hasReviewOk = sellerActions.some(a =>
          a.action === "return_review_ok" || a.action === "return_review_unified_ok"
        );
        const hasReviewFail = sellerActions.some(a =>
          a.action === "return_review_fail" || a.action === "return_review_unified_fail"
        );
        // Também considera revisão pendente se type=returns e stage=claim
        const isReturnInClaim = c.type === "returns" && c.stage === "claim";

        // needsReview considera actions explícitas OU stage=claim em devolução
        const needsReviewOverride = isReturnInClaim && !hasReviewOk && !hasReviewFail;

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
          needsReview: hasReviewOk || hasReviewFail || needsReviewOverride,
          hasReviewOk,
          hasReviewFail,
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
