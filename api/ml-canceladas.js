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
  const shipStatus = pedido.shipping?.status || pedido.shipments?.status || null;

  // Produto fisicamente voltando
  if (["shipped", "to_be_agreed", "ready_to_ship", "handling", "in_transit"].includes(shipStatus)) {
    return "em_transito";
  }

  // Produto chegou (delivered) — verifica se é devolução ativa
  if (shipStatus === "delivered") {
    // Pagamento reembolsado = devolução processada
    const paymentStatus = pedido.payments?.[0]?.status || "";
    if (/refund/i.test(paymentStatus)) return "em_transito";

    // Tags do pedido indicam devolução
    const tags = pedido.tags || [];
    if (tags.some(t => /return|devolu/i.test(String(t)))) return "em_transito";

    // status_detail do pedido indica devolução
    const statusDetail = String(pedido.status_detail || "");
    if (/refund|return|bpp/i.test(statusDetail)) return "em_transito";
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // DEBUG temporário
  if (req.query.debug_pedido) {
    try {
      const pedidoId = req.query.debug_pedido;
      const mlR2 = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
      const mlToken2 = await mlR2.json();
      const headers2 = { Authorization: `Bearer ${mlToken2.access_token}` };
      const pedidoRes = await fetch(`https://api.mercadolibre.com/orders/${pedidoId}`, { headers: headers2 });
      const pedido = await pedidoRes.json();
      const shipmentId = pedido.shipments?.id || pedido.shipping?.id || null;
      let shipment = null;
      if (shipmentId) {
        const shipRes = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}`, { headers: headers2 });
        shipment = await shipRes.json();
      }
      let claims = null;
      try {
        const claimRes = await fetch(`https://api.mercadolibre.com/post-purchase/v1/claims/search?order_id=${pedidoId}`, { headers: headers2 });
        claims = await claimRes.json();
      } catch(e) { claims = { error: e.message }; }
      return res.json({
        pedido_raw: pedido,
        pedido_status: pedido.status,
        pedido_substatus: pedido.status_detail,
        pack_id: pedido.pack_id,
        shipment_id: shipmentId,
        shipment_status: shipment?.status,
        claims: claims?.results?.map(c => ({ id: c.id, type: c.type, stage: c.stage, status: c.status })) || claims,
        pedido_campos: Object.keys(pedido),
        pedido_shipping_raw: pedido.shipping || pedido.shipments || null,
      });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
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

    const mlHeaders = { Authorization: `Bearer ${mlToken.access_token}` };
    const blingHeaders = { Authorization: `Bearer ${blingToken.access_token}`, Accept: "application/json" };

    const dias = parseInt(req.query.dias || "30");
    const dateFrom = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10) + "T00:00:00.000-03:00";
    const blingDateFrom = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

    // 1) ID do vendedor ML
    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers: mlHeaders });
    const me = await meRes.json();
    if (!me.id) return res.status(401).json({ error: "Token ML inválido" });

    // 2) Pedidos cancelados do ML (máx 50)
    const cancelRes = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${me.id}&order.status=cancelled&order.date_created.from=${encodeURIComponent(dateFrom)}&limit=50&offset=0`,
      { headers: mlHeaders }
    );
    const cancelData = await cancelRes.json();
    const cancelados = cancelData.results || [];

    if (cancelados.length === 0) {
      return res.json({ ok: true, itens: [], totalCancelados: 0, totalNotasEncontradas: 0 });
    }

    // 3) Busca NFs do Bling por período
    // Índice por apelido (lista de todas as NFs) e por numeroPedidoLoja (pack_id)
    const nfPorApelido    = new Map(); // apelido → [nfInfo, ...]
    const nfPorPackId     = new Map(); // pack_id (numeroPedidoLoja) → nfInfo

    for (let pagina = 1; pagina <= 5; pagina++) {
      const url = `https://www.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=100&dataEmissaoInicial=${blingDateFrom}&tipo=1`;
      const r = await fetch(url, { headers: blingHeaders });
      if (!r.ok) break;

      const data = await r.json();
      const notas = data.data || [];
      if (notas.length === 0) break;

      for (const nf of notas) {
        const nfInfo = {
          nfNumero: nf.numero,
          nfSituacao: parseSituacao(nf.situacao),
          nfId: nf.id,
        };

        // Índice por apelido — guarda TODAS as NFs do apelido
        const apelido = extrairApelido(nf.contato?.nome || nf.nome || "");
        if (apelido) {
          if (!nfPorApelido.has(apelido)) nfPorApelido.set(apelido, []);
          nfPorApelido.get(apelido).push(nfInfo);
        }

        // Índice por numeroPedidoLoja = pack_id do ML
        const pedidoLoja = String(nf.numeroPedidoLoja || "").trim();
        if (pedidoLoja && !nfPorPackId.has(pedidoLoja)) {
          nfPorPackId.set(pedidoLoja, nfInfo);
        }
      }

      if (notas.length < 100) break;
      await sleep(350);
    }

    // 4) Confirmação via detalhe do Bling: verifica numeroPedidoLoja === pack_id
    async function confirmarNFPorPackId(packId, nfCandidatas, numeroPedido) {
      for (const nfInfo of nfCandidatas) {
        try {
          const r = await fetch(
            `https://www.bling.com.br/Api/v3/nfe/${nfInfo.nfId}`,
            { headers: blingHeaders }
          );
          if (!r.ok) continue;
          const d = await r.json();
          const pedidoLojaNF = String(d.data?.numeroPedidoLoja || "").trim();
          // Aceita match por pack_id OU por order_id (pedidos sem pack)
          if (pedidoLojaNF === packId || (numeroPedido && pedidoLojaNF === numeroPedido)) return nfInfo;
        } catch(e) { /* ignora */ }
      }
      return null;
    }

    // 5) Processa pedidos em lotes de 5 paralelos
    const itens = [];
    const loteSize = 5;

    for (let i = 0; i < cancelados.length; i += loteSize) {
      const lote = cancelados.slice(i, i + loteSize);

      const resultados = await Promise.all(lote.map(async pedido => {
        const numeroPedido = String(pedido.id);
        // pack_id é o que o Bling usa como numeroPedidoLoja
        const packId = String(pedido.pack_id || pedido.id || "").trim();
        const valor = pedido.total_amount || 0;
        const nick = (pedido.buyer?.nickname || "").toLowerCase().trim();
        const comprador = pedido.buyer?.nickname || pedido.buyer?.first_name || "—";
        const dataCancelamento = pedido.last_updated || pedido.date_closed || null;
        const produto = pedido.order_items?.[0]?.item?.title || "—";

        // Detecta trânsito
        const transitoStatus = detectarTransito(pedido);

        // Match direto pelo pack_id no índice da listagem (pack_id = numeroPedidoLoja no Bling)
        // Tenta pack_id primeiro, depois order_id como fallback
        let nf = nfPorPackId.get(packId) || nfPorPackId.get(numeroPedido) || null;

        // Se não achou direto na listagem, tenta por apelido confirmando via detalhe do Bling
        // A confirmação verifica se numeroPedidoLoja == packId OU == numeroPedido
        if (!nf && nick) {
          const candidatas = nfPorApelido.get(nick) || [];
          if (candidatas.length > 0) {
            nf = await confirmarNFPorPackId(packId, candidatas, numeroPedido);
          }
        }

        // Status final
        let status;
        if (transitoStatus) {
          status = "em_transito";
        } else if (!nf) {
          status = "sem_nf";
        } else if (/cancelad/i.test(String(nf.nfSituacao))) {
          status = "nf_cancelada";
        } else {
          status = "nf_pendente";
        }

        return { numeroPedido, comprador, produto, valor, dataCancelamento, nf, status };
      }));

      itens.push(...resultados);
      if (i + loteSize < cancelados.length) await sleep(300);
    }

    const notasEncontradas = itens.filter(it => it.nf).length;

    // 6) Ordena: em_transito, nf_pendente, sem_nf, nf_cancelada
    const ordemStatus = { em_transito: 0, nf_pendente: 1, sem_nf: 2, nf_cancelada: 3 };
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
