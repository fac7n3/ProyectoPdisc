/**
 * store-metrics.js — registrar toques en la página de un comercio (migración 168)
 * Baradero Local
 *
 * Mismo criterio que `search-analytics.js`: "dispará y olvidate". Medir nunca debe romper
 * ni demorar la página, así que no se espera la respuesta y cualquier falla (sin red, función
 * no desplegada, tope de llamadas) se ignora. La base descarta sola las visitas del dueño,
 * de sus empleados y de los admins sobre su propio comercio, y pone un tope por hora.
 *
 * La lógica que se puede probar sin navegador está en `store-metrics-utils.js`.
 */

import { supabase } from './auth-utils.js';
import { storeMetricParams } from './store-metrics-utils.js';

function send(params) {
  if (!params) return;
  try {
    Promise.resolve(supabase.rpc('increment_store_metric', params)).catch(() => {});
  } catch {
    // sin analítica, la página sigue igual
  }
}

// Una visita por comercio y por sesión del navegador: recargar la página o volver con la
// flecha no es una visita nueva. (sessionStorage puede estar bloqueado: el Set cubre ese caso.)
const countedThisPage = new Set();

/** Alguien abrió la página del comercio. */
export function trackStoreView(storeId) {
  if (countedThisPage.has(storeId)) return;
  countedThisPage.add(storeId);
  const key = `bl:store-view:${storeId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    // sin sessionStorage: se cuenta una vez por carga de página
  }
  send(storeMetricParams(storeId, 'profile_view'));
}

/** Tocó "Contactar al vendedor" (WhatsApp, teléfono o mail). Cada toque cuenta. */
export function trackStoreContact(storeId) {
  send(storeMetricParams(storeId, 'contact_click'));
}

/** Tocó el botón de una red del perfil. `network`: instagram, facebook, tiktok, x, youtube o website. */
export function trackStoreSocial(storeId, network) {
  send(storeMetricParams(storeId, 'social_click', network));
}
