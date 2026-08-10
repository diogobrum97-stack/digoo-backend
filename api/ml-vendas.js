module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

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
      const { token: tokenP } = req.query;
      if (!tokenP) return res.status(400).json({ ok: false, error: "token obrigatório" });

      const meRes = await fetch("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${tokenP}` },
      });
      const me = await meRes.json();
      if (!me.id) return res.status(400).json({ ok: false, error: "Não foi possível identificar o vendedor" });

      const qRes = await fetch(
        `https://api.mercadolibre.com/questions/search?seller_id=${me.id}&status=UNANSWERED&sort_fields=date_created&sort_types=DESC&limit=30`,
        { headers: { Authorization: `Bearer ${tokenP}` } }
      );
      const qData = await qRes.json();
      const perguntas = qData.questions || [];

      if (perguntas.length === 0) {
        return res.json({ ok: true, perguntas: [] });
      }

      // Buscar título dos anúncios envolvidos (multiget, até 20 por chamada)
      const itemIds = [...new Set(perguntas.map(p => p.item_id))];
      const itemsInfo = {};
      for (let i = 0; i < itemIds.length; i += 20) {
        const lote = itemIds.slice(i, i + 20);
        try {
          const r = await fetch(`https://api.mercadolibre.com/items?ids=${lote.join(",")}&attributes=id,title,thumbnail`, {
            headers: { Authorization: `Bearer ${tokenP}` },
          });
          const arr = await r.json();
          arr.forEach(entry => {
            if (entry.code === 200 && entry.body) itemsInfo[entry.body.id] = entry.body;
          });
        } catch (e) {}
      }

      // Buscar primeiro nome do comprador (nickname público) para personalizar a saudação
      const buyerIds = [...new Set(perguntas.map(p => p.buyer_id).filter(Boolean))];
      const buyerNames = {};
      await Promise.all(buyerIds.map(async (bid) => {
        try {
          const r = await fetch(`https://api.mercadolibre.com/users/${bid}`, {
            headers: { Authorization: `Bearer ${tokenP}` },
          });
          const u = await r.json();
          const nick = (u.nickname || "").trim();
          // Só usa se parecer um nome real (letras, sem excesso de números/maiúsculas aleatórias)
          const pareceNome = /^[A-Za-zÀ-ÿ]+$/.test(nick) && nick.length >= 3 && nick.length <= 20;
          if (pareceNome) {
            buyerNames[bid] = nick.charAt(0).toUpperCase() + nick.slice(1).toLowerCase();
          }
        } catch (e) {}
      }));

      // Saudação por horário (fuso Brasil)
      const horaBR = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false });
      const h = parseInt(horaBR, 10);
      const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";

      // Buscar conhecimento fixo já respondido para CADA produto envolvido (por item_id, não global)
      const conhecimentoPorItem = {};
      if (process.env.FIREBASE_URL) {
        const itemIdsUnicos = [...new Set(perguntas.map(p => p.item_id))];
        await Promise.all(itemIdsUnicos.map(async (iid) => {
          try {
            const exR = await fetch(`${process.env.FIREBASE_URL}/perguntas_treinamento/${iid}.json`);
            const exData = await exR.json();
            if (exData && typeof exData === "object") {
              conhecimentoPorItem[iid] = Object.values(exData)
                .filter(e => e && e.pergunta && e.resposta)
                .map(e => ({ pergunta: e.pergunta, resposta: e.resposta }));
            }
          } catch (e) {}
        }));
      }

      // Gerar sugestões via Claude — uma chamada só, em lote
      const listaParaClaude = perguntas.map((p, i) => ({
        idx: i,
        produto: itemsInfo[p.item_id]?.title || "Produto",
        pergunta: p.text,
        nome_comprador: buyerNames[p.buyer_id] || null,
        respostas_anteriores_deste_produto: conhecimentoPorItem[p.item_id] || [],
      }));

      const systemPrompt = `Você é um assistente de atendimento da Digoo Brasil, loja de periféricos gamer no Mercado Livre.
Vai receber uma lista de perguntas pré-venda feitas por compradores em anúncios. Cada pergunta pode vir acompanhada do campo "respostas_anteriores_deste_produto" — são perguntas e respostas REAIS já enviadas pela loja sobre ESSE MESMO anúncio especificamente.

REGRA MAIS IMPORTANTE — CONHECIMENTO FIXO DO PRODUTO:
- Se "respostas_anteriores_deste_produto" tiver conteúdo, trate essas informações como FATOS VERIFICADOS e definitivos sobre aquele produto específico, escritos pelo próprio vendedor. Use-as para responder com precisão técnica, mesmo que a pergunta atual seja fraseada de forma diferente das anteriores.
- Exemplo: se uma resposta anterior diz "o modelo Forward joga o ar quente pra fora, o Reverse puxa o ar frio pra dentro", e a nova pergunta é "o Reverse solta ar quente?", você DEVE responder com base nesse fato (não, o Reverse puxa ar frio pra dentro), mesmo que a pergunta pareça nova.
- Nunca contradiga uma informação que já está em "respostas_anteriores_deste_produto".
- Se a pergunta atual não tiver relação com nenhuma resposta anterior daquele produto, responda normalmente com base no título/categoria do anúncio.

Para cada pergunta, decida:
1. Se é uma pergunta simples e objetiva (estoque, prazo, compatibilidade, cor, garantia, frete, ou algo já coberto em respostas_anteriores_deste_produto) — gere uma resposta.
2. Se for uma reclamação disfarçada de pergunta, negociação de preço, xingamento, ou algo fora do escopo de uma resposta padrão — marque como "requires_attention": true e não gere resposta.

REGRAS DA RESPOSTA (siga à risca):
- Comece com a saudação "${saudacao}" seguida do nome do comprador se o campo "nome_comprador" não for null (ex: "${saudacao}, Felipe!"). Se "nome_comprador" for null, comece só com "${saudacao}!" sem nome.
- Use frases curtas e palavras simples do dia a dia. Nada de linguagem formal, rebuscada ou técnica demais — escreva como se estivesse respondendo um amigo no WhatsApp, mas educado.
- No máximo 2 frases curtas depois da saudação. Direto ao ponto, sem enrolação.
- Não invente informações técnicas específicas que você não tem certeza e que não estão em respostas_anteriores_deste_produto (ex: compatibilidade exata com um modelo não informado no anúncio). Só nesse caso, oriente o comprador a confirmar antes da compra.
- Se a pergunta já traz a informação necessária pra responder com segurança, ou se respostas_anteriores_deste_produto já cobre isso, responda direto e completo — não adicione nenhum aviso de "confirme antes" ou "recomendamos verificar", isso é redundante e incomoda o comprador.
- Não use palavras difíceis, nada de "adquirir" (use "comprar"), "efetuar" (use "fazer"), "mediante" (use "com"), etc.
- Não repita a mesma ideia duas vezes na resposta. Uma frase resolve — não emende uma segunda frase que só reforça a primeira.

Responda APENAS com um JSON válido, sem nenhum texto antes ou depois, no formato:
[{"idx": 0, "requires_attention": false, "suggested_answer": "texto da resposta"}, {"idx": 1, "requires_attention": true, "suggested_answer": ""}]`;

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: JSON.stringify(listaParaClaude) }],
        }),
      });
      const claudeData = await claudeRes.json();
      let sugestoes = [];
      try {
        const textBlock = (claudeData.content || []).find(b => b.type === "text");
        const raw = textBlock?.text?.trim() || "[]";
        const jsonStr = raw.replace(/^```json\s*|\s*```$/g, "");
        sugestoes = JSON.parse(jsonStr);
      } catch (e) {
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
          requires_attention: sug.requires_attention !== false,
          suggested_answer: sug.suggested_answer || "",
          has_knowledge: (conhecimentoPorItem[p.item_id] || []).length > 0,
        };
      });

      return res.json({ ok: true, perguntas: resultado });
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
  } catch (e) {
    console.error("ml-vendas error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};

module.exports.config = {
  maxDuration: 60,
};



