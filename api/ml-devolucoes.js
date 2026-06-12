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
    dateFrom.setDate(dateFrom.getDate() - 90);
    const dateFromStr = dateFrom.toISOString().split("T")[0] + "T00:00:00.000-03:00";

    let cases = [];
    try {
      const r1 = await fetch(
        `https://api.mercadolibre.com/post-purchase/v1/cases/search?seller_id=${userId}&type=returns&status=opened&limit=50`,
        { headers }
      );
      const d1 = await r1.json();
      cases = d1.data || d1.cases || [];
    } catch {}

    if (cases.length === 0) {
      try {
        const r2 = await fetch(
          `https://api.mercadolibre.com/orders/search?seller=${userId}&order.status=cancelled&shipping.status=delivered&order.date_created.from=${encodeURIComponent(dateFromStr)}&limit=20&sort=date_desc`,
          { headers }
        );
        const d2 = await r2.json();
        cases = (d2.results || []).map(o => ({
          id: o.id, status: "em_transito", type: "devolução em trânsito",
          reason_id: o.cancel_detail?.reason || "—",
          stage: "waiting_seller", resource_id: o.id,
          date_created: o.date_created, _order: o,
        }));
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
        id: c.id, status: c.status || "em_transito",
        type: c.type || "devolução", reason: c.reason_id || "—",
        stage: c.stage || "waiting_seller",
        product: productTitle, buyer: buyerNickname,
        valor: c.resolution?.amount_to_return || null,
        created: c.date_created,
        permalink: `https://www.mercadolivre.com.br/vendas/${c.id}/detalhe`,
      };
    }));

    return res.json({ ok: true, data: enriched, total: enriched.length, updated_at: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
