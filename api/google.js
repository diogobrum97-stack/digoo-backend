export const config = { maxDuration: 30, api: { bodyParser: { sizeLimit: '10mb' } } };

const FIREBASE_URL  = process.env.FIREBASE_URL;
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = "https://digoo-backend.vercel.app/api/google";

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

  // OAuth
  if (action === "auth" || (!action && !code)) {
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id",     CLIENT_ID);
    authUrl.searchParams.set("redirect_uri",  REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope",         "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/drive.file");
    authUrl.searchParams.set("access_type",   "offline");
    authUrl.searchParams.set("prompt",        "consent");
    return res.redirect(authUrl.toString());
  }

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
    const mesAlvo = mes || new Date().toISOString().slice(0, 7);
    const [ano, mesNum] = mesAlvo.split("-");
    const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const nomeMes = `${MESES[Number(mesNum)-1]} ${ano}`;

    // Gerar CSV
    if (action === "csv") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const csv  = gerarCSV(body.nfses || [], mesAlvo);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="contas_pagar_${mesAlvo}.csv"`);
      return res.send("\uFEFF" + csv);
    }

    // Criar rascunho Gmail
    if (action === "rascunho") {
      const token = await getGoogleToken();
      const body  = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
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


    // Upload de arquivo para o Google Drive
    if (action === "uploadDrive") {
      const token = await getGoogleToken();
      const body  = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { nome, base64: fileBase64, mimeType, pastaPath } = body;

      // Garante/cria estrutura de pastas
      async function getOrCreateFolder(name, parentId) {
        const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
        const searchResp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`, {
          headers: { Authorization: `Bearer ${token.access_token}` }
        });
        const searchData = await searchResp.json();
        if(searchData.files && searchData.files.length > 0) return searchData.files[0].id;
        const createResp = await fetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] })
        });
        const createData = await createResp.json();
        return createData.id;
      }

      // Navega/cria pasta por path
      let parentId = "root";
      for(const part of pastaPath.split("/")) {
        if(part.trim()) parentId = await getOrCreateFolder(part.trim(), parentId);
      }

      // Upload do arquivo
      const fileBuffer = Buffer.from(fileBase64, "base64");
      const boundary = "boundary_digoo_upload";
      const metaJson = JSON.stringify({ name: nome, parents: [parentId] });
      const multipart = Buffer.concat([
        Buffer.from(`--${boundary}
Content-Type: application/json; charset=UTF-8

${metaJson}
--${boundary}
Content-Type: ${mimeType}

`),
        fileBuffer,
        Buffer.from(`
--${boundary}--`)
      ]);
      const uploadResp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
          "Content-Length": multipart.length
        },
        body: multipart
      });
      const uploadData = await uploadResp.json();
      if(!uploadResp.ok) throw new Error(uploadData.error?.message || "Erro no upload");

      // Tornar publico pra visualização no iframe
      await fetch(`https://www.googleapis.com/drive/v3/files/${uploadData.id}/permissions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" })
      });

      return res.json({
        ok: true,
        driveId: uploadData.id,
        driveUrl: uploadData.webViewLink,
        viewUrl: `https://drive.google.com/file/d/${uploadData.id}/preview`
      });
    }

    // Extrair dados de PDF via Claude API (backend tem a chave)
    if(action === "extractPdf") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { base64, nome } = body;
      if(!base64) return res.status(400).json({error:"base64 obrigatório"});

      // Tenta os dois nomes possíveis da variável (com e sem typo)
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPI_API_KEY;
      if(!ANTHROPIC_KEY) return res.status(500).json({error:"ANTHROPIC_API_KEY não configurada"});

      try {
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
1. valor: valor total líquido em reais (número apenas, ex: 2225.00)
2. competencia: no formato MM/AAAA — use a data de emissão se não houver competência explícita
3. prestador: nome do emitente/prestador do serviço
4. numeroNF: número da NF/NFS-e
5. cnpj: CNPJ do emitente/prestador (formato XX.XXX.XXX/XXXX-XX)

Responda APENAS em JSON sem texto extra:
{"valor": 2225.00, "competencia": "07/2026", "prestador": "Nome Empresa", "numeroNF": "12", "cnpj": "58.350.709/0001-05"}` }
              ]
            }]
          })
        });

        const iaData = await iaResp.json();
        console.log("Claude response:", JSON.stringify(iaData).slice(0,300));
        const texto = iaData.content?.[0]?.text || "{}";
        const clean = texto.replace(/```json|```/g,"").trim();
        const result = JSON.parse(clean);
        return res.json({ ok: true, valor: result.valor || 0, competencia: result.competencia || "" });

      } catch(e) {
        console.error("extractPdf error:", e.message);
        return res.status(500).json({ ok: false, error: e.message, valor: 0, competencia: "" });
      }
    }

    return res.status(400).json({ error: "Ação inválida" });

  } catch(e) {
    console.error("google error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}


