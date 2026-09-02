export const config = { maxDuration: 30 };

const FD_BASE = "https://nfse.fiscaldefender.com.br/api/v1";
// Tokens lidos de variável de ambiente única (JSON)
function getFDConfig() {
  try {
    const cfg = JSON.parse(process.env.FISCAL_DEFENDER || "{}");
    return { token: cfg.t || "", webhookSecret: cfg.w || "" };
  } catch(e) {
    return { token: "", webhookSecret: "" };
  }
}
const FIREBASE_URL = process.env.FIREBASE_URL;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Categorias Bling (mesmo mapa do bling-produtos.js)
const CATEGORIAS = [
  { id: 14729399721, label: "Antecipação de Importação", grupo: "COMPRAS", keywords: ["importa","antecip"] },
  { id: 14729394142, label: "Aluguel", grupo: "DESPESAS OPERACIONAIS", keywords: ["aluguel","cowork","endereço virtual","endereço fiscal"] },
  { id: 14729402416, label: "Armazenagem", grupo: "DESPESAS OPERACIONAIS", keywords: ["armazenagem","storage","fulfillment","full"] },
  { id: 14632652910, label: "Fretes", grupo: "DESPESAS OPERACIONAIS", keywords: ["frete","transport","shipping","logist","entrega"] },
  { id: 14617756256, label: "Salário", grupo: "DESPESAS OPERACIONAIS", keywords: ["salário","salario","folha","funcionário"] },
  { id: 14729594171, label: "Infraestrutura", grupo: "DESPESAS OPERACIONAIS", keywords: ["infraestrutura","servidor","cloud","hosting","internet"] },
  { id: 14729584147, label: "Insumos", grupo: "DESPESAS OPERACIONAIS", keywords: ["insumo","material","embalagem"] },
  { id: 14729584900, label: "Prestador de Serviços", grupo: "DESPESAS OPERACIONAIS", keywords: ["prestador","serviço","service","consultoria","freelance"] },
  { id: 14617763097, label: "Honorários", grupo: "DESPESAS OPERACIONAIS", keywords: ["honorário","honorario","contabil","contábil","contador","contabilidade"] },
  { id: 14729401229, label: "Sistemas", grupo: "DESPESAS OPERACIONAIS", keywords: ["sistema","software","saas","plataforma","mensalidade","licença","assinatura"] },
  { id: 14729391948, label: "Plano de Saúde", grupo: "REMUNERAÇÃO E PESSOAL", keywords: ["saúde","saude","plano","médico","odonto"] },
  { id: 14729397458, label: "Retirada de Lucro", grupo: "REMUNERAÇÃO E PESSOAL", keywords: ["retirada","lucro","pró-labore","pro-labore"] },
];

