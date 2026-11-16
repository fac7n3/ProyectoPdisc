/**
 * store-metrics-utils.js — lógica pura de las estadísticas del comercio (migración 168)
 * Baradero Local
 *
 * Sin DOM ni Supabase, para poder probarla en Node (`js/store-metrics-utils.test.mjs`).
 * La usan `js/store-metrics.js` (registrar toques en la página del comercio) y
 * `js/vender-estadisticas.js` (resumen y sección "Estadísticas" del panel).
 *
 * Qué se mide (del lado del sitio): visitas a la página del comercio, toques en
 * "Contactar al vendedor", toques en los botones de redes del perfil y vistas de
 * las publicaciones. Lo que pasa DENTRO de Instagram o Facebook no se puede medir.
 */

import { SOCIAL_NETWORKS } from './store-contact-utils.js';

/** Tipos de evento que acepta `increment_store_metric` (los valida también la base). */
export const STORE_EVENT_TYPES = ['profile_view', 'contact_click', 'social_click'];

/** Día desde el que se cuentan los toques (cuando se aplicó la migración 168). */
export const TRACKING_STARTED = '2026-11-16';

const NETWORK_KEYS = new Set(SOCIAL_NETWORKS.map((n) => n.key));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parámetros del RPC `increment_store_metric`, o null si algo no es válido (así no se
 * hace una llamada que la base va a rechazar igual).
 * @param {string} storeId
 * @param {string} eventType
 * @param {string} [network] solo para `social_click`: instagram, facebook, tiktok, x, youtube o website
 */
export function storeMetricParams(storeId, eventType, network = '') {
  if (typeof storeId !== 'string' || !UUID_RE.test(storeId)) return null;
  if (!STORE_EVENT_TYPES.includes(eventType)) return null;
  if (eventType === 'social_click') {
    if (!NETWORK_KEYS.has(network)) return null;
    return { p_store_id: storeId, p_event_type: eventType, p_detail: network };
  }
  return { p_store_id: storeId, p_event_type: eventType, p_detail: '' };
}

/** Los 4 números del resumen, en el orden en que se muestran. */
export const METRIC_CARDS = [
  { key: 'profile_views', label: 'Visitas a tu comercio', icon: 'fa-solid fa-eye', hint: 'Veces que abrieron la página de tu comercio.' },
  { key: 'product_views', label: 'Publicaciones vistas', icon: 'fa-solid fa-image', hint: 'Veces que abrieron una de tus publicaciones.' },
  { key: 'contact_clicks', label: 'Toques en Contactar', icon: 'fa-brands fa-whatsapp', hint: 'Veces que tocaron "Contactar al vendedor".' },
  { key: 'social_clicks', label: 'Toques en tus redes', icon: 'fa-solid fa-share-nodes', hint: 'Veces que tocaron el botón de una de tus redes (Instagram, Facebook...).' },
];

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

const emptyTotals = () => ({ profile_views: 0, product_views: 0, contact_clicks: 0, social_clicks: 0 });
const readTotals = (o) => ({
  profile_views: num(o?.profile_views),
  product_views: num(o?.product_views),
  contact_clicks: num(o?.contact_clicks),
  social_clicks: num(o?.social_clicks),
});

const networkLabel = (key) => SOCIAL_NETWORKS.find((n) => n.key === key)?.label || key;

/**
 * Ordena y sanea la respuesta de `get_store_metrics` (nunca se confía en la forma:
 * números inválidos pasan a 0, listas que no son listas a vacías).
 * Con `locked: true` la base no manda el detalle (`previous`, `daily`, ...): acá quedan en null / [].
 * @returns {null | {
 *   from: string, to: string, days: number, pro: boolean, locked: boolean,
 *   totals: Record<string, number>, previous: null | Record<string, number>,
 *   daily: Array<Record<string, number|string>>,
 *   socialByNetwork: Array<{ network: string, label: string, count: number }>,
 *   topProducts: Array<{ id: string, title: string, views: number }>,
 * }}
 */
