module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  const { member, message, history, context } = req.body;
  if (!member || !message) return res.status(400).json({ error: "Parâmetros ausentes" });

  const BACKEND = "https://digoo-backend.vercel.app";

  try {
    const systemPrompts = {
      Diogo: `Você é o assistente pessoal do Diogo, dono da Digoo Brasil — empresa de importação e distribuição de Porto Alegre que vende no Mercado Livre.

CONTEXTO ATUAL:
${context || "Sem contexto adicional"}

SUAS CAPACIDADES:
- Gerenciar tarefas recorrentes (criar, listar, remover)
- Analisar dados do negócio e dar insights
- Criar e delegar tarefas para a equipe
- Responder perguntas sobre o negócio

TAREFAS RECORRENTES — INSTRUÇÕES IMPORTANTES:
Quando o Diogo pedir para criar uma tarefa recorrente, você DEVE:
1. Identificar: texto da tarefa, frequência (diária/semanal/mensal), dia (se semanal/mensal)
2. Chamar o endpoint: POST https://digoo-backend.vercel.app/api/recorrentes
3. Body: { "text": "...", "frequency": "daily|weekly|monthly", "member": "Diogo", "prio": "urgente|importante|normal", "dayOfWeek": 0-6 ou null, "dayOfMonth": 1-31 ou null }
4. Confirmar para o Diogo que foi salvo

Dias da semana: 0=domingo, 1=segunda, 2=terça, 3=quarta, 4=quinta, 5=sexta, 6=sábado

Exemplos de interpretação:
- "adiciona diária: conferir ML" → frequency: "daily"
- "toda segunda: reunião" → frequency: "weekly", dayOfWeek: 1
- "todo dia 5: fechamento" → frequency: "monthly", dayOfMonth: 5
- "quais recorrentes tenho?" → GET https://digoo-backend.vercel.app/api/recorrentes
- "remove conferir ML" → DELETE com o id correto

ESTILO: Direto, informal, português brasileiro. Confirme sempre o que foi salvo.`,

      Bruno: `Você é o assistente do Bruno, que trabalha na Digoo Brasil.

CONTEXTO ATUAL:
${context || "Sem contexto adicional"}

Ajude com tarefas, dúvidas e priorização. Direto e prático, português brasileiro.`,

      Larissa: `Você é a assistente da Larissa, que cuida do pós-venda na Digoo Brasil no Mercado Livre.

CONTEXTO ATUAL:
${context || "Sem contexto adicional"}

Ajude com devoluções, reclamações e tarefas. Prestativa, português brasileiro.`,
    };

    const systemPrompt = systemPrompts[member] || systemPrompts.Diogo;

    const messages = [];
    if (history && Array.isArray(history)) {
      history.slice(-10).forEach(h => {
        messages.push({ role: h.role, content: h.content });
      });
    }
    messages.push({ role: "user", content: message });

    // Primeira chamada ao Claude
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
    let reply = data.content?.[0]?.text || "Erro ao gerar resposta";

    // Verifica se o Claude quer chamar o endpoint de recorrentes
    // O Claude vai incluir tags especiais na resposta quando precisar salvar
    const createMatch = reply.match(/\[CRIAR_RECORRENTE:(.*?)\]/s);
    const listMatch = reply.match(/\[LISTAR_RECORRENTES\]/);
    const deleteMatch = reply.match(/\[DELETAR_RECORRENTE:(.*?)\]/);

    if (createMatch) {
      try {
        const params = JSON.parse(createMatch[1]);
        const saveRes = await fetch(`${BACKEND}/api/recorrentes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        const saveData = await saveRes.json();
        reply = reply.replace(/\[CRIAR_RECORRENTE:.*?\]/s, "");
        if (saveData.ok) {
          reply += `\n\n✓ Salvo! "${params.text}" vai aparecer no seu card automaticamente.`;
        }
      } catch {}
    }

    if (listMatch) {
      try {
        const listRes = await fetch(`${BACKEND}/api/recorrentes`);
        const listData = await listRes.json();
        const items = listData.data || [];
        const freqLabel = { daily: "diária", weekly: "semanal", monthly: "mensal" };
        const dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
        reply = reply.replace("[LISTAR_RECORRENTES]", "");
        if (items.length === 0) {
          reply += "\n\nVocê não tem nenhuma recorrente configurada ainda.";
        } else {
          reply += "\n\n**Suas recorrentes:**\n" + items.map(r => {
            let extra = "";
            if (r.frequency === "weekly" && r.dayOfWeek != null) extra = ` (toda ${dias[r.dayOfWeek]})`;
            if (r.frequency === "monthly" && r.dayOfMonth != null) extra = ` (dia ${r.dayOfMonth})`;
            return `• ${r.text} — ${freqLabel[r.frequency] || r.frequency}${extra}`;
          }).join("\n");
        }
      } catch {}
    }

    if (deleteMatch) {
      try {
        const id = deleteMatch[1].trim();
        await fetch(`${BACKEND}/api/recorrentes`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        reply = reply.replace(/\[DELETAR_RECORRENTE:.*?\]/s, "");
        reply += "\n\n✓ Removida com sucesso.";
      } catch {}
    }

    return res.json({ ok: true, reply: reply.trim() });
  } catch (e) {
    console.error("Claude chat error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};
