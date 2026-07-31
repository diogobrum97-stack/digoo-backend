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
    authUrl.searchParams.set("scope",         "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose");
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

    // Extrair dados de PDF via texto (pdf-parse) + regex — sem depender de IA
    if(action === "extractPdf") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { base64, nome } = body;
      console.log("extractPdf chamado — body keys:", Object.keys(body), "base64 length:", base64?.length || 0);
      if(!base64) return res.status(400).json({error:"base64 obrigatório", bodyKeys: Object.keys(body), bodyType: typeof req.body});

      try {
        const { createRequire } = await import("module");
        const require = createRequire(import.meta.url);
        const pdfParse = require("pdf-parse");
        const pdfBuffer = Buffer.from(base64, "base64");
        const data = await pdfParse(pdfBuffer);
        const texto = data.text || "";

        // Extrair valor — busca "Valor Líquido" ou "Valor Total" ou "Valor do Serviço"
        let valor = 0;
        const valorPatterns = [
          /Valor L[íi]quido da NFS-?e[\s\S]{0,30}R\$\s*([\d.,]+)/i,
          /Valor L[íi]quido[\s\S]{0,20}R\$\s*([\d.,]+)/i,
          /VALOR TOTAL[\s\S]{0,20}R\$\s*([\d.,]+)/i,
          /Valor do Servi[çc]o[\s\S]{0,20}R\$\s*([\d.,]+)/i,
          /R\$\s*([\d]{1,3}(?:\.\d{3})*,\d{2})/g,
        ];
        for(const pat of valorPatterns) {
          const m = texto.match(pat);
          if(m) {
            const raw = m[1].replace(/\./g,"").replace(",",".");
            const v = parseFloat(raw);
            if(v > 0) { valor = v; break; }
          }
        }

        // Extrair competência — busca data de emissão ou competência
        let competencia = "";
        const compPatterns = [
          /Compet[êe]ncia da NFS-?e[\s\S]{0,10}(\d{2}\/\d{2}\/\d{4})/i,
          /Data[\s\S]{0,20}emiss[ãa]o[\s\S]{0,10}(\d{2}\/\d{2}\/\d{4})/i,
          /(\d{2}\/\d{2}\/\d{4})/,
        ];
        for(const pat of compPatterns) {
          const m = texto.match(pat);
          if(m) {
            const parts = m[1].split("/");
            if(parts.length === 3) { competencia = `${parts[1]}/${parts[2]}`; break; }
          }
        }

        console.log("extractPdf — valor:", valor, "comp:", competencia, "texto preview:", texto.slice(0,200));
        return res.json({ ok: true, valor, competencia });

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

