export const config = { maxDuration: 60 };

const FIREBASE_URL  = process.env.FIREBASE_URL;
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const REDIRECT_URI  = "https://digoo-backend.vercel.app/api/google";

// ── Token Google ──────────────────────────────────────────────
async function renovarTokenGoogle(token) {
  if (!token.refresh_token) throw new Error("Sem refresh_token — reconecte o Google");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: token.refresh_token, grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`Erro ao renovar token Google: ${await r.text()}`);
  const novo = await r.json();
  const atualizado = { ...token, access_token: novo.access_token, saved_at: Date.now() };
  await fetch(`${FIREBASE_URL}/google_token.json`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(atualizado),
  });
  return atualizado;
}

async function getGoogleToken() {
  const r = await fetch(`${FIREBASE_URL}/google_token.json`);
  let token = await r.json();
  if (!token?.access_token) throw new Error("Google não conectado");
  const expiredAt = (token.saved_at || 0) + (token.expires_in || 3600) * 1000;
  if (Date.now() > expiredAt - 60000) token = await renovarTokenGoogle(token);
  return token;
}

// ── Gera CSV Bling ────────────────────────────────────────────
function gerarCSV(nfses, mes) {
  const linhas = ["Fornecedor;CNPJ;Valor;Vencimento;Competência;Situação;Portador;Histórico"];
  for (const nf of nfses) {
    const valor = String(nf.valor || "0").replace(".", ",");
    const data  = nf.emissao || mes;
    linhas.push([
      nf.fornecedor, nf.cnpj, valor, data, data,
      "aberto", "Itaú",
      `NFS-e ${nf.numero || ""} - ${nf.fornecedor}`,
    ].join(";"));
  }
  return linhas.join("\n");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { action, mes, code, error } = req.query;

  // ── OAuth passo 1 ─────────────────────────────────────────
  if (action === "auth" || (!action && !code)) {
    const SCOPES = [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/drive.readonly",
    ].join(" ");
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id",     CLIENT_ID);
    authUrl.searchParams.set("redirect_uri",  REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope",         SCOPES);
    authUrl.searchParams.set("access_type",   "offline");
    authUrl.searchParams.set("prompt",        "consent");
    return res.redirect(authUrl.toString());
  }

  // ── OAuth passo 2: callback ───────────────────────────────
  if (code) {
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI, grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) throw new Error(await tokenRes.text());
      const tokenData = await tokenRes.json();
      tokenData.saved_at = Date.now();
      await fetch(`${FIREBASE_URL}/google_token.json`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokenData),
      });
      return res.send(`<html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><div style="font-size:48px;margin-bottom:16px;">✓</div><h2 style="color:#3dd68c;">Google conectado!</h2><p style="color:#888;">Pode fechar esta aba.</p></div></body></html>`);
    } catch(e) {
      return res.send(`<html><body style="color:#f87171;padding:40px;">${e.message}</body></html>`);
    }
  }

  if (error) return res.send(`<html><body style="color:#f87171;padding:40px;">Erro: ${error}</body></html>`);

  // ── Ações autenticadas ────────────────────────────────────
  try {
    const token  = await getGoogleToken();
    const mesAlvo = mes || new Date().toISOString().slice(0, 7);
    const [ano, mesNum] = mesAlvo.split("-");
    const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const nomeMes = `${MESES[Number(mesNum)-1]} ${ano}`;

    // ── Buscar: Claude com MCP Gmail + Drive ─────────────────
    if (action === "buscar") {
      if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY não configurada no Vercel");

      const prompt = `Você é um assistente contábil da Digoo Brasil. Faça o fechamento de NFS-e de ${nomeMes}.

PASSO 1 — Busque no Gmail:
- Query principal: (NFS-e OR "nota fiscal de serviço" OR nfse) after:${ano}/${mesNum}/01 before:${ano}/${mesNum}/31
- Query Resicon: from:leonardo@resicontabilidade.com.br after:${ano}/${mesNum}/01 before:${ano}/${mesNum}/31
- Para cada email encontrado, leia o conteúdo completo para extrair: número da NF, valor, data de emissão, CNPJ do prestador, nome do prestador, descrição do serviço

PASSO 2 — Busque no Google Drive:
- Pasta pai ID: 1urmoc9OshM2NMU4SwET24bDFcxNly1XU
- Procure a subpasta "NFS-e ${nomeMes}" e liste todos os arquivos
- Para cada arquivo PDF, tente extrair os dados da nota

PASSO 3 — Monte o consolidado:
Organize TODAS as notas encontradas em formato JSON com esta estrutura exata:
{
  "notas": [
    {
      "fornecedor": "Nome do Prestador",
      "cnpj": "XX.XXX.XXX/XXXX-XX",
      "numero": "número da NF",
      "servico": "descrição do serviço",
      "valor": "valor em reais (ex: 1234.56)",
      "emissao": "DD/MM/AAAA",
      "fonte": "Gmail" ou "Drive"
    }
  ],
  "faltantes": ["lista de fornecedores fixos não encontrados"],
  "avisos": ["avisos importantes, ex: possível duplicata, LWSA novo fornecedor, etc"]
}

Fornecedores fixos esperados todo mês (verifique se estão presentes):
- MercadoPago (CNPJ 10.573.521/0001-91) — vem da Prefeitura de Osasco
- Ebazar/ML (vários CNPJs 03.007.331 e 14.679.809) — vem da Prefeitura de Osasco
- Mercado Turbo (CNPJ 25.328.037/0001-74) — Prefeitura de Caxias do Sul
- Resicon Contabilidade (CNPJ 36.537.334/0001-46) — email do Leonardo Jung
- Coworka Alphaville (CNPJ 60.447.977/0001-83)
- RL Net Internet (CNPJ 09.506.894/0001-60)
- Doctor Clin (CNPJ 01.387.625/0001-10) — NÃO vem por email, verificar Drive

EXCLUIR sempre: Log House, Kaizen RS, Entech Informática (NF de devolução de produto).

Retorne APENAS o JSON, sem texto adicional.`;

      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "mcp-client-2025-04-04",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          mcp_servers: [
            {
              type: "url",
              url: "https://gmailmcp.googleapis.com/mcp/v1",
              name: "gmail-mcp",
              authorization_token: token.access_token,
            },
            {
              type: "url",
              url: "https://drivemcp.googleapis.com/mcp/v1",
              name: "drive-mcp",
              authorization_token: token.access_token,
            },
          ],
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        throw new Error(`Claude API erro ${claudeRes.status}: ${errText.slice(0, 200)}`);
      }

      const claudeData = await claudeRes.json();

      // Extrai o texto da resposta
      const textoResposta = claudeData.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      // Parse do JSON
      let resultado;
      try {
        const jsonMatch = textoResposta.match(/\{[\s\S]*\}/);
        resultado = JSON.parse(jsonMatch ? jsonMatch[0] : textoResposta);
      } catch(e) {
        throw new Error(`Erro ao parsear resposta do Claude: ${textoResposta.slice(0, 300)}`);
      }

      return res.json({ ok: true, mes: mesAlvo, ...resultado });
    }

    // ── Gerar CSV ─────────────────────────────────────────────
    if (action === "csv") {
      const body  = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const csv   = gerarCSV(body.nfses || [], mesAlvo);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="contas_pagar_${mesAlvo}.csv"`);
      return res.send("\uFEFF" + csv);
    }

    // ── Criar rascunho Gmail ──────────────────────────────────
    if (action === "rascunho") {
      const body   = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { para, assunto, corpo } = body;
      const emailRaw = [`To: ${para}`, `Subject: ${assunto}`, `Content-Type: text/plain; charset=utf-8`, ``, corpo].join("\n");
      const emailB64 = Buffer.from(emailRaw).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
      const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
        method: "POST",
        headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { raw: emailB64 } }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Erro ao criar rascunho");
      return res.json({ ok: true, draftId: d.id });
    }

    return res.status(400).json({ error: "Ação inválida" });

  } catch(e) {
    console.error("google handler error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
