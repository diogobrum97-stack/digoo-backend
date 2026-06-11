export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    const r = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
    const token = await r.json();
    if (!token || !token.access_token) throw new Error("Não conectado ao Mercado Livre");
    if (token.expires_at && Date.now() > token.expires_at - 600000) {
      await fetch(`${process.env.VERCEL_URL}/api/ml-refresh`);
      const r2 = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
      const fresh = await r2.json();
      token.access_token = fresh.access_token;
      token.user_id = fresh.user_id;
    }
    const userId = token.user_id;
    const headers = { Authorization: `Bearer ${token.access_token}` };

    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 60);
    const dateFromStr = dateFrom.toISOString().split("T")[0] + "T00:00:00.000-03:00";

    let cases = [];
    let source = "";

    try {
      const r1 = await fetch(
        `https://api.mercadolibre.com/post-purchase/v1/cases/search?seller_id=${userId}&status=opened&limit=50`,
        { headers }
      );
      const d1 = await r1.json();
      if (!d1.error && (d1.data?.length > 0 || d1.cases?.length > 0)) {
        cases = d1.data || d1.cases || [];
        source = "reclamacoes";
      }
    } catch {}

    if (cases.length === 0) {
      try {
        const r2 = await fetch(
          `https://api.mercadolibre.com/orders/search?seller=${userId}&order.status=cancelled&order.date_created.from=${encodeURIComponent(dateFromStr)}&limit=20&sort=date_desc`,
          { headers }
        );
        const d2 = await r2.json();
        const orders = d2.results || [];
        cases = orders.map(o => ({
          id: o.id, status: "cancelado",
          type: "pedido cancelado",
          reason_id: (o.cancel_detail?.reason || "cancelado").replace(/_/g," "),
          stage: "waiting_seller",
          resource_id: o.id, date_created: o.date_created, _order: o,
        }));
        source = "cancelados_60d";
      } catch {}
    }

    const enriched = await Promise.all(cases.slice(0, 20).map(async (c) => {
      let productTitle = "—", buyerNickname = "—";
      try {
        if (c._order) {
          if (c._order.order_items?.[0]) productTitle = c._order.order_items[0].item?.title || "—";
          if (c._order.buyer) buyerNickname = c._order.buyer.nickname || "—";
        } else {
          const or = await fetch(`https://api.mercadolibre.com/orders/${c.resource_id||c.id}`, { headers });
          const od = await or.json();
          if (od.order_items?.[0]) productTitle = od.order_items[0].item?.title || "—";
          if (od.buyer) buyerNickname = od.buyer.nickname || "—";
        }
      } catch {}
      return {
        id: c.id, status: c.status || "aberto",
        type: c.type || c.reason_id || "reclamacao",
        reason: c.reason_id || "—", stage: c.stage || "waiting_seller",
        product: productTitle, buyer: buyerNickname,
        valor: c.resolution?.amount_to_return || null,
        prazo: c.resolution?.due_date || c.date_created,
        created: c.date_created, source,
        permalink: source === "reclamacoes"
          ? `https://www.mercadolivre.com.br/reclamacao/${c.id}`
          : `https://www.mercadolivre.com.br/vendas/${c.id}/detalhe`,
      };
    }));

    return res.json({ ok: true, data: enriched, total: enriched.length, source, updated_at: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
