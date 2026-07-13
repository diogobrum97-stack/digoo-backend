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

// Retorna o status correto baseado nos campos confirmados empiricamente:
//
// | tags             | claims.resolution      | payments  | status                  |
// |------------------|------------------------|-----------|-------------------------|
// | not_delivered    | [] (sem claims)        | qualquer  | nf_pendente             |
// | delivered        | warehouse_decision     | qualquer  | em_transito             |
// | delivered        | item_returned          | refunded  | cancelar_nf_devolucao   |
// | delivered        | item_returned          | outro     | verificar_devolucao     |
// | sem claim / ?    | —                      | qualquer  | nf_pendente (fallback)  |
//
function detectarStatus(pedido, claims) {
  const tags = pedido.tags || [];
  const hasDelivered    = tags.includes("delivered");
  const hasNotDelivered = tags.includes("not_delivered");
  const payments        = (pedido.payments || []).map(p => p?.status);
  const isRefunded      = payments.includes("refunded");

  // Sem claims = cancelamento simples (produto nunca saiu ou devolvido sem abertura formal)
  if (!claims || claims.length === 0) {
    return "nf_pendente";
  }

  const claim      = claims[0];
  const resolution = claim.resolution; // "warehouse_decision" | "item_returned" | null

  if (hasDelivered) {
    if (resolution === "warehouse_decision") {
      // Produto saiu mas ainda está a caminho do vendedor
      return "em_transito";
    }
    if (resolution === "item_returned") {
      // Produto chegou fisicamente
      if (isRefunded) {
        // Comprador já foi reembolsado, NF precisa ser cancelada
        return "cancelar_nf_devolucao";
      }
      // Produto chegou mas reembolso ainda não processado — conferir
      return "verificar_devolucao";
    }
  }

  // not_delivered explícito ou qualquer outro caso = cancelamento direto
  return "nf_pendente";
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
      const statusDetectado = detectarStatus(pedido, claims);
      return res.json({
        pedido_status: pedido.status,
        pack_id: pedido.pack_id,
        order_id: pedido.id,
        tags: pedido.tags,
        payments_status: (pedido.payments||[]).map(p=>p?.status),
        pedido_shipping_raw: pedido.shipping||null,
        claims,
        status_detectado: statusDetectado,
      });
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
      let sibling = null;
      if (sd.sibling) {
        const sibRes = await fetch(`https://api.mercadolibre.com/shipments/${sd.sibling}`, { headers: headers2 });
        sibling = await sibRes.json();
      }
      return res.json({
        status_http: sr.status,
        shipment_status: sd.status,
        shipment_substatus: sd.substatus,
        return_details: sd.return_details,
        sibling_id: sd.sibling,
        sibling_status: sibling?.status,
        sibling_substatus: sibling?.substatus,
      });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // DEBUG: listagem Bling
  if (req.query.debug_bling) {
    try {
      const blingR2 = await fetch(`${process.env.FIREBASE_URL}/bling_token.json`);
      const blingToken2 = await blingR2.json();
      const blingH2 = { Authorization: `Bearer ${blingToken2.access_token}`, Accept: "application/json" };
      const blingDate = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
      const pagina = parseInt(req.query.pagina || "1");
      const r = await fetch(`https://www.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=100&dataEmissaoInicial=${blingDate}&tipo=1`, { headers: blingH2 });
      const d = await r.json();
      return res.json({ pagina, status_http: r.status, total_nfs: d.data?.length });
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

    // 2) Pedidos cancelados ML (máx 50)
    const cancelRes = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${me.id}&order.status=cancelled&order.date_created.from=${encodeURIComponent(dateFrom)}&limit=50&offset=0`,
      { headers: mlHeaders }
    );
    const cancelData = await cancelRes.json();
    const cancelados = cancelData.results || [];

    if (cancelados.length === 0) {
      return res.json({ ok: true, itens: [], totalCancelados: 0, totalNotasEncontradas: 0 });
    }

    // 3) Busca NFs do Bling — até 8 páginas de 100
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

    // 4) Confirmação via detalhe do Bling (para match por apelido)
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

    // 5) Busca claims em paralelo para pedidos com tag "delivered"
    //    (só buscamos claims quando necessário para economizar tempo)
    async function buscarClaims(orderId) {
      try {
        const r = await fetch(
          `https://api.mercadolibre.com/post-purchase/v1/claims/search?order_id=${orderId}`,
          { headers: mlHeaders }
        );
        if (!r.ok) return [];
        const d = await r.json();
        return (d.data || []).map(c => ({
          id: c.id,
          type: c.type,
          stage: c.stage,
          status: c.status,
          resolution: c.resolution?.reason || null,
        }));
      } catch(e) { return []; }
    }

    // 6) Processa pedidos serialmente
    const itens = [];

    for (const pedido of cancelados) {
      const orderId          = String(pedido.id || "");
      const packId           = String(pedido.pack_id || "").trim();
      const nick             = (pedido.buyer?.nickname || "").toLowerCase().trim();
      const comprador        = pedido.buyer?.nickname || pedido.buyer?.first_name || "—";
      const valor            = pedido.total_amount || 0;
      const dataCancelamento = pedido.last_updated || pedido.date_closed || null;
      const produto          = pedido.order_items?.[0]?.item?.title || "—";
      const shipmentId       = pedido.shipping?.id || null;
      const tags             = pedido.tags || [];

      // Busca claims apenas para pedidos com "delivered" (os únicos que precisam)
      let claims = [];
      if (tags.includes("delivered")) {
        claims = await buscarClaims(orderId);
        await sleep(150); // respeita rate limit ML
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

      // Determina status usando a função com lógica completa
      let status;
      if (!nf) {
        status = "sem_nf";
      } else if (/cancelad/i.test(String(nf.nfSituacao))) {
        status = "nf_cancelada";
      } else {
        status = detectarStatus(pedido, claims);
      }

      itens.push({
        numeroPedido: orderId,
        comprador,
        produto,
        valor,
        dataCancelamento,
        nf,
        status,
        _shipmentId: shipmentId,
      });
    }

    const notasEncontradas = itens.filter(it => it.nf).length;

    // 7) Ordena por status e depois por data de cancelamento
    const ordemStatus = {
      nf_pendente:          0,
      cancelar_nf_devolucao: 1,
      verificar_devolucao:  2,
      em_transito:          3,
      nf_cancelada:         4,
      sem_nf:               5,
    };
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
    });

  } catch (e) {
    console.error("ml-canceladas error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
