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

TAREFAS RECORRENTES — REGRAS OBRIGATÓRIAS:
Quando o Diogo pedir para criar uma tarefa recorrente, você DEVE responder APENAS com um JSON no seguinte formato, sem nenhum texto antes ou depois:

{"action":"create_recorrente","text":"nome da tarefa","frequency":"daily|weekly|monthly","prio":"urgente|importante|normal","dayOfWeek":null,"dayOfMonth":null}

Quando pedir para listar recorrentes:
{"action":"list_recorrentes"}

Quando pedir para remover uma recorrente:
{"action":"delete_recorrente","id":"ID_DA_RECORRENTE"}

Para qualquer outra pergunta, responda normalmente em texto.

Dias da semana: 0=domingo, 1=segunda, 2=terça, 3=quarta, 4=quinta, 5=sexta, 6=sábado

ESTILO: Direto, informal, português brasileiro.`,

      Bruno: `Você é o assistente do Bruno, que trabalha na Digoo Brasil.
CONTEXTO: ${context || ""}
Ajude com tarefas e dúvidas. Direto e prático, português brasileiro.`,

      Larissa: `Você é a assistente da Larissa, que cuida do pós-venda na Digoo Brasil.
CONTEXTO: ${context || ""}
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
    let reply = (data.content?.[0]?.text || "Erro ao gerar resposta").trim();

    // Tenta parsear como JSON de ação
    let actionResult = null;
    try {
      const jsonMatch = reply.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.action === "create_recorrente") {
          const saveRes = await fetch(`${BACKEND}/api/recorrentes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: parsed.text,
              frequency: parsed.frequency,
              member: member,
              prio: parsed.prio || "importante",
              dayOfWeek: parsed.dayOfWeek ?? null,
              dayOfMonth: parsed.dayOfMonth ?? null,
            }),
          });
          const saveData = await saveRes.json();
          const freqLabel = { daily: "diária", weekly: "semanal", monthly: "mensal" };
          reply = `✓ Salvo! "${parsed.text}" adicionada como tarefa ${freqLabel[parsed.frequency] || parsed.frequency}. Vai aparecer no seu card automaticamente.`;
        }

        if (parsed.action === "list_recorrentes") {
          const listRes = await fetch(`${BACKEND}/api/recorrentes`);
          const listData = await listRes.json();
          const items = listData.data || [];
          const freqLabel = { daily: "diária", weekly: "semanal", monthly: "mensal" };
          const dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
          if (items.length === 0) {
            reply = "Você não tem nenhuma recorrente configurada ainda.";
          } else {
            reply = "Suas recorrentes:\n\n" + items.map(r => {
              let extra = "";
              if (r.frequency === "weekly" && r.dayOfWeek != null) extra = ` (toda ${dias[r.dayOfWeek]})`;
              if (r.frequency === "monthly" && r.dayOfMonth != null) extra = ` (dia ${r.dayOfMonth})`;
              return `• ${r.text} — ${freqLabel[r.frequency] || r.frequency}${extra}`;
            }).join("\n");
          }
        }

        if (parsed.action === "delete_recorrente") {
          // Primeiro lista para encontrar pelo nome se não tiver ID
          const listRes = await fetch(`${BACKEND}/api/recorrentes`);
          const listData = await listRes.json();
          const items = listData.data || [];
          let targetId = parsed.id;
          if (!targetId && parsed.text) {
            const found = items.find(r => r.text.toLowerCase().includes(parsed.text.toLowerCase()));
            if (found) targetId = found.id;
          }
          if (targetId) {
            await fetch(`${BACKEND}/api/recorrentes`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: targetId }),
            });
            reply = `✓ Removida com sucesso.`;
          } else {
            reply = "Não encontrei essa recorrente. Tente listar suas recorrentes para ver os nomes exatos.";
          }
        }
      }
    } catch {}

    return res.json({ ok: true, reply: reply.trim() });
  } catch (e) {
    console.error("Claude chat error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};
