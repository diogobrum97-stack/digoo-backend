// ════════════════════════════════════════════════════════════════════════════
// Ofertas do ML — núcleo compartilhado entre o backend (Vercel) e o
// sincronizador da VPS (/opt/digoo-ofertas-ml). Sem dependências: usa o fetch global.
//
// Estrutura gravada no Firebase em /ofertas_ml_cache/{conta}:
//   meta:  { gerado_em, duracao_ms, total_anuncios, seller_id, falhas:{dados,promocoes}, origem }
//   itens: { MLB123: { item_id, titulo, sku, foto, preco, estoque, permalink, catalogo, ofertas:[...] } }
// Itens ficam separados por chave para que só o que mudou trafegue até o OPS.
// ════════════════════════════════════════════════════════════════════════════
export const esperar = ms => new Promise(r => setTimeout(r, ms));

// Chamada ao ML com nova tentativa em 429 (muitas requisições) e erros 5xx/rede.
export async function mlFetch(url, token, opts = {}, tentativas = 4) {
  let ultimoErro = null;
  for (let t = 0; t < tentativas; t++) {
    try {
      const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
      if (r.status !== 429 && r.status < 500) return r;
      const ra = Number(r.headers.get("retry-after"));
      ultimoErro = new Error(`HTTP ${r.status}`);
      await esperar(ra > 0 ? ra * 1000 : 800 * 2 ** t);
    } catch (e) {
      ultimoErro = e;
      await esperar(800 * 2 ** t);
    }
  }
  throw ultimoErro || new Error("falha ao consultar o ML");
}

// Roda fn em cada item com no máximo `limite` chamadas ao mesmo tempo.
export async function emParalelo(lista, limite, fn) {
  let i = 0;
  const trabalhadores = Array.from({ length: Math.min(limite, lista.length) }, async () => {
    while (i < lista.length) { const idx = i++; await fn(lista[idx], idx); }
  });
  await Promise.all(trabalhadores);
}

export function dadosDoItem(it) {
  const skuAttr = (it.attributes || []).find(a => a.id === "SELLER_SKU");
  const pic = (it.pictures || [])[0];
  return {
    titulo: it.title || null,
    sku: it.seller_custom_field || skuAttr?.value_name || "",
    foto: (pic?.secure_url || it.thumbnail || "").replace(/^http:/, "https:"),
    preco: it.price ?? null,
    estoque: it.available_quantity ?? null,
    permalink: it.permalink || "",
    catalogo: it.catalog_listing === true,
  };
}

// Converte a resposta de /seller-promotions/items/{id} na lista de ofertas usada pelo OPS
export function mapearPromos(arr) {
  return (Array.isArray(arr) ? arr : [])
    .filter(p => ["candidate", "started", "pending"].includes(p.status))
    .map(p => ({
      promotion_id: p.id || null,
      tipo: p.type || "",
      nome: p.name || "",
      status: p.status,
      preco: p.price || p.suggested_discounted_price || null,
      preco_original: p.original_price ?? null,
      preco_sugerido: p.suggested_discounted_price ?? null,
      preco_min: p.min_discounted_price ?? null,
      preco_max: p.max_discounted_price ?? null,
      meli_pct: Number(p.meli_percentage ?? p.benefits?.meli_percent ?? 0) || 0,
      seller_pct: Number(p.seller_percentage ?? p.benefits?.seller_percent ?? 0) || 0,
      offer_id: p.offer_id || p.ref_id || null,
      inicio: p.start_date || null,
      fim: p.finish_date || p.end_date || null,
      estoque_min: p.stock?.min ?? null,
      estoque_max: p.stock?.max ?? null,
    }));
}

// Promoções atuais de um anúncio, direto do ML (usado antes de Participar)
export async function ofertasDoItem(itemId, token) {
  const r = await mlFetch(`https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`, token);
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`ML respondeu HTTP ${r.status}`);
  return mapearPromos(await r.json());
}

