export const config = { maxDuration: 60 };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // Tokens
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

    // 1) Busca o ID do vendedor
    const meRes = await fetch("https://api.mercadolibre.com/users/me", { headers: mlHeaders });
    const me = await meRes.json();
    if (!me.id) return res.status(401).json({ error: "Token ML inválido" });

    // 2) Lista pedidos cancelados do ML (paginado, até 200)
    const cancelados = [];
    let offset = 0;
    while (offset < 200) {
      await sleep(300);
      const r = await fetch(
        `https://api.mercadolibre.com/orders/search?seller=${me.id}&order.status=cancelled&order.date_created.from=${encodeURIComponent(dateFrom)}&limit=50&offset=${offset}`,
        { headers: mlHeaders }
      );
      const d = await r.json();
      const results = d.results || [];
      cancelados.push(...results);
      if (results.length < 50) break;
      offset += 50;
    }

    if (cancelados.length === 0) return res.json({ ok: true, itens: [], totalCancelados: 0 });

    // 3) Para cada pedido cancelado, busca a NF no Bling pelo número do pedido
    // O Bling grava o número do pedido ML em "informaçõesAdicionais" / "numero_loja_virtual"
    // Estratégia: busca as NFs dos últimos (dias+5) dias e filtra pelo número do pedido nas informações adicionais
    const dataInicial = new Date(Date.now() - (dias + 5) * 86400000).toISOString().slice(0, 10);
    const dataFinal = new Date().toISOString().slice(0, 10);

    // Busca notas do Bling (paginado)
    const notasBling = [];
    let pagina = 1;
    while (pagina <= 10) {
      await sleep(350);
      const r = await fetch(
        `https://www.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=100&dataEmissaoInicial=${dataInicial}&dataEmissaoFinal=${dataFinal}&tipo=1`,
        { headers: blingHeaders }
      );
      if (!r.ok) break;
      const d = await r.json();
      const items = d.data || [];
      notasBling.push(...items);
      if (items.length < 100) break;
      pagina++;
    }

    // Busca detalhe das notas em lotes de 3 (limite rate do Bling)
    // para achar o número do pedido ML nas informações adicionais
    const mapaNotaPorPedido = {}; // numeroPedidoML -> { nfNumero, nfSituacao, nfId }
    for (let i = 0; i < notasBling.length; i += 3) {
      const lote = notasBling.slice(i, i + 3);
      await Promise.all(lote.map(async (nf) => {
        try {
          const r = await fetch(`https://www.bling.com.br/Api/v3/nfe/${nf.id}`, { headers: blingHeaders });
          if (!r.ok) return;
          const d = await r.json();
          const corpo = d.data || {};
          // Campo correto confirmado: "numeroPedidoLoja" na raiz da nota
          const numeroPedidoLoja = corpo.numeroPedidoLoja || corpo.numeroLojaVirtual || "";
          const infoAdicional = corpo.informacoesAdicionais || "";

          // Registra pelo campo direto (mais confiável)
          if (numeroPedidoLoja) {
            const numLimpo = String(numeroPedidoLoja).trim();
            mapaNotaPorPedido[numLimpo] = {
              nfNumero: nf.numero || corpo.numero,
              nfSituacao: corpo.situacao?.descricao || corpo.situacao || "—",
              nfId: nf.id,
            };
          }

          // Fallback: tenta extrair número de 10-20 dígitos das informações adicionais
          if (!numeroPedidoLoja) {
            const matchPedido = infoAdicional.match(/\b(\d{10,20})\b/g);
            if (matchPedido) {
              matchPedido.forEach(numPedido => {
                mapaNotaPorPedido[numPedido] = {
                  nfNumero: nf.numero || corpo.numero,
                  nfSituacao: corpo.situacao?.descricao || corpo.situacao || nf.situacao || "—",
                  nfId: nf.id,
                };
              });
            }
          }
        } catch (e) { /* ignora erro individual */ }
      }));
      if (i + 3 < notasBling.length) await sleep(1000);
    }

    // 4) Monta o resultado cruzado
    const itens = cancelados.map(pedido => {
      const numeroPedido = String(pedido.id);
      const nf = mapaNotaPorPedido[numeroPedido] || null;
      const valor = pedido.total_amount || 0;
      const comprador = pedido.buyer?.nickname || pedido.buyer?.first_name || "—";
      const dataCancelamento = pedido.last_updated || pedido.date_closed || null;
      const itemPrincipal = pedido.order_items?.[0];
      const produto = itemPrincipal?.item?.title || "—";

      // Status do cruzamento
      let status;
      if (!nf) status = "sem_nf";           // não encontrou NF — pode já ter sido cancelada há mais tempo
      else if (/cancelad/i.test(String(nf.nfSituacao))) status = "nf_cancelada"; // NF já cancelada ✓
      else status = "nf_pendente";            // NF existe mas não está cancelada ⚠

      return { numeroPedido, comprador, produto, valor, dataCancelamento, nf, status };
    });

    // Ordena: pendentes primeiro, depois sem NF, depois canceladas
    const ordem = { nf_pendente: 0, sem_nf: 1, nf_cancelada: 2 };
    itens.sort((a, b) => (ordem[a.status] ?? 9) - (ordem[b.status] ?? 9));

    return res.json({
      ok: true,
      itens,
      totalCancelados: cancelados.length,
      totalNotasEncontradas: Object.keys(mapaNotaPorPedido).length,
      periodo: `${dias} dias`,
    });

  } catch (e) {
    console.error("ml-canceladas error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
