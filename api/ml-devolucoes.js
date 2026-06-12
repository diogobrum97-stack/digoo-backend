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
      `https://api.mercadolibre.com/post-purchase/v1/cases/search?seller_id=${userId}&type=returns&status=opened&limit=50`,
      { headers }
    );
    const d1 = await r1.json();
    const cases = d1.data || d1.cases || [];

    // Log pra debug: estrutura do primeiro case
    if (cases.length > 0) {
      console.log("CASE_KEYS:", Object.keys(cases[0]));
      console.log("CASE_0:", JSON.stringify(cases[0]).slice(0, 600));
    }

    if (cases.length === 0) {
      return res.json({ ok: true, data: [], total: 0, updated_at: new Date().toISOString() });
    }

    const enriched = await Promise.all(cases.slice(0, 30).map(async (c) => {
      let productTitle = "—", buyerNickname = "—";
      let returnStatusLabel = null;
      let returnStatusKey = "default";
      let dueDate = null;

      // Tenta todas as possíveis chaves de ID do pedido
      const orderId = c.order_id || c.resource_id || c.claim_id || c.id;

      try {
        const orRes = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers });
        const od = await orRes.json();
        if (od.order_items?.[0]) productTitle = od.order_items[0].item?.title || "—";
        if (od.buyer) buyerNickname = od.buyer.nickname || "—";
      } catch {}

      // Busca o case completo para pegar status real
      try {
        const caseRes = await fetch(
          `https://api.mercadolibre.com/post-purchase/v1/cases/${c.id}`,
          { headers }
        );
        const caseData = await caseRes.json();

        // Log estrutura do case completo (só no primeiro)
        if (c === cases[0]) {
          console.log("CASE_FULL_KEYS:", Object.keys(caseData));
          console.log("CASE_FULL:", JSON.stringify(caseData).slice(0, 800));
        }

        // Tenta extrair status da devolução de várias formas
        const shipmentStatus = caseData.return?.shipment?.status
          || caseData.shipment?.status
          || caseData.return?.status
          || caseData.resolution?.return_status
          || null;

        if (shipmentStatus) {
          const mapped = mapStatus(shipmentStatus);
          returnStatusLabel = mapped.label;
          returnStatusKey = mapped.key;
        }

        dueDate = caseData.due_date
          || caseData.detail?.due_date
          || caseData.resolution?.due_date
          || null;

      } catch {}

      return {
        id: c.id,
        status: c.status || "opened",
        type: c.type || "devolução",
        reason: c.reason_id || "—",
        stage: c.stage || "waiting_seller",
        returnStatusLabel,
        returnStatusKey,
        dueDate,
        product: productTitle,
        buyer: buyerNickname,
        valor: c.resolution?.amount_to_return || null,
        created: c.date_created,
        permalink: `https://www.mercadolivre.com.br/vendas/${c.order_id || c.resource_id || c.id}/detalhe`,
      };
    }));

    return res.json({ ok: true, data: enriched, total: enriched.length, updated_at: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function mapStatus(status) {
  const s = (status || "").toLowerCase();
  if (s === "in_transit" || s.includes("transit") || s === "on_the_way" || s === "picked_up") return { label: "A caminho", key: "transit" };
  if (s === "delivered" || s.includes("delivered")) return { label: "Devolvido", key: "delivered" };
  if (s === "ready_to_ship" || s === "waiting_for_pickup" || s.includes("waiting")) return { label: "Aguard. coleta", key: "waiting" };
  if (s.includes("review")) return { label: "Em revisão", key: "review" };
  if (s.includes("dispute")) return { label: "Em disputa", key: "dispute" };
  if (s === "lost" || s === "not_delivered" || s.includes("extrav")) return { label: "Extraviado", key: "lost" };
  if (s === "cancelled") return { label: "Cancelado", key: "cancelled" };
  return { label: status, key: "default" };
}
