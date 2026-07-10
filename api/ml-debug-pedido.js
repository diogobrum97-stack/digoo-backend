export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const mlR = await fetch(`${process.env.FIREBASE_URL}/ml_token.json`);
    const mlToken = await mlR.json();
    if (!mlToken?.access_token) return res.status(401).json({ error: "ML não conectado" });

    const headers = { Authorization: `Bearer ${mlToken.access_token}` };
    const pedidoId = req.query.id || "2000013651141949";

    // 1) Dados completos do pedido
    const pedidoRes = await fetch(`https://api.mercadolibre.com/orders/${pedidoId}`, { headers });
    const pedido = await pedidoRes.json();

    // 2) Shipment ID (se existir no pedido)
    const shipmentId = pedido.shipments?.id || pedido.shipping?.id || null;
    let shipment = null;
    if (shipmentId) {
      const shipRes = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}`, { headers });
      shipment = await shipRes.json();
    }

    // 3) Claims do pedido
    let claims = null;
    try {
      const claimRes = await fetch(`https://api.mercadolibre.com/post-purchase/v1/claims/search?order_id=${pedidoId}`, { headers });
      claims = await claimRes.json();
    } catch(e) { claims = { error: e.message }; }

    return res.json({
      pedido_status: pedido.status,
      pedido_substatus: pedido.status_detail,
      shipment_id: shipmentId,
      shipment_status: shipment?.status,
      shipment_substatus: shipment?.substatus,
      shipment_campos_relevantes: shipment ? {
        status: shipment.status,
        substatus: shipment.substatus,
        return_details: shipment.return_details,
        tracking_number: shipment.tracking_number,
      } : null,
      claims_resumo: claims?.results?.map(c => ({
        id: c.id,
        type: c.type,
        stage: c.stage,
        status: c.status,
      })) || claims,
      // Campos raw do pedido pra ver tudo que vem
      pedido_campos_top: Object.keys(pedido),
      pedido_shipping_raw: pedido.shipping || pedido.shipments || null,
    });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
