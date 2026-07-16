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

// ── Gmail: busca mensagens ────────────────────────────────────
async function gmailSearch(accessToken, query, maxResults = 30) {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const d = await r.json();
  return d.messages || [];
}

// ── Gmail: lê conteúdo completo de uma mensagem ───────────────
async function gmailGetMessage(accessToken, messageId) {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return r.json();
}

function extrairTextoEmail(msg) {
  const headers = msg.payload?.headers || [];
  const get = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || "";
  const from    = get("From");
  const subject = get("Subject");
  const date    = get("Date");

  // Extrai body recursivamente
  function getBody(part) {
    if (!part) return "";
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64").toString("utf-8");
    }
    if (part.mimeType === "text/html" && part.body?.data) {
      const html = Buffer.from(part.body.data, "base64").toString("utf-8");
      return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    }
    if (part.parts) {
      for (const p of part.parts) {
        const text = getBody(p);
        if (text) return text;
      }
    }
    return "";
  }

  const body = getBody(msg.payload);
  return { from, subject, date, body: body.slice(0, 3000), messageId: msg.id };
}

// ── Drive: lista arquivos de uma pasta ───────────────────────
async function driveListFolder(accessToken, parentId) {
  const query = encodeURIComponent(`'${parentId}' in parents and trashed=false`);
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,createdTime)&pageSize=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const d = await r.json();
  return d.files || [];
}

// ── Drive: encontra subpasta por nome ────────────────────────
async function driveFindFolder(accessToken, parentId, nomePasta) {
  const query = encodeURIComponent(`'${parentId}' in parents and name='${nomePasta}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const d = await r.json();
  return d.files?.[0] || null;
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

  // ── OAuth callback ────────────────────────────────────────
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
      return res.send(`<html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><div style="font-size:48px;">✓</div><h2 style="color:#3dd68c;">Google conectado!</h2><p style="color:#888;">Pode fechar esta aba.</p></div></body></html>`);
    } catch(e) {
      return res.send(`<html><body style="color:#f87171;padding:40px;">${e.message}</body></html>`);
    }
  }

  if (error) return res.send(`<html><body style="color:#f87171;padding:40px;">Erro: ${error}</body></html>`);

  try {
    const token   = await getGoogleToken();
    const at      = token.access_token;
    const mesAlvo = mes || new Date().toISOString().slice(0, 7);
    const [ano, mesNum] = mesAlvo.split("-");
    const MESES   = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const nomeMes = `${MESES[Number(mesNum)-1]} ${ano}`;
    const dtInicio = `${ano}/${mesNum}/01`;
    const dtFim    = `${ano}/${mesNum}/31`;

    // ── Buscar NFS-e ─────────────────────────────────────────
    if (action === "buscar") {
      if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY não configurada");

      // 1) Busca emails no Gmail
      const [msgsNFSe, msgsResicon] = await Promise.all([
        gmailSearch(at, `(NFS-e OR nfse OR "nota fiscal de serviço") after:${dtInicio} before:${dtFim}`, 30),
        gmailSearch(at, `from:leonardo@resicontabilidade.com.br after:${dtInicio} before:${dtFim}`, 5),
      ]);

      // Deduplica e lê conteúdo dos emails (máx 20 pra não estourar tempo)
      const todosIds = [...new Set([...msgsNFSe, ...msgsResicon].map(m => m.id))].slice(0, 20);
      const emails = await Promise.all(todosIds.map(id => gmailGetMessage(at, id)));
      const emailsTexto = emails.map(extrairTextoEmail);

      // 2) Busca pasta do Drive
      const PASTA_PAI = "1urmoc9OshM2NMU4SwET24bDFcxNly1XU";
      const subpasta  = await driveFindFolder(at, PASTA_PAI, `NFS-e ${nomeMes}`);
      let arquivosDrive = [];
      if (subpasta) {
        arquivosDrive = await driveListFolder(at, subpasta.id);
      }

      // 3) Monta contexto pro Claude
      const contextoEmails = emailsTexto.map((e, i) =>
        `EMAIL ${i+1}:\nDe: ${e.from}\nAssunto: ${e.subject}\nData: ${e.date}\nConteúdo:\n${e.body}`
      ).join("\n\n---\n\n");

      const contextoDrive = arquivosDrive.length > 0
        ? `ARQUIVOS NO DRIVE (pasta "NFS-e ${nomeMes}"):\n${arquivosDrive.map(f => `- ${f.name} (id: ${f.id})`).join("\n")}`
        : `Pasta "NFS-e ${nomeMes}" não encontrada ou vazia no Drive.`;

      const prompt = `Você é um assistente contábil da Digoo Brasil. Analise os emails e arquivos do Drive abaixo e monte o consolidado de NFS-e de ${nomeMes}.

${contextoEmails}

---

${contextoDrive}

---

INSTRUÇÕES:
1. Extraia TODAS as notas fiscais de serviço encontradas
2. Para cada nota, identifique: fornecedor, CNPJ, número da NF, descrição do serviço, valor em R$, data de emissão
3. Agrupe notas do mesmo fornecedor quando fizer sentido (ex: várias Ebazar)
4. Verifique fornecedores fixos esperados todo mês:
   - MercadoPago CNPJ 10.573.521/0001-91 (vem da Prefeitura de Osasco)
   - Ebazar/ML vários CNPJs 03.007.331/xxxx e 14.679.809/xxxx (Prefeitura de Osasco)
   - Mercado Turbo CNPJ 25.328.037/0001-74 (Prefeitura de Caxias do Sul)
   - Resicon Contabilidade CNPJ 36.537.334/0001-46 (email do Leonardo Jung)
   - Coworka Alphaville CNPJ 60.447.977/0001-83
   - RL Net Internet CNPJ 09.506.894/0001-60
   - Doctor Clin CNPJ 01.387.625/0001-10 (só aparece no Drive, não vem por email)
5. EXCLUIR sempre: Log House, Kaizen RS, Entech Informática
6. Avise sobre possíveis duplicatas ou fornecedores novos não reconhecidos

Retorne APENAS JSON válido neste formato exato:
{
  "notas": [
    {
      "fornecedor": "Nome do Prestador",
      "cnpj": "XX.XXX.XXX/XXXX-XX",
      "numero": "número da NF",
      "servico": "descrição do serviço",
      "valor": "1234.56",
      "emissao": "DD/MM/AAAA",
      "fonte": "Gmail"
    }
  ],
  "faltantes": ["nomes dos fornecedores fixos não encontrados"],
  "avisos": ["avisos importantes"]
}`;

      // 4) Chama Claude
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        throw new Error(`Claude API erro ${claudeRes.status}: ${errText.slice(0, 300)}`);
      }

      const claudeData = await claudeRes.json();
      const textoResposta = claudeData.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      let resultado;
      try {
        const jsonMatch = textoResposta.match(/\{[\s\S]*\}/);
        resultado = JSON.parse(jsonMatch ? jsonMatch[0] : textoResposta);
      } catch(e) {
        throw new Error(`Erro ao parsear resposta: ${textoResposta.slice(0, 400)}`);
      }

      return res.json({
        ok: true,
        mes: mesAlvo,
        emailsLidos: todosIds.length,
        arquivosDrive: arquivosDrive.length,
        pastaDrive: subpasta ? `NFS-e ${nomeMes}` : null,
        ...resultado,
      });
    }

    // ── Gerar CSV ─────────────────────────────────────────────
    if (action === "csv") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const csv  = gerarCSV(body.nfses || [], mesAlvo);
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
        headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
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
