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

    // 1) ID do vendedor
    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers: mlHeaders });
    const me = await meRes.json();
    if (!me.id) return res.status(401).json({ error: "Token ML inválido" });

    // 2) Pedidos cancelados (máx 50 pra caber no tempo)
    const cancelRes = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${me.id}&order.status=cancelled&order.date_created.from=${encodeURIComponent(dateFrom)}&limit=50&offset=0`,
      { headers: mlHeaders }
    );
    const cancelData = await cancelRes.json();
    const cancelados = cancelData.results || [];

    if (cancelados.length === 0) return res.json({ ok: true, itens: [], totalCancelados: 0, totalNotasEncontradas: 0 });

    // 3) Para cada pedido, busca a NF no Bling diretamente pelo numeroPedidoLoja
    // Usa o endpoint de listagem com filtro por número do pedido externo
    // Em lotes de 3 pra respeitar o rate limit do Bling (3 req/s)
    let notasEncontradas = 0;
    const itens = [];

    for (let i = 0; i < cancelados.length; i += 3) {
      const lote = cancelados.slice(i, i + 3);
      const resultados = await Promise.all(lote.map(async pedido => {
        const numeroPedido = String(pedido.id);
        const valor = pedido.total_amount || 0;
        const comprador = pedido.buyer?.nickname || pedido.buyer?.first_name || "—";
        const dataCancelamento = pedido.last_updated || pedido.date_closed || null;
        const produto = pedido.order_items?.[0]?.item?.title || "—";

        let nf = null;
        try {
          // Busca NF pelo numeroPedidoLoja (campo confirmado no Bling)
          const nfRes = await fetch(
            `https://www.bling.com.br/Api/v3/nfe?pagina=1&limite=10&numeroPedidoLoja=${numeroPedido}&tipo=1`,
            { headers: blingHeaders }
          );
          if (nfRes.ok) {
            const nfData = await nfRes.json();
            const encontradas = nfData.data || [];
            if (encontradas.length > 0) {
              const primeira = encontradas[0];
              notasEncontradas++;
              nf = {
                nfNumero: primeira.numero,
                nfSituacao: primeira.situacao?.descricao || String(primeira.situacao || "—"),
                nfId: primeira.id,
              };
            }
          }
        } catch (e) { /* ignora erro individual */ }

        const status = !nf
          ? "sem_nf"
          : /cancelad/i.test(String(nf.nfSituacao)) ? "nf_cancelada" : "nf_pendente";

        return { numeroPedido, comprador, produto, valor, dataCancelamento, nf, status };
      }));

      itens.push(...resultados);
      if (i + 3 < cancelados.length) await sleep(1000);
    }

    // Ordena: NF pendente primeiro, sem NF depois, canceladas por último
    const ordem = { nf_pendente: 0, sem_nf: 1, nf_cancelada: 2 };
    itens.sort((a, b) => (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9));

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
