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

function detectarTransito(pedido) {
  const tags = pedido.tags || [];
  if (Array.isArray(tags) && tags.includes("delivered")) return true;
  return false;
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
      let claims = null;
      try {
        const cr = await fetch(`https://api.mercadolibre.com/post-purchase/v1/claims/search?order_id=${pedidoId}`, { headers: headers2 });
        const cd = await cr.json();
        claims = (cd.data||[]).map(c => ({ id: c.id, type: c.type, stage: c.stage, status: c.status, resolution: c.resolution?.reason }));
      } catch(e) { claims = { error: e.message }; }
      return res.json({
        pedido_status: pedido.status,
        pack_id: pedido.pack_id,
        order_id: pedido.id,
        tags: pedido.tags,
        payments_status: (pedido.payments||[]).map(p=>p?.status),
        pedido_shipping_raw: pedido.shipping||null,
        claims,
      });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // DEBUG: shipment com sibling
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

  // DEBUG: listagem Bling — todas as páginas
  if (req.query.debug_bling) {
    try {
      const blingR2 = await fetch(`${process.env.FIREBASE_URL}/bling_token.json`);
      const blingToken2 = await blingR2.json();
      const blingH2 = { Authorization: `Bearer ${blingToken2.access_token}`, Accept: "application/json" };
      const blingDate = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
      const pagina = parseInt(req.query.pagina || "1");
      const r = await fetch(`https://www.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=100&dataEmissaoInicial=${blingDate}&tipo=1`, { headers: blingH2 });
      const d = await r.json();
      const apelidos = [];
      for (const nf of (d.data||[])) {
        const m = String(nf.contato?.nome||"").match(/\(([^)]+)\)\s*$/);
        const apelido = m ? m[1].toLowerCase().trim() : null;
        if (apelido) apelidos.push(apelido);
      }
      const temJoyce = apelidos.includes("joycecostanascimento");
      const temLudimila = apelidos.includes("ludimilafarinazo");
      return res.json({
        pagina,
        status_http: r.status,
        total_nfs: d.data?.length,
        tem_joycecostanascimento: temJoyce,
        tem_ludimilafarinazo: temLudimila,
        numeros_nfs: (d.data||[]).map(n => n.numero),
        apelidos_encontrados: apelidos,
      });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // DEBUG: campos do orders/search
  if (req.query.debug_search) {
    try {
      const mlR2 = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
      const mlToken2 = await mlR2.json();
      const headers2 = { Authorization: `Bearer ${mlToken2.access_token}` };
      const meRes2 = await fetch("https://api.mercadolibre.com/users/me", { headers: headers2 });
      const me2 = await meRes2.json();
      const dateFrom2 = new Date(Date.now() - 30*86400000).toISOString().slice(0,10) + "T00:00:00.000-03:00";
      const r2 = await fetch(
        `https://api.mercadolibre.com/orders/search?seller=${me2.id}&order.status=cancelled&order.date_created.from=${encodeURIComponent(dateFrom2)}&limit=3&offset=0`,
        { headers: headers2 }
      );
      const d2 = await r2.json();
      const primeiro = d2.results?.[0] || {};
      return res.json({
        campos_disponiveis: Object.keys(primeiro),
        tags: primeiro.tags,
        mediations: primeiro.mediations,
        status_detail: primeiro.status_detail,
        pack_id: primeiro.pack_id,
        order_id: primeiro.id,
        transito_detectado: detectarTransito(primeiro),
      });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  try {
    const [mlR, blingR] = await Promise.all([
      fetch(`${process.env.FIREBASE_URL}/ml_token.json`),
      fetch(`${process.env.FIREBASE_URL}/bling_token.json`),
    ]);
    const mlToken = await mlR.json();
    const blingToken = await blingR.json();

    if (!mlToken?.access_token) return res.status(401).json({ error: "ML Matriz não conectado" });
    if (!blingToken?.access_token) return res.status(401).json({ error: "Bling não conectado" });

    const mlHeaders    = { Authorization: `Bearer ${mlToken.access_token}` };
    const blingHeaders = { Authorization: `Bearer ${blingToken.access_token}`, Accept: "application/json" };

    const dias = parseInt(req.query.dias || "30");
    const dateFrom      = new Date(Date.now() - dias*86400000).toISOString().slice(0,10) + "T00:00:00.000-03:00";
    const blingDateFrom = new Date(Date.now() - dias*86400000).toISOString().slice(0,10);

    // 1) ID do vendedor ML
    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers: mlHeaders });
    const me = await meRes.json();
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

    // 3) Busca NFs do Bling — até 5 páginas de 100
    const nfPorApelido = new Map();
    const nfPorPackId  = new Map();
    let paginasBling = 0;

    for (let pagina = 1; pagina <= 5; pagina++) {
      const url = `https://www.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=100&dataEmissaoInicial=${blingDateFrom}&tipo=1`;
      const r = await fetch(url, { headers: blingHeaders });
      if (!r.ok) {
        console.log(`Bling pag ${pagina} erro: ${r.status}`);
        break;
      }
      const data = await r.json();
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
        const apelido = extrairApelido(nomeContato);
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

    // 4) Confirmação via detalhe do Bling
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

    // 5) Processa em lotes de 5 paralelos
    const itens = [];

    for (let i = 0; i < cancelados.length; i += 5) {
      const lote = cancelados.slice(i, i + 5);

      const resultados = await Promise.all(lote.map(async pedido => {
        const orderId   = String(pedido.id || "");
        const packId    = String(pedido.pack_id || "").trim();
        const nick      = (pedido.buyer?.nickname || "").toLowerCase().trim();
        const comprador = pedido.buyer?.nickname || pedido.buyer?.first_name || "—";
        const valor     = pedido.total_amount || 0;
        const dataCancelamento = pedido.last_updated || pedido.date_closed || null;
        const produto   = pedido.order_items?.[0]?.item?.title || "—";
        const emTransito = detectarTransito(pedido);
        const shipmentId = pedido.shipping?.id || null;

        // Match direto pelo pack_id
        let nf = (packId ? nfPorPackId.get(packId) : null) || null;

        // Se não achou direto, tenta por apelido confirmando via detalhe
        if (!nf && nick) {
          const candidatas = nfPorApelido.get(nick) || [];
          if (candidatas.length > 0) {
            nf = await confirmarNF(packId, candidatas);
          }
        }

        let status;
        if (!nf) {
          status = "sem_nf";
        } else if (/cancelad/i.test(String(nf.nfSituacao))) {
          status = "nf_cancelada";
        } else if (emTransito) {
          status = "em_transito";
        } else {
          status = "nf_pendente";
        }

        return { numeroPedido: orderId, comprador, produto, valor, dataCancelamento, nf, status, _shipmentId: shipmentId };
      }));

      itens.push(...resultados);
      if (i + 5 < cancelados.length) await sleep(300);
    }

    const notasEncontradas = itens.filter(it => it.nf).length;

    // 6) Ordena: nf_pendente, em_transito, nf_cancelada, sem_nf
    const ordemStatus = { nf_pendente: 0, em_transito: 1, nf_cancelada: 2, sem_nf: 3 };
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
