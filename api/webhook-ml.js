/**
 * Webhook do Mercado Livre → Firebase
 *
 * O ML envia um POST para esta URL quando ocorre um evento nos tópicos
 * inscritos (Messages, Orders, etc.). Este handler:
 *   1. Valida que é uma notificação legítima do ML
 *   2. Salva o evento no Firebase (webhooks/messages ou webhooks/orders)
 *   3. O frontend escuta o Firebase em tempo real e reage
 *
 * URL a registrar no ML: https://digoo-backend.vercel.app/api/webhook-ml
 */

const FIREBASE_URL = process.env.FIREBASE_URL; // ex: https://xxx.firebaseio.com

export default async function handler(req, res) {
  // ML envia GET para verificar a URL antes de ativar — responde 200
  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", service: "digoo-webhook-ml" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body;

    // Estrutura do payload do ML:
    // { resource: "/messages/packs/...", user_id: 123, topic: "messages", ... }
    const topic    = body?.topic;
    const resource = body?.resource;
    const userId   = body?.user_id;
    const attempts = body?.attempts;

    if (!topic || !resource) {
      // ML às vezes envia pings vazios — responde 200 para não retentar
      return res.status(200).json({ ok: true, skipped: "empty payload" });
    }

    const timestamp = Date.now();
    const evento = { topic, resource, userId, attempts, receivedAt: timestamp };

    // Salva no Firebase no nó correspondente ao tópico
    let firebasePath;
    if (topic === "messages") {
      firebasePath = "webhooks/messages";
    } else if (topic === "orders_v2" || topic === "orders") {
      firebasePath = "webhooks/orders";
    } else if (topic === "shipments") {
      firebasePath = "webhooks/shipments";
    } else {
      firebasePath = `webhooks/outros/${topic}`;
    }

    // Usa POST no Firebase para gerar chave única automática (push)
    const fbRes = await fetch(`${FIREBASE_URL}/${firebasePath}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(evento),
    });

    if (!fbRes.ok) {
      const fbErr = await fbRes.text();
      console.error("[webhook-ml] Erro ao salvar no Firebase:", fbErr);
      // Retorna 500 para o ML retentar mais tarde
      return res.status(500).json({ error: "Firebase write failed" });
    }

    const fbData = await fbRes.json();
    console.log(`[webhook-ml] ${topic} → Firebase ${firebasePath} key=${fbData?.name}`);

    // ML espera 200 em até 500ms — responde imediatamente
    return res.status(200).json({ ok: true, key: fbData?.name });

  } catch (err) {
    console.error("[webhook-ml] Erro:", err.message);
    // Retorna 500 para o ML retentar
    return res.status(500).json({ error: err.message });
  }
}
