module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  let token = req.query.token;

  // Busca token da Filial automaticamente do Firebase se não vier na URL
  // (usado pelos modos estoque e custos que operam na conta da Filial)
  if ((req.query.estoque || req.query.custos || req.query.action === "testads" || req.query.cron === "prices") && !token && process.env.FIREBASE_URL) {
    try {
      const tR = await fetch(`${process.env.FIREBASE_URL}/ml_token_filial.json`);
      const tData = await tR.json();
      token = tData?.access_token;
    } catch (e) { /* segue sem token, cai no erro padrão abaixo */ }
  }

  if (!token) return res.status(400).json({ error: "Token ausente" });

  // Modo "testads": testa acesso à API de ADS do ML
  if (req.query.action === "testads") {
    try {
      const tokenRes = await fetch(`${process.env.FIREBASE_URL}/ml_token_filial.json`);
      const token = await tokenRes.json();
      if (!token?.access_token) return res.json({ ok: false, msg: "Token não encontrado" });

      const meRes = await fetch("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${token.access_token}` }
      });
      const me = await meRes.json();
      const userId = me.id;

      // Testar endpoint de campanhas
      const adsRes = await fetch(
        `https://api.mercadolibre.com/advertising/product_ads/sellers/${userId}/campaigns?limit=3`,
        { headers: { Authorization: `Bearer ${token.access_token}` } }
      );
      const adsData = await adsRes.json();
      return res.json({ ok: true, status: adsRes.status, userId, adsData });
    } catch(e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // Modo "checkPrices": cron diário que detecta mudanças de preço e registra no Firebase
  if (req.query.action === "checkPrices" || req.query.cron === "prices") {
    const FIREBASE_URL = process.env.FIREBASE_URL;
    try {
      const tokenRes = await fetch(`${FIREBASE_URL}/ml_token_filial.json`);
      const token = await tokenRes.json();
      if (!token?.access_token) return res.json({ ok: false, msg: "Token Filial não encontrado" });

      // Buscar preços atuais via prices=1
      const pricesRes = await fetch(
        `https://api.mercadolibre.com/users/me`,
        { headers: { Authorization: `Bearer ${token.access_token}` } }
      );
      const me = await pricesRes.json();
      if (!me.id) return res.json({ ok: false, msg: "Token inválido" });

      // Buscar anúncios ativos e preços
      let itemIds = [];
      for (let page = 0; page < 3; page++) {
        const r = await fetch(
          `https://api.mercadolibre.com/users/${me.id}/items/search?status=active&limit=100&offset=${page*100}`,
          { headers: { Authorization: `Bearer ${token.access_token}` } }
        );
        const d = await r.json();
        itemIds.push(...(d.results || []));
        if ((d.results || []).length < 100) break;
      }

      const prices = [];
      for (let i = 0; i < itemIds.length; i += 20) {
        const chunk = itemIds.slice(i, i + 20);
        const r = await fetch(
          `https://api.mercadolibre.com/items?ids=${chunk.join(",")}&attributes=id,price,seller_sku,status`,
          { headers: { Authorization: `Bearer ${token.access_token}` } }
        );
        const items = await r.json();
        for (const { body } of items) {
          if (body?.seller_sku) prices.push({ sku: body.seller_sku, price: body.price });
        }
      }

      // Buscar last_known_prices do Firebase
      const knownRes = await fetch(`${FIREBASE_URL}/last_known_prices.json`);
      const known = (await knownRes.json()) || {};

      const detected = [];
      const updates = {};

      for (const item of prices) {
        const sku = item.sku;
        const precoAtual = Number(item.price);
        const precoConhecido = known[sku];
        if (precoConhecido === undefined || precoConhecido === null) {
          updates[`last_known_prices/${sku}`] = precoAtual;
        } else if (Math.abs(Number(precoConhecido) - precoAtual) > 0.009) {
          updates[`price_changes/${sku}`] = {
            changedAt: Date.now(),
            changedBy: "cron-automático",
            priceBefore: Number(precoConhecido),
            priceAfter: precoAtual,
            vendas30AtChange: 0,
          };
          updates[`last_known_prices/${sku}`] = precoAtual;
          detected.push({ sku, before: precoConhecido, after: precoAtual });
        }
      }

      if (Object.keys(updates).length > 0) {
        await fetch(`${FIREBASE_URL}/.json`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
      }

      return res.json({ ok: true, skusVerificados: prices.length, mudancasDetectadas: detected.length, mudancas: detected });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // Modo "prices": lista preço atual de todos os anúncios ativos (sku, id, price).
  // Fica no mesmo arquivo/rota do ml-vendas pra não gastar mais uma Serverless
  // Function (limite de 12 no plano Hobby da Vercel). Usado pro acompanhamento
  // automático de mudança de preço, sem precisar marcar nada manualmente.
  if (req.query.prices) {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers });
      const me = await meRes.json();
      if (!me.id) return res.status(401).json({ error: "Token inválido" });

      let itemIds = [];
      let offset = 0;
      for (let page = 0; page < 3; page++) {
        const r = await fetch(
          `https://api.mercadolibre.com/users/${me.id}/items/search?status=active&limit=100&offset=${offset}`,
          { headers }
        );
        const d = await r.json();
        const results = d.results || [];
        itemIds.push(...results);
        if (results.length < 100) break;
        offset += 100;
      }

      const prices = [];
      for (let i = 0; i < itemIds.length; i += 20) {
        const chunk = itemIds.slice(i, i + 20);
        const detailRes = await fetch(
          `https://api.mercadolibre.com/items?ids=${chunk.join(",")}&attributes=id,price,seller_sku,status`,
          { headers }
        );
        const detailData = await detailRes.json();
        (detailData || [])
          .filter(r => r.code === 200)
          .forEach(r => {
            const body = r.body;
            if (body.seller_sku) prices.push({ sku: body.seller_sku, id: body.id, price: body.price });
          });
      }

      return res.json({ ok: true, prices, updated_at: new Date().toISOString() });
    } catch (e) {
      console.error("ml-vendas prices error:", e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Modo "custos": busca custo unitário por SKU nos dados fiscais dos anúncios
  // Usado pelo cálculo de CMP — busca token da Filial automaticamente
  if (req.query.custos) {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers });
      const me = await meRes.json();
      if (!me.id) return res.status(401).json({ error: "Token inválido" });

      const skusFiltro = (req.query.skus || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

      // Lista anúncios ativos + pausados
      let itemIds = [];
      for (const status of ["active", "paused"]) {
        let offset = 0;
        for (let page = 0; page < 5; page++) {
          const r = await fetch(`https://api.mercadolibre.com/users/${me.id}/items/search?status=${status}&limit=100&offset=${offset}`, { headers });
          const d = await r.json();
          const results = d.results || [];
          itemIds.push(...results);
          if (results.length < 100) break;
          offset += 100;
        }
      }
      itemIds = [...new Set(itemIds)];

      // Busca detalhe de cada item (inclui cost nos fiscal_data)
      const custoPorSku = {};
      for (let i = 0; i < Math.min(itemIds.length, 200); i += 10) {
        const lote = itemIds.slice(i, i + 10);
        const resultados = await Promise.all(lote.map(async id => {
          try {
            const r = await fetch(`https://api.mercadolibre.com/items/${id}`, { headers });
            return await r.json();
          } catch(e) { return null; }
        }));
        for (const d of resultados) {
          if (!d?.id) continue;
          const sku = d.seller_sku || (d.attributes||[]).find(a=>a.id==="SELLER_SKU")?.value_name;
          if (!sku) continue;
          const skuKey = String(sku).trim().toLowerCase();
          // Só processa SKUs que estamos buscando (se filtro informado)
          if (skusFiltro.length > 0 && !skusFiltro.includes(skuKey)) continue;
          // Custo vem em sale_terms como "COST_PRICE" ou em cost diretamente
          const costTerm = (d.sale_terms||[]).find(t => t.id === "COST_PRICE");
          const cost = costTerm?.value_struct?.amount ?? costTerm?.value_name ?? d.cost ?? null;
          if (!custoPorSku[skuKey] && cost != null) {
            custoPorSku[skuKey] = { sku, cost: parseFloat(cost) || 0, item_id: d.id };
          }
          // Debug: mostra campos disponíveis nos primeiros 3 itens com SKU filtrado
          if (req.query.debug && skusFiltro.includes(skuKey)) {
            custoPorSku[`_debug_${skuKey}`] = {
              sale_terms: d.sale_terms,
              cost: d.cost,
              costTerm,
            };
          }
        }
      }

      return res.json({ ok: true, custos: custoPorSku });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Modo "estoque": puxa o saldo do Full automaticamente, sem precisar da
  // planilha manual. Fica no mesmo arquivo/rota do ml-vendas pra não gastar
  // mais uma Serverless Function (limite de 12 no plano Hobby da Vercel).
  if (req.query.estoque) {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers });
      const me = await meRes.json();
      if (!me.id) return res.status(401).json({ error: "Token inválido" });

      // 1) Lista de anúncios ativos E pausados (um anúncio pausado ainda pode
      // ter estoque parado no Full, e não pode ficar de fora da conta)
      let itemIds = [];
      for (const status of ["active", "paused"]) {
        let offset = 0;
        for (let page = 0; page < 5; page++) {
          const r = await fetch(
            `https://api.mercadolibre.com/users/${me.id}/items/search?status=${status}&limit=100&offset=${offset}`,
            { headers }
          );
          const d = await r.json();
          const results = d.results || [];
          itemIds.push(...results);
          if (results.length < 100) break;
          offset += 100;
        }
      }
      itemIds = [...new Set(itemIds)]; // remove duplicatas se algum item aparecer nas duas buscas

      // 2) Detalhe COMPLETO item por item — o "inventory_id" não vem no
      // formato resumido em lote (attributes=...), só no detalhe completo
      // de cada anúncio individualmente.
      function extrairSku(item) {
        if (item.seller_sku) return item.seller_sku;
        const attr = (item.attributes || []).find(a => a.id === "SELLER_SKU");
        return attr ? attr.value_name : null;
      }
      const capBuscaDetalhe = Math.min(itemIds.length, 200);
      const idsParaBuscar = itemIds.slice(0, capBuscaDetalhe);
      let itensDetalhe = [];
      const debugItensAmostra = [];
      for (let i = 0; i < idsParaBuscar.length; i += 10) {
        const lote = idsParaBuscar.slice(i, i + 10);
        const resultados = await Promise.all(lote.map(async id => {
          try {
            const r = await fetch(`https://api.mercadolibre.com/items/${id}`, { headers });
            const d = await r.json();
            return d && d.id ? d : null;
          } catch (e) { return null; }
        }));
        resultados.forEach(d => {
          if (!d) return;
          const sku = extrairSku(d);
          if (req.query.debug && debugItensAmostra.length < 3) {
            debugItensAmostra.push({ id: d.id, sku, tem_inventory_id: !!d.inventory_id, inventory_id: d.inventory_id || null, logistic_type: d.shipping?.logistic_type || null });
          }
          if (sku) itensDetalhe.push({ id: d.id, seller_sku: sku, title: d.title, inventory_id: d.inventory_id || null });
        });
        if (i + 10 < idsParaBuscar.length) await sleep(300);
      }

      const itensFull = itensDetalhe.filter(it => it.inventory_id);
      const capItens = Math.min(parseInt(req.query.limite || "150"), 200);
      const itensLimitados = itensFull.slice(0, capItens);

      // 3) Saldo do Full por item, em lotes de 5 em paralelo
      const debug = [];
      const rowsPorSku = {}; // agrega por SKU — um mesmo SKU pode ter mais de um anúncio
      const inventoryJaContado = new Set(); // evita contar 2x anúncios sincronizados/catálogo que dividem o MESMO inventory_id
      for (let i = 0; i < itensLimitados.length; i += 5) {
        const lote = itensLimitados.slice(i, i + 5);
        await Promise.all(lote.map(async it => {
          try {
            const r = await fetch(`https://api.mercadolibre.com/inventories/${it.inventory_id}/stock/fulfillment`, { headers });
            const d = await r.json();
            // Nome exato do campo de saldo ainda não confirmado contra a API real —
            // tenta as variações mais prováveis e guarda a resposta crua no debug
            const aptas = d.available_quantity ?? d.total ?? d.quantity ?? 0;
            const chave = String(it.seller_sku).trim();
            const transf = (d.not_available_detail || []).filter(x => x.status === "transfer").reduce((s, x) => s + (x.quantity || 0), 0);

            if (req.query.debug) debug.push({ sku: it.seller_sku, item_id: it.id, inventory_id: it.inventory_id, jaContado: inventoryJaContado.has(it.inventory_id), transf, respostaCrua: d });

            if (!rowsPorSku[chave]) rowsPorSku[chave] = { sku: chave, produto: it.title || "", aptas: 0, transf: 0, pendente: 0, vendas30: 0 };

            // Dois anúncios (catálogo/sincronizados) que compartilham o MESMO inventory_id
            // são o mesmo estoque físico — conta só uma vez, não importa quantos anúncios apontem pra ele.
            if (inventoryJaContado.has(it.inventory_id)) return;
            inventoryJaContado.add(it.inventory_id);
            rowsPorSku[chave].aptas += aptas;
            rowsPorSku[chave].transf += transf;
          } catch (e) {
            if (req.query.debug) debug.push({ sku: it.seller_sku, erro: e.message });
          }
        }));
        if (i + 5 < itensLimitados.length) await sleep(300);
      }

      const rows = Object.values(rowsPorSku);

      return res.json({
        ok: true,
        rows,
        totalAnunciosAtivos: itemIds.length,
        totalNoFull: itensFull.length,
        totalProcessadosAgora: itensLimitados.length,
        ...(req.query.debug ? { debug, debugItensAmostra, todosOsSkusEncontrados: rows.map(r => r.sku) } : {}),
        updated_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error("ml-vendas estoque error:", e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  const skuFiltro = req.query.sku ? String(req.query.sku).trim().toLowerCase() : null;

  try {
    const headers = { Authorization: `Bearer ${token}` };

    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers });
    const me = await meRes.json();
    if (!me.id) return res.status(401).json({ error: "Token inválido" });
    const userId = me.id;

    // Suporta dois modos:
    // 1) ?days=N (padrão, usado pela aba Vendas) -> últimos N dias até agora
    // 2) ?from=ISO&to=ISO (usado pelo acompanhamento de mudança de preço) -> período exato
    let dateFromStr, dateToStr, days;
    if (req.query.from) {
      const fromD = new Date(req.query.from);
      const toD = req.query.to ? new Date(req.query.to) : new Date();
      dateFromStr = fromD.toISOString().split(".")[0] + ".000-03:00";
      dateToStr = toD.toISOString().split(".")[0] + ".000-03:00";
      days = Math.max(1, Math.ceil((toD - fromD) / 86400000));
    } else if (req.query.today === "1") {
      // Só o dia atual — 00:00 até agora
      days = 1;
      const hoje = new Date();
      dateFromStr = hoje.toISOString().split("T")[0] + "T00:00:00.000-03:00";
      dateToStr = hoje.toISOString().split("T")[0] + "T" + hoje.toTimeString().slice(0,8) + ".000-03:00";
    } else {
      days = parseInt(req.query.days || "7");
      const dateTo = new Date();
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - days);
      dateFromStr = dateFrom.toISOString().split("T")[0] + "T00:00:00.000-03:00";
      dateToStr = dateTo.toISOString().split("T")[0] + "T23:59:59.000-03:00";
    }

    // Pega total de pedidos para saber quantas páginas
    const countRes = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${userId}&order.date_created.from=${encodeURIComponent(dateFromStr)}&order.date_created.to=${encodeURIComponent(dateToStr)}&limit=1`,
      { headers }
    );
    const countData = await countRes.json();
    const totalOrders = countData.paging?.total || 0;

    // Busca primeiros 1000 pedidos em paralelo (lotes de 50, max 20 requisições)
    const maxPages = Math.min(Math.ceil(totalOrders / 50), 40); // até 2000 pedidos
    const pageRequests = [];
    for (let i = 0; i < maxPages; i++) {
      pageRequests.push(
        fetch(
          `https://api.mercadolibre.com/orders/search?seller=${userId}&order.date_created.from=${encodeURIComponent(dateFromStr)}&order.date_created.to=${encodeURIComponent(dateToStr)}&limit=50&offset=${i * 50}&sort=date_desc`,
          { headers }
        ).then(r => r.json()).then(d => d.results || []).catch(() => [])
      );
    }

    const pages = await Promise.all(pageRequests);
    let allOrders = pages.flat().filter(o => o.status !== "cancelled");

    // Processa pedidos
    const productMap = {};
    const dailyMap = {};
    let totalRevenue = 0;
    let totalUnits = 0;
    let skuQty = 0, skuRevenue = 0, skuTitle = null;
    const skuVendasDetalhe = [];

    allOrders.forEach(order => {
      const date = order.date_created?.slice(0, 10);
      const amount = order.total_amount || 0;
      if (date) dailyMap[date] = (dailyMap[date] || 0) + amount;
      totalRevenue += amount;

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
        const qty = item.quantity || 0;
        productMap[key].qty += qty;
        productMap[key].revenue += (item.unit_price || 0) * qty;
        totalUnits += qty;

        if (skuFiltro) {
          const itemSku = String(item.item?.seller_sku || "").trim().toLowerCase();
          const itemId = String(item.item?.id || "").trim().toLowerCase();
          if (itemSku === skuFiltro || itemId === skuFiltro) {
            skuQty += qty;
            skuRevenue += (item.unit_price || 0) * qty;
            skuTitle = item.item?.title || skuTitle;
            skuVendasDetalhe.push({
              date: order.date_created,
              qty,
              unitPrice: item.unit_price || 0,
              total: (item.unit_price || 0) * qty,
              orderId: order.id,
            });
          }
        }
      });
    });

    const products = Object.values(productMap).sort((a, b) => b.qty - a.qty);
    const topSellers = products.slice(0, 10);
    const lowSellers = products.filter(p => p.qty <= 2).slice(0, 10);

    // Anúncios parados
    let stoppedItems = [];
    try {
      const itemsRes = await fetch(
        `https://api.mercadolibre.com/users/${userId}/items/search?status=active&limit=20&sort=sold_quantity_asc`,
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
        stoppedItems = detailData
          .filter(r => r.code === 200)
          .map(r => r.body)
          .filter(item => !(productMap[item.id]?.qty > 0))
          .slice(0, 10);
      }
    } catch {}

    // Evolução diária (só quando o período for baseado em "days", pra não gerar listas gigantes com from/to longos)
    const dailyEvolution = [];
    if (!req.query.from) {
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
    }

    return res.json({
      ok: true,
      period: { days, from: dateFromStr, to: dateToStr },
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders: allOrders.length,
        totalOrdersML: totalOrders,
        totalUnits,
        avgTicket: allOrders.length > 0 ? Math.round((totalRevenue / allOrders.length) * 100) / 100 : 0,
        note: totalOrders > (maxPages * 50) ? `Mostrando ${maxPages * 50} de ${totalOrders} pedidos` : null,
      },
      skuMatch: skuFiltro ? { sku: skuFiltro, title: skuTitle, qty: skuQty, revenue: Math.round(skuRevenue * 100) / 100 } : null,
      skuVendasDetalhe: skuFiltro ? skuVendasDetalhe.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 100) : undefined,
      skusVendidosNoPeriodo: skuFiltro ? [...new Set(products.map(p => p.sku).filter(s => s && s !== "—"))].slice(0, 60) : undefined,
      allProducts: products.slice(0, 300).map(p => ({ sku: p.sku, qty: p.qty })), // usado pra montar o vendas30 do estoque automático
      dailyEvolution,
      topSellers,
      lowSellers,
      stoppedItems,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("ml-vendas error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};

module.exports.config = {
  maxDuration: 60,
};



