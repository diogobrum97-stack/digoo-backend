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

      // Busca os nomes das naturezas de operação primeiro — usamos isso tanto pra
      // resolver o nome de cada nota quanto pra tentar filtrar a busca direto pela
      // natureza de "transferência de mercadoria", em vez de varrer nota por nota.
      const naturezasPorId = {};
      try {
        const natResp = await fetch(`https://www.bling.com.br/Api/v3/naturezas-operacoes?limite=100`, { headers });
        if (natResp.ok) {
          const natData = await natResp.json();
          (natData.data || []).forEach(n => {
            naturezasPorId[n.id] = n.descricao || n.nome || n.tipo || "";
          });
        }
      } catch (e) { /* segue sem os nomes, usa só CFOP nesse caso */ }

      const idsNaturezaTransferencia = Object.entries(naturezasPorId)
        .filter(([, nome]) => {
          const n = String(nome).toLowerCase();
          return n.includes("transfer") && n.includes("mercadoria");
        })
        .map(([id]) => id);

      // Tenta buscar a lista JÁ filtrada pela(s) natureza(s) de transferência encontrada(s).
      // Não temos garantia de que o Bling aceita esse parâmetro — se der erro em qualquer
      // uma das tentativas, descartamos tudo e caímos no modo antigo (varrer tudo).
      let notasFiltradasPorNatureza = null;
      if (idsNaturezaTransferencia.length) {
        try {
          const candidatas = [];
          for (const natId of idsNaturezaTransferencia) {
            await sleep(350);
            const filtResp = await fetch(
              `https://www.bling.com.br/Api/v3/nfe?pagina=1&limite=100&dataEmissaoInicial=${dataInicial}&dataEmissaoFinal=${dataFinal}&tipo=1&idNaturezaOperacao=${natId}`,
              { headers }
            );
            if (!filtResp.ok) throw new Error(`filtro por natureza não aceito (status ${filtResp.status})`);
            const filtData = await filtResp.json();
            candidatas.push(...(filtData.data || []));
          }
          notasFiltradasPorNatureza = candidatas;
        } catch (e) {
          notasFiltradasPorNatureza = null; // volta pro modo de varrer tudo
        }
      }

      let notas;
      let filtroFuncionou = notasFiltradasPorNatureza !== null;
      if (notasFiltradasPorNatureza !== null) {
        notas = notasFiltradasPorNatureza;
      } else {
        // Fallback: busca TODAS as páginas de notas do período e verifica uma por uma
        notas = [];
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
      }

      const transferencias = [];
      const debug = [];
      // Se o filtro funcionou, a lista já deve ser pequena (raro precisar do cap).
      // Se caiu no fallback, mantemos o limite de segurança pra não estourar os 60s da Vercel.
      const capNotas = filtroFuncionou ? notas.length : Math.min(parseInt(req.query.limite || "90"), 150);
      const notasLimitadas = notas.slice(0, capNotas);

      const processarNota = async (nf) => {
        try {
          const detResp = await fetch(`https://www.bling.com.br/Api/v3/nfe/${nf.id}`, { headers });
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
      };

      // Processa em lotes de 3 (limite do Bling é 3 req/s) rodando em paralelo dentro do lote,
      // bem mais rápido que uma requisição de cada vez.
      for (let i = 0; i < notasLimitadas.length; i += 3) {
        const lote = notasLimitadas.slice(i, i + 3);
        await Promise.all(lote.map(processarNota));
        if (i + 3 < notasLimitadas.length) await sleep(1000);
      }

      return res.json({
        ok: true,
        transferencias,
        ...(req.query.debug ? {
          debug,
          naturezasEncontradas: naturezasPorId,
          idsNaturezaTransferencia,
          filtroPorNaturezaFuncionou: filtroFuncionou,
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
