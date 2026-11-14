// Lógica pura (sin DOM ni Supabase) de Admin -> "Beneficios de comercios".
// Correr los tests con `node js/admin-beneficios-utils.test.mjs`.
//
// Las filas son las que devuelve la RPC admin_list_benefits (migración 160):
//   { id, store_id, store_name, owner_email, plan_id, service_id, item_name, quantity,
//     source ('purchase'|'admin'), status ('active'|'pending'|'needs_review'|'cancelled'),
//     starts_at, ends_at, ... }
// "Vencido" no es un estado guardado: es `active` con ends_at en el pasado.

import { formatBoostDate } from './boost-utils.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** En la tabla, "vence pronto" = faltan 7 días o menos. */
export const EXPIRING_DAYS = 7;
/** La tarjeta de renovaciones (y el recordatorio a los admins): faltan 3 días o menos. */
export const RENEWAL_DAYS = 3;
/** Y también aparecen los que vencieron hace hasta 7 días y todavía no se renovaron. */
export const RENEWAL_EXPIRED_WINDOW_DAYS = 7;

export const STATE_LABEL = {
  vigente: 'Vigente',
  vence_pronto: 'Vence pronto',
  vencido: 'Vencido',
  en_revision: 'En revisión',
  quitado: 'Quitado',
  esperando_pago: 'Esperando pago',
  programado: 'Programado',
};

/** Clase de color (las mismas `status-*` del resto del admin) de cada estado. */
export const STATE_CLASS = {
  vigente: 'status-approved',
  vence_pronto: 'status-suspended',
  vencido: 'status-rejected',
  en_revision: 'status-rejected',
  quitado: 'status-rejected',
  esperando_pago: 'status-suspended',
  programado: 'status-approved',
};

/** Opciones del filtro "Estado" (valor -> texto). */
export const STATE_FILTERS = [
  ['', 'Todos'],
  ['vigente', 'Vigentes'],
  ['vence_pronto', `Vencen en ${EXPIRING_DAYS} días o menos`],
  ['en_revision', 'En revisión'],
  ['vencido', 'Vencidos'],
  ['quitado', 'Quitados'],
  ['esperando_pago', 'Esperando pago'],
];

/** Sin acentos ni mayúsculas, para buscar "panaderia" y encontrar "Panadería". */
export function normalizeText(text) {
  return String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * @param {{ status: string, starts_at?: string|null, ends_at?: string|null }} row
 * @param {number} [nowMs]
 * @returns {'vigente'|'vence_pronto'|'vencido'|'en_revision'|'quitado'|'esperando_pago'|'programado'}
 */
export function benefitState(row, nowMs = Date.now()) {
  if (row.status === 'cancelled') return 'quitado';
  if (row.status === 'needs_review') return 'en_revision';
  if (row.status === 'pending') return 'esperando_pago';
  const end = row.ends_at ? new Date(row.ends_at).getTime() : NaN;
  const start = row.starts_at ? new Date(row.starts_at).getTime() : NaN;
  if (Number.isNaN(end) || end <= nowMs) return 'vencido';
  if (!Number.isNaN(start) && start > nowMs) return 'programado';
  return end - nowMs <= EXPIRING_DAYS * DAY_MS ? 'vence_pronto' : 'vigente';
}

/** Día del calendario en Argentina ('YYYY-MM-DD'): evita que un vencimiento a las 23:00 "salte" de día. */
function argentinaDay(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** Días de calendario entre hoy y el fin (0 = hoy, 1 = mañana, -1 = ayer). */
export function calendarDaysUntil(endIso, nowMs = Date.now()) {
  const a = argentinaDay(nowMs).split('-').map(Number);
  const b = argentinaDay(new Date(endIso).getTime()).split('-').map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / DAY_MS);
}

/** "vence hoy", "vence mañana", "vence en 3 días", "venció ayer", "venció hace 4 días". */
export function whenText(endIso, nowMs = Date.now()) {
  const d = calendarDaysUntil(endIso, nowMs);
  if (d === 0) return new Date(endIso).getTime() > nowMs ? 'vence hoy' : 'venció hoy';
  if (d === 1) return 'vence mañana';
  if (d > 1) return `vence en ${d} días`;
  if (d === -1) return 'venció ayer';
  return `venció hace ${-d} días`;
}

/** ¿La fila tiene este elemento? Por id de combo/servicio, o -- si es un combo -- porque lo incluye. */
function rowHasItem(row, itemId, planItems) {
  if (!itemId) return true;
  if (row.plan_id === itemId || row.service_id === itemId) return true;
  return !!row.plan_id && (planItems || []).some((it) => it.plan_id === row.plan_id && it.service_id === itemId);
}

/**
 * Filtros de la tabla.
 *  - `q`: texto en el nombre del comercio, el email del dueño o el nombre del combo/servicio.
 *  - `itemId`: un combo o un servicio. Elegir un servicio muestra también los combos que lo incluyen.
 *  - `state`: '' (todos) | 'vigente' (incluye "vence pronto" y "programado") | cualquiera de los estados.
 */
export function filterBenefits(rows, { q = '', itemId = '', state = '' } = {}, nowMs = Date.now(), planItems = []) {
  const needle = normalizeText(q);
  return (rows || []).filter((row) => {
    if (needle) {
      const hay = normalizeText(`${row.store_name || ''} ${row.owner_email || ''} ${row.item_name || ''}`);
      if (!hay.includes(needle)) return false;
    }
    if (!rowHasItem(row, itemId, planItems)) return false;
    if (state) {
      const s = benefitState(row, nowMs);
      if (state === 'vigente' ? !['vigente', 'vence_pronto', 'programado'].includes(s) : s !== state) return false;
    }
    return true;
  });
}

/**
 * Compras vigentes o vencidas hace poco que hay que renovar, de la más urgente a la menos.
 * Cada una trae `daysLeft` (días de calendario; negativo si ya venció) y `when` ("vence mañana").
 */
export function renewalsDue(rows, nowMs = Date.now()) {
  return (rows || [])
    .filter((row) => {
      if (row.status !== 'active' || !row.ends_at) return false;
      const d = calendarDaysUntil(row.ends_at, nowMs);
      return d <= RENEWAL_DAYS && d >= -RENEWAL_EXPIRED_WINDOW_DAYS;
    })
    .map((row) => ({ ...row, daysLeft: calendarDaysUntil(row.ends_at, nowMs), when: whenText(row.ends_at, nowMs), expired: new Date(row.ends_at).getTime() <= nowMs }))
    .sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at));
}

