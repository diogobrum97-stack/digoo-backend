// ════════════════════════════════════════════════════════════════════════════
// Painel de Vendas (OPS → Mercado Livre → Vendas) — núcleo compartilhado entre
// o backend (Vercel, action painel-vendas) e o processo "vendas" da VPS.
// Sem dependências: recebe o banco (firebase-admin) e os ajudantes do ofertas-ml-core.
//
// Firebase:
//   /vendas_painel/{conta}/{data}/pedidos/{id}  detalhe de cada pedido (frete, Mercado Pago) — cache de trabalho
//   /vendas_dia/{conta}/{data}                  resumo pronto do dia que o OPS lê direto:
//      { vendas[], excecoes[], liberacoes[], fotos{}, atualizado_em, origem }
// Datas sempre no horário de Brasília (AAAA-MM-DD).
// ════════════════════════════════════════════════════════════════════════════

// Resume a nota fiscal que o ML devolve em /users/{uid}/invoices/orders/{pedido}
export function resumirNota(inv) {
  if (!inv?.id) return null;
  const amt = Object.fromEntries((inv.fiscal_data?.fiscal_amounts || []).map(a => [a.name, a.attributes || {}]));
  const n = v => Math.round((Number(v) || 0) * 100) / 100;
  const imp = {
    icms: n(amt.icms?.vicms), difal: n(amt.icms?.vicmsufdest), fcp: n(amt.icms?.vfcpufdest), st: n(amt.icms?.vst),
    ipi: n(amt.ipi?.vipi), pis: n(amt.pis?.vpis), cofins: n(amt.cofins?.vcofins), cbs: n(amt.cbs?.vcbs), ibs: n(amt.ibs?.vibs),
  };
  imp.total = n(Object.values(imp).reduce((s, v) => s + v, 0));
  return {
    id: String(inv.id), numero: inv.invoice_number ?? null, serie: inv.invoice_series ?? null,
    chave: inv.attributes?.invoice_key || null, status: inv.status || null,
    emitida: inv.issued_date || inv.attributes?.invoice_creation_date || null, valor: inv.amount ?? null,
    cfop: [...new Set((inv.items || []).map(i => i.fiscal_data?.attributes?.cfop).filter(Boolean))].join(", ") || null,
    impostos: imp,
  };
}

export const hojeSP = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);

/**
 * Monta (e grava) as vendas de um dia.
 * @param {object} o
 *   db, token, uid, conta, data, mlFetch, emParalelo
 *   limiteMs     — tempo máximo buscando detalhes (Vercel ~40s; VPS sem limite)
 *   revalidarMs  — rechecar pedidos consultados há mais que isso (padrão 6h)
 *   origem       — "backend" | "vps"
 */
