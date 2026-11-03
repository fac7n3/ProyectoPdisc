/**
 * product-image.js — Fotos de producto en dos tamaños (srcset).
 *
 * Las fotos de /img/productos/ son webp cuadrados de 800 px (~50 KB), pero una
 * tarjeta de la grilla muestra 170-280 px. Cada una tiene una versión de 520 px
 * en /img/productos/s/ (~25 KB, `npm run thumbs`): el navegador elige sola según el
 * ancho de la pantalla y su densidad. 520 y no 400: un celular de pantalla 2,6x
 * necesita ~500 px para una tarjeta de 190 px; con 400 elegía siempre la grande. `src` queda con la grande a propósito: el
 * modal, el carrito y los pedidos leen `img.getAttribute('src')` de la tarjeta.
 * Una foto que no sea de /img/productos/ (Supabase Storage, otras) queda como estaba.
 */

const FULL = /^\/img\/productos\/([^/]+\.webp)$/;

/** Ancho que ocupa una tarjeta de la grilla: 2 por fila en celular, ~280 px en escritorio. */
export const CARD_IMAGE_SIZES = '(max-width: 480px) 46vw, (max-width: 900px) 30vw, 280px';

/** URL de la versión de 520 px de una foto de producto, o null si no tiene. */
export function thumbUrl(url) {
  const m = FULL.exec(String(url || ''));
  return m ? `/img/productos/s/${m[1]}` : null;
}

/** Pone `src` + `srcset` + `sizes` en un <img> de tarjeta. Devuelve el mismo <img>. */
export function setProductImage(img, url, sizes = CARD_IMAGE_SIZES) {
  const src = url || '/img/no-image.svg';
  img.setAttribute('src', src);
  const small = thumbUrl(src);
  if (small) {
    img.setAttribute('srcset', `${small} 520w, ${src} 800w`);
    img.setAttribute('sizes', sizes);
  }
  return img;
}
