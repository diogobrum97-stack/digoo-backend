export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { token, claim_id, action } = req.body;
  // action: "ok" = chegou como esperado, "fail" = reportar problema
  if (!token || !claim_id || !action) {
    return res.status(400).json({ error: "Parâmetros ausentes: token, claim_id, action" });
  }

  try {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    // 1. Busca o return_id do claim
    const retRes = await fetch(
      `https://api.mercadolibre.com/post-purchase/v2/claims/${claim_id}/returns`,
      { headers }
    );
    const retData = await retRes.json();
    console.log("RETURN_DATA:", JSON.stringify(retData).slice(0, 400));

    const returnId = retData.id || retData.return_id || retData[0]?.id;
    if (!returnId) {
      return res.status(400).json({ error: "Return ID não encontrado para este claim", raw: retData });
    }

    // 2. Chama o endpoint de review
    let body = {};
    if (action === "fail") {
      // Para reportar problema, precisa do motivo — por enquanto usa o mais genérico
      body = { reason: "PRODUCT_DIFFERENT" };
    }
    // action === "ok" → body vazio {}

    const reviewRes = await fetch(
      `https://api.mercadolibre.com/post-purchase/v1/returns/${returnId}/return-review`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }
    );
    const reviewData = await reviewRes.json();
    console.log("REVIEW_RESULT:", JSON.stringify(reviewData).slice(0, 400));

    if (reviewRes.ok) {
      return res.json({ ok: true, message: action === "ok" ? "Devolução aprovada!" : "Problema reportado!" });
    } else {
      return res.status(reviewRes.status).json({ error: reviewData.message || "Erro ao revisar", raw: reviewData });
    }
  } catch (e) {
    console.error("ERROR:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
