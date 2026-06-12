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

    if (cases.length === 0) {
      return res.json({ ok: true, data: [], total: 0, updated_at: new Date().toISOString() });
    }

    // Log estrutura do primeiro case para debug
    console.log("CASE_0_KEYS:", Object.keys(cases[0]).join(","));
    console.log("CASE_0:", JSON.stringify(cases[0]).slice(0, 500));

    // Busca cases completos em lotes de 5 para não timeout
    const BATCH = 5;
    const enriched = [];

    for (let i = 0; i < Math.min(cases.length, 20); i += BATCH) {
      const batch = cases.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(async (c) => {
        let productTitle = "—", buyerNickname = "—";
        let returnStatusLabel = null, returnStatusKey = "default", dueDate = null;

        // Busca case completo (1 request por item)
        try {
          const caseRes = await fetch(
            `https://api.mercadolibre.com/post-purchase/v1/cases/${c.id}`,
            { headers }
          );
          const cd = await caseRes.json();

          // Log do primeiro caso completo
          if (c === cases[0]) {
            console.log("CASE_FULL_KEYS:", Object.keys(cd).join(","));
            console.log("CASE_FULL:", JSON.stringify(cd).slice(0, 600));
          }

          // Produto e comprador do case
          productTitle = cd.item?.title || cd.order?.item?.title || "—";
          buyerNickname = cd.buyer?.nickname || cd.order?.buyer?.nickname || "—";
          dueDate = cd.due_date || cd.detail?.due_date || null;

          // Status do envio de devolução
          const shipStatus = cd.return?.shipment?.status
            || cd.shipment?.status
            || cd.return?.status
            || null;

          if (shipStatus) {
            const m = mapStatus(shipStatus);
            returnStatusLabel = m.label;
            returnStatusKey = m.key;
          }
        } catch {}

        // Se não achou produto, busca o pedido (só se necessário)
        if (productTitle === "—") {
          try {
            const orderId = c.order_id || c.resource_id;
            if (orderId) {
              const orRes = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, { headers });
              const od = await orRes.json();
              if (od.order_items?.[0]) productTitle = od.order_items[0].item?.title || "—";
              if (od.buyer) buyerNickname = od.buyer.nickname || "—";
            }
          } catch {}
        }

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
      enriched.push(...results);
    }

    return res.json({ ok: true, data: enriched, total: enriched.length, updated_at: new Date().toISOString() });
  } catch (e) {
    console.error("ERROR:", e.message);
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
