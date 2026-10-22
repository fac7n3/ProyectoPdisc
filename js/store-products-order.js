/**
 * Orden de los productos en la página de un comercio: los que están en
 * oferta o con descuento van primero y el resto sigue abajo. Sin DOM (para
 * poder probarlo con `node js/store-products-order.test.mjs`).
 */

/**
 * ¿Tiene una oferta vigente? Mismo criterio que buildPriceRow (cart-utils.js):
 * precio tachado mayor al precio y la oferta sin vencer. `today` es el día
 * local en formato YYYY-MM-DD (localIsoDate()).
 */
export function isOnOffer(product, today) {
  if (!product?.compare_at_price || !(product.compare_at_price > product.price)) return false;
  return !(product.offer_expires_at && product.offer_expires_at < today);
}

/** Productos en oferta primero y el resto detrás; cada grupo conserva su orden. */
export function offersFirst(products, today) {
  const offers = [];
  const rest = [];
  (products || []).forEach((p) => (isOnOffer(p, today) ? offers : rest).push(p));
  return [...offers, ...rest];
}
