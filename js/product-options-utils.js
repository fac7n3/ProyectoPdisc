/**
 * product-options-utils.js — opciones de producto (color, sabor, talle, …)
 * Baradero Local
 *
 * Lógica pura, sin DOM y sin imports, para poder correrla con
 * `node js/product-options-utils.test.mjs` (mismo criterio que
 * cart-totals.js / store-contact-utils.js).
 *
 * La comparten cuatro pantallas que tienen que estar de acuerdo:
 * el modal rápido y la ficha de producto (elegir), el carrito (mostrar lo
 * elegido y armar el payload) y el panel del vendedor (cargar las opciones).
 *
 * Forma de un grupo de opciones, tal cual lo devuelve Supabase:
 *   { id, name, position, values: [{ id, value, is_available, position }] }
 *
 * Decisiones que vienen de la migración 102 y que este módulo respeta:
 *  - el stock es del producto, no de la opción: acá no hay ninguna cuenta de
 *    unidades por color;
 *  - un producto puede tener varios grupos y el cliente elige uno de cada uno;
 *  - la opción no cambia el precio.
 */

/**
 * Clave de línea del carrito.
 *
 * Sin opciones era `item.id` a secas y alcanzaba. Ahora no: la misma remera en
 * rojo y en azul son **dos líneas distintas** del carrito, con su propia
 * cantidad y su propio botón de borrar. Los ids se ordenan para que elegir
 * "Rojo, M" y "M, Rojo" caigan en la misma línea — si no, el cliente podría
 * terminar con dos renglones idénticos según en qué orden tocó los chips.
 *
 * @param {string} productId
 * @param {string[]} [optionValueIds]
 * @returns {string}
 */
export function cartLineKey(productId, optionValueIds = []) {
  const ids = (optionValueIds || []).filter(Boolean).map(String).sort();
  return ids.length ? `${productId}::${ids.join('+')}` : String(productId);
}

/** La clave de un ítem del carrito ya guardado (que puede no tener `options`). */
export function itemLineKey(item) {
  return cartLineKey(item?.id, item?.options);
}

/**
 * Los grupos que todavía no eligió, por nombre — para poder decirle
 * "Elegí un color" en vez de un "faltan opciones" genérico.
 * @returns {string[]}
 */
export function missingOptionNames(optionGroups, selectedIds = []) {
  const chosen = new Set((selectedIds || []).filter(Boolean).map(String));
  return (optionGroups || [])
    .filter((group) => !(group.values || []).some((v) => chosen.has(String(v.id))))
    .map((group) => group.name);
}

/**
 * Snapshot legible de lo elegido, con la misma forma que guarda
 * `order_items.selected_options`: `[{ option, value }]`. Se arma desde los
 * grupos que vinieron de la base, nunca desde texto del cliente.
 */
export function buildSelectionSnapshot(optionGroups, selectedIds = []) {
  const chosen = new Set((selectedIds || []).filter(Boolean).map(String));
  const snapshot = [];
  (optionGroups || []).forEach((group) => {
    const value = (group.values || []).find((v) => chosen.has(String(v.id)));
    if (value) snapshot.push({ option: group.name, value: value.value });
  });
  return snapshot;
}

/**
 * "Color: Rojo · Talle: M" — una sola línea para la fila del carrito, el
 * detalle del pedido y el toast de "agregado".
 */
export function describeSelectedOptions(snapshot) {
  if (!Array.isArray(snapshot) || snapshot.length === 0) return '';
  return snapshot
    .filter((entry) => entry && entry.option && entry.value)
    .map((entry) => `${entry.option}: ${entry.value}`)
    .join(' · ');
}

/**
 * ¿La selección guardada en el carrito sigue en pie?
 *
 * Entre que alguien puso algo en el carrito y va a pagar, el vendedor pudo
 * marcar ese color como agotado, renombrarlo, borrarlo, o agregar un grupo
 * nuevo (un talle) que esa línea vieja no tiene elegido. En los cuatro casos
 * `create_order` la rechaza, así que el carrito tiene que avisar **antes** de
 * llegar a pagar, no que explote el checkout.
 *
 * @returns {{ ok: boolean, reason: 'ok'|'sin-opciones'|'no-disponible'|'incompleta' }}
 */
export function checkSelection(optionGroups, selectedIds = []) {
  const groups = optionGroups || [];
  const ids = (selectedIds || []).filter(Boolean).map(String);

  if (groups.length === 0) {
    // El producto dejó de tener opciones: lo que quedó elegido sobra, pero no
    // es motivo para sacarle el producto del carrito — se limpia y listo.
    return { ok: ids.length === 0, reason: ids.length === 0 ? 'ok' : 'sin-opciones' };
  }

  const chosen = new Set(ids);
  let matched = 0;
  for (const group of groups) {
    const value = (group.values || []).find((v) => chosen.has(String(v.id)));
    if (!value) return { ok: false, reason: 'incompleta' };
    if (!value.is_available) return { ok: false, reason: 'no-disponible' };
    matched += 1;
  }
  // Ids de más (de otro producto, o dos del mismo grupo): misma cuenta que
  // hace create_order, para no mostrar como válido algo que el RPC rechaza.
  if (ids.length !== matched) return { ok: false, reason: 'incompleta' };

  return { ok: true, reason: 'ok' };
}

/** Ordena grupos y valores por `position` y, a igual posición, alfabético. */
export function sortOptionGroups(groups) {
  const byPosition = (a, b) =>
    (a.position ?? 0) - (b.position ?? 0) ||
    String(a.name ?? a.value ?? '').localeCompare(String(b.name ?? b.value ?? ''), 'es');

  return (groups || [])
    .map((group) => ({ ...group, values: [...(group.values || [])].sort(byPosition) }))
    .sort(byPosition);
}