/**
 * Contadores para los atajos y la insignia del menú.
 * `badge` = lo que pide acción: compras en revisión + renovaciones por hacer.
 */
export function summarizeBenefits(rows, nowMs = Date.now()) {
  let review = 0;
  let expiring = 0;
  let active = 0;
  for (const row of rows || []) {
    const s = benefitState(row, nowMs);
    if (s === 'en_revision') review += 1;
    else if (s === 'vence_pronto') { expiring += 1; active += 1; }
    else if (s === 'vigente' || s === 'programado') active += 1;
  }
  const renewals = renewalsDue(rows, nowMs).length;
  return { review, expiring, active, renewals, badge: review + renewals };
}

/**
 * Comercios que tienen un servicio vigente ahora, ya sea comprado, regalado o dentro de un
 * combo. Un comercio aparece una sola vez, con todos sus orígenes y el fin más lejano.
 * @returns {Array<{ store_id:string, store_name:string, owner_email:string|null, origins:string[], endsAt:string }>}
 */
export function storesWithService(rows, serviceId, planItems = [], nowMs = Date.now()) {
  const byStore = new Map();
  for (const row of rows || []) {
    if (row.status !== 'active' || !row.starts_at || !row.ends_at) continue;
    const start = new Date(row.starts_at).getTime();
    const end = new Date(row.ends_at).getTime();
    if (!(start <= nowMs && nowMs < end)) continue;

    let origin = null;
    if (row.service_id === serviceId) origin = row.source === 'admin' ? 'Regalo' : 'Compra';
    else if (row.plan_id && planItems.some((it) => it.plan_id === row.plan_id && it.service_id === serviceId)) origin = row.item_name;
    if (!origin) continue;

    const key = row.store_id;
    const entry = byStore.get(key) || { store_id: key, store_name: row.store_name || '(comercio eliminado)', owner_email: row.owner_email || null, origins: [], endsAt: row.ends_at };
    if (!entry.origins.includes(origin)) entry.origins.push(origin);
    if (new Date(row.ends_at) > new Date(entry.endsAt)) entry.endsAt = row.ends_at;
    byStore.set(key, entry);
  }
  return [...byStore.values()].sort((a, b) => a.store_name.localeCompare(b.store_name, 'es'));
}

/**
 * Link de WhatsApp para que el admin le recuerde al comercio que tiene que abonar de nuevo.
 * Devuelve null si el comercio no cargó un WhatsApp válido (8 a 15 dígitos).
 * @param {{ phone?: string|null, storeName?: string, itemName: string, endsAt: string, expired?: boolean }} p
 */
export function renewalWhatsAppUrl({ phone, storeName, itemName, endsAt, expired = false }) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15 || !String(itemName || '').trim() || !endsAt) return null;
  const store = String(storeName || '').replace(/\s+/g, ' ').trim();
  const what = `${String(itemName).replace(/\s+/g, ' ').trim()}${store ? ` de ${store}` : ''}`;
  const when = `${expired ? 'venció' : 'vence'} el ${formatBoostDate(new Date(endsAt))}`;
  const text = `Hola, te escribimos de Baradero Local: ${what} ${when}. ¿Querés renovarlo?`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * Texto de la notificación `boost_renewal_reminder` que la base le deja a cada admin
 * (migración 161): "2 por vencer: Kiosco Sol (Banner chico x2, 13/11/2026), ...".
 * `payload` = { count, items: [{ store_name, item_name, ends_at }] } (hasta 5 ítems).
 * @returns {string|null}
 */
export function renewalReminderPreview(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const count = Number(payload?.count) || items.length;
  if (!count) return null;
  const shown = items.slice(0, 3).map((it) => {
    const when = it.ends_at ? `, ${formatBoostDate(new Date(it.ends_at))}` : '';
    return `${it.store_name || 'Comercio'} (${it.item_name || 'combo'}${when})`;
  });
  const rest = count - shown.length;
  const head = `${count} por vencer`;
  if (!shown.length) return head;
  return `${head}: ${shown.join('; ')}${rest > 0 ? ` y ${rest} más` : ''}`;
}

/** Fecha de fin que va a tener una compra si se renueva (para mostrarla antes de confirmar). */
export function renewedEnd(row, days = 30, nowMs = Date.now()) {
  const end = new Date(row.ends_at).getTime();
  return new Date(Math.max(end, nowMs) + days * DAY_MS);
}
