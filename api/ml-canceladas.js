export const config = { maxDuration: 60 };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extrairApelido(nomeContato) {
  const m = String(nomeContato || "").match(/\(([^)]+)\)\s*$/);
  return m ? m[1].toLowerCase().trim() : null;
}

const SITUACAO_BLING = {
  0:  "Pendente",
  4:  "Autorizada",
  5:  "Autorizada",
  9:  "Cancelada",
  12: "Emitida",
  15: "Pendente autorização",
};
function parseSituacao(s) {
  if (!s && s !== 0) return "—";
  if (typeof s === "object" && s.descricao) return s.descricao;
  return SITUACAO_BLING[Number(s)] || String(s);
}

// Detecta o status do cancelamento com base nos campos confirmados:
//
// | tags          | claims       | resultado            |
// |---------------|--------------|----------------------|
// | not_delivered | sem claims   | nf_pendente          |
// | delivered     | qualquer     | devolucao_pendente   | (Bruno precisa processar no Bling)
//
// Se o order_id já está nos pedidos de venda Bling cancelados → devolucao_processada (some)
function detectarStatus(pedido, claims, pedidosBlingCancelados) {
  const tags = pedido.tags || [];
  const orderId = String(pedido.id || "");

  // Devolução já processada no Bling → NF cancelada, some do painel
  if (pedidosBlingCancelados.has(orderId)) return "nf_cancelada";

  // Sem entrega = cancelamento simples
  if (!tags.includes("delivered") || !claims || claims.length === 0) return "nf_pendente";

  // Tem entrega + claim = devolução em algum estágio, Bruno ainda precisa processar
  return "devolucao_pendente";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // DEBUG: pedido específico + claims
  if (req.query.debug_pedido) {
    try {
      const pedidoId = req.query.debug_pedido;
      const mlR2 = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
      const mlToken2 = await mlR2.json();
      const headers2 = { Authorization: `Bearer ${mlToken2.access_token}` };
      const pedidoRes = await fetch(`https://api.mercadolibre.com/orders/${pedidoId}`, { headers: headers2 });
      const pedido = await pedidoRes.json();
      let claims = [];
      try {
        const cr = await fetch(`https://api.mercadolibre.com/post-purchase/v1/claims/search?order_id=${pedidoId}`, { headers: headers2 });
        const cd = await cr.json();
        claims = (cd.data||[]).map(c => ({ id: c.id, type: c.type, stage: c.stage, status: c.status, resolution: c.resolution?.reason }));
      } catch(e) { claims = []; }
      return res.json({
        pedido_status: pedido.status,
        pack_id: pedido.pack_id,
        order_id: pedido.id,
        tags: pedido.tags,
        payments_status: (pedido.payments||[]).map(p=>p?.status),
        claims,
      });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // DEBUG: pedidos de venda Bling cancelados
  if (req.query.debug_pedidos_bling) {
    try {
      const blingR2 = await fetch(`${process.env.FIREBASE_URL}/bling_token.json`);
      const blingToken2 = await blingR2.json();
      const blingH2 = { Authorization: `Bearer ${blingToken2.access_token}`, Accept: "application/json" };
      const blingDate = new Date(Date.now() - 120*86400000).toISOString().slice(0,10);
      const r = await fetch(`https://www.bling.com.br/Api/v3/pedidos/vendas?pagina=1&limite=10&dataInicial=${blingDate}&situacao=9`, { headers: blingH2 });
      const d = await r.json();
      const pedidos = (d.data || []).slice(0, 5).map(p => ({
        id: p.id,
        numero: p.numero,
        numeroLoja: p.numeroLoja,
        situacao: p.situacao,
        contato_nome: p.contato?.nome,
        apelido: extrairApelido(p.contato?.nome),
        data: p.data,
        totalProdutos: p.totalProdutos,
      }));
      return res.json({ status: r.status, total: d.data?.length, pedidos, erro: d.error || null });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // DEBUG: shipment
  if (req.query.debug_shipment) {
    try {
      const mlR2 = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
      const mlToken2 = await mlR2.json();
      const headers2 = { Authorization: `Bearer ${mlToken2.access_token}` };
      const sr = await fetch(`https://api.mercadolibre.com/shipments/${req.query.debug_shipment}`, { headers: headers2 });
      const sd = await sr.json();
      return res.json({ shipment_status: sd.status, shipment_substatus: sd.substatus });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  try {
    const [mlR, blingR] = await Promise.all([
      fetch(`${process.env.FIREBASE_URL}/ml_token.json`),
      fetch(`${process.env.FIREBASE_URL}/bling_token.json`),
    ]);
    const mlToken    = await mlR.json();
    const blingToken = await blingR.json();

    if (!mlToken?.access_token)    return res.status(401).json({ error: "ML Matriz não conectado" });
    if (!blingToken?.access_token) return res.status(401).json({ error: "Bling não conectado" });

    const mlHeaders    = { Authorization: `Bearer ${mlToken.access_token}` };
    const blingHeaders = { Authorization: `Bearer ${blingToken.access_token}`, Accept: "application/json" };

    const dias          = parseInt(req.query.dias || "30");
    const dateFrom      = new Date(Date.now() - dias*86400000).toISOString().slice(0,10) + "T00:00:00.000-03:00";
    const blingDateFrom = new Date(Date.now() - dias*86400000).toISOString().slice(0,10);

    // 1) ID do vendedor ML
    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers: mlHeaders });
    const me    = await meRes.json();
    if (!me.id) return res.status(401).json({ error: "Token ML inválido" });

    // 2) Pedidos cancelados ML + pedidos de venda Bling cancelados em paralelo
    const [cancelRes, blingPedidosRes] = await Promise.all([
      fetch(
        `https://api.mercadolibre.com/orders/search?seller=${me.id}&order.status=cancelled&order.date_created.from=${encodeURIComponent(dateFrom)}&limit=50&offset=0`,
        { headers: mlHeaders }
      ),
      fetch(
        `https://www.bling.com.br/Api/v3/pedidos/vendas?pagina=1&limite=100&dataInicial=${blingDateFrom}&situacao=9`,
        { headers: blingHeaders }
      ),
    ]);

    const cancelData = await cancelRes.json();
    const cancelados = cancelData.results || [];

    if (cancelados.length === 0) {
      return res.json({ ok: true, itens: [], totalCancelados: 0, totalNotasEncontradas: 0 });
    }

    // 3) Monta Set de order_ids ML que já foram processados no Bling (devolução feita)
    const pedidosBlingCancelados = new Set();
    try {
      const blingPedidosData = await blingPedidosRes.json();
      // Busca até 5 páginas para cobrir o período
      const todasPaginas = [blingPedidosData.data || []];
      if ((blingPedidosData.data || []).length === 100) {
        for (let pagina = 2; pagina <= 5; pagina++) {
          const r = await fetch(
            `https://www.bling.com.br/Api/v3/pedidos/vendas?pagina=${pagina}&limite=100&dataInicial=${blingDateFrom}&situacao=9`,
            { headers: blingHeaders }
          );
          const d = await r.json();
          const notas = d.data || [];
          todasPaginas.push(notas);
          if (notas.length < 100) break;
          await sleep(200);
        }
      }
      for (const pagina of todasPaginas) {
        for (const p of pagina) {
          if (p.numeroLoja) pedidosBlingCancelados.add(String(p.numeroLoja));
        }
      }
    } catch(e) {
      console.error("Erro ao buscar pedidos Bling:", e.message);
    }

    // 4) Busca NFs de saída do Bling — até 8 páginas de 100
    const nfPorApelido = new Map();
    const nfPorPackId  = new Map();
    let paginasBling   = 0;

    for (let pagina = 1; pagina <= 8; pagina++) {
      const url = `https://www.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=100&dataEmissaoInicial=${blingDateFrom}&tipo=1`;
      const r   = await fetch(url, { headers: blingHeaders });
      if (!r.ok) { console.log(`Bling pag ${pagina} erro: ${r.status}`); break; }
      const data  = await r.json();
      const notas = data.data || [];
      if (notas.length === 0) break;
      paginasBling = pagina;

      for (const nf of notas) {
        const nfInfo = {
          nfNumero:    nf.numero,
          nfSituacao:  parseSituacao(nf.situacao),
          nfId:        nf.id,
          dataEmissao: nf.dataEmissao || null,
        };
        const nomeContato = nf.contato?.nome || nf.nome || "";
        const apelido     = extrairApelido(nomeContato);
        if (apelido) {
          if (!nfPorApelido.has(apelido)) nfPorApelido.set(apelido, []);
          nfPorApelido.get(apelido).push(nfInfo);
        }
        const pedidoLoja = String(nf.numeroPedidoLoja || "").trim();
        if (pedidoLoja) nfPorPackId.set(pedidoLoja, nfInfo);
      }

      if (notas.length < 100) break;
      await sleep(350);
    }

    // 5) Confirmação via detalhe do Bling (para match por apelido)
    async function confirmarNF(packId, candidatas) {
      for (const nfInfo of candidatas) {
        try {
          const r = await fetch(`https://www.bling.com.br/Api/v3/nfe/${nfInfo.nfId}`, { headers: blingHeaders });
          if (!r.ok) continue;
          const d = await r.json();
          const numeroPedidoLoja = String(d.data?.numeroPedidoLoja || "").trim();
          if (numeroPedidoLoja === packId) return nfInfo;
        } catch(e) { /* ignora */ }
      }
      return null;
    }

    // 6) Busca claims para pedidos com tag "delivered"
    async function buscarClaims(orderId) {
      try {
        const r = await fetch(
          `https://api.mercadolibre.com/post-purchase/v1/claims/search?order_id=${orderId}`,
          { headers: mlHeaders }
        );
        if (!r.ok) return [];
        const d = await r.json();
        return (d.data || []).map(c => ({
          id: c.id, type: c.type, stage: c.stage, status: c.status,
          resolution: c.resolution?.reason || null,
        }));
      } catch(e) { return []; }
    }

    // 7) Processa pedidos serialmente
    const itens = [];

    for (const pedido of cancelados) {
      const orderId          = String(pedido.id || "");
      const packId           = String(pedido.pack_id || "").trim();
      const nick             = (pedido.buyer?.nickname || "").toLowerCase().trim();
      const comprador        = pedido.buyer?.nickname || pedido.buyer?.first_name || "—";
      const valor            = pedido.total_amount || 0;
      const dataCancelamento = pedido.last_updated || pedido.date_closed || null;
      const produto          = pedido.order_items?.[0]?.item?.title || "—";
      const tags             = pedido.tags || [];

      // Busca claims só pra pedidos com entrega
      let claims = [];
      if (tags.includes("delivered")) {
        claims = await buscarClaims(orderId);
        await sleep(150);
      }

      // Match NF: direto por pack_id ou por apelido com confirmação
      let nf = (packId ? nfPorPackId.get(packId) : null) || null;
      if (!nf && nick) {
        const candidatas = nfPorApelido.get(nick) || [];
        if (candidatas.length > 0) {
          nf = await confirmarNF(packId, candidatas);
          if (nf) await sleep(200);
        }
      }

      // Determina status
      let status;
      if (!nf) {
        status = "sem_nf";
      } else if (/cancelad/i.test(String(nf.nfSituacao))) {
        status = "nf_cancelada";
      } else {
        status = detectarStatus(pedido, claims, pedidosBlingCancelados);
      }

      itens.push({ numeroPedido: orderId, comprador, produto, valor, dataCancelamento, nf, status });
    }

    const notasEncontradas = itens.filter(it => it.nf).length;

    // 8) Ordena: ação imediata primeiro
    const ordemStatus = { nf_pendente: 0, devolucao_pendente: 1, nf_cancelada: 2, sem_nf: 3 };
    itens.sort((a, b) => {
      const ds = (ordemStatus[a.status] ?? 9) - (ordemStatus[b.status] ?? 9);
      if (ds !== 0) return ds;
      return new Date(b.dataCancelamento || 0) - new Date(a.dataCancelamento || 0);
    });

    return res.json({
      ok: true,
      itens,
      totalCancelados: cancelados.length,
      totalNotasEncontradas: notasEncontradas,
      periodo: `${dias} dias`,
      _debug_paginas_bling: paginasBling,
      _debug_pedidos_cancelados_bling: pedidosBlingCancelados.size,
    });

  } catch (e) {
    console.error("ml-canceladas error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
