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

    let cases = [];
    const r1 = await fetch(
      `https://api.mercadolibre.com/post-purchase/v1/cases/search?seller_id=${userId}&type=returns&status=opened&limit=50`,
      { headers }
    );
    const d1 = await r1.json();
    cases = d1.data || d1.cases || [];

    const enriched = await Promise.all(cases.slice(0, 30).map(async (c) => {
      let productTitle = "—", buyerNickname = "—";
      let returnStatusLabel = "Em andamento";
      let returnStatusKey = "default";
      let dueDate = null;

      try {
        const orderId = c.resource_id || c.id;
        const orRes = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers });
        const od = await orRes.json();

        if (od.order_items?.[0]) productTitle = od.order_items[0].item?.title || "—";
        if (od.buyer) buyerNickname = od.buyer.nickname || "—";

        // Busca o shipping de devolução pelo order
        // Primeiro tenta pegar o return_shipping_id direto do pedido
        let returnShippingId = od.return_shipping_id || null;

        // Se não tiver, busca nas devoluções do pedido
        if (!returnShippingId) {
          try {
            const retRes = await fetch(
              `https://api.mercadolibre.com/orders/${orderId}/returns`,
              { headers }
            );
            const retData = await retRes.json();
            const ret = Array.isArray(retData) ? retData[0] : retData;
            returnShippingId = ret?.shipping_id || ret?.shipment_id || null;

            // Status direto do objeto de devolução
            if (ret?.status) {
              const mapped = mapReturnStatus(ret.status, ret.substatus);
              returnStatusLabel = mapped.label;
              returnStatusKey = mapped.key;
            }
            if (ret?.due_date) dueDate = ret.due_date;
          } catch {}
        }

        // Se tiver shipping_id, consulta o status do envio
        if (returnShippingId && returnStatusLabel === "Em andamento") {
          try {
            const shipRes = await fetch(
              `https://api.mercadolibre.com/shipments/${returnShippingId}`,
              { headers }
            );
            const ship = await shipRes.json();
            if (ship.status) {
              const mapped = mapShipmentStatus(ship.status, ship.substatus);
              returnStatusLabel = mapped.label;
              returnStatusKey = mapped.key;
            }
            if (ship.status_history?.date_shipped) dueDate = null;
          } catch {}
        }

        // Fallback: tenta buscar via case detail
        if (returnStatusLabel === "Em andamento") {
          try {
            const caseRes = await fetch(
              `https://api.mercadolibre.com/post-purchase/v1/cases/${c.id}`,
              { headers }
            );
            const caseData = await caseRes.json();
            const ret = caseData.return || caseData;
            if (ret?.status && ret.status !== "opened") {
              const mapped = mapReturnStatus(ret.status, ret.substatus);
              returnStatusLabel = mapped.label;
              returnStatusKey = mapped.key;
            }
            if (caseData.due_date) dueDate = caseData.due_date;
            if (caseData.detail?.due_date) dueDate = caseData.detail.due_date;
          } catch {}
        }

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
        permalink: `https://www.mercadolivre.com.br/vendas/${c.resource_id || c.id}/detalhe`,
      };
    }));

    return res.json({ ok: true, data: enriched, total: enriched.length, updated_at: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function mapShipmentStatus(status, substatus) {
  const s = (status || "").toLowerCase();
  const ss = (substatus || "").toLowerCase();
  if (s === "in_transit" || ss === "in_transit") return { label: "A caminho", key: "transit" };
  if (s === "delivered") return { label: "Devolvido", key: "delivered" };
  if (s === "ready_to_ship") return { label: "Aguard. coleta", key: "waiting" };
  if (s === "waiting_for_pickup" || ss === "waiting_for_pickup") return { label: "Aguard. coleta", key: "waiting" };
  if (s === "picked_up") return { label: "Coletado", key: "transit" };
  if (s === "not_delivered" || s === "lost") return { label: "Extraviado", key: "lost" };
  if (s === "cancelled") return { label: "Cancelado", key: "cancelled" };
  return { label: status || "Em andamento", key: "default" };
}

function mapReturnStatus(status, substatus) {
  const s = (status || "").toLowerCase();
  if (s.includes("transit") || s === "on_the_way") return { label: "A caminho", key: "transit" };
  if (s.includes("delivered") || s === "delivered") return { label: "Devolvido", key: "delivered" };
  if (s.includes("waiting") || s === "waiting_for_pickup") return { label: "Aguard. coleta", key: "waiting" };
  if (s.includes("review")) return { label: "Em revisão", key: "review" };
  if (s.includes("dispute")) return { label: "Em disputa", key: "dispute" };
  if (s.includes("lost") || s.includes("extrav")) return { label: "Extraviado", key: "lost" };
  if (s.includes("refused")) return { label: "Recusado", key: "lost" };
  return { label: status || "Em andamento", key: "default" };
}
