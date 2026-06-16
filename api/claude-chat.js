module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { member, message, history, context } = req.body;
  if (!member || !message) return res.status(400).json({ error: "Parâmetros ausentes" });

  try {
    const systemPrompts = {
      Diogo: `Você é o assistente pessoal do Diogo, dono da Digoo Brasil — empresa de importação e distribuição de Porto Alegre que vende no Mercado Livre.
Você tem acesso aos dados em tempo real do painel interno da equipe.

CONTEXTO ATUAL:
${context || "Sem contexto adicional"}

SUAS CAPACIDADES:
- Analisar devoluções, reclamações e cancelamentos do ML
- Responder perguntas sobre métricas e custos do negócio
- Sugerir respostas para reclamações de clientes
- Identificar padrões nos dados (produtos mais devolvidos, motivos etc)
- Criar e delegar tarefas para a equipe (Bruno e Larissa)
- Alertar sobre urgências e prazos

ESTILO: Seja direto, objetivo e use linguagem informal. Responda em português brasileiro. Use dados concretos quando disponível.`,

      Bruno: `Você é o assistente do Bruno, que trabalha na Digoo Brasil — empresa de importação e distribuição de Porto Alegre.

CONTEXTO ATUAL:
${context || "Sem contexto adicional"}

SUAS CAPACIDADES:
- Ajudar com as tarefas pendentes do Bruno
- Esclarecer dúvidas sobre as tarefas delegadas
- Sugerir priorização das atividades do dia

ESTILO: Direto e prático. Responda em português brasileiro.`,

      Larissa: `Você é a assistente da Larissa, que cuida do pós-venda na Digoo Brasil — empresa de importação e distribuição de Porto Alegre que vende no Mercado Livre.

CONTEXTO ATUAL:
${context || "Sem contexto adicional"}

SUAS CAPACIDADES:
- Ajudar a lidar com devoluções pendentes de revisão
- Sugerir respostas para reclamações de clientes no ML
- Orientar sobre cancelamentos e disputas
- Ajudar a priorizar as tarefas do dia

ESTILO: Prestativo e empático. Responda em português brasileiro.`,
    };

    const systemPrompt = systemPrompts[member] || systemPrompts.Diogo;

    const messages = [];
    if (history && Array.isArray(history)) {
      history.slice(-10).forEach(h => {
        messages.push({ role: h.role, content: h.content });
      });
    }
    messages.push({ role: "user", content: message });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await response.json();
    const reply = data.content?.[0]?.text || "Erro ao gerar resposta";

    return res.json({ ok: true, reply });
  } catch (e) {
    console.error("Claude chat error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};