// Classificação automática por keywords
function classificarCategoria(texto) {
  const t = (texto || "").toLowerCase();
  for (const cat of CATEGORIAS) {
    if (cat.keywords.some(k => t.includes(k))) return cat;
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── Webhook recebe NFS-e nova do Fiscal Defender ─────────────────────────
  if (req.query.action === "webhook-nfse" && req.method === "POST") {
    try {
      // Valida assinatura HMAC do Fiscal Defender
      const { webhookSecret: FD_WEBHOOK_SECRET } = getFDConfig();
      if (FD_WEBHOOK_SECRET) {
        const sig = req.headers["x-fd-signature"] || req.headers["x-signature"] || "";
        if (sig) {
          const crypto = await import("crypto");
          const rawBody = JSON.stringify(req.body);
          const expected = crypto.createHmac("sha256", FD_WEBHOOK_SECRET).update(rawBody).digest("hex");
          if (sig !== expected && sig !== `sha256=${expected}`) {
            return res.status(401).json({ erro: "Assinatura inválida" });
          }
        }
      }
      const body = req.body;
      const event = body?.event;

      if (event !== "nfse.created") return res.json({ ok: true, ignorado: event });

      const nfse = body?.data;
      if (!nfse) return res.status(400).json({ erro: "Sem dados da NFS-e" });

      await processarNfse(nfse);
      return res.json({ ok: true });
    } catch(e) {
      console.error("webhook-nfse erro:", e.message);
      return res.status(500).json({ erro: e.message });
    }
  }

  // ── Busca NFS-e do Fiscal Defender e importa para o Firebase ─────────────
  if (req.query.action === "importar-nfse") {
    try {
      const pagina = parseInt(req.query.pagina || "1");
      const competencia = req.query.competencia || ""; // YYYY-MM

      const { token: FD_TOKEN } = getFDConfig();
      let url = `${FD_BASE}/nfse?page=${pagina}&limit=50&tipo=recebida`;
      if (competencia) url += `&competencia=${competencia}`;

      const r = await fetch(url, { headers: { Authorization: `Bearer ${FD_TOKEN}` } });
      const data = await r.json();
      const notas = data?.data || data?.nfses || data?.items || [];

      let importadas = 0;
      for (const nfse of notas) {
        await processarNfse(nfse);
        importadas++;
      }

      return res.json({ ok: true, importadas, total: data?.total || notas.length, pagina });
    } catch(e) {
      return res.status(500).json({ erro: e.message });
    }
  }

  // ── Lista NFS-e do Firebase (para o OPS) ─────────────────────────────────
  if (req.query.action === "listar-nfse-firebase") {
    try {
      const mes = req.query.mes || new Date().toISOString().slice(0, 7);
      const mesPath = mes.replace("-", "/");
      const snap = await fetch(`${FIREBASE_URL}/nfse_tomadas/${mesPath}.json`);
      const dados = await snap.json() || {};
      const itens = Object.entries(dados).map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
      return res.json({ ok: true, itens });
    } catch(e) {
      return res.status(500).json({ erro: e.message });
    }
  }

  return res.status(404).json({ erro: "Action não encontrada" });
}

// ── Processa uma NFS-e e salva no Firebase como rascunho no Contas a Pagar ──
async function processarNfse(nfse) {
  // Extrai dados principais
  const chaveAcesso = nfse.chaveAcesso || nfse.chave_acesso || nfse.numero || "";
  const competencia = nfse.competencia || nfse.dataCompetencia?.slice(0, 7) || nfse.dataEmissao?.slice(0, 7) || new Date().toISOString().slice(0, 7);
  const mesPath = competencia.replace("-", "/");

  // Verifica se já importou
  const existeSnap = await fetch(`${FIREBASE_URL}/nfse_tomadas/${mesPath}/${chaveAcesso.replace(/\//g, "_")}.json`);
  const existe = await existeSnap.json();
  if (existe) return; // já importada

  const fornecedor = nfse.prestador?.razaoSocial || nfse.prestador?.nome || nfse.tomador?.razaoSocial || "";
  const cnpj = (nfse.prestador?.cnpj || "").replace(/\D/g, "");
  const valor = Number(nfse.valorServicos || nfse.valor || 0);
  const discriminacao = nfse.discriminacao || nfse.descricaoServico || "";
  const numero = nfse.numero || nfse.numeroNfse || "";
  const dataEmissao = nfse.dataEmissao?.slice(0, 10) || "";

  // Classificação automática por keywords
  const textoClassificar = `${fornecedor} ${discriminacao}`.toLowerCase();
  const catAutomatic = classificarCategoria(textoClassificar);

  // Se não classificou automaticamente, usa IA
  let categoriaId = catAutomatic?.id || null;
  let categoriaLabel = catAutomatic?.label || "";
  let categoriaSugerida = catAutomatic?.label || "";

  if (!categoriaId && ANTHROPIC_KEY) {
    try {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 100,
          messages: [{
            role: "user",
            content: `Classifique esta NFS-e em UMA das categorias. Responda APENAS com o nome exato da categoria.\n\nFornecedor: ${fornecedor}\nDiscriminação: ${discriminacao}\n\nCategorias: Antecipação de Importação, Aluguel, Armazenagem, Fretes, Salário, Infraestrutura, Insumos, Prestador de Serviços, Honorários, Sistemas, Plano de Saúde, Retirada de Lucro`
          }]
        })
      });
      const aiData = await aiRes.json();
      const sugestao = aiData.content?.[0]?.text?.trim() || "";
      const match = CATEGORIAS.find(c => c.label.toLowerCase() === sugestao.toLowerCase());
      if (match) { categoriaId = match.id; categoriaLabel = match.label; categoriaSugerida = match.label; }
    } catch(e) {}
  }

  // Salva no Firebase como rascunho no Contas a Pagar
  const entrada = {
    fornecedor, cnpj, numeroDoc: numero, valor,
    competencia, vencimento: dataEmissao,
    historico: discriminacao,
    categoriaId: categoriaId || "",
    categoriaLabel,
    categoriaSugerida,
    situacao: "rascunho", // rascunho = aguardando aprovação
    origem: "fiscal-defender",
    chaveAcesso,
    criadoEm: Date.now(),
  };

  const key = (chaveAcesso || `${cnpj}_${numero}_${Date.now()}`).replace(/[.#$[\]/]/g, "_");
  await fetch(`${FIREBASE_URL}/contas_pagar/${mesPath}/${key}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entrada),
  });

  // Também salva referência na coleção nfse_tomadas para histórico
  await fetch(`${FIREBASE_URL}/nfse_tomadas/${mesPath}/${key}.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...entrada, importadoEm: Date.now() }),
  });
}
