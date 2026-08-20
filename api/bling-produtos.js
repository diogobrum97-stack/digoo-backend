export const config = {
  maxDuration: 60,
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  try {
    const r = await fetch(`${process.env.FIREBASE_URL}/bling_token.json`);
    const token = await r.json();
    if (!token || !token.access_token) throw new Error("Bling não conectado");
    
    // Verificar se o token expirou (expires_in é em segundos, saved_at em ms)
    const savedAt = token.saved_at || 0;
    const expiresIn = (token.expires_in || 3600) * 1000;
    const expirou = Date.now() > savedAt + expiresIn - 60000; // 1 min de margem
    if (expirou) {
      return res.status(401).json({ erro: "Token Bling expirado — reconecte em Config → APIs" });
    }
    const headers = {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/json",
    };

    // ── Debug: ver estrutura raw de um produto no Bling ──────────────────────
    if (req.query.action === 'debug-produto' && req.query.sku) {
      const sku = req.query.sku;
      const buscaResp = await fetch(`https://www.bling.com.br/Api/v3/produtos?codigo=${encodeURIComponent(sku)}&limite=5`, { headers });
      const buscaData = await buscaResp.json();
      const encontrado = (buscaData.data || []).find(p => String(p.codigo || '').trim() === sku.trim()) || (buscaData.data || [])[0];
      if (!encontrado) return res.json({ erro: 'nao encontrado', buscaData });
      const detResp = await fetch(`https://www.bling.com.br/Api/v3/produtos/${encontrado.id}`, { headers });
      const det = await detResp.json();
      return res.json({ ok: true, keys: Object.keys(det.data || {}), estrutura: det.data?.estrutura, composicao: det.data?.composicao, componentes: det.data?.componentes, raw: det.data });
    }


    // ── Debug: ver campos de custo/estoque de um produto ──────────────────────
    if (req.query.action === 'debug-custo' && req.query.sku) {
      const sku = req.query.sku;
      const busca = await fetch(`https://www.bling.com.br/Api/v3/produtos?codigo=${encodeURIComponent(sku)}&limite=3`, { headers });
      const buscaData = await busca.json();
      const prod = (buscaData.data || []).find(p => String(p.codigo||'').trim() === sku.trim()) || (buscaData.data||[])[0];
      if (!prod) return res.json({ erro: 'nao encontrado' });
      
      // Busca detalhe do produto
      const det = await fetch(`https://www.bling.com.br/Api/v3/produtos/${prod.id}`, { headers });
      const detData = (await det.json()).data || {};
      
      // Busca estoque do produto
      const est = await fetch(`https://www.bling.com.br/Api/v3/estoques?idProduto=${prod.id}`, { headers });
      const estData = await est.json();
      
      // Busca saldo em estoque
      const saldo = await fetch(`https://www.bling.com.br/Api/v3/produtos/${prod.id}/estoques`, { headers });
      const saldoData = await saldo.json();

      return res.json({
        ok: true,
        precoCusto: detData.fornecedor?.precoCusto,
        preco: detData.preco,
        fornecedor: detData.fornecedor,
        estoqueKeys: Object.keys(estData.data?.[0] || {}),
        estoqueRaw: estData.data?.[0],
        saldoKeys: Object.keys(saldoData.data?.[0] || {}),
        saldoRaw: saldoData.data?.[0],
      });
    }
    // ── Desmembrar kits do Full — extrai componentes via Bling ───────────────
    if (req.query.action === 'desmembrar-kits-full' && req.method === 'POST') {
      const { itens } = req.body;
      if (!itens?.length) return res.status(400).json({ erro: 'Itens obrigatórios' });
      const resultado = [];
      for (const item of itens) {
        const { sku, descricao, quantidade } = item;
        await sleep(200);
        const buscaResp = await fetch(`https://www.bling.com.br/Api/v3/produtos?codigo=${encodeURIComponent(sku)}&limite=5`, { headers });
        if (!buscaResp.ok) { resultado.push({ sku, descricao, quantidade, tipo: 'erro', motivo: `Bling ${buscaResp.status}` }); continue; }
        const buscaData = await buscaResp.json();
        const encontrado = (buscaData.data || []).find(p => String(p.codigo || '').trim() === sku.trim()) || (buscaData.data || [])[0];
        if (!encontrado) { resultado.push({ sku, descricao, quantidade, tipo: 'nao_encontrado' }); continue; }
        await sleep(200);
        const detResp = await fetch(`https://www.bling.com.br/Api/v3/produtos/${encontrado.id}`, { headers });
        if (!detResp.ok) { resultado.push({ sku, descricao, quantidade, tipo: 'erro' }); continue; }
        const prod = (await detResp.json()).data || {};
        // Componentes vêm só com id — busca detalhe de cada um
        const componentes = prod.estrutura?.componentes || [];
        const custo = Number(prod.fornecedor?.precoCusto || prod.preco || 0);
        const ncm = String(prod.tributacao?.ncm || '').replace(/[^0-9]/g, '');
        if (componentes.length > 0) {
          for (const comp of componentes) {
            const compId = comp.produto?.id;
            const compQtd = Number(comp.quantidade || 1) * quantidade;
            if (!compId) continue;
            await sleep(200);
            const compResp = await fetch(`https://www.bling.com.br/Api/v3/produtos/${compId}`, { headers });
            if (!compResp.ok) continue;
            const compData = (await compResp.json()).data || {};
            const compSku = compData.codigo || '';
            const compDescricao = compData.nome || compData.descricao || compSku;
            const compCusto = Number(compData.fornecedor?.precoCusto || compData.preco || 0);
            const compNcm = String(compData.tributacao?.ncm || '').replace(/[^0-9]/g, '');
            resultado.push({ sku: compSku, descricao: compDescricao, quantidade: compQtd, custo: compCusto, ncm: compNcm, tipo: 'componente', kitOrigem: sku });
          }
        } else {
          resultado.push({ sku, descricao: prod.nome || prod.descricao || descricao, quantidade, custo, ncm, tipo: 'simples' });
        }
      }
      // Agrupa mesmo SKU de kits diferentes
      const map = {};
      for (const r of resultado) {
        if (!r.sku) continue;
        if (map[r.sku]) { map[r.sku].quantidade += r.quantidade; }
        else { map[r.sku] = { ...r }; }
      }
      return res.json({ ok: true, itens: Object.values(map) });
    }

    // ── Emitir NF de Transferência Full ──────────────────────────────────────
    if (req.query.action === 'emitir-nf-transferencia' && req.method === 'POST') {
      const { itens, naturezaId } = req.body;
      if (!itens?.length) return res.status(400).json({ erro: 'Itens obrigatórios' });
      const payload = {
        tipo: 1, finalidade: 1,
        naturezaOperacao: { id: Number(naturezaId || 15109130797) },
        itens: itens.map(it => ({
          codigo: it.sku, descricao: it.descricao, unidade: 'UN',
          quantidade: it.quantidade, valor: Number(it.custo || 0),
          cfop: '6152', ncm: String(it.ncm || '').replace(/\D/g, ''),
        })),
      };
      const resp = await fetch('https://www.bling.com.br/Api/v3/nfe', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const respData = await resp.json();
      if (!resp.ok) return res.status(resp.status).json({ erro: respData.error?.description || 'Erro Bling', detalhe: respData });
      const nfeId = respData.data?.id;
      if (!nfeId) return res.status(500).json({ erro: 'NF criada sem ID', raw: respData });
      const envioResp = await fetch(`https://www.bling.com.br/Api/v3/nfe/${nfeId}/enviar`, { method: 'POST', headers });
      const envioData = await envioResp.json();
      return res.json({ ok: true, nfeId, numero: respData.data?.numero || null, chaveAcesso: envioData.data?.chaveAcesso || null, status: envioData.data?.situacao || null });
    }

    // ── Emitir NF Complementar de IPI ────────────────────────────────────────
    if (req.query.action === 'emitir-complementar-ipi' && req.method === 'POST') {
      const { itens, chaveRefOriginal, numeroOriginal, naturezaId } = req.body;
      if (!itens?.length) return res.status(400).json({ erro: 'Itens obrigatórios' });
      const payload = {
        tipo: 1, finalidade: 3,
        naturezaOperacao: { id: naturezaId || null },
        notasReferenciadas: chaveRefOriginal ? [{ chave: chaveRefOriginal }] : [],
        itens: itens.map(it => ({
          codigo: it.sku, descricao: it.descricao || it.produto, unidade: 'UN',
          quantidade: it.quantidade, valor: 0, cfop: '6152',
          ncm: String(it.ncm || '').replace(/\D/g, ''),
          ipi: { situacaoTributaria: '50', aliquota: it.aliquota, valor: it.valorIpi },
        })),
      };
      const resp = await fetch('https://www.bling.com.br/Api/v3/nfe', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const respData = await resp.json();
      if (!resp.ok) return res.status(resp.status).json({ erro: respData.error?.description || 'Erro Bling', detalhe: respData });
      const nfeId = respData.data?.id;
      if (!nfeId) return res.status(500).json({ erro: 'NF criada sem ID', raw: respData });
      const envioResp = await fetch(`https://www.bling.com.br/Api/v3/nfe/${nfeId}/enviar`, { method: 'POST', headers });
      const envioData = await envioResp.json();
      return res.json({ ok: true, nfeId, numero: respData.data?.numero || null, chaveAcesso: envioData.data?.chaveAcesso || null, status: envioData.data?.situacao || null });
    }

    // ── Extrair SKUs do PDF via Claude ────────────────────────────────────────
    if (req.query.action === 'extrair-pdf-full' && req.method === 'POST') {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ erro: 'pdfBase64 obrigatório' });

      // Usa Claude só para associar SKU -> quantidade a partir do texto do PDF
      // Os SKUs são extraídos pelo Claude mas mandamos o texto completo para ele
      // interpretar a tabela corretamente
      const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
              { type: 'text', text: 'Este é um PDF de instrucoes de preparacao de envio Full do Mercado Livre. Extraia todos os itens com SKU e quantidade. O SKU aparece no formato "SKU: XXXX-YYYY-ZZZZ" - copie EXATAMENTE como está, incluindo todos os hifens. A quantidade é o número na coluna UNIDADES. Retorne APENAS um JSON array puro sem markdown: [{"sku":"WC-HDC-PRETO","descricao":"Water Cooler...","quantidade":38}]. Nada além do JSON.' }
            ]
          }]
        })
      });

      const claudeRespText = await claudeResp.text();
      if (!claudeResp.ok) {
        return res.status(500).json({ erro: 'Erro Claude API status ' + claudeResp.status + ': ' + claudeRespText.slice(0, 300) });
      }
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada no Vercel' });
      }
      const claudeData = JSON.parse(claudeRespText);
      const rawText = claudeData.content?.[0]?.text || '[]';
      const clean = rawText.replace(/\`\`\`json|\`\`\`/g, '').trim();
      const match = clean.match(/\[\s\S]*\]/);
      if (!match) return res.status(500).json({ erro: 'Claude nao retornou JSON valido', raw: rawText.slice(0, 300) });
      const itens = JSON.parse(match[0]);
      return res.json({ ok: true, itens });
    }

