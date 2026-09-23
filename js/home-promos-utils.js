/**
 * Promociones de comercios en los mosaicos de banners del home (tabla
 * `home_promos`, migración 107). Lógica pura, sin DOM ni Supabase, para
 * poder correr `node js/home-promos-utils.test.mjs`. La usan el home
 * (pintar + redirigir), el panel de admin (asignar espacios) y el panel del
 * vendedor (cargar la imagen y la publicación de su espacio).
 */

/** Los 6 espacios, en el orden en que aparecen en el home. `ratio` es la
 *  proporción aproximada del banner, para orientar a quien diseña la imagen. */
export const HOME_PROMO_SLOTS = [
  { slot: 'mosaic_a', label: 'Mosaico de arriba · grande (izquierda)', ratio: '16:9 (ej. 1600x900)' },
  { slot: 'mosaic_b', label: 'Mosaico de arriba · chico (arriba a la derecha)', ratio: '16:9 (ej. 900x507)' },
  { slot: 'mosaic_c', label: 'Mosaico de arriba · chico (abajo a la derecha)', ratio: '16:9 (ej. 900x507)' },
  { slot: 'mosaic_d', label: 'Mosaico de abajo · franja ancha', ratio: '5:1 (ej. 1600x320)' },
  { slot: 'mosaic_e', label: 'Mosaico de abajo · izquierda', ratio: '4:1 (ej. 1200x300)' },
  { slot: 'mosaic_f', label: 'Mosaico de abajo · derecha', ratio: '4:1 (ej. 1200x300)' },
];

export function slotLabel(slot) {
  return HOME_PROMO_SLOTS.find((s) => s.slot === slot)?.label || slot;
}

/**
 * ¿Esta fila tiene que reemplazar al banner fijo del home? Solo si está
 * activa, tiene comercio aprobado e imagen. Cualquier otra cosa (espacio
 * libre, comercio suspendido, todavía sin imagen) deja el banner de siempre.
 */
export function isPromoLive(promo) {
  return Boolean(
    promo
    && promo.is_active
    && promo.store_id
    && promo.image_url
    && promo.stores?.status === 'approved'
  );
}

/**
 * A dónde lleva el click: a la publicación elegida si sigue activa, y si no
 * (sin publicación elegida, o la pausaron / la borraron) a la página del
 * comercio -- nunca a un producto que el vecino no va a poder comprar.
 */
export function promoHref(promo) {
  if (!promo?.store_id) return null;
  if (promo.product_id && promo.products?.is_active) {
    return `./producto.html?id=${encodeURIComponent(promo.product_id)}`;
  }
  return `./comercio.html?id=${encodeURIComponent(promo.store_id)}`;
}

/** Texto accesible del banner: "Promoción de <comercio>: <título>". */
export function promoAriaLabel(promo) {
  const store = promo?.stores?.name || 'un comercio';
  const title = (promo?.title || '').trim();
  return title ? `Promoción de ${store}: ${title}` : `Ver promoción de ${store}`;
}
