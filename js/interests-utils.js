// Lógica pura (sin DOM ni Supabase) de "Productos recomendados" según lo que
// mira la persona. Correr los tests con `node js/interests-utils.test.mjs`.
//
// Se guarda en el navegador (localStorage) la lista de productos que abrió, de
// más reciente a más vieja. El inicio la cruza con la categoría de cada uno,
// pesa más lo reciente y reparte los lugares de la grilla entre TODAS las
// categorías que miró, en proporción a cuánto las miró.

export const VIEWED_KEY = 'bl_viewed_products';
/** Cuántos productos vistos se recuerdan. */
export const MAX_VIEWED = 40;
/** Cada cuántos días lo que se miró pesa la mitad. */
export const HALF_LIFE_DAYS = 14;
/** Máximo de categorías que alimentan la grilla. */
export const MAX_CATEGORIES = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Lee lo guardado y lo deja en forma: [{ id, at }], sin repetidos, más reciente primero. */
export function normalizeViews(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const v of raw) {
    if (!v || typeof v.id !== 'string' || !v.id || seen.has(v.id)) continue;
    const at = Number(v.at);
    if (!Number.isFinite(at)) continue;
    seen.add(v.id);
    out.push({ id: v.id, at });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, MAX_VIEWED);
}

/** Suma una vista: si el producto ya estaba, se actualiza su fecha (no cuenta doble). */
export function addView(views, productId, now) {
  if (!productId) return normalizeViews(views);
  const rest = normalizeViews(views).filter((v) => v.id !== productId);
  return normalizeViews([{ id: productId, at: now }, ...rest]);
}

/**
 * Peso de cada categoría: suma de las vistas de sus productos, cada una
 * multiplicada por 0,5^(días / HALF_LIFE_DAYS). Devuelve [{ categoryId, weight }]
 * de mayor a menor, como mucho MAX_CATEGORIES. Las vistas sin categoría
 * conocida se ignoran.
 * @param {{id:string, at:number}[]} views
 * @param {Record<string,string>} categoryByProduct  product id -> category id
 */
export function weightCategories(views, categoryByProduct, now) {
  const weights = new Map();
  for (const v of normalizeViews(views)) {
    const cat = categoryByProduct[v.id];
    if (!cat) continue;
    const days = Math.max(0, (now - v.at) / DAY_MS);
    weights.set(cat, (weights.get(cat) || 0) + Math.pow(0.5, days / HALF_LIFE_DAYS));
  }
  return [...weights.entries()]
    .map(([categoryId, weight]) => ({ categoryId, weight }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_CATEGORIES);
}

/**
 * Reparte `total` lugares entre las categorías en proporción a su peso, con al
 * menos 1 para cada una mientras alcance. Devuelve { categoryId: lugares }.
 */
export function allocateSlots(weighted, total) {
  const slots = {};
  if (!weighted.length || total <= 0) return slots;
  const picked = weighted.slice(0, total);
  const sum = picked.reduce((s, w) => s + w.weight, 0) || 1;
  let left = total;
  for (const w of picked) { slots[w.categoryId] = 1; left -= 1; }
  // El resto, de a uno, a la categoría que más le falta respecto de su parte justa.
  while (left > 0) {
    let best = null;
    let bestGap = -Infinity;
    for (const w of picked) {
      const gap = (w.weight / sum) * total - slots[w.categoryId];
      if (gap > bestGap) { bestGap = gap; best = w.categoryId; }
    }
    slots[best] += 1;
    left -= 1;
  }
  return slots;
}

/**
 * Arma la lista final: de cada categoría toma hasta su cupo de la lista que le
 * corresponde, intercalando categorías (una de cada una por vuelta, así no
 * salen todos los panes juntos y después toda la ropa). Si una categoría tiene
 * menos productos que su cupo, el lugar lo ocupan las demás.
 * @param {Record<string, object[]>} byCategory  category id -> productos candidatos
 * @param {{categoryId:string, weight:number}[]} weighted  en orden de peso
 */
export function interleaveByInterest(byCategory, weighted, total) {
  const slots = allocateSlots(weighted, total);
  const queues = weighted.map((w) => ({ id: w.categoryId, items: [...(byCategory[w.categoryId] || [])], cap: slots[w.categoryId] || 0, used: 0 }));
  const out = [];
  const seen = new Set();
  const pass = (respectCap) => {
    let progressed = true;
    while (out.length < total && progressed) {
      progressed = false;
      for (const q of queues) {
        if (out.length >= total) break;
        if (respectCap && q.used >= q.cap) continue;
        let next = q.items.shift();
        while (next && seen.has(next.id)) next = q.items.shift();
        if (!next) continue;
        seen.add(next.id);
        q.used += 1;
        out.push(next);
        progressed = true;
      }
    }
  };
  pass(true);   // cada una hasta su cupo
  pass(false);  // lo que sobre de lugares, con lo que aún tengan
  return out;
}
