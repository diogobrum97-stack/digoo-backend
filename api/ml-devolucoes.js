export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = req.query.token;
  if (!token) return res.status(400).json({ error: "Token ausente" });

  try {
    const headers = { Authorization: `Bearer ${token}` };

    // Busca seller_id
    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers });
    const me = await meRes.json();
    if (!me.id) return res.status(401).json({ error: "Token inválido ou expirado" });
    const userId = me.id;

    // Busca devoluções abertas
    let cases = [];
    try {
      const r1 = await fetch(
        `https://api.mercadolibre.com/post-purchase/v1/cases/search?seller_id=${userId}&type=returns&status=opened&limit=50`,
        { headers }
      );
      const d1 = await r1.json();
      cases = d1.data || d1.cases || [];
    } catch {}

    // Fallback: pedidos cancelados com envio entregue
    if (cases.length === 0) {
      try {
        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - 90);
        const dateFromStr = dateFrom.toISOString().split("T")[0] + "T00:00:00.000-03:00";
        const r2 = await fetch(
          `https://api.mercadolibre.com/orders/search?seller=${userId}&order.status=cancelled&shipping.status=delivered&order.date_created.from=${encodeURIComponent(dateFromStr)}&limit=20&sort=date_desc`,
          { headers }
        );
        const d2 = await r2.json();
        cases = (d2.results || []).map(o => ({
          id: o.id, status: "em_transito", type: "devolução",
          reason_id: o.cancel_detail?.reason || "—",
          stage: "waiting_seller", resource_id: o.id,
          date_created: o.date_created, _order: o,
        }));
      } catch {}
    }

    const enriched = await Promise.all(cases.slice(0, 30).map(async (c) => {
      let productTitle = "—", buyerNickname = "—";
      let returnStatus = null, returnSubstatus = null, dueDateStr = null;

      // Dados do pedido
      try {
        if (c._order) {
          if (c._order.order_items?.[0]) productTitle = c._order.order_items[0].item?.title || "—";
          if (c._order.buyer) buyerNickname = c._order.buyer.nickname || "—";
        } else {
          const or = await fetch(`https://api.mercadolibre.com/orders/${c.resource_id || c.id}`, { headers });
          const od = await or.json();
          if (od.order_items?.[0]) productTitle = od.order_items[0].item?.title || "—";
          if (od.buyer) buyerNickname = od.buyer.nickname || "—";
        }
      } catch {}

      // Busca detalhes do caso/devolução para pegar status real
      try {
        const caseRes = await fetch(
          `https://api.mercadolibre.com/post-purchase/v1/cases/${c.id}`,
          { headers }
        );
        const caseData = await caseRes.json();

        // Status da devolução vem em caseData.return ou caseData.status
        if (caseData.return) {
          returnStatus = caseData.return.status || null;
          returnSubstatus = caseData.return.substatus || null;
        }

        // Prazo de ação
        if (caseData.due_date) dueDateStr = caseData.due_date;
        if (caseData.detail?.due_date) dueDateStr = caseData.detail.due_date;

        // Se não veio do case, usa o stage do claim
        if (!returnStatus && caseData.stage) returnStatus = caseData.stage;

      } catch {}

      // Mapeia status para label legível
      const statusLabel = mapReturnStatus(returnStatus, returnSubstatus, c.stage);

      return {
        id: c.id,
        status: c.status || "opened",
        type: c.type || "devolução",
        reason: c.reason_id || "—",
        stage: c.stage || "waiting_seller",
        returnStatus: returnStatus || c.stage || "waiting_seller",
        returnStatusLabel: statusLabel,
        dueDate: dueDateStr,
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

function mapReturnStatus(status, substatus, stage) {
  // Status do objeto return
  const s = (status || "").toLowerCase();
  const ss = (substatus || "").toLowerCase();

  if (s.includes("transit") || s === "on_the_way" || ss.includes("transit")) return "A caminho";
  if (s.includes("delivered") || s === "delivered") return "Devolvido";
  if (s.includes("waiting") || s === "waiting_for_pickup") return "Aguard. coleta";
  if (s.includes("lost")) return "Extraviado";
  if (s.includes("refused")) return "Recusado";
  if (s.includes("returned")) return "Devolvido";
  if (s.includes("dispute") || (stage || "").includes("dispute")) return "Em disputa";
  if (s.includes("review")) return "Em revisão";

  // Fallback pelo stage do claim
  const st = (stage || "").toLowerCase();
  if (st === "waiting_seller") return "Aguarda você";
  if (st === "buyer") return "Aguarda comprador";
  if (st === "dispute") return "Em disputa";
  if (st === "resolved") return "Resolvida";

  return status || "Em andamento";
}
