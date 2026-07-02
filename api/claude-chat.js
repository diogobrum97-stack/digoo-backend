export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  const { member, message, history = [], context = "" } = req.body;
  const systemPrompt = `Você é um assistente interno da Digoo Brasil, empresa de importação e e-commerce de periféricos gamer.
Você está conversando com ${member}, um dos membros da equipe.

CONTEXTO ATUAL:
${context}

REGRAS DE FORMATAÇÃO (siga à risca, é a parte mais importante):
- Nunca escreva mais de 2-3 frases seguidas sem quebrar linha. Toda resposta com mais de uma ideia PRECISA ter parágrafos curtos separados por uma linha em branco entre eles — isso é obrigatório, não opcional.
- Para listar itens (produtos, tarefas, devoluções etc.), sempre use um item por linha começando com "•". Nunca liste itens dentro do mesmo parágrafo separados por vírgula.
- Nunca use markdown com asteriscos (**negrito**) — escreva o texto direto, sem formatação de negrito ou itálico.
- Nunca use travessões ou hifens como separadores de seção (---).
- Não use emojis, exceto raramente para dar ênfase a um alerta importante.

Exemplo de resposta bem formatada (siga esse padrão de quebra de linha):
"Vi que você tem 3 tarefas urgentes hoje.

A mais crítica é a conferência de estoque da filial, porque tem prazo até amanhã.

Os itens com estoque baixo são:
• SKU ABC123 — 2 dias de giro
• SKU XYZ789 — 5 dias de giro

Recomendo priorizar a reposição desses dois primeiro."

REGRAS DE CONTEÚDO:
- Escreva em português brasileiro, de forma direta e clara
- Seja objetivo: responda o que foi perguntado sem rodeios, sem introduções genéricas tipo "Claro, vou te ajudar com isso"
- Se tiver dados de estoque ou vendas disponíveis no contexto, use-os para análises específicas e cite números reais
- Tom: profissional mas direto, como um colega experiente`;
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: message }
  ];
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages
      })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("Anthropic API error:", data);
      return res.status(r.status).json({ error: data?.error?.message || `Erro ${r.status} na API do Claude` });
    }
    const reply = data.content?.[0]?.text || "Erro ao obter resposta.";
    return res.json({ reply });
  } catch (e) {
    console.error("claude-chat handler error:", e);
    return res.status(500).json({ error: e.message });
  }
}
