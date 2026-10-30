// Comparador de precios de la búsqueda: cuando el mismo producto está en dos o
// más comercios, search.js muestra una tarjeta con dos filas, primero el más
// barato y después el más cerca de la persona. Acá vive la cuenta, sin DOM ni
// Supabase, para poder correr `node js/price-compare-utils.test.mjs`.
//
// "El mismo producto" = mismo nombre normalizado (sin mayúsculas, acentos,
// signos ni espacios de más; "1L" y "1 l" son lo mismo). Es la primera vuelta:
// dos comercios que escriben distinto el nombre no se juntan.

/** "Leche La Serenísima  1L" -> "leche la serenisima 1 l". */
export function normalizeProductTitle(title) {
  return (title || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Junta los productos que se llaman igual en distintos comercios. Si un mismo
 * comercio lo tiene dos veces, queda el más barato. Devuelve solo los grupos
 * con `minStores` comercios o más, en el orden en que apareció el primero de
 * cada grupo (el de la búsqueda, que ya viene por relevancia).
 */
export function groupSameProducts(products, { minStores = 2 } = {}) {
  const groups = new Map();
  for (const p of products || []) {
    if (!p || !p.store_id || p.price == null) continue;
    const key = normalizeProductTitle(p.title);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    const byStore = groups.get(key);
    const prev = byStore.get(p.store_id);
    if (!prev || p.price < prev.price) byStore.set(p.store_id, p);
  }
  const out = [];
  for (const [key, byStore] of groups) {
    if (byStore.size >= minStores) out.push({ key, items: [...byStore.values()] });
  }
  return out;
}

/** Más barato primero; a igual precio, por nombre del comercio. */
export function rankByPrice(items) {
  return [...items].sort((a, b) =>
    a.price - b.price || (a.store_name || '').localeCompare(b.store_name || '', 'es'));
}

/** Distancia en metros entre dos puntos {lat, lng} (haversine). */
export function distanceMeters(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function isPoint(p) {
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

/**
 * Más cerca primero. `coordsByStore` es un Map store_id -> {lat, lng}. Cada
 * ítem vuelve con `distance` (metros, o null si el comercio no cargó su
 * ubicación); los que no tienen van al final, más baratos primero.
 */
export function rankByDistance(items, userLoc, coordsByStore) {
  const withDistance = items.map((it) => {
    const c = coordsByStore?.get(it.store_id);
    return { ...it, distance: isPoint(userLoc) && isPoint(c) ? distanceMeters(userLoc, c) : null };
  });
  return withDistance.sort((a, b) => {
    if (a.distance == null && b.distance == null) return a.price - b.price;
    if (a.distance == null) return 1;
    if (b.distance == null) return -1;
    return a.distance - b.distance || a.price - b.price;
  });
}

/** 340 -> "350 m", 1234 -> "1,2 km". */
export function formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}
