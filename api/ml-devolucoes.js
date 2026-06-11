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
    }
    const claimsRes = await fetch(
      `https://api.mercadolibre.com/post-purchase/v1/cases/search?seller_id=${token.user_id}&status=opened&limit=50`,
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );
    const claimsData = await claimsRes.json();
    if (claimsData.error) throw new Error(claimsData.message || claimsData.error);
    const cases = claimsData.data || claimsData.cases || [];
    const enriched = await Promise.all(cases.slice(0, 20).map(async (c) => {
      let productTitle = "—", buyerNickname = "—";
      try {
        if (c.resource_id) {
          const or = await fetch(`https://api.mercadolibre.com/orders/${c.resource_id}`,
            { headers: { Authorization: `Bearer ${token.access_token}` } });
          const od = await or.json();
          if (od.order_items?.[0]) productTitle = od.order_items[0].item?.title || "—";
          if (od.buyer) buyerNickname = od.buyer.nickname || "—";
        }
      } catch {}
      return {
        id: c.id, status: c.status, type: c.type || "reclamação",
        reason: c.reason_id || "—", stage: c.stage || "—",
        product: productTitle, buyer: buyerNickname,
        valor: c.resolution?.amount_to_return || null,
        prazo: c.resolution?.due_date || c.date_created,
        created: c.date_created,
        permalink: `https://www.mercadolivre.com.br/reclamacao/${c.id}`,
      };
    }));
    return res.json({ ok: true, data: enriched, updated_at: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
