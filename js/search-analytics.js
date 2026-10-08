// Eventos de búsqueda y vistas de producto (migración 128).
// Sirven para ver qué se busca, qué búsquedas dan 0 resultados y qué resultados
// se miran (admin_search_report). Medir nunca debe romper ni demorar la página:
// todo es "dispará y olvidate" y cualquier falla (sin red, función no
// desplegada) se ignora.
import { supabase } from './auth-utils.js';

function send(fn, args) {
  try {
    Promise.resolve(supabase.rpc(fn, args)).catch(() => {});
  } catch {
    // sin analítica, la página sigue igual
  }
}

/** Una búsqueda terminada: cuántos resultados dio (productos + comercios + profesionales). */
export function logSearch(query, results) {
  send('log_search_event', { p_kind: 'search', p_query: query, p_results: results });
}

/** Clic en un resultado; position arranca en 1. */
export function logSearchClick(query, productId, position) {
  send('log_search_event', { p_kind: 'click', p_query: query, p_product_id: productId, p_position: position });
}

// Una vista por producto y por carga de página: reabrir el mismo modal diez
// veces no es interés diez veces mayor.
const viewedThisPage = new Set();

export function logProductView(productId) {
  if (!productId || viewedThisPage.has(productId)) return;
  viewedThisPage.add(productId);
  send('log_product_view', { p_product_id: productId });
}
