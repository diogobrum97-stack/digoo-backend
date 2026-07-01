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

REGRAS DE RESPOSTA:
- Escreva em português brasileiro, de forma direta e clara
- Use parágrafos curtos com no máximo 2-3 linhas cada
- Separe tópicos diferentes com uma linha em branco
- Para listas, use um item por linha começando com "•"
- Nunca use markdown com asteriscos (**negrito**) — escreva o texto direto
- Nunca use traços como separadores (---)
- Não use emojis excessivos
- Seja objetivo: responda o que foi perguntado sem rodeios
- Se tiver dados de estoque ou vendas disponíveis no contexto, use-os para análises específicas
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
    const reply = data.content?.[0]?.text || "Erro ao obter resposta.";
    return res.json({ reply });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
