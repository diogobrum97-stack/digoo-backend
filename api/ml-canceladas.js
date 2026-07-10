export const config = { maxDuration: 60 };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

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
    // Formato que o Bling aceita: yyyy-mm-dd
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

    // 3) Busca NFs do Bling por período — todas de uma vez, em páginas
    //    O campo `numeroPedidoLoja` vem na listagem básica da v3, sem precisar
    //    buscar detalhe de cada nota. Buscamos até 5 páginas (250 NFs) pra cobrir
    //    30 dias de operação tranquilamente.
    const nfPorPedido = new Map(); // numeroPedidoLoja (string) → { nfNumero, nfSituacao, nfId }

    for (let pagina = 1; pagina <= 5; pagina++) {
      const url = `https://www.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=100&dataEmissaoInicial=${blingDateFrom}&tipo=1`;
      const r = await fetch(url, { headers: blingHeaders });

      if (!r.ok) break; // acabaram as páginas ou erro

      const data = await r.json();
      const notas = data.data || [];

      if (notas.length === 0) break; // última página

      for (const nf of notas) {
        const pedidoLoja = String(nf.numeroPedidoLoja || "").trim();
        if (!pedidoLoja) continue;
        // Guarda só a primeira NF encontrada por pedido (em caso de duplicata)
        if (!nfPorPedido.has(pedidoLoja)) {
          nfPorPedido.set(pedidoLoja, {
            nfNumero: nf.numero,
            nfSituacao: nf.situacao?.descricao || String(nf.situacao || "—"),
            nfId: nf.id,
          });
        }
      }

      if (notas.length < 100) break; // última página (incompleta)
      await sleep(350); // respeita rate limit do Bling (~3 req/s)
    }

    // 4) Cruza os pedidos cancelados com o Map de NFs
    let notasEncontradas = 0;
    const itens = cancelados.map(pedido => {
      const numeroPedido = String(pedido.id);
      const valor = pedido.total_amount || 0;
      const comprador = pedido.buyer?.nickname || pedido.buyer?.first_name || "—";
      const dataCancelamento = pedido.last_updated || pedido.date_closed || null;
      const produto = pedido.order_items?.[0]?.item?.title || "—";

      const nf = nfPorPedido.get(numeroPedido) || null;
      if (nf) notasEncontradas++;

      const status = !nf
        ? "sem_nf"
        : /cancelad/i.test(String(nf.nfSituacao)) ? "nf_cancelada" : "nf_pendente";

      return { numeroPedido, comprador, produto, valor, dataCancelamento, nf, status };
    });

    // 5) Ordena: nf_pendente primeiro, sem_nf depois, nf_cancelada por último
    //    Dentro de cada grupo: mais recente primeiro (por dataCancelamento)
    const ordemStatus = { nf_pendente: 0, sem_nf: 1, nf_cancelada: 2 };
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
