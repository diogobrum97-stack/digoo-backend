export const config = {
  maxDuration: 60,
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mapa de categorias Bling (IDs fixos — plano de contas Digoo Brasil)
const CATEGORIAS_BLING = [
  { id: 14729399721, label: "COMPRAS → Antecipação de Importação", grupo: "COMPRAS" },
  { id: 14729394142, label: "DESPESAS OPERACIONAIS → Aluguel", grupo: "DESPESAS OPERACIONAIS" },
  { id: 14729402416, label: "DESPESAS OPERACIONAIS → Armazenagem", grupo: "DESPESAS OPERACIONAIS" },
  { id: 14632652910, label: "DESPESAS OPERACIONAIS → Fretes", grupo: "DESPESAS OPERACIONAIS" },
  { id: 14617756256, label: "DESPESAS OPERACIONAIS → Funcionários → Salário", grupo: "DESPESAS OPERACIONAIS" },
  { id: 14729594171, label: "DESPESAS OPERACIONAIS → Infraestrutura", grupo: "DESPESAS OPERACIONAIS" },
  { id: 14729584147, label: "DESPESAS OPERACIONAIS → Insumos", grupo: "DESPESAS OPERACIONAIS" },
  { id: 14729584900, label: "DESPESAS OPERACIONAIS → Prestador de Serviços", grupo: "DESPESAS OPERACIONAIS" },
  { id: 14617763097, label: "DESPESAS OPERACIONAIS → Prestadores de Serviços → Honorários", grupo: "DESPESAS OPERACIONAIS" },
  { id: 14729401229, label: "DESPESAS OPERACIONAIS → Sistemas", grupo: "DESPESAS OPERACIONAIS" },
  { id: 14729391948, label: "REMUNERAÇÃO E PESSOAL → Plano de Saúde", grupo: "REMUNERAÇÃO E PESSOAL" },
  { id: 14729397458, label: "REMUNERAÇÃO E PESSOAL → Retirada de Lucro", grupo: "REMUNERAÇÃO E PESSOAL" },
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
    // ── Extrair dados de NF para Contas a Pagar ──────────────────────────────
    if (req.query.action === 'extrair-nf-cp' && req.method === 'POST') {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ erro: 'PDF obrigatório' });
      const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
              { type: 'text', text: 'Extraia os dados desta nota fiscal brasileira. Retorne APENAS JSON puro sem markdown nem explicações. Campos: fornecedor (string), cnpj (string, só números), numeroDoc (string), competencia (YYYY-MM - mês/ano de competência ou emissão do serviço, este campo define a escrituração contábil no Lucro Real), dataVencimento (YYYY-MM-DD - data de vencimento do pagamento, null se não houver), valor (number, valor total da nota), discriminacao (string, descrição do serviço ou produto), cnpjTomador (string, só números, CNPJ do tomador/contratante do serviço), categoria_sugerida (string, escolha UMA das opções: Antecipação de Importação, Aluguel, Armazenagem, Fretes, Salário, Infraestrutura, Insumos, Prestador de Serviços, Honorários, Sistemas, Plano de Saúde, Retirada de Lucro), tipo (string: servico ou produto).' }
            ]
          }]
        })
      });
      const claudeData = await claudeResp.json();
      const text = claudeData.content?.[0]?.text || '';
      try {
        const clean = text.replace(/```json|```/g, '').trim();
        const dados = JSON.parse(clean);
        return res.json({ ok: true, dados });
      } catch(e) {
        return res.status(500).json({ erro: 'Falha ao parsear resposta da IA', raw: text });
      }
    }

    // ── Categorias de despesa ─────────────────────────────────────────────
    if (req.query.action === 'categorias-despesas') {
      return res.json({ ok: true, categorias: CATEGORIAS_BLING });
    }

    // ── Listar contas a pagar ─────────────────────────────────────────────
    if (req.query.action === 'listar-contas-pagar') {
      const pagina = req.query.pagina || 1;
      const situacao = req.query.situacao || ''; // 1=aberto, 2=pago, 3=cancelado
      const dataInicio = req.query.dataInicio || '';
      const dataFim = req.query.dataFim || '';
      let url = `https://api.bling.com.br/Api/v3/contas/pagar?pagina=${pagina}&limite=100`;
      if (situacao) url += `&situacao=${situacao}`;
      if (dataInicio) url += `&dataVencimento[gte]=${dataInicio}`;
      if (dataFim) url += `&dataVencimento[lte]=${dataFim}`;
      const resp = await fetch(url, { headers });
      const data = await resp.json();
      return res.json({ ok: true, contas: data.data || [], total: data.data?.length || 0 });
    }

    // ── Criar conta a pagar ───────────────────────────────────────────────
    if (req.query.action === 'criar-conta-pagar' && req.method === 'POST') {
      const { fornecedor, cnpj, valor, vencimento, historico, categoriaId, numeroDoc, portador } = req.body;
      if (!valor || !vencimento) return res.status(400).json({ erro: 'valor e vencimento obrigatórios' });
      const payload = {
        vencimento,
        valor: Number(valor),
        historico: historico || '',
        numeroDocumento: numeroDoc || '',
        categoria: categoriaId ? { id: Number(categoriaId) } : undefined,
        portador: portador ? { id: Number(portador) } : undefined,
        contato: cnpj ? {
          nome: fornecedor || '',
          numeroDocumento: cnpj.replace(/\D/g,''),
        } : undefined,
        situacao: 1, // aberto
      };
      const resp = await fetch('https://api.bling.com.br/Api/v3/contas/pagar', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) return res.status(resp.status).json({ erro: data.error?.description || 'Erro Bling', detalhe: data });
      return res.json({ ok: true, id: data.data?.id });
    }

    // ── Baixar conta a pagar (marcar como pago) ────────────────────────────
    if (req.query.action === 'baixar-conta-pagar' && req.method === 'POST') {
      const { id, dataPagamento, valorPago, portador } = req.body;
      if (!id) return res.status(400).json({ erro: 'id obrigatório' });
      const payload = {
        data: dataPagamento || new Date().toISOString().split('T')[0],
        valor: Number(valorPago),
        portador: portador ? { id: Number(portador) } : undefined,
      };
      const resp = await fetch(`https://api.bling.com.br/Api/v3/contas/pagar/${id}/baixas`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) return res.status(resp.status).json({ erro: data.error?.description || 'Erro Bling', detalhe: data });
      return res.json({ ok: true });
    }

    if (req.query.action === 'debug-produto' && req.query.sku) {
      const sku = req.query.sku;
      const buscaResp = await fetch(`https://api.bling.com.br/Api/v3/produtos?codigo=${encodeURIComponent(sku)}&limite=5`, { headers });
      const buscaData = await buscaResp.json();
      const encontrado = (buscaData.data || []).find(p => String(p.codigo || '').trim() === sku.trim()) || (buscaData.data || [])[0];
      if (!encontrado) return res.json({ erro: 'nao encontrado', buscaData });
      const detResp = await fetch(`https://api.bling.com.br/Api/v3/produtos/${encontrado.id}`, { headers });
      const det = await detResp.json();
      return res.json({ ok: true, keys: Object.keys(det.data || {}), estrutura: det.data?.estrutura, composicao: det.data?.composicao, componentes: det.data?.componentes, raw: det.data });
    }

    // ── Desmembrar kits do Full — extrai componentes via Bling ───────────────
    if (req.query.action === 'desmembrar-kits-full' && req.method === 'POST') {
      const { itens } = req.body;
      if (!itens?.length) return res.status(400).json({ erro: 'Itens obrigatórios' });
      const resultado = [];
      for (const item of itens) {
        const { sku, descricao, quantidade } = item;
        await sleep(200);
        const buscaResp = await fetch(`https://api.bling.com.br/Api/v3/produtos?codigo=${encodeURIComponent(sku)}&limite=5`, { headers });
        if (!buscaResp.ok) { resultado.push({ sku, descricao, quantidade, tipo: 'erro', motivo: `Bling ${buscaResp.status}` }); continue; }
        const buscaData = await buscaResp.json();
        const encontrado = (buscaData.data || []).find(p => String(p.codigo || '').trim() === sku.trim()) || (buscaData.data || [])[0];
        if (!encontrado) { resultado.push({ sku, descricao, quantidade, tipo: 'nao_encontrado' }); continue; }
        await sleep(200);
        const detResp = await fetch(`https://api.bling.com.br/Api/v3/produtos/${encontrado.id}`, { headers });
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
            const compResp = await fetch(`https://api.bling.com.br/Api/v3/produtos/${compId}`, { headers });
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


    // ── Debug: ver estrutura de uma NF existente no Bling ──────────────────
    if (req.query.action === 'debug-nf' && req.query.numero) {
      const numero = req.query.numero;
      const resp = await fetch(`https://api.bling.com.br/Api/v3/nfe?numero=${numero}&limite=5`, { headers });
      const data = await resp.json();
      const nf = (data.data || [])[0];
      if (!nf) return res.json({ erro: 'NF não encontrada', data });
      // Busca detalhe completo
      const det = await fetch(`https://api.bling.com.br/Api/v3/nfe/${nf.id}`, { headers });
      const detData = await det.json();
      return res.json({ ok: true, keys: Object.keys(detData.data || {}), contato: detData.data?.contato, enderecoEntrega: detData.data?.enderecoEntrega, raw: detData.data });
    }

    // ── Emitir NF de Transferência Full ──────────────────────────────────────
    if (req.query.action === 'emitir-nf-transferencia' && req.method === 'POST') {
      const { itens, naturezaId, cnpjFilial } = req.body;
      if (!itens?.length) return res.status(400).json({ erro: 'Itens obrigatórios' });
      // Data de hoje no formato YYYY-MM-DD
      const hoje = new Date().toISOString().split('T')[0];

      const payload = {
        tipo: 1,
        finalidade: 1,
        dataOperacao: hoje,
        naturezaOperacao: { id: Number(naturezaId || 15109130797) },
        // Contato destinatário — Filial SP (CNPJ passado no body ou padrão)
        contato: {
          id: 16726789250,
          nome: "DIGOO BRASIL IMPORTACAO E DISTRIBUICAO LTDA",
          numeroDocumento: "40981026000344",
          tipoPessoa: "J",
          indicadorIe: 1,
          ie: "157133516113",
          endereco: {
            endereco: "Avenida Paulista",
            numero: "1471",
            complemento: "CONJ 1110 CXPST 9014",
            bairro: "Bela Vista",
            cep: "01311927",
            municipio: "Sao Paulo",
            uf: "SP",
            pais: "Brasil"
          }
        },
        itens: itens.map(it => ({
          codigo: it.sku,
          descricao: it.descricao,
          unidade: 'UN',
          quantidade: it.quantidade,
          valor: Number(it.custo || 0),
          cfop: '6152',
          ncm: String(it.ncm || '').replace(/[^0-9]/g, ''),
        })),
      };
      const resp = await fetch('https://api.bling.com.br/Api/v3/nfe', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const respData = await resp.json();
      if (!resp.ok) return res.status(resp.status).json({ erro: respData.error?.description || 'Erro Bling', detalhe: respData });
      const nfeId = respData.data?.id;
      if (!nfeId) return res.status(500).json({ erro: 'NF criada sem ID', raw: respData });
      const envioResp = await fetch(`https://api.bling.com.br/Api/v3/nfe/${nfeId}/enviar`, { method: 'POST', headers });
      const envioData = await envioResp.json();

      // Busca detalhe da NF para pegar chaveAcesso (pode não vir no envio)
      let chaveAcesso = envioData.data?.chaveAcesso || null;
      let situacao = envioData.data?.situacao || null;
      if (!chaveAcesso) {
        await new Promise(r => setTimeout(r, 2000)); // aguarda 2s
        const detResp = await fetch(`https://api.bling.com.br/Api/v3/nfe/${nfeId}`, { headers });
        const detData = await detResp.json();
        chaveAcesso = detData.data?.chaveAcesso || null;
        situacao = detData.data?.situacao?.valor || situacao;
      }

      return res.json({ ok: true, nfeId, numero: respData.data?.numero || null, chaveAcesso, status: situacao });
    }

    // ── Emitir NF Complementar de IPI ────────────────────────────────────────
    if (req.query.action === 'emitir-complementar-ipi' && req.method === 'POST') {
      const { itens, chaveRefOriginal, numeroOriginal, naturezaId } = req.body;
      if (!itens?.length) return res.status(400).json({ erro: 'Itens obrigatórios' });
      const hoje = new Date().toISOString().split('T')[0];
      const payload = {
        tipo: 1, finalidade: 3,
        dataOperacao: hoje,
        naturezaOperacao: { id: Number(naturezaId || 15109513361) },
        contato: {
          id: 16726789250,
          nome: "DIGOO BRASIL IMPORTACAO E DISTRIBUICAO LTDA",
          numeroDocumento: "40981026000344",
          tipoPessoa: "J",
          indicadorIe: 1,
          ie: "157133516113",
          endereco: {
            endereco: "Avenida Paulista",
            numero: "1471",
            complemento: "CONJ 1110 CXPST 9014",
            bairro: "Bela Vista",
            cep: "01311927",
            municipio: "Sao Paulo",
            uf: "SP",
            pais: "Brasil"
          }
        },
        notasReferenciadas: chaveRefOriginal ? [{ chave: chaveRefOriginal }] : [],
        itens: itens.map(it => {
          const valorIpi = Number(it.valorIpi || 0);
          const aliquotaPct = Number(it.aliquota || 0);
          // aliquota vem como fração (0.065) — Bling espera percentual (6.5)
          const aliquotaBling = aliquotaPct < 1 ? aliquotaPct * 100 : aliquotaPct;
          return {
            codigo: it.sku,
            descricao: it.descricao || it.produto,
            unidade: 'UN',
            quantidade: it.quantidade,
            valor: 0, // NF complementar: valor do produto = 0, só IPI é destacado
            cfop: '6152',
            ncm: String(it.ncm || '').replace(/\D/g, ''),
            ipi: {
              situacaoTributaria: '50',
              aliquota: aliquotaBling,
              valor: valorIpi,
            },
          };
        }),
      };
      // Log do payload para debug
      console.log('[complementar-ipi] payload:', JSON.stringify(payload, null, 2));
      const resp = await fetch('https://api.bling.com.br/Api/v3/nfe', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const respData = await resp.json();
      if (!resp.ok) return res.status(resp.status).json({ erro: respData.error?.description || 'Erro Bling', detalhe: respData });
      const nfeId = respData.data?.id;
      if (!nfeId) return res.status(500).json({ erro: 'NF criada sem ID', raw: respData });
      const envioResp = await fetch(`https://api.bling.com.br/Api/v3/nfe/${nfeId}/enviar`, { method: 'POST', headers });
      const envioData = await envioResp.json();
      return res.json({ ok: true, nfeId, numero: respData.data?.numero || null, chaveAcesso: envioData.data?.chaveAcesso || null, status: envioData.data?.situacao || null, rawEnvio: envioData });
    }

    // ── Extrair SKUs do PDF via Claude ────────────────────────────────────────
    if (req.query.action === 'extrair-pdf-full' && req.method === 'POST') {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ erro: 'pdfBase64 obrigatório' });
      const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } }, { type: 'text', text: 'Extrai todos os SKUs e quantidades desta lista de produtos do ML Full. Retorna APENAS JSON puro sem markdown: [{"sku":"SKU","descricao":"nome","quantidade":38}]. Não inclua nada além do JSON array.' }] }] })
      });
      if (!claudeResp.ok) return res.status(500).json({ erro: 'Erro Claude API' });
      const claudeData = await claudeResp.json();
      const itens = JSON.parse((claudeData.content?.[0]?.text || '[]').replace(/```json|```/g, '').trim());
      return res.json({ ok: true, itens });
    }



    // ── Modo "notaCompleta": devolve o JSON bruto e completo de UMA nota
    // específica (por número), sem cortar nada — usado só pra investigar
    // campos que ainda não mapeamos (tipo o total de IPI da nota).
    // ── Modo "picking": busca um produto por SKU e devolve EAN + componentes
    // (se for kit/composição). Usado na tela de Picking & Packing pra saber
    // o que precisa ser bipado fisicamente pra cada item do pedido.
    if (req.query.picking && req.query.sku) {
      const skuAlvo = String(req.query.sku).trim();

      // 1) Localiza o produto pelo código (SKU) — a listagem já filtra por código
      const buscaResp = await fetch(
        `https://api.bling.com.br/Api/v3/produtos?codigo=${encodeURIComponent(skuAlvo)}&limite=5`,
        { headers }
      );
      if (!buscaResp.ok) {
        const txt = await buscaResp.text();
        throw new Error(`Bling /produtos ${buscaResp.status}: ${txt.slice(0, 200)}`);
      }
      const buscaData = await buscaResp.json();
      const encontrado = (buscaData.data || []).find(p => String(p.codigo || "").trim() === skuAlvo) || (buscaData.data || [])[0];

      if (!encontrado) {
        return res.json({ ok: true, encontrado: false, sku: skuAlvo });
      }

      // 2) Busca o detalhe completo do produto (é lá que vem o GTIN/EAN e a estrutura de kit)
      const detResp = await fetch(`https://api.bling.com.br/Api/v3/produtos/${encontrado.id}`, { headers });
      if (!detResp.ok) {
        const txt = await detResp.text();
        throw new Error(`Bling /produtos/${encontrado.id} ${detResp.status}: ${txt.slice(0, 200)}`);
      }
      const detData = await detResp.json();
      const p = detData.data || {};

      // Tenta os nomes de campo mais prováveis pro EAN — a doc pública não deixa
      // 100% claro qual é o nome exato retornado, então testamos os candidatos.
      const ean = p.gtin || p.codigoBarras || p.gtinEmbalagem || p.ean || "";

      // Tenta localizar a lista de componentes (kit) nos formatos mais prováveis
      const listaComponentes =
        p.estrutura?.componentes ||
        p.composicao?.itens ||
        p.componentes ||
        [];

      const isKit = Array.isArray(listaComponentes) && listaComponentes.length > 0;

      // Pausa curta entre chamadas — evita estourar o limite de requisições do Bling
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      // Busca o detalhe de um produto no Bling, com 1 nova tentativa se a primeira falhar
      // (o Bling às vezes derruba requisição por excesso de chamadas simultâneas, não
      // porque o produto realmente não existe)
      async function buscarDetalheComRetry(produtoId) {
        for (let tentativa = 0; tentativa < 2; tentativa++) {
          try {
            const r = await fetch(`https://api.bling.com.br/Api/v3/produtos/${produtoId}`, { headers });
            if (r.ok) return await r.json();
          } catch (e) {}
          if (tentativa === 0) await sleep(400); // espera um pouco antes de tentar de novo
        }
        return null;
      }

      let componentes = [];
      if (isKit) {
        // Busca cada componente UM POR VEZ (não em paralelo) — o Bling derruba
        // chamadas simultâneas demais, o que fazia componentes aparecerem como
        // "não encontrado" por engano, de forma aleatória a cada tentativa.
        for (const c of listaComponentes) {
          const compProdutoId = c.produto?.id || c.produtoId || c.id;
          const quantidade = Number(c.quantidade) || 1;
          if (!compProdutoId) {
            componentes.push({ sku: "", nome: c.descricao || "", ean: "", quantidade });
            continue;
          }
          const cData = await buscarDetalheComRetry(compProdutoId);
          const cp = cData?.data || {};
          componentes.push({
            sku: cp.codigo || "",
            nome: cp.nome || c.descricao || "",
            ean: cp.gtin || cp.codigoBarras || cp.gtinEmbalagem || cp.ean || "",
            quantidade,
          });
          await sleep(250); // respiro entre uma chamada e outra
        }
      }

      return res.json({
        ok: true,
        encontrado: true,
        sku: p.codigo || skuAlvo,
        nome: p.nome || "",
        ean,
        isKit,
        componentes,
        // Devolve o produto bruto também — útil pra debugar se algum campo
        // não bateu com o esperado (ean vazio, kit não detectado, etc.)
        _bruto: req.query.debug ? p : undefined,
      });
    }

    if (req.query.notaCompleta) {
      const numeroAlvo = String(req.query.notaCompleta).trim();
      let encontrada = null;
      let tentativas = [];

      // Tentativa 1: buscar direto pelo número, sem filtro de data nem tipo
      try {
        const diretoResp = await fetch(`https://api.bling.com.br/Api/v3/nfe?numero=${numeroAlvo}&limite=10`, { headers });
        const diretoData = await diretoResp.json();
        const itemsDireto = diretoData.data || [];
        tentativas.push({ metodo: "busca direta por numero=", encontrou: itemsDireto.length });
        encontrada = itemsDireto.find(nf => Number(nf.numero) === Number(numeroAlvo)) || itemsDireto[0];
      } catch (e) {
        tentativas.push({ metodo: "busca direta por numero=", erro: e.message });
      }

      // Tentativa 2 (fallback): varre por data, janela bem maior (180 dias), sem filtrar por tipo
      if (!encontrada) {
        const dataInicial = req.query.dataInicial || new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
        const dataFinal = req.query.dataFinal || new Date().toISOString().slice(0, 10);
        let totalVarrido = 0;
        let pagina = 1;
        while (pagina <= 10 && !encontrada) {
          const listResp = await fetch(
            `https://api.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=100&dataEmissaoInicial=${dataInicial}&dataEmissaoFinal=${dataFinal}`,
            { headers }
          );
          const listData = await listResp.json();
          const items = listData.data || [];
          totalVarrido += items.length;
          encontrada = items.find(nf => Number(nf.numero) === Number(numeroAlvo));
          if (items.length < 100) break;
          pagina++;
        }
        tentativas.push({ metodo: `varredura por data (${dataInicial} a ${dataFinal}, sem filtro de tipo)`, totalNotasVarridas: totalVarrido });
      }

      if (!encontrada) return res.status(404).json({ error: `Nota ${numeroAlvo} não encontrada`, tentativas });
      const detResp = await fetch(`https://api.bling.com.br/Api/v3/nfe/${encontrada.id}`, { headers });
      const detData = await detResp.json();
      return res.json(detData);
    }

    // ── Modo "notas": detecta notas fiscais de transferência de mercadoria
    // pra filial (CFOP 6152 e/ou natureza contendo "transferência de
    // mercadoria"). Fica no mesmo arquivo/rota do bling-produtos pra não
    // gastar mais uma Serverless Function (limite de 12 no plano Hobby).
    if (req.query.notas) {
      const diasAtras = parseInt(req.query.dias || "5");
      const dataInicial = req.query.dataInicial || new Date(Date.now() - diasAtras * 86400000).toISOString().slice(0, 10);
      const dataFinal = req.query.dataFinal || new Date().toISOString().slice(0, 10);

      // Busca os nomes das naturezas de operação uma vez só, pra resolver o nome de
      // cada nota sem precisar de uma chamada extra por nota (só serve pra exibir o
      // nome certo — não dá pra confiar em filtrar a lista por ela: o Bling aceita
      // o parâmetro sem erro mas não filtra de verdade, então nem tentamos mais).
      const naturezasPorId = {};
      try {
        const natResp = await fetch(`https://api.bling.com.br/Api/v3/naturezas-operacoes?limite=100`, { headers });
        if (natResp.ok) {
          const natData = await natResp.json();
          (natData.data || []).forEach(n => {
            naturezasPorId[n.id] = n.descricao || n.nome || n.tipo || "";
          });
        }
      } catch (e) { /* segue sem os nomes, usa só CFOP nesse caso */ }

      // Busca TODAS as páginas de notas do período (não só a primeira)
      const notas = [];
      let pagina = 1;
      while (pagina <= 5) { // trava de segurança: até 500 notas
        const listResp = await fetch(
          `https://api.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=100&dataEmissaoInicial=${dataInicial}&dataEmissaoFinal=${dataFinal}&tipo=1`,
          { headers }
        );
        if (!listResp.ok) {
          const txt = await listResp.text();
          throw new Error(`Bling /nfe ${listResp.status}: ${txt.slice(0, 300)}`);
        }
        const listData = await listResp.json();
        const items = listData.data || [];
        notas.push(...items);
        if (items.length < 100) break;
        pagina++;
        await sleep(350);
      }

      // Lembra quais notas já foram verificadas em execuções anteriores — assim,
      // em vez de sempre checar as mesmas primeiras N notas (e nunca avançar num
      // acúmulo grande), cada execução avança no que ainda falta.
      let notasJaVerificadas = {};
      if (!req.query.ignorarVerificadas) {
        try {
          const vResp = await fetch(`${process.env.FIREBASE_URL}/nfes_verificadas.json`);
          notasJaVerificadas = (await vResp.json()) || {};
        } catch (e) { /* segue sem o histórico, verifica tudo de novo */ }
      }

      // Lembra também quais notas JÁ FORAM CONFIRMADAS como transferência antes —
      // separado da lista acima, pra não "esquecer" de mostrar uma transferência
      // que já tinha sido encontrada numa execução anterior só porque ela não
      // precisou ser verificada de novo dessa vez.
      let transferenciasConfirmadasAntes = {};
      try {
        const cResp = await fetch(`${process.env.FIREBASE_URL}/nfe_transferencias_confirmadas.json`);
        transferenciasConfirmadasAntes = (await cResp.json()) || {};
      } catch (e) { /* segue sem o histórico */ }

      const transferencias = Object.values(transferenciasConfirmadasAntes)
        .filter(t => !dataInicial || !t.dataEmissao || (t.dataEmissao.slice(0, 10) >= dataInicial && t.dataEmissao.slice(0, 10) <= dataFinal));
      const debug = [];
      const notasPendentes = notas.filter(nf => !notasJaVerificadas[nf.id]);
      const capNotas = Math.min(parseInt(req.query.limite || "90"), 110); // 90 já testado com folga real (~44s); acima disso arrisca estourar os 60s da Vercel
      const notasLimitadas = notasPendentes.slice(0, capNotas);
      const novasVerificadas = {};
      const novasConfirmadas = {};

      const processarNota = async (nf) => {
        try {
          const detResp = await fetch(`https://api.bling.com.br/Api/v3/nfe/${nf.id}`, { headers });
          if (!detResp.ok) return;
          const det = await detResp.json();
          const corpo = det.data || {};
          const naturezaId = corpo.naturezaOperacao?.id || null;
          const naturezaNome = naturezasPorId[naturezaId] || corpo.naturezaOperacao?.nome || "";
          const naturezaNorm = String(naturezaNome).toLowerCase();
          const itens = corpo.itens || corpo.itensNota || [];
          const temCfop6152 = itens.some(it => String(it.cfop || it.classificacaoFiscal?.codigo || "").trim() === "6152");
          const naturezaBate = naturezaNorm.includes("transfer") && naturezaNorm.includes("mercadoria");

          if (req.query.debug) {
            debug.push({ id: nf.id, numero: nf.numero, naturezaId, naturezaNome, temCfop6152, naturezaBate, cfopsDaNota: itens.map(it => it.cfop) });
          }

          if (temCfop6152 || naturezaBate) {
            const registro = {
              id: nf.id,
              numero: nf.numero || corpo.numero,
              chaveAcesso: corpo.chaveAcesso || corpo.chaveLinkDanfe || null,
              dataEmissao: nf.dataEmissao || corpo.dataEmissao || null,
              natureza: naturezaNome || null,
              itens: itens.map(it => ({
                sku: it.codigo || null,
                produto: it.descricao || "",
                ncm: String(it.classificacaoFiscal || "").replace(/\D/g, ""),
                quantidade: Number(it.quantidade) || 0,
                valorUnit: Number(it.valor) || 0,
              })).filter(it => it.sku),
            };
            transferencias.push(registro);
            novasConfirmadas[nf.id] = registro;
          }
          novasVerificadas[nf.id] = true;
        } catch (e) {
          if (req.query.debug) debug.push({ id: nf.id, erro: e.message });
        }
      };

      // Processa em lotes de 3 (limite do Bling é 3 req/s) rodando em paralelo dentro do lote,
      // bem mais rápido que uma requisição de cada vez.
      for (let i = 0; i < notasLimitadas.length; i += 3) {
        const lote = notasLimitadas.slice(i, i + 3);
        await Promise.all(lote.map(processarNota));
        if (i + 3 < notasLimitadas.length) await sleep(1000);
      }

      // Salva as notas verificadas e as confirmadas agora, pra próxima execução
      // não repetir o trabalho E não esquecer das transferências já achadas.
      if (!req.query.ignorarVerificadas) {
        try {
          if (Object.keys(novasVerificadas).length) {
            await fetch(`${process.env.FIREBASE_URL}/nfes_verificadas.json`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(novasVerificadas),
            });
          }
          if (Object.keys(novasConfirmadas).length) {
            await fetch(`${process.env.FIREBASE_URL}/nfe_transferencias_confirmadas.json`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(novasConfirmadas),
            });
          }
        } catch (e) { /* não impede a resposta se essa gravação falhar */ }
      }

      return res.json({
        ok: true,
        transferencias,
        ...(req.query.debug ? {
          debug,
          naturezasEncontradas: naturezasPorId,
          totalNotasEncontradas: notas.length,
          totalNotasJaVerificadasAntes: notas.length - notasPendentes.length,
          totalNotasPendentes: notasPendentes.length,
          totalNotasVerificadasAgora: notasLimitadas.length,
          totalConfirmadasDeExecucoesAnteriores: Object.keys(transferenciasConfirmadasAntes).length,
        } : {}),
      });
    }

    // ── Modo padrão: lista de produtos com custo (comportamento original) ──
    const produtos = [];
    let pagina = 1;
    while (true) {
      const resp = await fetch(
        `https://api.bling.com.br/Api/v3/produtos?pagina=${pagina}&limite=100&situacao=A`,
        { headers }
      );
      if (!resp.ok) {
        const txt = await resp.text();
        return res.status(502).json({ erro: `Bling ${resp.status}`, detalhe: txt.slice(0, 500) });
      }
      const data = await resp.json();
      const items = data.data || [];
      if (!items.length) break;
      produtos.push(...items);
      pagina++;
      if (items.length < 100) break;
    }
    const resultado = produtos
      .filter(p => p.codigo)
      .map(p => ({
        codigo: String(p.codigo).trim(),
        nome: p.nome || "",
        precoCusto: Number(p.precoCusto) || 0,
      }));
    return res.json({ ok: true, data: resultado, total: resultado.length });
  
  // ── Emitir NF-e complementar de IPI ──────────────────────────────────────
  if (req.query.action === 'emitir-complementar-ipi' && req.method === 'POST') {
    try {
      const body = req.body;
      const { itens, chaveRefOriginal, numeroOriginal, naturezaId } = body;

      if (!itens?.length) return res.status(400).json({ erro: 'Itens obrigatórios' });

      // Busca dados do emitente (Matriz RS) e destinatário (Filial SP) do Firebase
      const configResp = await fetch(`${process.env.FIREBASE_URL}/config_nfe.json`);
      const configNfe = await configResp.json() || {};

      // Monta o payload da NF complementar de IPI para o Bling
      const hoje = new Date().toISOString().split('T')[0];
      const payload = {
        tipo: 1, // NF-e
        finalidade: 3, // complementar
        dataOperacao: hoje,
        naturezaOperacao: { id: Number(naturezaId || 15109513361) },
        contato: {
          id: 16726789250,
          nome: "DIGOO BRASIL IMPORTACAO E DISTRIBUICAO LTDA",
          numeroDocumento: "40981026000344",
          tipoPessoa: "J",
          indicadorIe: 1,
          ie: "157133516113",
          endereco: {
            endereco: "Avenida Paulista",
            numero: "1471",
            complemento: "CONJ 1110 CXPST 9014",
            bairro: "Bela Vista",
            cep: "01311927",
            municipio: "Sao Paulo",
            uf: "SP",
            pais: "Brasil"
          }
        },
        notasReferenciadas: chaveRefOriginal ? [{ chave: chaveRefOriginal }] : [],
        itens: itens.map((it, idx) => ({
          codigo: it.sku,
          descricao: it.descricao || it.produto,
          unidade: 'UN',
          quantidade: it.quantidade,
          valor: 0, // complementar de IPI: valor do produto = 0
          cfop: '6152',
          ncm: String(it.ncm || '').replace(/\D/g, ''),
          ipi: {
            situacaoTributaria: '50', // saída tributada
            aliquota: it.aliquota,
            valor: it.valorIpi,
          },
        })),
        // Emitente e destinatário virão do cadastro do Bling (conta logada = Matriz RS)
      };

      const resp = await fetch('https://api.bling.com.br/Api/v3/nfe', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const respData = await resp.json();
      if (!resp.ok) return res.status(resp.status).json({ erro: respData.error?.description || 'Erro ao criar NF no Bling', detalhe: respData });

      const nfeId = respData.data?.id;
      if (!nfeId) return res.status(500).json({ erro: 'NF criada mas sem ID retornado', raw: respData });

      // Transmitir para SEFAZ
      const envioResp = await fetch(`https://api.bling.com.br/Api/v3/nfe/${nfeId}/enviar`, {
        method: 'POST',
        headers,
      });
      const envioData = await envioResp.json();

      return res.json({
        ok: true,
        nfeId,
        numero: respData.data?.numero || null,
        chaveAcesso: envioData.data?.chaveAcesso || null,
        status: envioData.data?.situacao || null,
        raw: envioData,
      });
    } catch (e) {
      return res.status(500).json({ erro: e.message });
    }
  }

  // ── Preview da NF complementar (só valida, não emite) ────────────────────
  if (req.query.action === 'preview-complementar-ipi') {
    try {
      const { nfId } = req.query;
      if (!nfId) return res.status(400).json({ erro: 'nfId obrigatório' });

      // Busca detalhes da NF original para preencher o preview
      const detResp = await fetch(`https://api.bling.com.br/Api/v3/nfe/${nfId}`, { headers });
      if (!detResp.ok) return res.status(detResp.status).json({ erro: 'NF não encontrada no Bling' });
      const det = await detResp.json();
      const corpo = det.data || {};

      return res.json({
        ok: true,
        numero: corpo.numero,
        chaveAcesso: corpo.chaveAcesso || null,
        dataEmissao: corpo.dataEmissao,
        naturezaOperacao: corpo.naturezaOperacao,
        itens: (corpo.itens || []).map(it => ({
          sku: it.codigo,
          descricao: it.descricao,
          ncm: String(it.classificacaoFiscal || '').replace(/\D/g, ''),
          quantidade: Number(it.quantidade) || 0,
          valorUnit: Number(it.valor) || 0,
        })),
      });
    } catch (e) {
      return res.status(500).json({ erro: e.message });
    }
  }


  // ── Desmembrar kits do Full — extrai componentes via Bling ───────────────
  if (req.query.action === 'desmembrar-kits-full' && req.method === 'POST') {
    try {
      const { itens } = req.body; // [{ sku, descricao, quantidade }]
      if (!itens?.length) return res.status(400).json({ erro: 'Itens obrigatórios' });

      const resultado = [];

      for (const item of itens) {
        const { sku, descricao, quantidade } = item;
        await sleep(150); // evitar rate limit

        // Busca produto pelo SKU no Bling
        const buscaResp = await fetch(
          `https://api.bling.com.br/Api/v3/produtos?codigo=${encodeURIComponent(sku)}&limite=5`,
          { headers }
        );
        if (!buscaResp.ok) {
          resultado.push({ sku, descricao, quantidade, tipo: 'erro', motivo: `Bling ${buscaResp.status}` });
          continue;
        }
        const buscaData = await buscaResp.json();
        const encontrado = (buscaData.data || []).find(p => String(p.codigo || '').trim() === sku.trim()) || (buscaData.data || [])[0];

        if (!encontrado) {
          resultado.push({ sku, descricao, quantidade, tipo: 'nao_encontrado' });
          continue;
        }

        // Busca detalhe completo (estrutura de kit fica aqui)
        await sleep(150);
        const detResp = await fetch(`https://api.bling.com.br/Api/v3/produtos/${encontrado.id}`, { headers });
        if (!detResp.ok) {
          resultado.push({ sku, descricao, quantidade, tipo: 'erro', motivo: `Detalhe ${detResp.status}` });
          continue;
        }
        const detData = await detResp.json();
        const prod = detData.data || {};
        const estrutura = prod.estrutura || prod.componentes || prod.kit || [];
        const custo = Number(prod.preco || prod.precoCusto || 0);
        const ncm = String(prod.classificacaoFiscal || '').replace(/\D/g, '');

        if (estrutura && estrutura.length > 0) {
          // É um kit — desmembra os componentes
          for (const comp of estrutura) {
            await sleep(100);
            const compSku = comp.codigo || comp.produto?.codigo || '';
            const compQtd = Number(comp.quantidade || 1) * quantidade;
            const compDescricao = comp.descricao || comp.produto?.descricao || compSku;
            const compCusto = Number(comp.preco || comp.produto?.preco || 0);
            const compNcm = String(comp.classificacaoFiscal || comp.produto?.classificacaoFiscal || '').replace(/\D/g, '');

            // Busca NCM e custo do componente se não veio
            let compNcmFinal = compNcm;
            let compCustoFinal = compCusto;
            if (!compNcmFinal || !compCustoFinal) {
              try {
                await sleep(150);
                const compBusca = await fetch(
                  `https://api.bling.com.br/Api/v3/produtos?codigo=${encodeURIComponent(compSku)}&limite=3`,
                  { headers }
                );
                if (compBusca.ok) {
                  const compBuscaData = await compBusca.json();
                  const compEnc = (compBuscaData.data || []).find(p => String(p.codigo||'').trim() === compSku.trim()) || (compBuscaData.data||[])[0];
                  if (compEnc) {
                    await sleep(100);
                    const compDet = await fetch(`https://api.bling.com.br/Api/v3/produtos/${compEnc.id}`, { headers });
                    if (compDet.ok) {
                      const compDetData = await compDet.json();
                      const cp = compDetData.data || {};
                      compNcmFinal = compNcmFinal || String(cp.classificacaoFiscal || '').replace(/\D/g, '');
                      compCustoFinal = compCustoFinal || Number(cp.preco || cp.precoCusto || 0);
                    }
                  }
                }
              } catch(e) {}
            }

            resultado.push({
              sku: compSku,
              descricao: compDescricao,
              quantidade: compQtd,
              custo: compCustoFinal,
              ncm: compNcmFinal,
              tipo: 'componente',
              kitOrigem: sku,
              kitDescricao: descricao,
            });
          }
        } else {
          // Produto simples — vai direto
          resultado.push({
            sku,
            descricao: prod.descricao || descricao,
            quantidade,
            custo,
            ncm,
            tipo: 'simples',
          });
        }
      }

      // Agrupa componentes iguais (mesmo SKU pode vir de kits diferentes)
      const agrupado = {};
      for (const r of resultado) {
        const key = r.sku;
        if (!key) continue;
        if (agrupado[key]) {
          agrupado[key].quantidade += r.quantidade;
          if (!agrupado[key].kitsOrigem) agrupado[key].kitsOrigem = [];
          if (r.kitOrigem) agrupado[key].kitsOrigem.push(`${r.kitOrigem} ×${r.quantidade/agrupado[key].quantidade * r.quantidade}`);
        } else {
          agrupado[key] = { ...r, kitsOrigem: r.kitOrigem ? [r.kitOrigem] : [] };
        }
      }

      return res.json({ ok: true, itens: Object.values(agrupado) });
    } catch (e) {
      return res.status(500).json({ erro: e.message });
    }
  }

  // ── Emitir NF de Transferência Full ──────────────────────────────────────
  if (req.query.action === 'emitir-nf-transferencia' && req.method === 'POST') {
    try {
      const { itens, naturezaId, cnpjFilial } = req.body;
      if (!itens?.length) return res.status(400).json({ erro: 'Itens obrigatórios' });

      const payload = {
        tipo: 1,
        finalidade: 1, // normal
        naturezaOperacao: { id: naturezaId || 15109130797 },
        itens: itens.map(it => ({
          codigo: it.sku,
          descricao: it.descricao,
          unidade: 'UN',
          quantidade: it.quantidade,
          valor: Number(it.custo || 0),
          cfop: '6152',
          ncm: String(it.ncm || '').replace(/\D/g, ''),
        })),
      };

      const resp = await fetch('https://api.bling.com.br/Api/v3/nfe', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const respData = await resp.json();
      if (!resp.ok) return res.status(resp.status).json({ erro: respData.error?.description || 'Erro ao criar NF', detalhe: respData });

      const nfeId = respData.data?.id;
      if (!nfeId) return res.status(500).json({ erro: 'NF criada sem ID', raw: respData });

      // Transmite para SEFAZ
      const envioResp = await fetch(`https://api.bling.com.br/Api/v3/nfe/${nfeId}/enviar`, { method: 'POST', headers });
      const envioData = await envioResp.json();

      return res.json({
        ok: true,
        nfeId,
        numero: respData.data?.numero || null,
        chaveAcesso: envioData.data?.chaveAcesso || null,
        status: envioData.data?.situacao || null,
      });
    } catch (e) {
      return res.status(500).json({ erro: e.message });
    }
  }


  // ── Extrai SKUs do PDF do ML Full via Claude API ────────────────────────
  if (req.query.action === 'extrair-pdf-full' && req.method === 'POST') {
    try {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ erro: 'PDF base64 obrigatório' });

      const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
              { type: 'text', text: 'Extrai todos os SKUs e quantidades desta lista de produtos do ML Full. Retorna APENAS um JSON puro, sem markdown, no formato: [{"sku":"SKU-AQUI","descricao":"...","quantidade":38}]. Usa o campo SKU do documento. Não inclua nada além do JSON.' }
            ]
          }]
        })
      });

      const claudeData = await claudeResp.json();
      if (!claudeResp.ok) return res.status(500).json({ erro: 'Erro Claude API', detalhe: claudeData });

      const texto = claudeData.content?.[0]?.text || '[]';
      const clean = texto.replace(/```json|```/g, '').trim();
      const itens = JSON.parse(clean);

      return res.json({ ok: true, itens });
    } catch (e) {
      return res.status(500).json({ erro: e.message });
    }
  }

  
  // ── Extrair SKUs do PDF do ML Full via Claude API ─────────────────────────
  if (req.query.action === 'extrair-pdf-full' && req.method === 'POST') {
    try {
      const { pdfBase64 } = req.body;
      if (!pdfBase64) return res.status(400).json({ erro: 'pdfBase64 obrigatório' });

      const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }
              },
              {
                type: 'text',
                text: 'Extrai todos os SKUs e quantidades desta lista de produtos do ML Full (instruções de preparação de envio). Retorna APENAS um JSON puro sem markdown no formato: [{"sku":"SKU-AQUI","descricao":"nome do produto","quantidade":38}]. Usa o campo SKU do documento (ex: WC-HDC-PRETO, COSMIQ-REV-PRETO). Não inclua nada além do JSON array.'
              }
            ]
          }]
        })
      });

      if (!claudeResp.ok) {
        const err = await claudeResp.text();
        return res.status(claudeResp.status).json({ erro: 'Erro Claude API: ' + err.slice(0, 200) });
      }

      const claudeData = await claudeResp.json();
      const texto = claudeData.content?.[0]?.text || '[]';
      const clean = texto.replace(/```json|```/g, '').trim();
      const itens = JSON.parse(clean);

      return res.json({ ok: true, itens });
    } catch (e) {
      return res.status(500).json({ erro: e.message });
    }
  }

  // ── Fiscal Defender ─────────────────────────────────────────────────────
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

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
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