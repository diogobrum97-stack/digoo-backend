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

/**
 * Processa uma notificação de reclamação (post_purchase) em background.
 * Busca detalhes da claim no ML, chama Claude para analisar e salva no Firebase.
 * resource = "/post-purchase/v1/claims/CLAIM_ID"
 */
async function processarReclamacao(resource, userId, fbUrl) {
  // Extrair claim_id do resource (ex: /post-purchase/v1/claims/12345678)
  const matchClaim = resource.match(/\/claims\/(\d+)/);
  if (!matchClaim) {
    console.log("[reclamacao] resource sem claim_id:", resource);
    return;
  }
  const claimId = matchClaim[1];

  // Buscar token do Firebase (tenta Matriz e Filial; usa o que pertence ao userId)
  const [tkMatrizR, tkFilialR] = await Promise.all([
    fetch(`${fbUrl}/ml_token.json`),
    fetch(`${fbUrl}/ml_token_filial.json`),
  ]);
  const tkMatriz = await tkMatrizR.json().catch(() => null);
  const tkFilial = await tkFilialR.json().catch(() => null);

  // Escolher o token certo baseado no userId da notificação
  let token = null;
  let contaLabel = "";
  if (tkMatriz?.access_token) {
    // Verifica se o userId corresponde à conta Matriz
    try {
      const meR = await fetch("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${tkMatriz.access_token}` }
      });
      const me = await meR.json();
      if (String(me.id) === String(userId)) {
        token = tkMatriz.access_token;
        contaLabel = "Matriz RS";
      }
    } catch(e) {}
  }
  if (!token && tkFilial?.access_token) {
    try {
      const meR = await fetch("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${tkFilial.access_token}` }
      });
      const me = await meR.json();
      if (String(me.id) === String(userId)) {
        token = tkFilial.access_token;
        contaLabel = "Filial SP";
      }
    } catch(e) {}
  }
  // Fallback: usar qualquer token disponível
  if (!token) {
    token = tkMatriz?.access_token || tkFilial?.access_token;
    contaLabel = tkMatriz?.access_token ? "Matriz RS" : "Filial SP";
  }
  if (!token) {
    console.log("[reclamacao] Nenhum token disponível");
    return;
  }

  // Buscar detalhes da claim
  const claimRes = await fetch(
    `https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!claimRes.ok) {
    console.log(`[reclamacao] Erro ao buscar claim ${claimId}: HTTP ${claimRes.status}`);
    return;
  }
  const claim = await claimRes.json();

  // Só processa reclamações abertas/em andamento
  const status = claim.status || "";
  if (!["opened", "running"].includes(status)) {
    console.log(`[reclamacao] claim ${claimId} status="${status}" ignorada`);
    return;
  }

  // Buscar mensagens da reclamação
  let mensagens = [];
  try {
    const msgRes = await fetch(
      `https://api.mercadolibre.com/post-purchase/v1/claims/${claimId}/messages`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (msgRes.ok) {
      const msgData = await msgRes.json();
      mensagens = (msgData.messages || msgData || []).slice(0, 10);
    }
  } catch(e) {}

  // Buscar treinamento de reclamações do Firebase
  let treinamentoPorTipo = {};
  try {
    const tipoClaim = claim.reason_id || claim.type || "geral";
    const treinoR = await fetch(`${fbUrl}/reclamacoes_treinamento/${tipoClaim}.json`);
    const treinoData = await treinoR.json();
    if (treinoData && typeof treinoData === "object") {
      treinamentoPorTipo = Object.values(treinoData)
        .filter(e => e && e.situacao && e.resposta)
        .slice(0, 5);
    }
  } catch(e) {}

  // Buscar detalhes do pedido/item
  let infoItem = {};
  try {
    const orderId = claim.order_id;
    if (orderId) {
      const orderR = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const order = await orderR.json();
      const firstItem = (order.order_items || [])[0];
      if (firstItem?.item) {
        infoItem = {
          titulo: firstItem.item.title || "",
          item_id: firstItem.item.id || "",
          sku: firstItem.item.seller_sku || "",
          quantidade: firstItem.quantity || 1,
        };
      }
    }
  } catch(e) {}

  // Hora BR para saudação
  const horaBR = new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false });
  const h = parseInt(horaBR, 10);
  const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";

  // Chamar Claude para analisar
  const sistemaClaude = `Você é atendente especializado em pós-venda da Digoo Brasil no Mercado Livre.

Analise a reclamação e retorne APENAS JSON válido:
{
  "tipo_reclamacao": "item_nao_recebido|item_diferente|item_defeituoso|item_incompleto|arrependimento|outro",
  "resumo": "Uma frase resumindo o problema",
  "requires_attention": true/false,
  "suggested_answer": "Resposta sugerida ao cliente (ou vazia se requires_attention=true)",
  "acao_sugerida": "reembolso|reenvio|troca|explicacao|aguardar_transportadora|outro"
}

REGRAS:
- Comece sempre com "${saudacao}!"
- Seja empático e objetivo
- Para item não recebido: peça para aguardar o prazo de entrega ou verifique com a transportadora
- Para item defeituoso/incompleto: peça foto/vídeo do problema e proponha solução
- Para item diferente do anunciado: reconheça o erro e proponha troca ou reembolso
- Para arrependimento: informe prazo de 7 dias para devolução sem custo
- Se a situação for complexa ou precisar de ação manual, coloque requires_attention=true e suggested_answer=""
- Respostas anteriores bem-sucedidas para esse tipo: ${JSON.stringify(treinamentoPorTipo)}
- NF: Filial SP emite por São Paulo, Matriz RS por Porto Alegre`;

  const contexto = {
    claim_id: claimId,
    tipo_claim: claim.reason_id || claim.type || "",
    status: claim.status,
    produto: infoItem,
    descricao_problema: claim.reason?.description || claim.player_role_details?.description || "",
    mensagens: mensagens.map(m => ({
      de: m.from?.role || m.sender_role || "cliente",
      texto: (m.message || m.text || "").slice(0, 300),
      data: m.date_created || m.date,
    })),
  };

  let sugestao = { tipo_reclamacao: "outro", resumo: "", requires_attention: true, suggested_answer: "", acao_sugerida: "outro" };
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      const claudeR = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 800,
          system: sistemaClaude,
          messages: [{ role: "user", content: JSON.stringify(contexto) }],
        }),
      });
      const cd = await claudeR.json();
      const raw = ((cd.content || []).find(b => b.type === "text")?.text || "{}").trim().replace(/```json\s*|\s*```/g, "");
      sugestao = JSON.parse(raw);
    }
  } catch(e) {
    console.error("[reclamacao] Erro Claude:", e.message);
  }

  // Salvar no Firebase
  const registro = {
    claim_id: claimId,
    order_id: claim.order_id || "",
    status: claim.status,
    tipo_reclamacao: sugestao.tipo_reclamacao || "outro",
    resumo: sugestao.resumo || "",
    acao_sugerida: sugestao.acao_sugerida || "outro",
    requires_attention: !!sugestao.requires_attention,
    suggested_answer: sugestao.suggested_answer || "",
    produto: infoItem,
    conta: contaLabel,
    receivedAt: Date.now(),
    data: new Date().toISOString(),
    respondida: false,
    mensagens_count: mensagens.length,
  };

  await fetch(`${fbUrl}/reclamacoes_pendentes/${claimId}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(registro),
  });

  console.log(`[reclamacao] claim ${claimId} processada → tipo=${registro.tipo_reclamacao} attention=${registro.requires_attention}`);
}

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
    // Nota: o ML usa "questions" para perguntas (não "messages")
    let firebasePath;
    if (topic === "questions" || topic === "messages") {
      firebasePath = "webhooks/messages"; // frontend escuta este nó
    } else if (topic === "orders_v2" || topic === "orders") {
      firebasePath = "webhooks/orders";
    } else if (topic === "shipments") {
      firebasePath = "webhooks/shipments";
    } else if (topic === "post_purchase") {
      firebasePath = "webhooks/post_purchase";
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

    // Para post_purchase (reclamações), processa em background sem bloquear resposta
    if (topic === "post_purchase" && resource && FIREBASE_URL) {
      processarReclamacao(resource, userId, FIREBASE_URL).catch(e =>
        console.error("[webhook-ml] Erro ao processar reclamação:", e.message)
      );
    }

    // ML espera 200 em até 500ms — responde imediatamente
    return res.status(200).json({ ok: true, key: fbData?.name });

  } catch (err) {
    console.error("[webhook-ml] Erro:", err.message);
    // Retorna 500 para o ML retentar
    return res.status(500).json({ error: err.message });
  }
}
