module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const token = req.query.token;
  const days = parseInt(req.query.days || "7");
  if (!token) return res.status(400).json({ error: "Token ausente" });

  try {
    const headers = { Authorization: `Bearer ${token}` };

    // Seller ID
    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers });
    const me = await meRes.json();
    if (!me.id) return res.status(401).json({ error: "Token inválido" });
    const userId = me.id;

    // Datas
    const dateTo = new Date();
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    const dateFromStr = dateFrom.toISOString().split("T")[0] + "T00:00:00.000-03:00";
    const dateToStr = dateTo.toISOString().split("T")[0] + "T23:59:59.000-03:00";

    // Busca pedidos pagos do período em lotes
    let allOrders = [];
    let offset = 0;
    const limit = 50;
    let total = null;

    while (total === null || offset < Math.min(total, 200)) {
      const r = await fetch(
        `https://api.mercadolibre.com/orders/search?seller=${userId}&order.status=paid&order.date_created.from=${encodeURIComponent(dateFromStr)}&order.date_created.to=${encodeURIComponent(dateToStr)}&limit=${limit}&offset=${offset}&sort=date_desc`,
        { headers }
      );
      const d = await r.json();
      if (!d.results) break;
      allOrders = allOrders.concat(d.results);
      total = d.paging?.total || 0;
      offset += limit;
      if (d.results.length < limit) break;
    }

    // Processa pedidos
    const productMap = {}; // SKU/título -> dados agregados
    const dailyMap = {};   // data -> faturamento

    let totalRevenue = 0;
    let totalOrders = allOrders.length;

    allOrders.forEach(order => {
      const date = order.date_created?.slice(0, 10);
      if (date) {
        dailyMap[date] = (dailyMap[date] || 0) + (order.total_amount || 0);
      }
      totalRevenue += order.total_amount || 0;

      (order.order_items || []).forEach(item => {
        const key = item.item?.id || item.item?.title || "unknown";
        if (!productMap[key]) {
          productMap[key] = {
            id: item.item?.id,
            title: item.item?.title || "—",
            sku: item.item?.seller_sku || "—",
            qty: 0,
            revenue: 0,
            unitPrice: item.unit_price || 0,
          };
        }
        productMap[key].qty += item.quantity || 0;
        productMap[key].revenue += (item.unit_price || 0) * (item.quantity || 0);
      });
    });

    // Produtos ordenados por quantidade vendida
    const products = Object.values(productMap).sort((a, b) => b.qty - a.qty);
    const topSellers = products.slice(0, 10);
    const lowSellers = products.filter(p => p.qty <= 2).slice(0, 10);

    // Busca anúncios ativos para cruzar com parados
    let activeItems = [];
    try {
      const itemsRes = await fetch(
        `https://api.mercadolibre.com/users/${userId}/items/search?status=active&limit=50&sort=sold_quantity_asc`,
        { headers }
      );
      const itemsData = await itemsRes.json();
      const itemIds = (itemsData.results || []).slice(0, 20);

      if (itemIds.length > 0) {
        const detailRes = await fetch(
          `https://api.mercadolibre.com/items?ids=${itemIds.join(",")}&attributes=id,title,price,sold_quantity,available_quantity,seller_sku`,
          { headers }
        );
        const detailData = await detailRes.json();
        activeItems = detailData
          .filter(r => r.code === 200)
          .map(r => r.body)
          .filter(item => {
            // Parados: não aparecem nos pedidos do período
            const soldInPeriod = productMap[item.id]?.qty || 0;
            return soldInPeriod === 0;
          })
          .slice(0, 10);
      }
    } catch {}

    // Evolução diária — preenche dias sem venda com 0
    const dailyEvolution = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      dailyEvolution.push({
        date: dateStr,
        label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        revenue: Math.round((dailyMap[dateStr] || 0) * 100) / 100,
      });
    }

    return res.json({
      ok: true,
      period: { days, from: dateFromStr, to: dateToStr },
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders,
        avgTicket: totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
      },
      dailyEvolution,
      topSellers,
      lowSellers,
      stoppedItems: activeItems,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("ml-vendas error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};
