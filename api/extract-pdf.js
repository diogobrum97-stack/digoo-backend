export const config = { maxDuration: 30, api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if(req.method === "OPTIONS") return res.status(200).end();

  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const { base64, nome } = body;
  if(!base64) return res.status(400).json({error:"base64 obrigatório"});

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPI_API_KEY;
  if(!ANTHROPIC_KEY) return res.status(500).json({error:"chave não configurada"});

  const iaResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "pdfs-2024-09-25"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: `Extraia deste documento fiscal brasileiro:
1. valor: valor total liquido em reais (numero apenas, ex: 2225.00)
2. competencia: no formato MM/AAAA
3. prestador: nome do emitente
4. numeroNF: numero da NF
5. cnpj: CNPJ do emitente (XX.XXX.XXX/XXXX-XX)

Responda APENAS em JSON:
{"valor":2225.00,"competencia":"07/2026","prestador":"Nome","numeroNF":"12","cnpj":"58.350.709/0001-05"}` }
        ]
      }]
    })
  });

  const iaData = await iaResp.json();
  const texto = iaData.content?.[0]?.text || "{}";
  try {
    const result = JSON.parse(texto.replace(/```json|```/g,"").trim());
    return res.json({ok:true, valor:result.valor||0, competencia:result.competencia||"", prestador:result.prestador||"", numeroNF:result.numeroNF||"", cnpj:result.cnpj||""});
  } catch(e) {
    return res.json({ok:false, valor:0, competencia:"", prestador:"", numeroNF:"", cnpj:"", raw:texto});
  }
}
