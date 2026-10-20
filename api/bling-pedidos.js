export const config = { maxDuration: 30 };

function getBlingToken() {
  try { const c = JSON.parse(process.env.BLING_TOKENS || "{}"); return c.access_token || ""; }
  catch(e) { return ""; }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { numeroLoja } = req.query;
  if (!numeroLoja) return res.status(400).json({ ok: false, error: "numeroLoja obrigatório" });

  const token = getBlingToken();
  if (!token) return res.status(500).json({ ok: false, error: "Token Bling não configurado" });

  try {
    // 1. Busca pedido pelo número da loja (order_id do ML)
    const rPedido = await fetch(
      `https://www.bling.com.br/Api/v3/pedidos/vendas?numeroLoja=${numeroLoja}&limite=5`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const dPedido = await rPedido.json();

    if (!rPedido.ok || !dPedido.data?.length) {
      return res.status(200).json({ ok: false, error: "Pedido não encontrado no Bling", raw: dPedido });
    }

    const pedido = dPedido.data[0];
    const idPedido = pedido.id;
    const numeroPedido = pedido.numero;

    // 2. Busca NF-e vinculada ao pedido
    let nfe = null;
    try {
      const rNfe = await fetch(
        `https://www.bling.com.br/Api/v3/nfe?idPedidoVenda=${idPedido}&limite=5`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const dNfe = await rNfe.json();
      if (dNfe.data?.length) {
        const n = dNfe.data[0];
        nfe = {
          id: n.id,
          numero: n.numero,
          serie: n.serie,
          chave: n.chaveAcesso,
          situacao: n.situacao,
        };
      }
    } catch(e) {
      // sem NF, tudo bem
    }

    return res.status(200).json({
      ok: true,
      pedido: {
        id: idPedido,
        numero: numeroPedido,
        numeroLoja,
        situacao: pedido.situacao,
      },
      nfe,
    });

  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
