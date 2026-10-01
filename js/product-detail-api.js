/**
 * product-detail-api.js — Cableado real a Supabase del detalle de un producto.
 * La lógica (respaldo + pedido adelantado) vive en product-detail-utils.js.
 *
 * Lo usan el modal de producto (product-modal.js) y producto.html
 * (producto.js), así los dos salen por el mismo camino rápido.
 *
 * Formato de salida (el mismo por el RPC y por el respaldo), como lo devolvía
 * el .select() de antes más el resumen de reseñas:
 *   { id, title, description, price, compare_at_price, offer_expires_at, stock,
 *     image_url,
 *     stores: { id, name, owner_id, delivery_fee, free_shipping_threshold,
 *               contact_method, whatsapp } | null,
 *     product_images: [{ url, position }],
 *     product_options: [{ id, name, position,
 *                         product_option_values: [{ id, value, is_available, position }] }],
 *     review_count, review_average }   // review_average: null si no hay reseñas
 */

import { supabase } from './auth-utils.js';
import { fetchReviewsSummary } from './reviews-utils.js';
import { createProductDetailFetcher } from './product-detail-utils.js';

// Las consultas de siempre, solo para cuando la función get_product_detail
// (migración 117) todavía no está en la base. Ojo: son las lentas -- los joins
// anidados disparan en cadena las policies de products/orders/stores.
const LEGACY_SELECT = [
  'id, title, description, price, compare_at_price, offer_expires_at, stock, image_url',
  'stores(id, name, owner_id, delivery_fee, free_shipping_threshold, contact_method, whatsapp)',
  'product_images(url, position)',
  'product_options(id, name, position, product_option_values(id, value, is_available, position))',
].join(', ');

const fetcher = createProductDetailFetcher({
  rpc: async (productId) => {
    const { data, error } = await supabase.rpc('get_product_detail', { p_product_id: productId });
    if (error) throw error;
    return data;
  },

  legacy: async (productId) => {
    const [{ data: product, error }, summary] = await Promise.all([
      supabase.from('products').select(LEGACY_SELECT).eq('id', productId).maybeSingle(),
      fetchReviewsSummary('product', productId),
    ]);
    if (error) throw error;
    if (!product) return null;
    return { ...product, review_count: summary.count, review_average: summary.average };
  },
});

/** Detalle completo de un producto en una sola consulta. Tira si no existe o no se puede ver. */
export const fetchProductDetail = fetcher.fetch;

/** Lo pide por adelantado (hover/toque); el próximo fetchProductDetail del mismo id lo aprovecha. */
export const prefetchProductDetail = fetcher.prefetch;
