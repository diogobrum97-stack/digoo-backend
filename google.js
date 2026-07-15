export const config = { maxDuration: 60 };

const FIREBASE_URL  = process.env.FIREBASE_URL;
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = "https://digoo-backend.vercel.app/api/google";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

// ── Fornecedores fixos esperados todo mês ─────────────────────────────────────
const FORNECEDORES_FIXOS = [
  { nome: "MercadoPago",           cnpj: "10.573.521/0001-91" },
  { nome: "Ebazar/ML (0001-41)",   cnpj: "14.679.809/0001-41" },
  { nome: "Ebazar/ML (0015-47)",   cnpj: "14.679.809/0015-47" },
  { nome: "Ebazar/ML (0043-09)",   cnpj: "03.007.331/0043-09" },
  { nome: "Mercado Turbo",         cnpj: "25.328.037/0001-74" },
  { nome: "Resicon Contabilidade", cnpj: "36.537.334/0001-46" },
  { nome: "Coworka Alphaville",    cnpj: "60.447.977/0001-83" },
  { nome: "RL Net Internet",       cnpj: "09.506.894/0001-60" },
  { nome: "Doctor Clin",           cnpj: "01.387.625/0001-10", manual: true },
];

// ── Token Google ──────────────────────────────────────────────────────────────
async function renovarTokenGoogle(token) {
  if (!token.refresh_token) throw new Error("Sem refresh_token — reconecte o Google");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type:    "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`Erro ao renovar token Google: ${await r.text()}`);
  const novo = await r.json();
  const atualizado = { ...token, access_token: novo.access_token, saved_at: Date.now() };
  await fetch(`${FIREBASE_URL}/google_token.json`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
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

// ── Gmail ─────────────────────────────────────────────────────────────────────
async function buscarEmailsNFSe(accessToken, mes) {
  const [ano, mesNum] = mes.split("-");
  const dataInicio = `${ano}/${mesNum}/01`;
  const ultimoDia  = new Date(Number(ano), Number(mesNum), 0).getDate();
  const dataFim    = `${ano}/${mesNum}/${ultimoDia}`;
  const query = encodeURIComponent(
    `(NFS-e OR "nota fiscal de serviço" OR nfse OR subject:NFS) after:${dataInicio} before:${dataFim}`
  );
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const d = await r.json();
  return d.messages || [];
}

async function detalheEmail(accessToken, messageId) {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const d = await r.json();
  const headers = d.payload?.headers || [];
  const get = (name) => headers.find(h => h.name === name)?.value || "";
  const anexos = [];
  function walkParts(parts) {
    if (!parts) return;
    for (const p of parts) {
      if (p.filename && p.filename.toLowerCase().endsWith(".pdf"))
        anexos.push({ nome: p.filename, attachmentId: p.body?.attachmentId, messageId });
      if (p.parts) walkParts(p.parts);
    }
  }
  walkParts(d.payload?.parts);
  return { id: messageId, from: get("From"), subject: get("Subject"), date: get("Date"), anexos };
}

// ── Drive ─────────────────────────────────────────────────────────────────────
async function buscarDriveNFSe(accessToken, mes) {
  const [ano, mesNum] = mes.split("-");
  const mesesNomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const nomeMes   = mesesNomes[Number(mesNum) - 1];
  const nomePasta = `NFS-e ${nomeMes} ${ano}`;
  const pastaQuery = encodeURIComponent(`name='${nomePasta}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const rPasta = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${pastaQuery}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const dPasta = await rPasta.json();
  const pasta  = dPasta.files?.[0];
  if (!pasta) return { pasta: nomePasta, encontrada: false, arquivos: [] };
  const arquivosQuery = encodeURIComponent(`'${pasta.id}' in parents and trashed=false`);
  const rArq = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${arquivosQuery}&fields=files(id,name,mimeType,createdTime)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const dArq = await rArq.json();
  return { pasta: nomePasta, pastaId: pasta.id, encontrada: true, arquivos: dArq.files || [] };
}

// ── CSV Bling ─────────────────────────────────────────────────────────────────
function gerarCSV(nfses) {
  const linhas = ["Fornecedor;CNPJ;Valor;Vencimento;Competência;Situação;Portador;Histórico"];
  for (const nf of nfses) {
    const valor = String(nf.valor || "0").replace(".", ",");
    linhas.push([
      nf.fornecedor,
      nf.cnpj || "",
      valor,
      nf.dataEmissao,
      nf.dataEmissao,
      "aberto",
      "Itaú",
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

  // ── OAuth passo 1: redireciona pro Google ─────────────────────────────────
  if (action === "auth" || (!action && !code)) {
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id",     CLIENT_ID);
    authUrl.searchParams.set("redirect_uri",  REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope",         SCOPES);
    authUrl.searchParams.set("access_type",   "offline");
    authUrl.searchParams.set("prompt",        "consent");
    authUrl.searchParams.set("state",         "digoo");
    return res.redirect(authUrl.toString());
  }

  // ── OAuth passo 2: callback com código ───────────────────────────────────
  if (code) {
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id:     CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri:  REDIRECT_URI,
          grant_type:    "authorization_code",
        }),
      });
      if (!tokenRes.ok) throw new Error(`Google token error: ${await tokenRes.text()}`);
      const tokenData = await tokenRes.json();
      tokenData.saved_at = Date.now();
      await fetch(`${FIREBASE_URL}/google_token.json`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokenData),
      });
      return res.send(`<html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><div style="font-size:48px;margin-bottom:16px;">✓</div><h2 style="color:#3dd68c;">Google conectado!</h2><p style="color:#888;">Pode fechar esta aba.</p></div></body></html>`);
    } catch(e) {
      return res.send(`<html><body style="font-family:sans-serif;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><div style="font-size:48px;">✗</div><h2 style="color:#f87171;">${e.message}</h2></div></body></html>`);
    }
  }

  if (error) return res.send(`<html><body style="color:#f87171;padding:40px;">Erro: ${error}</body></html>`);

  // ── Ações autenticadas ────────────────────────────────────────────────────
  try {
    const token = await getGoogleToken();
    const { access_token } = token;
    const mesAlvo = mes || new Date().toISOString().slice(0, 7);

    // Buscar NFS-e (Gmail + Drive + checklist)
    if (action === "buscar") {
      const [mensagensGmail, drive] = await Promise.all([
        buscarEmailsNFSe(access_token, mesAlvo),
        buscarDriveNFSe(access_token, mesAlvo),
      ]);
      const emails = [];
      for (const msg of mensagensGmail.slice(0, 20)) {
        emails.push(await detalheEmail(access_token, msg.id));
      }
      const emailsTexto = emails.map(e => `${e.from} ${e.subject}`).join(" ").toLowerCase();
      const driveTexto  = drive.arquivos.map(a => a.name).join(" ").toLowerCase();
      const checklist = FORNECEDORES_FIXOS.map(f => {
        const nome = f.nome.toLowerCase();
        const cnpj = f.cnpj.replace(/\D/g, "");
        const encontrado = emailsTexto.includes(nome) || driveTexto.includes(nome) || driveTexto.includes(cnpj);
        return { ...f, encontrado };
      });
      return res.json({
        ok: true, mes: mesAlvo,
        emails: emails.map(e => ({ id: e.id, from: e.from, subject: e.subject, date: e.date, anexos: e.anexos.length })),
        drive, checklist,
        doctorClin: !checklist.find(f => f.nome === "Doctor Clin")?.encontrado,
      });
    }

    // Gerar CSV
    if (action === "csv") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const csv  = gerarCSV(body.nfses || []);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="contas_pagar_${mesAlvo}.csv"`);
      return res.send("\uFEFF" + csv);
    }

    // Criar rascunho Gmail
    if (action === "rascunho") {
      const body   = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { para, assunto, corpo } = body;
      const emailRaw = [`To: ${para}`, `Subject: ${assunto}`, `Content-Type: text/plain; charset=utf-8`, ``, corpo].join("\n");
      const emailB64 = Buffer.from(emailRaw).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
      const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { raw: emailB64 } }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Erro ao criar rascunho");
      return res.json({ ok: true, draftId: d.id });
    }

    return res.status(400).json({ error: "Ação inválida. Use: auth, buscar, csv, rascunho" });

  } catch(e) {
    console.error("google handler error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
