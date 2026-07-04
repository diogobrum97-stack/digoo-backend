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
    if (!token || !token.access_token) throw new Error("Bling não conectado — rode oauth_bling.py");
    const headers = {
      Authorization: `Bearer ${token.access_token}`,
      Accept: "application/json",
    };

    // ── Modo "notas": detecta notas fiscais de transferência de mercadoria
    // pra filial (CFOP 6152 e/ou natureza contendo "transferência de
    // mercadoria"). Fica no mesmo arquivo/rota do bling-produtos pra não
    // gastar mais uma Serverless Function (limite de 12 no plano Hobby).
    if (req.query.notas) {
      const diasAtras = parseInt(req.query.dias || "5");
      const dataInicial = new Date(Date.now() - diasAtras * 86400000).toISOString().slice(0, 10);
      const dataFinal = new Date().toISOString().slice(0, 10);

      // Busca TODAS as páginas de notas do período (não só a primeira)
      const notas = [];
      let pagina = 1;
      while (pagina <= 5) { // trava de segurança: até 500 notas
        const listResp = await fetch(
          `https://www.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=100&dataEmissaoInicial=${dataInicial}&dataEmissaoFinal=${dataFinal}&tipo=1`,
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

      // Busca os nomes das naturezas de operação UMA vez só (várias notas repetem o mesmo ID),
      // pra não precisar de uma chamada extra por nota.
      const naturezasPorId = {};
      try {
        await sleep(350);
        const natResp = await fetch(`https://www.bling.com.br/Api/v3/naturezas-operacoes?limite=100`, { headers });
        if (natResp.ok) {
          const natData = await natResp.json();
          (natData.data || []).forEach(n => {
            naturezasPorId[n.id] = n.descricao || n.nome || n.tipo || "";
          });
        }
      } catch (e) { /* segue sem os nomes, usa só CFOP nesse caso */ }

      const transferencias = [];
      const debug = [];
      const notasLimitadas = notas.slice(0, 140); // ~350ms x 140 ≈ 49s, dentro do limite de 60s da função
      for (const nf of notasLimitadas) {
        await sleep(350); // Bling limita a 3 requisições/segundo — essa pausa mantém a gente em ~2,8/s com folga
        try {
          const detResp = await fetch(`https://www.bling.com.br/Api/v3/nfe/${nf.id}`, { headers });
          if (!detResp.ok) continue;
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
            transferencias.push({
              id: nf.id,
              numero: nf.numero || corpo.numero,
              dataEmissao: nf.dataEmissao || corpo.dataEmissao || null,
              natureza: naturezaNome || null,
            });
          }
        } catch (e) {
          if (req.query.debug) debug.push({ id: nf.id, erro: e.message });
        }
      }

      return res.json({
        ok: true,
        transferencias,
        ...(req.query.debug ? {
          debug,
          naturezasEncontradas: naturezasPorId,
          totalNotasEncontradas: notas.length,
          totalNotasVerificadas: notasLimitadas.length,
        } : {}),
      });
    }

    // ── Modo padrão: lista de produtos com custo (comportamento original) ──
    const produtos = [];
    let pagina = 1;
    while (true) {
      const resp = await fetch(
        `https://www.bling.com.br/Api/v3/produtos?pagina=${pagina}&limite=100&situacao=A`,
        { headers }
      );
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Bling ${resp.status}: ${txt.slice(0, 200)}`);
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
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
