/**
 * cart-totals.js — La cuenta del carrito, replicando lo que hace `create_order`.
 *
 * Existe porque el resumen del carrito y el RPC que cobra sacaban números
 * distintos, y el que manda es el RPC: lo que el carrito muestra es una
 * promesa, lo que `create_order` calcula es lo que se cobra. Las dos
 * diferencias que había:
 *
 * 1. **Un cupón de un comercio puntual se descontaba de TODO el carrito.**
 *    `create_order` aplica el porcentaje tienda por tienda, y solo donde
 *    `coupon.store_id` es null (global) o coincide con esa tienda. El carrito
 *    guardaba solo el porcentaje y lo restaba del subtotal entero, así que con
 *    dos comercios en el carrito mostraba un total bastante más bajo del que
 *    después se cobraba. No era un peso de diferencia: con un cupón del 20% y
 *    $10.000 en cada comercio, mostraba $16.000 y cobraba $18.000.
 * 2. **El redondeo iba en otro orden.** El RPC redondea el subtotal con
 *    descuento de CADA tienda (`round(...)::integer`) y recién ahí suma el
 *    envío; el carrito redondeaba una sola vez, al final y solo para mostrar.
 *    Con varios comercios eso se corre unos pesos.
 *
 * Sin DOM ni imports a propósito, para poder correr `node js/cart-totals.test.mjs`.
 *
 * Nota de redondeo: el `round()` de Postgres sobre `numeric` redondea la
 * fracción 0.5 alejándose del cero, y `Math.round` de JS la redondea hacia
 * +infinito. Acá todos los importes son positivos, así que coinciden.
 */

/** Valores por defecto del envío, iguales a los de la base (migración 42). */
export const DEFAULT_FREE_SHIPPING_THRESHOLD = 5000;
export const DEFAULT_DELIVERY_FEE = 350;

/**
 * Porcentaje de descuento que le toca a una tienda.
 * Mismo `case` que `create_order`: un cupón global (store_id null) va a todas,
 * uno de vendedor solo a la suya, y el resto paga precio lleno.
 */
export function discountPctForStore(couponPercent, couponStoreId, storeId) {
  if (!couponPercent) return 0;
  if (couponStoreId == null) return couponPercent;
  return couponStoreId === storeId ? couponPercent : 0;
}

/**
 * @typedef {{ id: string, price: number, qty: number }} CartItem
 * @typedef {{ deliveryFee?: number, freeShippingThreshold?: number }} StoreShipping
 *
 * @param {object} opts
 * @param {CartItem[]} opts.items          solo los tildados (los que se van a cobrar)
 * @param {(item: CartItem) => string} opts.storeIdOf   agrupador: id de la tienda del ítem
 * @param {(storeId: string) => StoreShipping|undefined} [opts.shippingOf]
 * @param {'pickup'|'delivery'} [opts.deliveryMethod]
 * @param {number} [opts.couponPercent]    0-100, como lo devuelve la base (no 0-1)
 * @param {string|null} [opts.couponStoreId] null = cupón global
 * @returns {{ subtotal: number, discountAmount: number, shipping: number, total: number,
 *             byStore: Array<{ storeId: string, subtotal: number, discountPct: number,
 *                              discounted: number, shipping: number, total: number }> }}
 */
export function computeCartTotals({
  items,
  storeIdOf,
  shippingOf = () => undefined,
  deliveryMethod = 'pickup',
  couponPercent = 0,
  couponStoreId = null,
}) {
  const subtotalByStore = new Map();
  for (const item of items || []) {
    const storeId = storeIdOf(item);
    const line = Number(item.price) * Number(item.qty);
    subtotalByStore.set(storeId, (subtotalByStore.get(storeId) || 0) + line);
  }

  const byStore = [];
  for (const [storeId, subtotal] of subtotalByStore) {
    const discountPct = discountPctForStore(couponPercent, couponStoreId, storeId);
    const discounted = subtotal * (1 - discountPct / 100);

    const config = shippingOf(storeId);
    const threshold = config?.freeShippingThreshold ?? DEFAULT_FREE_SHIPPING_THRESHOLD;
    const fee = config?.deliveryFee ?? DEFAULT_DELIVERY_FEE;

    // El RPC compara el valor SIN redondear contra el umbral; se replica igual
    // para no quedar del otro lado del límite por una fracción de peso.
    const shipping = deliveryMethod === 'delivery' && discounted < threshold ? fee : 0;

    byStore.push({
      storeId,
      subtotal,
      discountPct,
      discounted: Math.round(discounted),
      shipping,
      total: Math.round(discounted) + shipping,
    });
  }

  const subtotal = byStore.reduce((acc, s) => acc + s.subtotal, 0);
  const shipping = byStore.reduce((acc, s) => acc + s.shipping, 0);
  const total = byStore.reduce((acc, s) => acc + s.total, 0);
  // Lo que se descontó de verdad, no `subtotal * pct`: con un cupón de una
  // sola tienda es bastante menos, y es justo el número que antes mentía.
  const discountAmount = subtotal - byStore.reduce((acc, s) => acc + s.discounted, 0);

  return { subtotal, discountAmount, shipping, total, byStore };
}