export function normalizeStoreMetrics(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const locked = raw.locked !== false;
  const daily = Array.isArray(raw.daily)
    ? raw.daily.map((d) => ({
      day: String(d?.day || '').slice(0, 10),
      ...readTotals(d),
    })).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day))
    : [];
  return {
    from: String(raw.from || '').slice(0, 10),
    to: String(raw.to || '').slice(0, 10),
    days: num(raw.days) || 30,
    pro: raw.pro === true,
    locked,
    totals: raw.totals ? readTotals(raw.totals) : emptyTotals(),
    previous: !locked && raw.previous ? readTotals(raw.previous) : null,
    daily: locked ? [] : daily,
    socialByNetwork: !locked && Array.isArray(raw.social_by_network)
      ? raw.social_by_network
        .map((r) => ({ network: String(r?.network || ''), label: networkLabel(String(r?.network || '')), count: num(r?.count) }))
        .filter((r) => r.network && r.count > 0)
      : [],
    topProducts: !locked && Array.isArray(raw.top_products)
      ? raw.top_products
        .map((r) => ({ id: String(r?.id || ''), title: String(r?.title || 'Publicación'), views: num(r?.views) }))
        .filter((r) => r.id && r.views > 0)
      : [],
  };
}

/** ¿Hubo algún movimiento en los 4 números? */
export function hasAnyActivity(totals) {
  return Object.values(totals || {}).some((v) => num(v) > 0);
}

/**
 * Cambio contra el período anterior.
 * @returns {null | { direction: 'up'|'down'|'same'|'new', pct: number|null, text: string }}
 *   null si no hubo nada en ninguno de los dos períodos (no hay qué comparar).
 */
export function changeVsPrevious(current, previous) {
  const c = num(current);
  const p = num(previous);
  if (c === 0 && p === 0) return null;
  if (p === 0) return { direction: 'new', pct: null, text: 'Nuevo: antes no había movimiento' };
  const pct = Math.round(((c - p) / p) * 100);
  if (pct === 0) return { direction: 'same', pct: 0, text: 'Igual que los 30 días anteriores' };
  if (pct > 0) return { direction: 'up', pct, text: `${pct}% más que los 30 días anteriores` };
  return { direction: 'down', pct, text: `${Math.abs(pct)}% menos que los 30 días anteriores` };
}

/**
 * Alturas de las barras de un gráfico diario: el día más alto ocupa el 100%; un día con
 * movimiento nunca queda en cero (mínimo 4%) para que se vea; un día sin nada queda en 0.
 * @param {Array<Record<string, number|string>>} daily
 * @param {string} key profile_views | product_views | contact_clicks | social_clicks
 */
export function barHeights(daily, key) {
  const values = (daily || []).map((d) => num(d?.[key]));
  const max = Math.max(1, ...values);
  return (daily || []).map((d, i) => ({
    day: d.day,
    value: values[i],
    pct: values[i] === 0 ? 0 : Math.max(4, Math.round((values[i] / max) * 100)),
  }));
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "2026-11-05" -> "5/11" (sin pasar por Date: no hay corrimientos de zona horaria). */
export function shortDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${Number(m[3])}/${Number(m[2])}` : '';
}

/** "2026-11-05" -> "5 de noviembre". */
export function longDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? `${Number(m[3])} de ${MONTHS[Number(m[2]) - 1] || ''}`.trim() : '';
}

/** Texto del período: "Del 17 de octubre al 15 de noviembre". */
export function periodText(from, to) {
  const a = longDay(from);
  const b = longDay(to);
  return a && b ? `Del ${a} al ${b}` : 'Últimos 30 días';
}

/** ¿La ventana de 30 días empieza antes de que se empezara a contar? (para avisarlo) */
export function startedCountingRecently(from) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(from || '')) && String(from) < TRACKING_STARTED;
}

/** "1234" -> "1.234" (miles con punto, como el resto del sitio). */
export function formatCount(n) {
  return num(n).toLocaleString('es-AR');
}

/** Qué suma Estadísticas Pro (para la vista bloqueada). */
export const PRO_FEATURES = [
  'Evolución día por día de visitas, publicaciones, contactos y redes.',
  'Comparación con los 30 días anteriores: si venís subiendo o bajando.',
  'Qué red social te trae más toques.',
  'Tus 5 publicaciones más vistas.',
];
