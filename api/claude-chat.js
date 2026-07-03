export const config = {
  maxDuration: 60,
};

const TOOLS = [
  {
    name: "criar_tarefa",
    description: "Cria uma tarefa avulsa (não recorrente) para um membro da equipe Digoo.",
    input_schema: {
      type: "object",
      properties: {
        member: { type: "string", enum: ["Diogo", "Bruno", "Larissa"], description: "Quem vai executar a tarefa" },
        text: { type: "string", description: "Descrição curta e clara da tarefa" },
        prio: { type: "string", enum: ["superurgente", "urgente", "importante", "normal"], description: "Prioridade da tarefa" }
      },
      required: ["member", "text", "prio"]
    }
  },
  {
    name: "criar_tarefa_recorrente",
    description: "Cria uma tarefa recorrente (diária, semanal ou mensal) para um membro da equipe Digoo. Use quando o usuário pedir algo que se repete, como 'toda sexta-feira' ou 'todo dia'.",
    input_schema: {
      type: "object",
      properties: {
        member: { type: "string", enum: ["Diogo", "Bruno", "Larissa"], description: "Quem vai executar a tarefa" },
        text: { type: "string", description: "Descrição curta e clara da tarefa" },
        prio: { type: "string", enum: ["superurgente", "urgente", "importante", "normal"], description: "Prioridade da tarefa" },
        frequency: { type: "string", enum: ["daily", "weekly", "monthly"], description: "Frequência da recorrência" },
        dayOfWeek: { type: "integer", description: "0=domingo, 1=segunda ... 6=sábado. Obrigatório apenas se frequency for weekly." },
        dayOfMonth: { type: "integer", description: "Dia do mês, 1 a 31. Obrigatório apenas se frequency for monthly." }
      },
      required: ["member", "text", "prio", "frequency"]
    }
  }
];

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

FERRAMENTAS DE CRIAÇÃO DE TAREFA:
- Você tem acesso às ferramentas "criar_tarefa" e "criar_tarefa_recorrente". Use-as sempre que ${member} pedir para criar, adicionar, lembrar ou cadastrar uma tarefa, avulsa ou recorrente.
- Se ${member} não disser para quem é a tarefa, assuma que é para ele(a) mesmo(a) (member = "${member}").
- Se ${member} não disser a prioridade, use "importante" como padrão.
- Ao chamar uma ferramenta, SEMPRE escreva também um texto curto de confirmação explicando o que você fez (ex: "Beleza, criei a tarefa recorrente toda sexta-feira para você."). Nunca responda só com a chamada da ferramenta, sem nenhum texto.
- Só use as ferramentas quando a intenção de criar uma tarefa for clara. Se for só uma pergunta ou pedido de análise, não use ferramentas.

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
        max_tokens: 1200,
        system: systemPrompt,
        tools: TOOLS,
        messages
      })
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("Anthropic API error:", data);
      return res.status(r.status).json({ error: data?.error?.message || `Erro ${r.status} na API do Claude` });
    }
    const blocks = data.content || [];
    const reply = blocks.filter(b => b.type === "text").map(b => b.text).join("\n\n").trim();
    const actions = blocks
      .filter(b => b.type === "tool_use")
      .map(b => ({ type: b.name, input: b.input }));
    return res.json({
      reply: reply || (actions.length ? "Feito." : "Erro ao obter resposta."),
      actions
    });
  } catch (e) {
    console.error("claude-chat handler error:", e);
    return res.status(500).json({ error: e.message });
  }
}