// Varre todos os anúncios ativos da conta. `infoAnterior` (opcional) evita
// rebuscar título/foto/SKU a cada volta: só busca os dados de anúncios novos.
export async function montarOfertasML(token, infoAnterior = null) {
  const inicio = Date.now();
  const me = await (await mlFetch("https://api.mercadolibre.com/users/me", token)).json();
  if (!me.id) throw new Error("Token inválido ou expirado");

  // 1) IDs dos anúncios ativos
  const ids = [];
  for (let off = 0; off < 2000; off += 50) {
    const d = await (await mlFetch(`https://api.mercadolibre.com/users/${me.id}/items/search?status=active&limit=50&offset=${off}`, token)).json();
    const b = Array.isArray(d.results) ? d.results : [];
    ids.push(...b);
    if (b.length < 50) break;
  }

  // 2) Dados dos anúncios (preço e estoque mudam, então rebusca em lotes de 20)
  const ATR = "id,title,price,seller_custom_field,attributes,thumbnail,pictures,permalink,available_quantity,catalog_listing";
  const info = {};
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    try {
      const d = await (await mlFetch(`https://api.mercadolibre.com/items?ids=${lote.join(",")}&attributes=${ATR}`, token)).json();
      (Array.isArray(d) ? d : []).forEach(e => { if (e?.code === 200 && e.body?.id) info[e.body.id] = dadosDoItem(e.body); });
    } catch (e) { /* os que faltarem vão pro passo individual */ }
  }
  const semDados = ids.filter(id => !info[id]);
  await emParalelo(semDados, 3, async id => {
    try {
      const r = await mlFetch(`https://api.mercadolibre.com/items/${id}?attributes=${ATR}`, token);
      if (r.ok) info[id] = dadosDoItem(await r.json());
    } catch (e) {}
    if (!info[id] && infoAnterior?.[id]) info[id] = infoAnterior[id];
  });

  // 3) Promoções de cada anúncio, 5 por vez
  const ofertasPorItem = {};
  const falhaPromo = [];
  await emParalelo(ids, 5, async itemId => {
    try {
      const r = await mlFetch(`https://api.mercadolibre.com/seller-promotions/items/${itemId}?app_version=v2`, token);
      if (r.status === 404) return;
      if (!r.ok) { falhaPromo.push(itemId); return; }
      const lista = mapearPromos(await r.json());
      if (lista.length) ofertasPorItem[itemId] = lista;
    } catch (e) { falhaPromo.push(itemId); }
  });

  const itens = {};
  for (const id of Object.keys(ofertasPorItem)) {
    const d = info[id];
    itens[id] = d
      ? { item_id: id, ...d, ofertas: ofertasPorItem[id] }
      : { item_id: id, sem_dados: true, titulo: null, sku: "", foto: "", preco: null, estoque: null,
          permalink: `https://produto.mercadolivre.com.br/${id.replace(/^MLB/, "MLB-")}`, catalogo: false, ofertas: ofertasPorItem[id] };
  }
  // Firebase não aceita undefined
  return JSON.parse(JSON.stringify({
    meta: {
      gerado_em: Date.now(),
      duracao_ms: Date.now() - inicio,
      total_anuncios: ids.length,
      seller_id: me.id,
      falhas: { dados: Object.keys(itens).filter(id => !info[id]), promocoes: falhaPromo },
    },
    itens,
    info,
  }));
}

// Tira null/undefined (o Firebase não guarda), pra comparação com o que já está gravado bater
function limpar(v) {
  if (Array.isArray(v)) return v.map(limpar);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x !== null && x !== undefined) o[k] = limpar(x);
    return o;
  }
  return v;
}

// Grava no Firebase só o que mudou. `ref` é um Reference do firebase-admin
// apontando para /ofertas_ml_cache/{conta}; `anterior` é o objeto de itens já gravado.
export async function gravarOfertas(ref, dados, anterior, origem) {
  const upd = {};
  const atual = limpar(dados.itens || {});
  dados.itens = atual;
  for (const [id, it] of Object.entries(atual)) {
    if (!anterior || JSON.stringify(anterior[id]) !== JSON.stringify(it)) upd[`itens/${id}`] = it;
  }
  for (const id of Object.keys(anterior || {})) if (!atual[id]) upd[`itens/${id}`] = null;
  upd.meta = { ...dados.meta, origem };
  upd.ultimo_erro = null;
  // limpa campos do formato antigo (tudo na raiz, itens em lista)
  for (const k of ["ok", "gerado_em", "seller_id", "duracao_ms", "total_anuncios", "falhas"]) upd[k] = null;
  await ref.update(upd);
  return Object.keys(upd).filter(k => k.startsWith("itens/")).length; // quantos anúncios mudaram
}
