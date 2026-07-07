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

    // ── Modo "notaCompleta": devolve o JSON bruto e completo de UMA nota
    // específica (por número), sem cortar nada — usado só pra investigar
    // campos que ainda não mapeamos (tipo o total de IPI da nota).
    if (req.query.notaCompleta) {
      const numeroAlvo = String(req.query.notaCompleta).trim();
      const dataInicial = req.query.dataInicial || new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
      const dataFinal = req.query.dataFinal || new Date().toISOString().slice(0, 10);
      let encontrada = null;
      let pagina = 1;
      while (pagina <= 5 && !encontrada) {
        const listResp = await fetch(
          `https://www.bling.com.br/Api/v3/nfe?pagina=${pagina}&limite=100&dataEmissaoInicial=${dataInicial}&dataEmissaoFinal=${dataFinal}&tipo=1`,
          { headers }
        );
        const listData = await listResp.json();
        const items = listData.data || [];
        encontrada = items.find(nf => String(nf.numero) === numeroAlvo);
        if (items.length < 100) break;
        pagina++;
      }
      if (!encontrada) return res.status(404).json({ error: `Nota ${numeroAlvo} não encontrada nos últimos ${Math.round((Date.now() - new Date(dataInicial)) / 86400000)} dias` });
      const detResp = await fetch(`https://www.bling.com.br/Api/v3/nfe/${encontrada.id}`, { headers });
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
        const natResp = await fetch(`https://www.bling.com.br/Api/v3/naturezas-operacoes?limite=100`, { headers });
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
            const registro = {
              id: nf.id,
              numero: nf.numero || corpo.numero,
              dataEmissao: nf.dataEmissao || corpo.dataEmissao || null,
              natureza: naturezaNome || null,
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