export async function montarDiaVendas(o) {
  const { db, token, uid, conta, data, mlFetch, emParalelo } = o;
  const limiteMs = o.limiteMs ?? Infinity;
  const revalidarMs = o.revalidarMs ?? 6 * 3600e3;
  const inicio = Date.now();
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const lerJson = async url => { try { const r = await mlFetch(url, token); if (!r.ok) return { status: r.status, body: null }; return { status: r.status, body: await r.json() }; } catch (e) { return { status: 0, body: null }; } };
  const cacheRef = db.ref(`/vendas_painel/${conta}/${data}`);
  const cache = (await cacheRef.child("pedidos").once("value")).val() || {};

  // 1) Todos os pedidos do dia
  const de = `${data}T00:00:00.000-03:00`, ate = `${data}T23:59:59.999-03:00`;
  const pedidos = [];
  for (let off = 0; off < 5000; off += 50) {
    const b = await lerJson(`https://api.mercadolibre.com/orders/search?seller=${uid}&order.date_created.from=${encodeURIComponent(de)}&order.date_created.to=${encodeURIComponent(ate)}&sort=date_asc&limit=50&offset=${off}`);
    if (!b.body) { if (!pedidos.length) throw new Error(`busca de pedidos do ML falhou (HTTP ${b.status})`); break; }
    pedidos.push(...(b.body.results || []));
    if ((b.body.results || []).length < 50 || pedidos.length >= (b.body.paging?.total || 0)) break;
  }

  // 2) Detalhe (frete + Mercado Pago) só do que é novo, mudou de status ou está velho
  const precisa = pedidos.filter(p => {
    const c = cache[p.id];
    if (!c || c.status !== p.status) return true;
    const desde = Date.now() - (c.checado_em || 0);
    const idade = Date.now() - new Date(p.date_created).getTime();
    if (desde > revalidarMs) return true;
    // o Mercado Pago ajusta o líquido logo após a venda (ex.: desconta a tarifa 2 min depois):
    // venda com menos de 2h e venda que "não bate" (até 3 dias) são conferidas de novo a cada ~10 min
    if (desde > 8 * 60e3 && (idade < 2 * 3600e3 || (c.recheck && idade < 3 * 864e5))) return true;
    return false;
  });
  const fretes = {};          // shipping_id → custo do vendedor (um por envio)
  for (const c of Object.values(cache)) if (c.shipping_id && c.frete_envio != null) fretes[c.shipping_id] = c.frete_envio;
  let parcial = false;
  const novos = {};
  await emParalelo(precisa, 4, async p => {
    if (Date.now() - inicio > limiteMs) { parcial = true; return; }
    const itens = (p.order_items || []).map(it => ({
      item_id: it.item?.id || null, titulo: it.item?.title || null,
      sku: it.item?.seller_sku || it.item?.seller_custom_field || null,
      qtd: it.quantity || 1, preco_unit: r2(it.unit_price), tarifa_unit: r2(it.sale_fee),
    }));
    const shipId = p.shipping?.id || null;
    let freteEnvio = shipId != null && fretes[shipId] != null ? fretes[shipId] : null;
    if (shipId && freteEnvio == null) {
      const c = await lerJson(`https://api.mercadolibre.com/shipments/${shipId}/costs`);
      if (c.body) { freteEnvio = r2((c.body.senders || []).reduce((s, x) => s + (Number(x.cost) || 0), 0)); fretes[shipId] = freteEnvio; }
    }
    const pags = [];
    for (const pg of p.payments || []) {
      const mp = await lerJson(`https://api.mercadopago.com/v1/payments/${pg.id}`);
      const b = mp.body;
      if (!b) { pags.push({ id: pg.id, erro: mp.status || "sem acesso", status: pg.status || null }); continue; }
      pags.push({
        id: pg.id, status: b.status, liquido: b.transaction_details?.net_received_amount ?? null,
        valor: b.transaction_amount ?? null, reembolsado: b.transaction_amount_refunded || 0,
        liberacao: b.money_release_date || null, liberado: b.money_release_status || null,
      });
    }
    novos[p.id] = {
      id: p.id, criado: p.date_created, status: p.status, pack_id: p.pack_id || null,
      shipping_id: shipId, frete_envio: freteEnvio, itens, pagamentos: pags, checado_em: Date.now(),
      // o que já foi descoberto antes não se perde quando o pedido é conferido de novo
      nf: cache[p.id]?.nf || null, nf_tentou_em: cache[p.id]?.nf_tentou_em || null,
      familia: cache[p.id]?.familia, recheck: cache[p.id]?.recheck || null,
    };
  });
  if (Object.keys(novos).length) await cacheRef.child("pedidos").update(JSON.parse(JSON.stringify(novos)));
  const todos = { ...cache, ...novos };

  // 2b) Nota fiscal de cada pedido (ML devolve a nota das duas contas — Full emitida pelo ML, Matriz pelo Bling).
  //     Guarda uma vez; pedido sem nota é tentado de novo a cada ~30 min por até 5 dias.
  const semNota = pedidos.filter(p => {
    const c = todos[p.id];
    if (!c || c.nf || p.status === "cancelled") return false;
    if (Date.now() - new Date(p.date_created).getTime() > 5 * 864e5) return false;
    return Date.now() - (c.nf_tentou_em || 0) > 30 * 60e3;
  });
  const notasNovas = {};
  await emParalelo(semNota, 3, async p => {
    if (Date.now() - inicio > limiteMs) return;
    const r = await lerJson(`https://api.mercadolibre.com/users/${uid}/invoices/orders/${p.id}`);
    let nf = resumirNota(r.body);
    if (!nf && p.shipping?.id) {
      // reserva: dados básicos da nota pelo envio (sem os impostos)
      const e = await lerJson(`https://api.mercadolibre.com/shipments/${p.shipping.id}/invoice_data/?siteId=MLB`);
      if (e.body?.invoice_number) nf = { id: null, numero: e.body.invoice_number, serie: e.body.invoice_serie || null, chave: e.body.fiscal_key || null, status: null, emitida: e.body.invoice_date || null, valor: e.body.invoice_amount ?? null, cfop: e.body.additional_data?.cfop ? String(e.body.additional_data.cfop) : null, impostos: null };
    }
    if (nf) { todos[p.id].nf = nf; notasNovas[`${p.id}/nf`] = nf; }
    else { todos[p.id].nf_tentou_em = Date.now(); notasNovas[`${p.id}/nf_tentou_em`] = Date.now(); }
  });
  if (Object.keys(notasNovas).length) await cacheRef.child("pedidos").update(JSON.parse(JSON.stringify(notasNovas)));

  // 3) Linhas: uma por compra.
  //    • carrinho → mesmo pack_id
  //    • compra que o ML dividiu em pacotes (tag "splitted_order") → cada pacote aponta para a compra
  //      original em /packs/{pack_id}.family_pack_id; o frete costuma vir inteiro num pacote só
  //    • o pedido original da compra dividida fica "cancelado — pack_splitted": não é venda nem exceção
  //    O frete continua contando uma vez por envio.
  const divididos = pedidos.filter(p => (p.tags || []).includes("splitted_order") && p.pack_id && todos[p.id] && todos[p.id].familia === undefined);
  const familias = {}, familiaNova = {};
  await emParalelo([...new Set(divididos.map(p => p.pack_id))], 3, async packId => {
    const r = await lerJson(`https://api.mercadolibre.com/packs/${packId}`);
    familias[packId] = r.body ? (r.body.family_pack_id || 0) : undefined;
  });
  for (const p of divididos) if (familias[p.pack_id] !== undefined) { todos[p.id].familia = familias[p.pack_id]; familiaNova[`${p.id}/familia`] = familias[p.pack_id]; }
  if (Object.keys(familiaNova).length) await cacheRef.child("pedidos").update(familiaNova);
  const grupos = {};
  for (const p of pedidos) {
    const c = todos[p.id]; if (!c) continue;
    if (p.cancel_detail?.code === "pack_splitted") continue;   // compra original que virou pacotes
    const k = c.familia ? `f${c.familia}` : c.pack_id ? `p${c.pack_id}` : `o${c.id}`;
    (grupos[k] = grupos[k] || []).push(c);
  }
  const compradorDe = {};                                      // pedido → comprador (vem na busca de pedidos)
  for (const p of pedidos) if (p.buyer) compradorDe[p.id] = {
    apelido: p.buyer.nickname || null,
    nome: [p.buyer.first_name, p.buyer.last_name].filter(Boolean).join(" ") || null,
  };
  const vendas = [], excecoes = [], liberacoes = {}, marcarRecheck = {};
  for (const [k, ords] of Object.entries(grupos)) {
    const itens = ords.flatMap(x => x.itens || []);
    const bruto = r2(itens.reduce((s, i) => s + i.preco_unit * i.qtd, 0));
    const tarifa = r2(itens.reduce((s, i) => s + i.tarifa_unit * i.qtd, 0));
    const envios = [...new Set(ords.map(x => x.shipping_id).filter(Boolean))];
    const freteOk = envios.every(sid => ords.some(x => x.shipping_id === sid && x.frete_envio != null));
    const frete = freteOk ? r2(envios.reduce((s, sid) => s + (ords.find(x => x.shipping_id === sid)?.frete_envio || 0), 0)) : null;
    const pags = ords.flatMap(x => x.pagamentos || []);
    const aprov = pags.filter(pg => ["approved", "authorized"].includes(pg.status));   // recusados são ignorados
    const semAcesso = pags.some(pg => pg.erro);
    const liquido = aprov.length && aprov.every(pg => pg.liquido != null) ? r2(aprov.reduce((s, pg) => s + pg.liquido, 0)) : null;
    const esperado = frete != null ? r2(bruto - tarifa - frete) : null;
    const diferenca = esperado != null && liquido != null ? r2(liquido - esperado) : null;
    const cancelada = ords.every(x => x.status === "cancelled");
    const reembolso = r2(pags.reduce((s, pg) => s + (Number(pg.reembolsado) || 0), 0));
    for (const pg of aprov) {
      if (!pg.liberacao || pg.liquido == null) continue;
      const d = new Date(new Date(pg.liberacao).getTime() - 3 * 3600e3).toISOString().slice(0, 10);
      const l = liberacoes[d] = liberacoes[d] || { data: d, vendas: 0, valor: 0, liberado: true };
      l.vendas++; l.valor = r2(l.valor + pg.liquido); if (pg.liberado !== "released") l.liberado = false;
    }
    // números de cada pedido (para conferir com o ML/Mercado Turbo pedido a pedido); frete fica no 1º pedido de cada envio
    const envioUsado = new Set();
    const porPedido = ords.length > 1 ? ords.map(x => {
      const its = x.itens || [];
      const fr = x.shipping_id && !envioUsado.has(x.shipping_id) ? (envioUsado.add(x.shipping_id), x.frete_envio) : 0;
      const ap = (x.pagamentos || []).filter(pg => ["approved", "authorized"].includes(pg.status));
      return {
        id: x.id, un: its.reduce((s, i) => s + i.qtd, 0),
        bruto: r2(its.reduce((s, i) => s + i.preco_unit * i.qtd, 0)), tarifa: r2(its.reduce((s, i) => s + i.tarifa_unit * i.qtd, 0)),
        frete: fr ?? null, liquido: ap.length && ap.every(pg => pg.liquido != null) ? r2(ap.reduce((s, pg) => s + pg.liquido, 0)) : null,
      };
    }) : null;
    const linha = {
      id: k, pedidos: ords.map(x => x.id), por_pedido: porPedido,
      nfs: ords.filter(x => x.nf).map(x => ({ pedido: x.id, numero: x.nf.numero, serie: x.nf.serie, impostos: x.nf.impostos?.total ?? null })), comprador: compradorDe[ords[0].id] || null, criado: ords[0].criado, status: cancelada ? "cancelada" : ords[0].status,
      itens: itens.map(i => ({ titulo: i.titulo, sku: i.sku, qtd: i.qtd, preco_unit: i.preco_unit, item_id: i.item_id })),
      bruto, tarifa, frete, envios: envios.length, liquido, esperado, diferenca, reembolso,
      liberacao: aprov.map(pg => pg.liberacao).filter(Boolean).sort()[0] || null,
    };
    const motivos = [];
    if (cancelada) motivos.push("cancelada");
    if (reembolso > 0) motivos.push(`reembolso R$ ${reembolso.toFixed(2)}`);
    if (diferenca != null && Math.abs(diferenca) > 0.10) motivos.push(`diferença de R$ ${diferenca.toFixed(2)} no MP`);
    if (semAcesso && !aprov.length) motivos.push("sem acesso ao pagamento no MP");
    if (!cancelada && !aprov.length && !semAcesso) motivos.push("pagamento não aprovado");
    if (motivos.length) excecoes.push({ ...linha, motivos });
    if (!cancelada && aprov.length) vendas.push(linha);
    // marca os pedidos que não batem para conferir de novo na próxima volta
    const naoBate = diferenca != null && Math.abs(diferenca) > 0.10;
    for (const x of ords) if (!!x.recheck !== naoBate) marcarRecheck[`${x.id}/recheck`] = naoBate || null;
  }
  vendas.sort((a, b) => String(b.criado).localeCompare(String(a.criado)));
  if (Object.keys(marcarRecheck).length) await cacheRef.child("pedidos").update(marcarRecheck);

  // 4) Fotos (miniatura): reaproveita as do resumo anterior, busca só as que faltam
  const resumoRef = db.ref(`/vendas_dia/${conta}/${data}`);
  const fotos = (await resumoRef.child("fotos").once("value")).val() || {};
  const faltaFoto = [...new Set([...vendas, ...excecoes].flatMap(v => v.itens.map(i => i.item_id)).filter(id => id && !fotos[id]))];
  if (faltaFoto.length && Date.now() - inicio < limiteMs + 10e3) {
    const lotes = Array.from({ length: Math.ceil(faltaFoto.length / 20) }, (_, i) => faltaFoto.slice(i * 20, i * 20 + 20));
    await emParalelo(lotes, 3, async lote => {
      const r = await lerJson(`https://api.mercadolibre.com/items?ids=${lote.join(",")}&attributes=id,thumbnail`);
      for (const e of Array.isArray(r.body) ? r.body : []) if (e?.code === 200 && e.body?.thumbnail) fotos[e.body.id] = String(e.body.thumbnail).replace(/^http:/, "https:");
    });
  }

  const resumo = {
    ok: true, conta, data, parcial, faltam: parcial ? precisa.length - Object.keys(novos).length : 0,
    vendas, excecoes, fotos, liberacoes: Object.values(liberacoes).sort((a, b) => a.data.localeCompare(b.data)),
    atualizado_em: Date.now(), origem: o.origem || null,
  };
  // Só grava o resumo completo (parcial continua na próxima chamada)
  if (!parcial) await resumoRef.set(JSON.parse(JSON.stringify({ ...resumo, ok: null, parcial: null, faltam: null })));
  return resumo;
}
