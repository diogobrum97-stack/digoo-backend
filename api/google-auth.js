export const config = { maxDuration: 60 };

const FIREBASE_URL  = process.env.FIREBASE_URL;
const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// ── Fornecedores fixos esperados todo mês ─────────────────────────────────────
const FORNECEDORES_FIXOS = [
  { nome: "MercadoPago",          cnpj: "10.573.521/0001-91" },
  { nome: "Ebazar/ML (0001-41)",  cnpj: "14.679.809/0001-41" },
  { nome: "Ebazar/ML (0015-47)",  cnpj: "14.679.809/0015-47" },
  { nome: "Ebazar/ML (0043-09)",  cnpj: "03.007.331/0043-09" },
  { nome: "Mercado Turbo",        cnpj: "25.328.037/0001-74" },
  { nome: "Resicon Contabilidade",cnpj: "36.537.334/0001-46" },
  { nome: "Coworka Alphaville",   cnpj: "60.447.977/0001-83" },
  { nome: "RL Net Internet",      cnpj: "09.506.894/0001-60" },
  { nome: "Doctor Clin",          cnpj: "01.387.625/0001-10", manual: true },
];

// ── Renova token Google via refresh_token ─────────────────────────────────────
async function renovarTokenGoogle(token) {
  if (!token.refresh_token) throw new Error("Sem refresh_token — reconecte o Google");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
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
  // Renova se expirou (expira em ~1h)
  const expiredAt = (token.saved_at || 0) + (token.expires_in || 3600) * 1000;
  if (Date.now() > expiredAt - 60000) token = await renovarTokenGoogle(token);
  return token;
}

// ── Gmail: busca emails com NFS-e ─────────────────────────────────────────────
async function buscarEmailsNFSe(accessToken, mes) {
  // mes = "2026-06" → busca no período
  const [ano, mesNum] = mes.split("-");
  const dataInicio = `${ano}/${mesNum}/01`;
  const ultimoDia = new Date(Number(ano), Number(mesNum), 0).getDate();
  const dataFim   = `${ano}/${mesNum}/${ultimoDia}`;

  const query = encodeURIComponent(
    `(NFS-e OR "nota fiscal de serviço" OR "nfse" OR subject:NFS) after:${dataInicio} before:${dataFim}`
  );

  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const d = await r.json();
  return d.messages || [];
}

// ── Gmail: detalhe de um email ────────────────────────────────────────────────
async function detalheEmail(accessToken, messageId) {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const d = await r.json();
  const headers = d.payload?.headers || [];
  const get = (name) => headers.find(h => h.name === name)?.value || "";

  // Extrai anexos PDF
  const anexos = [];
  function walkParts(parts) {
    if (!parts) return;
    for (const p of parts) {
      if (p.filename && p.filename.toLowerCase().endsWith(".pdf")) {
        anexos.push({ nome: p.filename, attachmentId: p.body?.attachmentId, messageId });
      }
      if (p.parts) walkParts(p.parts);
    }
  }
  walkParts(d.payload?.parts);

  return {
    id: messageId,
    from: get("From"),
    subject: get("Subject"),
    date: get("Date"),
    anexos,
  };
}

// ── Drive: busca NFS-e na pasta do mês ───────────────────────────────────────
async function buscarDriveNFSe(accessToken, mes) {
  const [ano, mesNum] = mes.split("-");
  const mesesNomes = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const nomeMes = mesesNomes[Number(mesNum) - 1];
  const nomePasta = `NFS-e ${nomeMes} ${ano}`;

  // Busca a pasta
  const pastaQuery = encodeURIComponent(`name='${nomePasta}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const rPasta = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${pastaQuery}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const dPasta = await rPasta.json();
  const pasta  = dPasta.files?.[0];
  if (!pasta) return { pasta: nomePasta, encontrada: false, arquivos: [] };

  // Lista arquivos da pasta
  const arquivosQuery = encodeURIComponent(`'${pasta.id}' in parents and trashed=false`);
  const rArq = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${arquivosQuery}&fields=files(id,name,mimeType,createdTime)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const dArq = await rArq.json();
  return { pasta: nomePasta, pastaId: pasta.id, encontrada: true, arquivos: dArq.files || [] };
}

// ── Gera CSV Bling (contas a pagar) ──────────────────────────────────────────
function gerarCSV(nfses) {
  const linhas = [
    "Fornecedor;CNPJ;Valor;Vencimento;Competência;Situação;Portador;Histórico"
  ];
  for (const nf of nfses) {
    const cnpjFormatado = String(nf.cnpj || "").replace(/\D/g,"").replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,"$1.$2.$3/$4-$5");
    const valor = String(nf.valor || "0").replace(".", ",");
    linhas.push([
      nf.fornecedor,
      cnpjFormatado,
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

  const { action, mes } = req.query;
  const mesAlvo = mes || new Date().toISOString().slice(0, 7); // "2026-07"

  try {
    const token = await getGoogleToken();
    const { access_token } = token;

    // ── Ação: buscar NFS-e ─────────────────────────────────────────────────
    if (action === "buscar" || !action) {
      const [mensagensGmail, drive] = await Promise.all([
        buscarEmailsNFSe(access_token, mesAlvo),
        buscarDriveNFSe(access_token, mesAlvo),
      ]);

      // Detalha emails (máx 20)
      const emails = [];
      for (const msg of mensagensGmail.slice(0, 20)) {
        const det = await detalheEmail(access_token, msg.id);
        emails.push(det);
      }

      // Checklist de fornecedores fixos
      const emailsTexto = emails.map(e => `${e.from} ${e.subject}`).join(" ").toLowerCase();
      const driveTexto  = drive.arquivos.map(a => a.name).join(" ").toLowerCase();
      const checklist = FORNECEDORES_FIXOS.map(f => {
        const nome = f.nome.toLowerCase();
        const cnpj = f.cnpj.replace(/\D/g,"");
        const encontrado = emailsTexto.includes(nome) || driveTexto.includes(nome) || driveTexto.includes(cnpj);
        return { ...f, encontrado, alerta: f.manual && !encontrado };
      });

      return res.json({
        ok: true,
        mes: mesAlvo,
        emails: emails.map(e => ({ id: e.id, from: e.from, subject: e.subject, date: e.date, anexos: e.anexos.length })),
        drive,
        checklist,
        doctorClin: !checklist.find(f => f.nome === "Doctor Clin")?.encontrado,
      });
    }

    // ── Ação: gerar CSV ────────────────────────────────────────────────────
    if (action === "csv") {
      const body = req.body || {};
      const nfses = body.nfses || [];
      const csv = gerarCSV(nfses);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="contas_pagar_${mesAlvo}.csv"`);
      return res.send("\uFEFF" + csv); // BOM para Excel reconhecer UTF-8
    }

    // ── Ação: criar rascunho Gmail ─────────────────────────────────────────
    if (action === "rascunho") {
      const body = req.body || {};
      const { para, assunto, corpo } = body;

      const emailRaw = [
        `To: ${para}`,
        `Subject: ${assunto}`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        corpo,
      ].join("\n");

      const emailBase64 = Buffer.from(emailRaw).toString("base64")
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: { raw: emailBase64 } }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Erro ao criar rascunho");
      return res.json({ ok: true, draftId: d.id });
    }

    return res.status(400).json({ error: "Ação inválida" });

  } catch(e) {
    console.error("fechamento-mensal error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}
