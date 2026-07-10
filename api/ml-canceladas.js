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

  // DEBUG: inspeciona campos de um pedido específico
  if (req.query.debug_pedido) {
    try {
      const pedidoId = req.query.debug_pedido;
      const mlR2 = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
      const mlToken2 = await mlR2.json();
      const headers2 = { Authorization: `Bearer ${mlToken2.access_token}` };
      const pedidoRes = await fetch(`https://api.mercadolibre.com/orders/${pedidoId}`, { headers: headers2 });
      const pedido = await pedidoRes.json();
      return res.json({
        pedido_status: pedido.status,
        pack_id: pedido.pack_id,
        order_id: pedido.id,
        tags: pedido.tags,
        payments_status: (pedido.payments||[]).map(p=>p?.status),
        pedido_shipping_raw: pedido.shipping||null,
      });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // DEBUG: inspeciona listagem do Bling
  if (req.query.debug_bling) {
    try {
      const blingR2 = await fetch(`${process.env.FIREBASE_URL}/bling_token.json`);
      const blingToken2 = await blingR2.json();
      const blingH2 = { Authorization: `Bearer ${blingToken2.access_token}`, Accept: "application/json" };
      const blingDate = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
      const r = await fetch(`https://www.bling.com.br/Api/v3/nfe?pagina=1&limite=5&dataEmissaoInicial=${blingDate}&tipo=1`, { headers: blingH2 });
      const d = await r.json();
      // Busca detalhe da primeira NF
      const primeiraId = d.data?.[0]?.id;
      let detalhe = null;
      if (primeiraId) {
        const dr = await fetch(`https://www.bling.com.br/Api/v3/nfe/${primeiraId}`, { headers: blingH2 });
        detalhe = await dr.json();
      }
      return res.json({
        status: r.status,
        primeiras: d.data?.map(n => ({
          id: n.id,
          numero: n.numero,
          contato: n.contato,
          nome: n.nome,
          numeroPedidoLoja: n.numeroPedidoLoja,
          dataEmissao: n.dataEmissao,
          situacao: n.situacao,
          todos_campos: Object.keys(n),
        })),
        detalhe_primeira: {
          numeroPedidoLoja: detalhe?.data?.numeroPedidoLoja,
          numero: detalhe?.data?.numero,
          contato_nome: detalhe?.data?.contato?.nome,
        },
      });
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // DEBUG: inspeciona campos do orders/search
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
        shipping_raw: primeiro.shipping,
        payments_raw: primeiro.payments,
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

    const mlHeaders   = { Authorization: `Bearer ${mlToken.access_token}` };
    const blingHeaders = { Authorization: `Bearer ${blingToken.access_token}`, Accept: "application/json" };

    const dias = parseInt(req.query.dias || "30");
    const dateFrom     = new Date(Date.now() - dias*86400000).toISOString().slice(0,10) + "T00:00:00.000-03:00";
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
    // Índice por apelido (extraído do nome do contato) → [nfInfo, ...]
    const nfPorApelido  = new Map();
    // Índice por numeroPedidoLoja (order_id do ML) → nfInfo (se vier na listagem)
    const nfPorOrderId  = new Map();

    for (let pagina = 1; pagina <= 5; pagina++) {
      const url = `https://www.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=100&dataEmissaoInicial=${blingDateFrom}&tipo=1`;
      const r = await fetch(url, { headers: blingHeaders });
      if (!r.ok) break;
      const data = await r.json();
      const notas = data.data || [];
      if (notas.length === 0) break;

      for (const nf of notas) {
        const nfInfo = {
          nfNumero:   nf.numero,
          nfSituacao: parseSituacao(nf.situacao),
          nfId:       nf.id,
          dataEmissao: nf.dataEmissao || null,
        };

        // Índice por apelido — tenta contato.nome primeiro, depois nome direto
        const nomeContato = nf.contato?.nome || nf.nome || "";
        const apelido = extrairApelido(nomeContato);
        if (apelido) {
          if (!nfPorApelido.has(apelido)) nfPorApelido.set(apelido, []);
          nfPorApelido.get(apelido).push(nfInfo);
        }

        // Índice por numeroPedidoLoja (só se vier preenchido na listagem)
        const pedidoLoja = String(nf.numeroPedidoLoja || "").trim();
        if (pedidoLoja) {
          nfPorOrderId.set(pedidoLoja, nfInfo);
        }
      }

      if (notas.length < 100) break;
      await sleep(350);
    }

    // 4) Confirmação via detalhe do Bling
    // numeroPedidoLoja no detalhe = order_id do ML (confirmado nos testes)
    async function confirmarNFPorOrderId(orderId, candidatas) {
      for (const nfInfo of candidatas) {
        try {
          const r = await fetch(`https://www.bling.com.br/Api/v3/nfe/${nfInfo.nfId}`, { headers: blingHeaders });
          if (!r.ok) continue;
          const d = await r.json();
          const numeroPedidoLoja = String(d.data?.numeroPedidoLoja || "").trim();
          if (numeroPedidoLoja === orderId) return nfInfo;
        } catch(e) { /* ignora */ }
      }
      return null;
    }

    // 5) Processa pedidos em lotes de 5 paralelos
    const itens = [];

    for (let i = 0; i < cancelados.length; i += 5) {
      const lote = cancelados.slice(i, i + 5);

      const resultados = await Promise.all(lote.map(async pedido => {
        const orderId   = String(pedido.id || "");
        const nick      = (pedido.buyer?.nickname || "").toLowerCase().trim();
        const comprador = pedido.buyer?.nickname || pedido.buyer?.first_name || "—";
        const valor     = pedido.total_amount || 0;
        const dataCancelamento = pedido.last_updated || pedido.date_closed || null;
        const produto   = pedido.order_items?.[0]?.item?.title || "—";
        const emTransito = detectarTransito(pedido);

        // Tenta match direto pelo order_id no índice da listagem
        let nf = nfPorOrderId.get(orderId) || null;

        // Se não achou direto, tenta por apelido confirmando via detalhe
        if (!nf && nick) {
          const candidatas = nfPorApelido.get(nick) || [];
          if (candidatas.length > 0) {
            nf = await confirmarNFPorOrderId(orderId, candidatas);
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

        return { numeroPedido: orderId, comprador, produto, valor, dataCancelamento, nf, status };
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
    });

  } catch (e) {
    console.error("ml-canceladas error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
