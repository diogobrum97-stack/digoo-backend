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
  // A tag "delivered" indica que o produto foi fisicamente entregue/devolvido
  // Cancelamento simples: sem "delivered" nas tags (produto nunca saiu)
  // Devolução em andamento: tem "delivered" (produto voltou ou está voltando)
  const tags = pedido.tags || [];
  if (Array.isArray(tags) && tags.includes("delivered")) return true;
  return false;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  // DEBUG: inspeciona campos de um pedido específico via /orders/{id}
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
        payments_status: (pedido.payments || []).map(p => p?.status),
        claims: claims?.results?.map(c => ({ id: c.id, type: c.type, stage: c.stage, status: c.status })) || claims,
        pedido_campos: Object.keys(pedido),
        pedido_shipping_raw: pedido.shipping || null,
      });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DEBUG: inspeciona campos que chegam via orders/search (não via /orders/{id})
  if (req.query.debug_search) {
    try {
      const mlR2 = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
      const mlToken2 = await mlR2.json();
      const headers2 = { Authorization: `Bearer ${mlToken2.access_token}` };
      const meRes2 = await fetch("https://api.mercadolibre.com/users/me", { headers: headers2 });
      const me2 = await meRes2.json();
      const dateFrom2 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10) + "T00:00:00.000-03:00";
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
        status_detail: primeiro.status_detail,
        pack_id: primeiro.pack_id,
        transito_detectado: detectarTransito(primeiro),
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
    // nfPorPackId: numeroPedidoLoja (= pack_id do ML) → nfInfo
    // nfPorApelido: apelido → [nfInfo, ...] (todas as NFs do comprador)
    const nfPorApelido = new Map();
    const nfPorPackId  = new Map();

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
          dataEmissao: nf.dataEmissao || null, // "2026-07-08 18:05:38" — vem na listagem básica
        };
        const apelido = extrairApelido(nf.contato?.nome || nf.nome || "");
        if (apelido) {
          if (!nfPorApelido.has(apelido)) nfPorApelido.set(apelido, []);
          nfPorApelido.get(apelido).push(nfInfo);
        }
        const pedidoLoja = String(nf.numeroPedidoLoja || "").trim();
        if (pedidoLoja && !nfPorPackId.has(pedidoLoja)) {
          nfPorPackId.set(pedidoLoja, nfInfo);
        }
      }

      if (notas.length < 100) break;
      await sleep(350);
    }

    // 4) Confirmação da NF por janela temporal
    // A NF correta foi emitida DEPOIS da criação do pedido e ANTES (ou até 2h após) do cancelamento
    // Isso evita falso positivo quando o comprador tem mais de uma NF no período
    function confirmarNFPorTempo(pedido, candidatas) {
      const criadoEm  = new Date(pedido.date_created || 0).getTime();
      const canceladoEm = new Date(pedido.last_updated || pedido.date_closed || 0).getTime();

      // Janela: desde a criação do pedido até 2h após o cancelamento
      // (2h de margem pra NF emitida ligeiramente depois do cancelamento por atraso de sistema)
      const janelaDe  = criadoEm;
      const janelaAte = canceladoEm + (2 * 60 * 60 * 1000);

      // Filtra candidatas que têm dataEmissao dentro da janela
      const dentroJanela = candidatas.filter(nf => {
        if (!nf.dataEmissao) return false;
        const emitidaEm = new Date(nf.dataEmissao.replace(" ", "T") + "-03:00").getTime();
        return emitidaEm >= janelaDe && emitidaEm <= janelaAte;
      });

      if (dentroJanela.length === 0) return null;
      if (dentroJanela.length === 1) return dentroJanela[0];

      // Se ainda tem mais de uma dentro da janela, pega a mais próxima da criação do pedido
      dentroJanela.sort((a, b) => {
        const ta = new Date(a.dataEmissao.replace(" ", "T") + "-03:00").getTime();
        const tb = new Date(b.dataEmissao.replace(" ", "T") + "-03:00").getTime();
        return Math.abs(ta - criadoEm) - Math.abs(tb - criadoEm);
      });
      return dentroJanela[0];
    }

    // 5) Processa pedidos em lotes de 10 paralelos (sem req extra, tudo em memória)
    const itens = [];

    for (let i = 0; i < cancelados.length; i += 10) {
      const lote = cancelados.slice(i, i + 10);

      const resultados = lote.map(pedido => {
        const orderId  = String(pedido.id || "");
        const packId   = String(pedido.pack_id || "");
        const nick     = (pedido.buyer?.nickname || "").toLowerCase().trim();
        const comprador = pedido.buyer?.nickname || pedido.buyer?.first_name || "—";
        const valor    = pedido.total_amount || 0;
        const dataCancelamento = pedido.last_updated || pedido.date_closed || null;
        const produto  = pedido.order_items?.[0]?.item?.title || "—";
        const emTransito = detectarTransito(pedido);

        // Tenta match direto pelo numeroPedidoLoja (pack_id ou order_id)
        let nf = nfPorPackId.get(packId) || nfPorPackId.get(orderId) || null;

        // Se não achou direto, tenta por apelido com confirmação por janela temporal
        if (!nf && nick) {
          const candidatas = nfPorApelido.get(nick) || [];
          if (candidatas.length > 0) {
            nf = confirmarNFPorTempo(pedido, candidatas);
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
      });

      itens.push(...resultados);
    }

    const notasEncontradas = itens.filter(it => it.nf).length;

    // 6) Ordena: nf_pendente primeiro, em_transito, nf_cancelada, sem_nf por último
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
