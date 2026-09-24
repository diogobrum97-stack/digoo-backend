
async function atualizarCatalogoBackground(token, uid, fbUrl) {
  const ids = [];
  for (let offset = 0; offset < 300; offset += 50) {
    const r = await fetch(`https://api.mercadolibre.com/users/${uid}/items/search?status=active&limit=50&offset=${offset}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json();
    const batch = d.results || [];
    ids.push(...batch);
    if (batch.length < 50) break;
  }
  const lotes = [];
  for (let i = 0; i < ids.length; i += 20) lotes.push(ids.slice(i, i + 20));
  const resultados = await Promise.all(lotes.map(lote =>
    fetch(`https://api.mercadolibre.com/items?ids=${lote.join(",")}&attributes=id,title,permalink,seller_sku,available_quantity`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).catch(() => [])
  ));
  const itens = [];
  resultados.flat().forEach(entry => {
    if (entry.code === 200 && entry.body)
      itens.push({ id: entry.body.id, titulo: entry.body.title, sku: entry.body.seller_sku || "", link: entry.body.permalink, estoque: entry.body.available_quantity || 0 });
  });
  await fetch(`${fbUrl}/catalogo_ml/${uid}.json`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itens, atualizado_em: Date.now(), total: itens.length }),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── Criar anúncio no ML ─────────────────────────────────────────────────
  if (req.query.action === 'criar-anuncio' && req.method === 'POST') {
    try {
      const { token, titulo, descricao, preco, estoque } = req.body;
      if (!token || !titulo || !preco) return res.status(400).json({ ok: false, error: "token, titulo e preco obrigatórios" });

      // Buscar user_id e category_id
      const meRes = await fetch('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${token}` } });
      const me = await meRes.json();
      if (!me.id) return res.status(400).json({ ok: false, error: "Token inválido" });

      // Predizer categoria automaticamente pelo título
      const catRes = await fetch(`https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(titulo)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const catData = await catRes.json();
      const category_id = catData?.[0]?.category_id || "MLB1648";

      const body = {
        title: titulo,
        category_id,
        price: Number(preco),
        currency_id: "BRL",
        available_quantity: Number(estoque) || 1,
        buying_mode: "buy_it_now",
        condition: "new",
        listing_type_id: "gold_special",
        description: { plain_text: descricao || titulo },
      };

      const crRes = await fetch('https://api.mercadolibre.com/items', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const crData = await crRes.json();

      if (crData.id) {
        return res.json({ ok: true, item_id: crData.id, permalink: crData.permalink });
      } else {
        return res.status(400).json({ ok: false, error: crData.message || JSON.stringify(crData.cause || crData) });
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Teste de sugestão com pergunta manual ──────────────────────────────
  if (req.query.action === 'testar-sugestao' && req.method === 'POST') {
    try {
      const { pergunta, token: tokenP, token_outro: tokenOutro } = { ...req.query, ...req.body };
      if (!pergunta || !tokenP) return res.status(400).json({ erro: 'pergunta e token obrigatorios' });

      async function buscarCatalogoTeste(token) {
        // Buscar ID do usuário primeiro
        const meRes = await fetch('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${token}` } });
        const me = await meRes.json();
        if (!me.id) return [];
        const ids = [];
        for (let offset = 0; offset < 200; offset += 50) {
          const r = await fetch(`https://api.mercadolibre.com/users/${me.id}/items/search?status=active&limit=50&offset=${offset}`, { headers: { Authorization: `Bearer ${token}` } });
          const d = await r.json();
          const batch = d.results || [];
          ids.push(...batch);
          if (batch.length < 50) break;
        }
        const itens = [];
        for (let i = 0; i < ids.length; i += 20) {
          const lote = ids.slice(i, i + 20);
          const r = await fetch(`https://api.mercadolibre.com/items?ids=${lote.join(',')}&attributes=id,title,permalink,seller_sku`, { headers: { Authorization: `Bearer ${token}` } });
          const arr = await r.json();
          arr.forEach(entry => { if (entry.code === 200 && entry.body) itens.push({ id: entry.body.id, titulo: entry.body.title, sku: entry.body.seller_sku || '', link: entry.body.permalink }); });
        }
        return itens;
      }

      const promessas = [buscarCatalogoTeste(tokenP)];
      if (tokenOutro) promessas.push(buscarCatalogoTeste(tokenOutro));
      const seen = new Set();
      const catalogo = [];
      (await Promise.all(promessas)).flat().forEach(item => { if (!seen.has(item.id)) { seen.add(item.id); catalogo.push(item); } });

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 500,
          system: 'Você é assistente de atendimento da Digoo Brasil. Recebe uma pergunta e o catálogo ativo. Identifique o produto mais adequado e responda com link se encontrar. Retorne APENAS JSON: {"suggested_answer": "resposta", "produto_identificado": {"titulo": "...", "sku": "...", "link": "..."} ou null}',
          messages: [{ role: 'user', content: JSON.stringify({ pergunta, catalogo_anuncios_ativos: catalogo }) }]
        })
      });
      const cd = await claudeRes.json();
      const raw = ((cd.content || []).find(b => b.type === 'text')?.text || '{}').trim().replace(/```json\s*|\s*```/g, '');
      const result = JSON.parse(raw);
      return res.json({ ok: true, pergunta, total_anuncios: catalogo.length, suggested_answer: result.suggested_answer || '', produto_identificado: result.produto_identificado || null });
    } catch (e) {
      return res.status(500).json({ erro: e.message });
    }
  }

  // ── Picking: fila de pedidos pendentes de envio (paga, pronto pra separar, sem ser Full) ──
  if (req.query.action === "picking-fila" && req.method === "GET") {
    try {
      const { token: tokenPk } = req.query;
      if (!tokenPk) return res.status(400).json({ ok: false, error: "token obrigatório" });

      const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers: { Authorization: `Bearer ${tokenPk}` } });
      const me = await meRes.json();
      if (!me.id) return res.status(400).json({ ok: false, error: "Não foi possível identificar o vendedor" });

      // Pedidos pagos dos últimos 4 dias — já é margem de sobra (na prática
      // pedido pendente de separar é sempre bem recente); reduz muito o
      // volume de chamadas comparado aos 15 dias de antes, deixando mais rápido.
      const dataDe = new Date(Date.now() - 7 * 86400000).toISOString();
      // ML limita a 50 por página — busca até 3 páginas (150 pedidos, mais que suficiente)
      let pedidos = [];
      for (let offset = 0; offset < 150; offset += 50) {
        const mlUrl = `https://api.mercadolibre.com/orders/search?seller=${me.id}&order.status=paid&order.date_created.from=${encodeURIComponent(dataDe)}&sort=date_desc&limit=50&offset=${offset}`;
        const ordersRes = await fetch(mlUrl, { headers: { Authorization: `Bearer ${tokenPk}` } });
        const ordersData = await ordersRes.json();
        const pagina = ordersData.results || [];
        pedidos.push(...pagina);
        if (pagina.length < 50) break; // última página
      }

      // Pra cada pedido, busca o envio (status/substatus/tipo logístico) — em
      // paralelo, em lotes de 10 (dobrado — antes eram 5, deixava mais lento)
      const comEnvio = [];
      for (let i = 0; i < pedidos.length; i += 10) {
        const lote = pedidos.slice(i, i + 10);
        const resultados = await Promise.all(lote.map(async (o) => {
          try {
            const shipRes = await fetch(`https://api.mercadolibre.com/orders/${o.id}/shipments`, { headers: { Authorization: `Bearer ${tokenPk}` } });
            if (!shipRes.ok) return null;
            const ship = await shipRes.json();
            return { order: o, shipment: ship };
          } catch (e) {
            return null;
          }
        }));
        comEnvio.push(...resultados.filter(Boolean));
      }

      // Filtra: só o que está REALMENTE pendente de separar/despachar —
      // "ready_to_ship" sozinho não basta, porque inclui "dropped_off" (já
      // despachado fisicamente) e "invoice_pending" (esperando nota fiscal).
      // Só entram: ready_to_print (etiqueta gerada) e printed (já impressa,
      // ainda não despachada) — que é exatamente o que aparece pendente no
      // painel do próprio ML. E continua excluindo Full, que o ML resolve sozinho.
      const SUBSTATUS_PENDENTES = ["ready_to_print", "printed", "waiting_for_carrier", null, undefined];
      const filaFinal = comEnvio.filter(({ shipment }) =>
        shipment.status === "ready_to_ship" &&
        (SUBSTATUS_PENDENTES.includes(shipment.substatus) || !shipment.substatus) &&
        shipment.logistic_type !== "fulfillment"
      );

      const resultado = filaFinal.map(({ order, shipment }) => ({
        order_id: order.id,
        pack_id: order.pack_id || null,
        shipment_id: shipment.id,
        comprador: order.buyer?.nickname || order.buyer?.first_name || "",
        itens: (order.order_items || []).map(it => ({
          item_id: it.item?.id || "",
          titulo: it.item?.title || "",
          sku: it.item?.seller_sku || "",
          quantidade: it.quantity || 1,
          thumbnail: it.item?.thumbnail || "",
        })),
        logistic_type: shipment.logistic_type || "",
        substatus: shipment.substatus || "",
        data: order.date_created,
      }));

      return res.json({
        ok: true,
        fila: resultado,
        ...(req.query.debug ? {
          debug: {
            sellerId: me.id,
            dataDe,
            totalPedidosEncontrados: pedidos.length,
            totalComEnvioConsultado: comEnvio.length,
            statusEncontrados: comEnvio
              .filter(({ shipment }) => shipment.status === "ready_to_ship" && ["ready_to_print", "printed"].includes(shipment.substatus) && shipment.logistic_type !== "fulfillment")
              .map(({ order, shipment }) => ({
                order_id: order.id,
                shipment_status: shipment.status,
                shipment_substatus: shipment.substatus,
                logistic_type: shipment.logistic_type,
                mode: shipment.mode,
                date_created: shipment.date_created,
                last_updated: shipment.last_updated,
                estimated_handling_limit: shipment.lead_time?.estimated_handling_limit?.date || null,
                shipping_option_estimated_handling_limit: shipment.shipping_option?.estimated_handling_limit?.date || null,
                status_history: shipment.status_history || null,
              })),
          },
        } : {}),
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Picking: gerar/baixar etiqueta de um ou mais envios ──
  if (req.query.action === "picking-etiqueta" && req.method === "GET") {
    try {
      const { token: tokenEt, shipment_ids } = req.query;
      if (!tokenEt || !shipment_ids) return res.status(400).json({ ok: false, error: "token e shipment_ids obrigatórios" });

      const labelRes = await fetch(
        `https://api.mercadolibre.com/shipment_labels?shipment_ids=${shipment_ids}&response_type=pdf`,
        { headers: { Authorization: `Bearer ${tokenEt}` } }
      );
      if (!labelRes.ok) {
        const txt = await labelRes.text();
        return res.status(labelRes.status).json({ ok: false, error: `Erro ao gerar etiqueta: ${txt.slice(0, 300)}` });
      }
      const buf = await labelRes.arrayBuffer();
      const base64pdf = Buffer.from(buf).toString("base64");
      return res.json({ ok: true, pdf_base64: base64pdf });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Perguntas: contagem rápida para o resumo do dashboard (sem IA) ──
  if (req.query.action === "contar-perguntas" && req.method === "GET") {
    try {
      const { token: tokenC } = req.query;
      if (!tokenC) return res.status(400).json({ ok: false, error: "token obrigatório" });
      const meRes = await fetch("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${tokenC}` },
      });
      const me = await meRes.json();
      if (!me.id) return res.status(400).json({ ok: false, error: "Não foi possível identificar o vendedor" });
      const qRes = await fetch(
        `https://api.mercadolibre.com/questions/search?seller_id=${me.id}&status=UNANSWERED&limit=1`,
        { headers: { Authorization: `Bearer ${tokenC}` } }
      );
      const qData = await qRes.json();
      return res.json({ ok: true, total: qData.total ?? qData.paging?.total ?? 0 });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Perguntas: buscar pendentes + gerar sugestão de resposta via Claude ──
  if (req.query.action === "buscar-perguntas" && req.method === "GET") {
    try {
      const { token: tokenP, token_outro: tokenOutro } = req.query;
      if (!tokenP) return res.status(400).json({ ok: false, error: "token obrigatório" });

      const meRes = await fetch("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${tokenP}` },
      });
      const me = await meRes.json();
      if (!me.id) return res.status(400).json({ ok: false, error: "Não foi possível identificar o vendedor" });

      const t0 = Date.now();
      const offset = parseInt(req.query.offset || "0");
      const qRes = await fetch(
        `https://api.mercadolibre.com/questions/search?seller_id=${me.id}&status=UNANSWERED&sort_fields=date_created&sort_types=DESC&limit=10&offset=${offset}`,
        { headers: { Authorization: `Bearer ${tokenP}` } }
      );
      const qData = await qRes.json();
      console.log(`[perf] perguntas ML: ${Date.now()-t0}ms`);
      const perguntas = (qData.questions || []).slice(0, 10);

      if (perguntas.length === 0) {
        return res.json({ ok: true, perguntas: [] });
      }

      // Buscar título, fotos, atributos e descrição dos anúncios
      const itemIds = [...new Set(perguntas.map(p => p.item_id))];
      const itemsInfo = {};
      for (let i = 0; i < itemIds.length; i += 20) {
        const lote = itemIds.slice(i, i + 20);
        try {
          const r = await fetch(`https://api.mercadolibre.com/items?ids=${lote.join(",")}&attributes=id,title,thumbnail,pictures,attributes,category_id`, {
            headers: { Authorization: `Bearer ${tokenP}` },
          });
          const arr = await r.json();
          arr.forEach(entry => {
            if (entry.code === 200 && entry.body) itemsInfo[entry.body.id] = entry.body;
          });
        } catch (e) {}
      }

      console.log(`[perf] itens ML: ${Date.now()-t0}ms`);
      // Descrições removidas do fluxo principal para reduzir latência
      // O Claude usa ficha técnica, título e catálogo que já são suficientes

      // Saudação por horário (fuso Brasil)
      const horaBR = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false });
      const h = parseInt(horaBR, 10);
      const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";

      // Buscar buyerNames + conhecimentoPorItem em paralelo
      const buyerIds = [...new Set(perguntas.map(p => p.buyer_id).filter(Boolean))];
      const itemIdsUnicos = [...new Set(perguntas.map(p => p.item_id))];
      const buyerNames = {};
      const conhecimentoPorItem = {};

      await Promise.all([
        // Nomes dos compradores
        ...buyerIds.map(async (bid) => {
          try {
            const r = await fetch(`https://api.mercadolibre.com/users/${bid}`, { headers: { Authorization: `Bearer ${tokenP}` } });
            const u = await r.json();
            const nick = (u.nickname || "").trim();
            const pareceNome = /^[A-Za-zÀ-ÿ]+$/.test(nick) && nick.length >= 3 && nick.length <= 20;
            if (pareceNome) buyerNames[bid] = nick.charAt(0).toUpperCase() + nick.slice(1).toLowerCase();
          } catch (e) {}
        }),
        // Histórico de respostas por produto
        ...(process.env.FIREBASE_URL ? itemIdsUnicos.map(async (iid) => {
          try {
            const exR = await fetch(`${process.env.FIREBASE_URL}/perguntas_treinamento/${iid}.json`);
            const exData = await exR.json();
            if (exData && typeof exData === "object") {
              conhecimentoPorItem[iid] = Object.values(exData)
                .filter(e => e && e.pergunta && e.resposta)
                .map(e => ({ pergunta: e.pergunta, resposta: e.resposta }));
            }
          } catch (e) {}
        }) : []),
      ]);

      console.log(`[perf] buyerNames+conhecimento: ${Date.now()-t0}ms`);
      // Gerar sugestões via Claude — uma chamada só, em lote
      // Buscar catálogo ativo (título + permalink + SKU) para o Claude identificar anúncios
      // Buscar catálogo das duas contas em paralelo
      async function buscarCatalogoConta(token) {
        const meR = await fetch('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${token}` } });
        const meD = await meR.json();
        if (!meD.id) return [];
        const uid = meD.id;
        const fbUrl = process.env.FIREBASE_URL;

        // Sempre usar cache do Firebase — se não tiver, retorna vazio e atualiza em background
        try {
          const cacheRes = await fetch(`${fbUrl}/catalogo_ml/${uid}.json`);
          const cache = await cacheRes.json();
          const cacheValido = cache && cache.atualizado_em && (Date.now() - cache.atualizado_em) < 4 * 60 * 60 * 1000;
          if (cache && cache.itens) {
            // Atualizar cache em background se expirado (sem bloquear)
            if (!cacheValido) {
              atualizarCatalogoBackground(token, uid, fbUrl).catch(() => {});
            }
            return cache.itens;
          }
        } catch(e) {}

        // Cache vazio — buscar de forma rápida (só 50 itens) e salvar
        const r0 = await fetch(`https://api.mercadolibre.com/users/${uid}/items/search?status=active&limit=50&offset=0`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d0 = await r0.json();
        const ids0 = d0.results || [];
        const lotes0 = [];
        for (let i = 0; i < ids0.length; i += 20) lotes0.push(ids0.slice(i, i + 20));
        const res0 = await Promise.all(lotes0.map(lote =>
          fetch(`https://api.mercadolibre.com/items?ids=${lote.join(",")}&attributes=id,title,permalink,seller_sku,available_quantity`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then(r => r.json()).catch(() => [])
        ));
        const itens0 = [];
        res0.flat().forEach(entry => {
          if (entry.code === 200 && entry.body)
            itens0.push({ id: entry.body.id, titulo: entry.body.title, sku: entry.body.seller_sku || "", link: entry.body.permalink, estoque: entry.body.available_quantity || 0 });
        });
        try {
          await fetch(`${fbUrl}/catalogo_ml/${uid}.json`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itens: itens0, atualizado_em: Date.now(), total: itens0.length }),
          });
        } catch(e) {}
        // Atualizar completo em background
        atualizarCatalogoBackground(token, uid, fbUrl).catch(() => {});
        return itens0;
      }

      let catalogoAtivo = [];
      try {
        const promessas = [buscarCatalogoConta(tokenP)];
        if (tokenOutro) promessas.push(buscarCatalogoConta(tokenOutro));
        const resultados = await Promise.all(promessas);
        // Deduplica por id
        const seen = new Set();
        resultados.flat().forEach(item => { if (!seen.has(item.id)) { seen.add(item.id); catalogoAtivo.push(item); } });
      } catch (e) { console.error("Erro ao buscar catálogo:", e.message); }

      console.log(`[perf] catálogo: ${Date.now()-t0}ms`);
      const listaParaClaude = perguntas.map((p, i) => {
        const item = itemsInfo[p.item_id] || {};
        // Ficha técnica — atributos do anúncio
        const fichaAtributos = (item.attributes || [])
          .filter(a => a.value_name && a.name)
          .map(a => `${a.name}: ${a.value_name}`)
          .join(", ");
        // URLs das fotos (até 4)
        const fotos = (item.pictures || []).slice(0, 4).map(pic => pic.url || pic.secure_url).filter(Boolean);
        return {
          idx: i,
          produto: item.title || "Produto",
          descricao: item.descricao || "",
          ficha_tecnica: fichaAtributos || "",
          fotos_url: fotos,
          pergunta: p.text,
          nome_comprador: buyerNames[p.buyer_id] || null,
          respostas_anteriores_deste_produto: conhecimentoPorItem[p.item_id] || [],
        };
      });

      const systemPrompt = `Atendimento Digoo Brasil (periféricos gamer e peças notebook no ML).

CONTEXTO: catalogo_anuncios_ativos tem os anúncios com estoque. perguntas tem contexto de cada pergunta.

REGRAS:
- Responda SEMPRE. Use conhecimento geral + respostas_anteriores_deste_produto + ficha_tecnica.
- NUNCA diga "não tenho essa informação" ou "vou passar pro time" para perguntas simples.
- NUNCA invente estoque, prazo de reposição ou disponibilidade futura.
- Se produto no catálogo com estoque > 0: confirme e mande link. Se estoque = 0: informe sem estoque e sugira similar disponível.
- NUNCA confirme disponibilidade sem produto no catálogo_anuncios_ativos.
- Busque MESMO MODELO/LINHA ao identificar variações (Wind X Reverse → Wind X Forward, não Aurora).
- NF: Filial SP emite por São Paulo, Matriz RS por Porto Alegre/RS.
- Saudação: use "${saudacao}" + nome do comprador se disponível.
- Frases curtas, linguagem simples, máx 2 frases.
- Se não achar produto e pergunta for sobre compra: suggested_answer="" e criar_rascunho com até 3 sugestões distintas de anúncios a criar.

Retorne APENAS JSON válido:
[{"idx":0,"requires_attention":false,"suggested_answer":"texto","produto_identificado":{"titulo":"...","sku":"...","link":"..."},"criar_rascunho":null}]

criar_rascunho formato: [{"titulo_sugerido":"...","descricao_sugerida":"...","preco_sugerido":null,"motivo":"..."}]`;

      const claudeRes

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 3000,
          system: systemPrompt,
          messages: [{
            role: "user",
            content: JSON.stringify({
              catalogo_anuncios_ativos: catalogoAtivo.slice(0, 150),
              perguntas: listaParaClaude.map(p => ({
                idx: p.idx,
                produto: p.produto,
                descricao: p.descricao,
                ficha_tecnica: p.ficha_tecnica,
                fotos_url: (p.fotos_url || []).slice(0, 3),
                pergunta: p.pergunta,
                nome_comprador: p.nome_comprador,
                respostas_anteriores_deste_produto: p.respostas_anteriores_deste_produto,
              }))
            })
          }],
        }),
      });
      const claudeData = await claudeRes.json();
      console.log(`[perf] claude: ${Date.now()-t0}ms`);
      let sugestoes = [];
      let debugRaw = "";
      try {
        const textBlock = (claudeData.content || []).find(b => b.type === "text");
        const raw = textBlock?.text?.trim() || "[]";
        debugRaw = raw.slice(0, 500);
        const jsonStr = raw.replace(/^```json\s*|\s*```$/g, "").replace(/^```\s*|\s*```$/g, "");
        try {
          sugestoes = JSON.parse(jsonStr);
        } catch(parseErr) {
          // JSON cortado — tentar extrair objetos completos individualmente
          console.error("JSON cortado, tentando extração parcial:", parseErr.message);
          const matches = jsonStr.match(/\{[^{}]*"idx"\s*:\s*\d+[^{}]*\}/g) || [];
          matches.forEach(m => { try { sugestoes.push(JSON.parse(m)); } catch(e) {} });
          if (sugestoes.length === 0) {
            // Último recurso: aumentar limite e tentar de novo com prompt mais curto
            console.error("Extração parcial falhou. Raw:", debugRaw);
          }
        }
      } catch (e) {
        console.error("Erro ao parsear resposta do Claude:", e.message);
        sugestoes = [];
      }

      const resultado = perguntas.map((p, i) => {
        const sug = sugestoes.find(s => s.idx === i) || {};
        return {
          question_id: p.id,
          item_id: p.item_id,
          produto: itemsInfo[p.item_id]?.title || "Produto",
          thumbnail: itemsInfo[p.item_id]?.thumbnail || "",
          pergunta: p.text,
          data: p.date_created,
          requires_attention: false,
          suggested_answer: sug.suggested_answer || "",
          produto_identificado: sug.produto_identificado || null,
          criar_rascunho: Array.isArray(sug.criar_rascunho) ? sug.criar_rascunho : (sug.criar_rascunho ? [sug.criar_rascunho] : null),
          has_knowledge: (conhecimentoPorItem[p.item_id] || []).length > 0,
        };
      });

      // Salvar rascunhos no Firebase — agrupados por question_id
      const rascunhos = resultado.filter(p => p.criar_rascunho);
      if (rascunhos.length > 0) {
        try {
          const fbUrl = process.env.FIREBASE_URL;

          // Buscar rascunhos existentes para não duplicar por question_id
          const existRes = await fetch(`${fbUrl}/anuncios_rascunho.json`);
          const existData = await existRes.json() || {};
          const existingByPergunta = {};
          Object.entries(existData).forEach(([id, r]) => {
            if (r && r.pergunta_id) existingByPergunta[r.pergunta_id] = id;
          });

          // Agrupar sugestões por question_id
          const porPergunta = {};
          rascunhos.forEach(p => {
            const qid = p.question_id || p.item_id;
            if (!porPergunta[qid]) {
              porPergunta[qid] = {
                pergunta_origem: p.pergunta,
                pergunta_id: p.question_id,
                item_id_origem: p.item_id,
                produto_origem_titulo: p.produto || "",
                criado_em: Date.now(),
                status: "pendente",
                sugestoes: [],
              };
            }
            // criar_rascunho já é array — adiciona cada sugestão
            const sugs = Array.isArray(p.criar_rascunho) ? p.criar_rascunho : [p.criar_rascunho];
            sugs.forEach(s => {
              if (s && s.titulo_sugerido && !porPergunta[qid].sugestoes.find(x => x.titulo_sugerido === s.titulo_sugerido)) {
                porPergunta[qid].sugestoes.push({
                  titulo_sugerido: s.titulo_sugerido || "",
                  descricao_sugerida: s.descricao_sugerida || "",
                  preco_sugerido: s.preco_sugerido || null,
                  motivo: s.motivo || "",
                });
              }
            });
          });

          // Salvar ou atualizar no Firebase
          for (const [qid, rascunho] of Object.entries(porPergunta)) {
            if (existingByPergunta[qid]) {
              // Já existe — adiciona sugestões novas
              const existId = existingByPergunta[qid];
              const existSugestoes = existData[existId]?.sugestoes || [];
              const novasSugestoes = [...existSugestoes, ...rascunho.sugestoes];
              await fetch(`${fbUrl}/anuncios_rascunho/${existId}/sugestoes.json`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(novasSugestoes),
              });
            } else {
              // Novo rascunho
              await fetch(`${fbUrl}/anuncios_rascunho.json`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(rascunho),
              });
            }
          }
        } catch (e) { console.error("Erro ao salvar rascunho:", e.message); }
      }

      return res.json({ ok: true, perguntas: resultado, _debug: debugRaw, _perf: { total: Date.now()-t0 } });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Perguntas: enviar resposta ──
  if (req.query.action === "responder-pergunta" && req.method === "POST") {
    try {
      const { question_id, texto, token: tokenR } = req.body || {};
      if (!question_id || !texto || !tokenR) return res.status(400).json({ ok: false, error: "question_id, texto e token obrigatórios" });

      const r = await fetch("https://api.mercadolibre.com/answers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenR}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ question_id: Number(question_id), text: texto }),
      });
      const data = await r.json();
      if (!r.ok || data.error || data.cause) {
        return res.status(400).json({ ok: false, error: data.message || data.error || "Erro ao enviar resposta", status: r.status, raw: data });
      }

      // Salvar como conhecimento fixo DESSE produto — com limite de tempo, pra nunca segurar a resposta ao usuário
      if (process.env.FIREBASE_URL) {
        try {
          const { pergunta_texto, produto, item_id: itemIdSalvar } = req.body || {};
          if (itemIdSalvar) {
            const salvarPromise = fetch(`${process.env.FIREBASE_URL}/perguntas_treinamento/${itemIdSalvar}/${question_id}.json`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                pergunta: pergunta_texto || "",
                produto: produto || "",
                resposta: texto,
                data: new Date().toISOString(),
              }),
            });
            const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1200));
            await Promise.race([salvarPromise, timeoutPromise]);
          }
        } catch (e) {}
      }

      return res.json({ ok: true, raw: data });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Clonar anúncio: buscar dados completos do item de origem ──
  if (req.query.action === "buscar-clone" && req.method === "GET") {
    try {
      const { item_id, token: tokenOrigem } = req.query;
      if (!item_id || !tokenOrigem) return res.status(400).json({ ok: false, error: "item_id e token obrigatórios" });

      const itemRes = await fetch(`https://api.mercadolibre.com/items/${item_id}`, {
        headers: { Authorization: `Bearer ${tokenOrigem}` },
      });
      const item = await itemRes.json();
      if (item.error) return res.status(400).json({ ok: false, error: item.message || "Anúncio não encontrado" });

      let descricao = "";
      try {
        const descRes = await fetch(`https://api.mercadolibre.com/items/${item_id}/description`, {
          headers: { Authorization: `Bearer ${tokenOrigem}` },
        });
        const descData = await descRes.json();
        descricao = descData.plain_text || "";
      } catch (e) {}

      return res.json({
        ok: true,
        item: {
          id: item.id,
          title: item.title,
          category_id: item.category_id,
          price: item.price,
          currency_id: item.currency_id,
          available_quantity: item.available_quantity,
          condition: item.condition,
          listing_type_id: item.listing_type_id,
          buying_mode: item.buying_mode,
          seller_custom_field: item.seller_custom_field,
          sku: item.seller_custom_field || (item.attributes || []).find(a => a.id === "SELLER_SKU")?.value_name || "",
          pictures: (item.pictures || []).map(p => ({ source: p.secure_url || p.url })),
          attributes: (item.attributes || [])
            .map(a => ({
              id: a.id,
              value_id: a.value_id || (Array.isArray(a.values) && a.values[0]?.id) || undefined,
              value_name: a.value_name || (Array.isArray(a.values) && a.values[0]?.name) || undefined,
            }))
            .filter(a => a.id && (a.value_id || a.value_name) && !["PACKAGE_HEIGHT","PACKAGE_LENGTH","PACKAGE_WIDTH","PACKAGE_WEIGHT","PRODUCT_FEATURES","SHIPMENT_PACKING","LED_COLOR","PACKAGE_DATA_SOURCE"].includes(a.id)),
          variations: item.variations || [],
          descricao,
          has_variations: (item.variations || []).length > 0,
        },
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Clonar anúncio: publicar na conta de destino ──
  if (req.query.action === "clonar" && req.method === "POST") {
    try {
      const { item, tokenDestino, novoSku, novaQuantidade } = req.body || {};
      if (!item || !tokenDestino) return res.status(400).json({ ok: false, error: "item e tokenDestino obrigatórios" });

      if (item.has_variations) {
        return res.status(400).json({ ok: false, error: "Anúncios com variações ainda não são suportados na clonagem." });
      }

      const body = {
        family_name: (item.title || "").slice(0, 60),
        category_id: item.category_id,
        price: item.price,
        currency_id: item.currency_id || "BRL",
        available_quantity: novaQuantidade != null ? novaQuantidade : item.available_quantity,
        buying_mode: item.buying_mode || "buy_it_now",
        condition: item.condition || "new",
        listing_type_id: item.listing_type_id || "gold_special",
        seller_custom_field: novoSku || item.seller_custom_field || item.sku || undefined,
        pictures: item.pictures,
        attributes: item.attributes,
      };

      const createRes = await fetch("https://api.mercadolibre.com/items", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenDestino}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const created = await createRes.json();

      if (created.error || created.cause) {
        return res.status(400).json({ ok: false, error: created.message || "Erro ao criar anúncio", detalhes: created.cause || [], raw: created });
      }

      if (item.descricao) {
        try {
          await fetch(`https://api.mercadolibre.com/items/${created.id}/description`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${tokenDestino}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ plain_text: item.descricao }),
          });
        } catch (e) {}
      }

      return res.json({ ok: true, item_id: created.id, permalink: created.permalink });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  let token = req.query.token;

  // Busca token da Filial automaticamente do Firebase se não vier na URL
  // (usado pelos modos estoque e custos que operam na conta da Filial)

  // ── Frete médio por componente (para base de cálculo do IPI) ─────────────
  // Busca vendas dos últimos 60 dias, pega frete pago por anúncio (list_cost),
  // cruza com composição dos kits no Bling, rateia por valor de cada componente
  if (req.query.action === "frete-medio-componentes") {
    try {
      if (!token) return res.status(400).json({ ok: false, erro: "Token ML ausente" });

      const diasAtras = parseInt(req.query.dias || "60");
      const dataDe = new Date(Date.now() - diasAtras * 86400000).toISOString();

      // Resolve seller_id
      const meResFrete = await fetch("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const meFrete = await meResFrete.json();
      if (!meFrete.id) return res.status(401).json({ ok: false, erro: "Token ML inválido" });

      // Busca token Bling para pegar composição dos kits
      const blingTokenSnap = await fetch(`${process.env.FIREBASE_URL}/bling_token.json`);
      const blingToken = await blingTokenSnap.json();
      const blingHeaders = {
        Authorization: `Bearer ${blingToken?.access_token}`,
        Accept: "application/json",
      };

      // Busca pedidos pagos dos últimos X dias (máx 200)
      const ordersResp = await fetch(
        `https://api.mercadolibre.com/orders/search?seller=${meFrete.id}&order.status=paid&order.date_created.from=${encodeURIComponent(dataDe)}&sort=date_desc&limit=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!ordersResp.ok) return res.status(ordersResp.status).json({ erro: "Erro ao buscar pedidos ML" });
      const ordersData = await ordersResp.json();
      const orders = ordersData.results || [];

      // Para cada pedido, busca o envio e pega o list_cost (frete pago pelo vendedor)
      // Agrupa por SKU do item vendido
      const fretePorSku = {}; // sku -> { totalFrete, totalQtd, pedidos }

      const sleep = ms => new Promise(r => setTimeout(r, ms));

      for (const order of orders) {
        // Pega SKU e quantidade de cada item do pedido
        const itens = order.order_items || [];
        if (!itens.length) continue;

        // Pega shipment_id direto do pedido (sem chamada extra)
        const shipmentId = order.shipping?.id;
        if (!shipmentId) continue;

        // Busca fees do shipment — campo que contém o custo real pago pelo vendedor
        await sleep(100);
        let listCost = 0;
        try {
          const feesResp = await fetch(
            `https://api.mercadolibre.com/shipments/${shipmentId}/fees`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (feesResp.ok) {
            const feesData = await feesResp.json();
            // seller_shipping_cost = custo líquido cobrado do vendedor
            listCost = Number(
              feesData?.seller_shipping_cost ??
              feesData?.cost?.seller_shipping_cost ??
              feesData?.shipping_cost ??
              0
            );
            // Fallback: tenta shipping_option dentro do shipment
            if (listCost <= 0) {
              const shipResp2 = await fetch(
                `https://api.mercadolibre.com/shipments/${shipmentId}`,
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (shipResp2.ok) {
                const ship = await shipResp2.json();
                listCost = Number(
                  ship?.shipping_option?.cost ??
                  ship?.base_cost ??
                  ship?.cost ??
                  0
                );
              }
            }
          }
        } catch(e) {}

        if (listCost <= 0) continue;

        // Distribui frete entre itens do pedido proporcionalmente ao preço
        const totalValorPedido = itens.reduce((s, it) => s + (Number(it.unit_price || 0) * Number(it.quantity || 1)), 0);

        for (const item of itens) {
          // Busca SKU do anúncio no Bling (pode estar no título ou precisar buscar)
          const itemId = item.item?.id;
          const qty = Number(item.quantity || 1);
          const valorItem = Number(item.unit_price || 0) * qty;
          const freteItem = totalValorPedido > 0 ? listCost * (valorItem / totalValorPedido) : listCost / itens.length;

          // Busca SKU real do anúncio ML
          await sleep(80);
          let sku = null;
          try {
            const itemResp = await fetch(
              `https://api.mercadolibre.com/items/${itemId}?attributes=id,seller_sku`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (itemResp.ok) {
              const itemData = await itemResp.json();
              sku = itemData.seller_sku || null;
            }
          } catch(e) {}

          if (!sku) continue;

          if (!fretePorSku[sku]) fretePorSku[sku] = { totalFrete: 0, totalQtd: 0 };
          fretePorSku[sku].totalFrete += freteItem;
          fretePorSku[sku].totalQtd += qty;
        }
      }

      // Agora para cada SKU, verifica se é kit no Bling e desmembra
      // freteMedioComponente -> { componente_sku: freteUnitMedio }
      const freteComponente = {}; // sku_componente -> { totalFreteAtribuido, totalQtd }
      const skusKit = {}; // sku_kit -> [{ sku_comp, qtdPorKit, custoComp }]

      for (const [sku, dados] of Object.entries(fretePorSku)) {
        const freteUnitKit = dados.totalFrete / dados.totalQtd; // frete por unidade de kit

        // Busca produto no Bling para ver se é kit
        await sleep(150);
        let componentes = null;
        let custoTotalKit = 0;
        try {
          const buscaResp = await fetch(
            `https://www.bling.com.br/Api/v3/produtos?codigo=${encodeURIComponent(sku)}&limite=3`,
            { headers: blingHeaders }
          );
          if (buscaResp.ok) {
            const buscaData = await buscaResp.json();
            const prod = (buscaData.data || []).find(p => String(p.codigo||'').trim() === sku.trim()) || (buscaData.data||[])[0];
            if (prod) {
              await sleep(150);
              const detResp = await fetch(`https://www.bling.com.br/Api/v3/produtos/${prod.id}`, { headers: blingHeaders });
              if (detResp.ok) {
                const detData = (await detResp.json()).data || {};
                const estrutura = detData.estrutura?.componentes || [];
                if (estrutura.length > 0) {
                  // É kit — busca cada componente para saber o custo
                  const comps = [];
                  for (const comp of estrutura) {
                    const compId = comp.produto?.id;
                    const compQtd = Number(comp.quantidade || 1);
                    if (!compId) continue;
                    await sleep(100);
                    const compResp = await fetch(`https://www.bling.com.br/Api/v3/produtos/${compId}`, { headers: blingHeaders });
                    if (compResp.ok) {
                      const compData = (await compResp.json()).data || {};
                      const compSku = compData.codigo || '';
                      const compCusto = Number(compData.fornecedor?.precoCusto || compData.preco || 0);
                      comps.push({ sku: compSku, qtdPorKit: compQtd, custo: compCusto });
                      custoTotalKit += compCusto * compQtd;
                    }
                  }
                  componentes = comps;
                }
              }
            }
          }
        } catch(e) {}

        if (componentes && componentes.length > 0 && custoTotalKit > 0) {
          // Rateia frete do kit proporcionalmente pelo custo de cada componente
          for (const comp of componentes) {
            const proporcao = (comp.custo * comp.qtdPorKit) / custoTotalKit;
            const freteAtribuidoComp = freteUnitKit * proporcao; // frete por unidade de componente
            const qtdTotalComp = dados.totalQtd * comp.qtdPorKit;

            if (!freteComponente[comp.sku]) freteComponente[comp.sku] = { totalFreteAtribuido: 0, totalQtd: 0 };
            freteComponente[comp.sku].totalFreteAtribuido += freteAtribuidoComp * qtdTotalComp;
            freteComponente[comp.sku].totalQtd += qtdTotalComp;
          }
        } else {
          // Produto simples — frete é direto por unidade
          if (!freteComponente[sku]) freteComponente[sku] = { totalFreteAtribuido: 0, totalQtd: 0 };
          freteComponente[sku].totalFreteAtribuido += dados.totalFrete;
          freteComponente[sku].totalQtd += dados.totalQtd;
        }
      }

      // Calcula média final por componente
      const resultado = {};
      for (const [sku, dados] of Object.entries(freteComponente)) {
        if (dados.totalQtd > 0) {
          resultado[sku] = Number((dados.totalFreteAtribuido / dados.totalQtd).toFixed(4));
        }
      }

      // Salva no Firebase para uso na calculadora IPI
      await fetch(`${process.env.FIREBASE_URL}/frete_medio_componentes.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados: resultado, atualizadoEm: Date.now(), diasBase: diasAtras, pedidosAnalisados: orders.length })
      });

      return res.json({ ok: true, resultado, pedidosAnalisados: orders.length, diasBase: diasAtras });
    } catch(e) {
      return res.status(500).json({ erro: e.message });
    }
  }

    if ((req.query.estoque || req.query.custos || req.query.action === "testads" || req.query.action === "testpacking" || req.query.action === "testinbound" || req.query.cron === "prices") && !token && process.env.FIREBASE_URL) {
    try {
      const tR = await fetch(`${process.env.FIREBASE_URL}/ml_token_filial.json`);
      const tData = await tR.json();
      token = tData?.access_token;
    } catch (e) { /* segue sem token, cai no erro padrão abaixo */ }
  }

  if (!token) return res.status(400).json({ error: "Token ausente" });

  // Modo "testinbound": busca entrada pendente OZKO53026
  if (req.query.action === "testinbound") {
    const safeJson = async (r) => {
      const text = await r.text();
      try { return { status: r.status, data: JSON.parse(text) }; }
      catch(e) { return { status: r.status, data: null, raw: text.slice(0, 400) }; }
    };
    try {
      const tR = await fetch(`${process.env.FIREBASE_URL}/ml_token_filial.json`);
      const tData = await tR.json();
      const tk = tData?.access_token;
      if (!tk) return res.json({ ok: false, msg: "Token filial não encontrado" });

      const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers: { Authorization: `Bearer ${tk}` } });
      const me = await meRes.json();
      const uid = me.id;
      const invId = "OZKO53026";

      // Janela correta: máximo 59 dias, sem data futura
      const dateFrom = new Date(Date.now() - 59*24*60*60*1000).toISOString().slice(0,10);
      const dateTo   = new Date().toISOString().slice(0,10);

      // a) operations sem tipo — janela correta
      const ra = await safeJson(await fetch(
        `https://api.mercadolibre.com/stock/fulfillment/operations/search?seller_id=${uid}&inventory_id=${invId}&date_from=${dateFrom}&date_to=${dateTo}&limit=50`,
        { headers: { Authorization: `Bearer ${tk}` } }
      ));
      const types = [...new Set((ra.data?.results||[]).map(x => x.type))];

      // b) inventories/{id}/stock/fulfillment — campos completos
      const rb = await safeJson(await fetch(
        `https://api.mercadolibre.com/inventories/${invId}/stock/fulfillment`,
        { headers: { Authorization: `Bearer ${tk}` } }
      ));

      // c) inventories/{id}/inbounds — entradas pendentes
      const rc = await safeJson(await fetch(
        `https://api.mercadolibre.com/inventories/${invId}/inbounds?seller_id=${uid}&limit=10`,
        { headers: { Authorization: `Bearer ${tk}` } }
      ));

      // d) seller inbounds pelo seller_id
      const rd = await safeJson(await fetch(
        `https://api.mercadolibre.com/users/${uid}/inbounds?status=pending&limit=10`,
        { headers: { Authorization: `Bearer ${tk}` } }
      ));

      // e) inbound por seller — outro padrão
      const re = await safeJson(await fetch(
        `https://api.mercadolibre.com/inbound/plans?seller_id=${uid}&limit=5`,
        { headers: { Authorization: `Bearer ${tk}` } }
      ));

      return res.json({ ok: true, uid, invId, dateFrom, dateTo,
        operations:        { status: ra.status, error: ra.data?.message, total: ra.data?.paging?.total, types_found: types, sample: (ra.data?.results||[]).slice(0,3) },
        inv_fulfillment:   { status: rb.status, data: rb.data },
        inv_inbounds:      { status: rc.status, data: rc.data },
        user_inbounds:     { status: rd.status, data: rd.data },
        inbound_plans:     { status: re.status, data: re.data },
      });
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }); }
  }

  // Modo "testpacking": diagnóstico de endpoints packing/fulfillment do ML
  if (req.query.action === "testpacking") {
    try {
      const tR = await fetch(`${process.env.FIREBASE_URL}/ml_token_filial.json`);
      const tData = await tR.json();
      const tk = tData?.access_token;
      if (!tk) return res.json({ ok: false, msg: "Token filial não encontrado" });
      const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers: { Authorization: `Bearer ${tk}` } });
      const me = await meRes.json();
      if (!me.id) return res.status(401).json({ error: "Token inválido", detail: me });
      const uid = me.id;
      const endpoints = [
        { label: "packing_requests v1",      url: `https://api.mercadolibre.com/packing_requests?seller_id=${uid}&status=open&limit=5` },
        { label: "packing_requests v2",      url: `https://api.mercadolibre.com/v2/packing_requests?seller_id=${uid}&status=open&limit=5` },
        { label: "fulfillment/inbound",      url: `https://api.mercadolibre.com/fulfillment/inbound/orders?seller_id=${uid}&limit=5` },
        { label: "logistics/shipments",      url: `https://api.mercadolibre.com/logistics/shipments?seller_id=${uid}&type=fulfillment&limit=5` },
        { label: "stock/seller_product",     url: `https://api.mercadolibre.com/fulfillment/stock/seller_product_stock_details?seller_id=${uid}&limit=5` },
      ];
      const results = await Promise.all(endpoints.map(async ({ label, url }) => {
        try {
          const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
          const data = await r.json();
          return { label, path: url.replace("https://api.mercadolibre.com",""), status: r.status, data };
        } catch(e) { return { label, status: "fetch_error", error: e.message }; }
      }));
      return res.json({ ok: true, userId: uid, nickname: me.nickname, results });
    } catch(e) { return res.status(500).json({ ok: false, error: e.message }); }
  }

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

      // Testar múltiplos endpoints de ADS
      const endpoints = [
        `https://api.mercadolibre.com/advertising/product_ads/sellers/${userId}/campaigns?limit=3`,
        `https://api.mercadolibre.com/advertising/advertisers?seller_id=${userId}`,
        `https://api.mercadolibre.com/advertising/product_ads/sellers/${userId}/ad_groups?limit=3`,
      ];

      const results = await Promise.all(endpoints.map(async url => {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token.access_token}` } });
        const data = await r.json();
        return { url: url.replace(`https://api.mercadolibre.com`, ""), status: r.status, data };
      }));

      return res.json({ ok: true, userId, results });
    } catch(e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // Modo "experiencia": busca experiência de compra de todos os itens ativos
  if (req.query.action === "experiencia") {
    try {
      const meRes2 = await fetch("https://api.mercadolibre.com/users/me", { headers: { Authorization: `Bearer ${token}` } });
      const meData2 = await meRes2.json();
      const uid = meData2.id;

      // Buscar todos os itens ativos (até 200)
      let allItems = [];
      for(let offset = 0; offset < 200; offset += 50) {
        const r = await fetch(
          `https://api.mercadolibre.com/users/${uid}/items/search?status=active&limit=50&offset=${offset}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const d = await r.json();
        if(!d.results?.length) break;
        allItems = allItems.concat(d.results);
        if(d.results.length < 50) break;
      }

      // Buscar experiência de compra em paralelo (lotes de 20)
      const results = [];
      for(let i = 0; i < allItems.length; i += 20) {
        const batch = allItems.slice(i, i + 20);
        const batchResults = await Promise.all(batch.map(async itemId => {
          try {
            const r = await fetch(
              `https://api.mercadolibre.com/reputation/items/${itemId}/purchase_experience/integrators?locale=pt_BR`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const d = await r.json();
            if(d.reputation) {
              // Problemas reais com causa raiz e solução (metrics_details.problems)
              const problemasDetalhados = (d.metrics_details?.problems || []).map(p => ({
                categoria: p.level_two?.title?.text || "",
                problema: p.level_three?.title?.text || "",
                solucao: p.level_three?.remedy?.text || "",
                quantidade: p.quantity || "",
                cancelamentos: p.cancellations || 0,
                reclamacoes: p.claims || 0,
                principal: p.tag === "PROBLEMA PRINCIPAL",
              }));
              // Recomendações reais (não os botões de ação da UI)
              const recomendacoes = (d.recommendations?.subtitles || []).map(s => s.text).filter(Boolean);
              return {
                itemId,
                title: d.title?.text,
                color: d.reputation.color,
                level: d.reputation.text,
                value: d.reputation.value,
                actions: recomendacoes.length ? recomendacoes : (d.actions?.map(a => a.text) || []),
                subtitles: (d.subtitles || []).map(s => s.text).filter(Boolean),
                problemasDetalhados,
                principalAcao: d.principal_actionable?.text || "",
                freeze: d.freeze?.text || "",
                status: d.status?.id || "active",
                sku: d.up_id,
              };
            }
            return null;
          } catch(e) { return null; }
        }));
        results.push(...batchResults.filter(Boolean));
      }

      // Filtrar só os com problema — qualquer cor que não seja "green" (ok), com valor válido
      const problemasBrutos = results
        .filter(r => r.color && r.color !== "green" && typeof r.value === "number" && r.value >= 0)
        .sort((a,b) => a.value - b.value);

      // Buscar título e SKU real dos itens problemáticos
      const itemIds = problemasBrutos.map(p => p.itemId).join(",");
      let itemDetails = {};
      if(itemIds) {
        const detRes = await fetch(
          `https://api.mercadolibre.com/items?ids=${itemIds}&attributes=id,title,seller_custom_field`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const detData = await detRes.json();
        detData.forEach(d => {
          if(d.code === 200) {
            itemDetails[d.body.id] = {
              title: d.body.title,
              sku: d.body.seller_custom_field || d.body.id,
            };
          }
        });
      }

      // Detalhes reais vêm de metrics_details.problems (causa raiz + solução)
      const problemasComDetalhes = problemasBrutos.map(p => ({
        ...p,
        detalhes: (p.problemasDetalhados || []).map(pd => ({
          tipo: pd.categoria,
          descricao: pd.problema + (pd.reclamacoes ? ` (${pd.reclamacoes} reclamação${pd.reclamacoes>1?"ões":""})` : "") + (pd.cancelamentos ? ` (${pd.cancelamentos} cancelamento${pd.cancelamentos>1?"s":""})` : ""),
          comoMelhorar: pd.solucao,
          quantidade: pd.reclamacoes + pd.cancelamentos,
        })),
      }));

      // Montar lista com detalhes e deduplicar por up_id (catálogo + tradicional)
      const vistos = new Set();
      const problemas = [];
      for(const p of problemasComDetalhes) {
        const chave = p.sku;
        if(vistos.has(chave)) continue;
        vistos.add(chave);
        problemas.push({
          ...p,
          title: itemDetails[p.itemId]?.title || p.title,
          sku: itemDetails[p.itemId]?.sku || p.itemId,
          link: `https://www.mercadolivre.com.br/anuncio/${p.itemId}`,
        });
      }

      return res.json({ ok: true, total: allItems.length, problemas, todos: results.length });
    } catch(e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // Modo "testquality": testa endpoints de experiência de compra e performance
  if (req.query.action === "testquality") {
    try {
      const meRes2 = await fetch("https://api.mercadolibre.com/users/me", { headers: { Authorization: `Bearer ${token}` } });
      const meData2 = await meRes2.json();
      const uid = meData2.id;

      const itemsRes = await fetch(
        `https://api.mercadolibre.com/users/${uid}/items/search?limit=1`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const itemsData = await itemsRes.json();
      const itemId = itemsData?.results?.[0];
      if (!itemId) return res.json({ ok: false, msg: "Nenhum item encontrado" });

      const [expRes, perfRes] = await Promise.all([
        fetch(`https://api.mercadolibre.com/reputation/items/${itemId}/purchase_experience/integrators?locale=pt_BR`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`https://api.mercadolibre.com/user-product/${itemId}/performance?locale=pt_BR`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      return res.json({
        ok: true, itemId,
        experiencia: { status: expRes.status, data: await expRes.json() },
        performance: { status: perfRes.status, data: await perfRes.json() },
      });
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
      // Só o dia atual em BRT (UTC-3) — 00:00 até agora
      days = 1;
      const agora = new Date();
      // Converter para BRT subtraindo 3h
      const agoraBRT = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
      const dataBRT = agoraBRT.toISOString().split("T")[0];
      const horaBRT = agoraBRT.toISOString().split("T")[1].slice(0,8);
      dateFromStr = `${dataBRT}T00:00:00.000-03:00`;
      dateToStr = `${dataBRT}T${horaBRT}.000-03:00`;
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
  // ── Lista de Compras ──────────────────────────────────────────────────────
  if (req.query.action === "lista-compras") {
    try {
      const dias = parseInt(req.query.dias || "90");
      const transitoDias = parseInt(req.query.transito || "70");
      const segurancaDias = parseInt(req.query.seguranca || "30");
      const tokenML = req.query.token || "";

      const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers: { Authorization: `Bearer ${tokenML}` } });
      const me = await meRes.json();
      if (!me.id) return res.status(401).json({ ok: false, erro: "Token ML inválido" });

      const blingSnap = await fetch(`${process.env.FIREBASE_URL}/bling_token.json`);
      const blingToken = await blingSnap.json();
      const blingH = { Authorization: `Bearer ${blingToken?.access_token}`, Accept: "application/json" };

      // Busca vendas ML paginado
      const dataDe = new Date(Date.now() - dias * 86400000).toISOString();
      let pedidos = [];
      for (let offset = 0; offset < 1000; offset += 50) {
        const r = await fetch(
          `https://api.mercadolibre.com/orders/search?seller=${me.id}&order.status=paid&order.date_created.from=${encodeURIComponent(dataDe)}&sort=date_desc&limit=50&offset=${offset}`,
          { headers: { Authorization: `Bearer ${tokenML}` } }
        );
        const d = await r.json();
        const pg = d.results || [];
        pedidos.push(...pg);
        if (pg.length < 50) break;
      }

      // Agrega vendas por SKU
      const vendasBruto = {};
      for (const pedido of pedidos) {
        for (const item of (pedido.order_items || [])) {
          const sku = item.item?.seller_sku || "";
          if (!sku) continue;
          vendasBruto[sku] = (vendasBruto[sku] || 0) + (item.quantity || 1);
        }
      }

      // Desmembra kits via Bling
      const vendasUnit = {};
      const cache = {};
      const getComps = async (sku) => {
        if (cache[sku] !== undefined) return cache[sku];
        try {
          const r1 = await fetch(`https://www.bling.com.br/Api/v3/produtos?codigo=${encodeURIComponent(sku)}&limite=1`, { headers: blingH });
          const d1 = await r1.json();
          const prod = d1.data?.[0];
          if (!prod) { cache[sku] = null; return null; }
          const r2 = await fetch(`https://www.bling.com.br/Api/v3/produtos/${prod.id}`, { headers: blingH });
          const d2 = await r2.json();
          const comps = d2.data?.estrutura?.componentes || [];
          cache[sku] = comps.length > 0 ? comps : null;
          return cache[sku];
        } catch(e) { cache[sku] = null; return null; }
      };

      const skus = Object.keys(vendasBruto);
      for (let i = 0; i < skus.length; i += 5) {
        await Promise.all(skus.slice(i, i+5).map(async (sku) => {
          const comps = await getComps(sku);
          if (comps) {
            for (const comp of comps) {
              const cSku = comp.produto?.codigo || comp.codigo || "";
              const cQtd = Number(comp.quantidade || 1);
              if (!cSku) continue;
              vendasUnit[cSku] = (vendasUnit[cSku] || 0) + (vendasBruto[sku] * cQtd);
            }
          } else {
            vendasUnit[sku] = (vendasUnit[sku] || 0) + vendasBruto[sku];
          }
        }));
      }

      // Busca estoque Bling
      const estoqueMap = {};
      const skusUnit = Object.keys(vendasUnit);
      for (let i = 0; i < skusUnit.length; i += 5) {
        await Promise.all(skusUnit.slice(i, i+5).map(async (sku) => {
          try {
            const r = await fetch(`https://www.bling.com.br/Api/v3/produtos?codigo=${encodeURIComponent(sku)}&limite=1`, { headers: blingH });
            const d = await r.json();
            estoqueMap[sku] = Number(d.data?.[0]?.estoque?.saldoVirtualTotal || 0);
          } catch(e) { estoqueMap[sku] = 0; }
        }));
      }

      // Calcula sugestão
      const resultado = skusUnit.map(sku => {
        const totalVendido = vendasUnit[sku];
        const mediaDiaria = totalVendido / dias;
        const cobertura = Math.ceil(mediaDiaria * (transitoDias + segurancaDias));
        const estoque = estoqueMap[sku] || 0;
        const sugestao = Math.max(0, cobertura - estoque);
        return { sku, totalVendido: Math.round(totalVendido), mediaMensal: Math.round(mediaDiaria * 30), estoque, coberturaNecessaria: cobertura, sugestao };
      }).filter(r => r.totalVendido > 0).sort((a, b) => b.sugestao - a.sugestao);

      return res.json({ ok: true, resultado, diasBase: dias, totalPedidos: pedidos.length });
    } catch(e) {
      return res.status(500).json({ ok: false, erro: e.message });
    }
  }

  // ── Criar anúncio no ML ─────────────────────────────────────────────────
  if (req.query.action === 'criar-anuncio' && req.method === 'POST') {
    try {
      const { token, titulo, descricao, preco, estoque } = req.body;
      if (!token || !titulo || !preco) return res.status(400).json({ ok: false, error: "token, titulo e preco obrigatórios" });

      // Buscar user_id e category_id
      const meRes = await fetch('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${token}` } });
      const me = await meRes.json();
      if (!me.id) return res.status(400).json({ ok: false, error: "Token inválido" });

      // Predizer categoria automaticamente pelo título
      const catRes = await fetch(`https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent(titulo)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const catData = await catRes.json();
      const category_id = catData?.[0]?.category_id || "MLB1648";

      const body = {
        title: titulo,
        category_id,
        price: Number(preco),
        currency_id: "BRL",
        available_quantity: Number(estoque) || 1,
        buying_mode: "buy_it_now",
        condition: "new",
        listing_type_id: "gold_special",
        description: { plain_text: descricao || titulo },
      };

      const crRes = await fetch('https://api.mercadolibre.com/items', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const crData = await crRes.json();

      if (crData.id) {
        return res.json({ ok: true, item_id: crData.id, permalink: crData.permalink });
      } else {
        return res.status(400).json({ ok: false, error: crData.message || JSON.stringify(crData.cause || crData) });
      }
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // ── Teste de sugestão com pergunta manual ──────────────────────────────
  if (req.query.action === 'testar-sugestao' && req.method === 'POST') {
    try {
      const { pergunta, token: tokenP, token_outro: tokenOutro } = { ...req.query, ...req.body };
      if (!pergunta || !tokenP) return res.status(400).json({ erro: 'pergunta e token obrigatorios' });

      async function buscarCatalogoTeste(token) {
        // Buscar ID do usuário primeiro
        const meRes = await fetch('https://api.mercadolibre.com/users/me', { headers: { Authorization: `Bearer ${token}` } });
        const me = await meRes.json();
        if (!me.id) return [];
        const ids = [];
        for (let offset = 0; offset < 200; offset += 50) {
          const r = await fetch(`https://api.mercadolibre.com/users/${me.id}/items/search?status=active&limit=50&offset=${offset}`, { headers: { Authorization: `Bearer ${token}` } });
          const d = await r.json();
          const batch = d.results || [];
          ids.push(...batch);
          if (batch.length < 50) break;
        }
        const itens = [];
        for (let i = 0; i < ids.length; i += 20) {
          const lote = ids.slice(i, i + 20);
          const r = await fetch(`https://api.mercadolibre.com/items?ids=${lote.join(',')}&attributes=id,title,permalink,seller_sku`, { headers: { Authorization: `Bearer ${token}` } });
          const arr = await r.json();
          arr.forEach(entry => { if (entry.code === 200 && entry.body) itens.push({ id: entry.body.id, titulo: entry.body.title, sku: entry.body.seller_sku || '', link: entry.body.permalink }); });
        }
        return itens;
      }

      const promessas = [buscarCatalogoTeste(tokenP)];
      if (tokenOutro) promessas.push(buscarCatalogoTeste(tokenOutro));
      const seen = new Set();
      const catalogo = [];
      (await Promise.all(promessas)).flat().forEach(item => { if (!seen.has(item.id)) { seen.add(item.id); catalogo.push(item); } });

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 500,
          system: 'Você é assistente de atendimento da Digoo Brasil. Recebe uma pergunta e o catálogo ativo. Identifique o produto mais adequado e responda com link se encontrar. Retorne APENAS JSON: {"suggested_answer": "resposta", "produto_identificado": {"titulo": "...", "sku": "...", "link": "..."} ou null}',
          messages: [{ role: 'user', content: JSON.stringify({ pergunta, catalogo_anuncios_ativos: catalogo }) }]
        })
      });
      const cd = await claudeRes.json();
      const raw = ((cd.content || []).find(b => b.type === 'text')?.text || '{}').trim().replace(/^```json\s*|\s*```$/g, '');
      const result = JSON.parse(raw);
      return res.json({ ok: true, pergunta, total_anuncios: catalogo.length, suggested_answer: result.suggested_answer || '', produto_identificado: result.produto_identificado || null });
    } catch (e) {
      return res.status(500).json({ erro: e.message });
    }
  }

  } catch (e) {
    console.error("ml-vendas error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};

module.exports.config = {
  maxDuration: 60,
};




