/**
 * Lógica pura del panel de repartidor (pages/repartidor.html): etapas de una
 * entrega, semáforo de tiempos, links de mapa y código de retiro del comercio.
 * Sin DOM ni red, para poder correr `node js/courier-utils.test.mjs`.
 */
import { safeExternalUrl } from './store-contact-utils.js';

/** Pedidos que un repartidor puede llevar a la vez (lo exige también claim_delivery). */
export const MAX_ACTIVE = 3;

const MIN = 60 * 1000;

/** Cola: amarillo a los 5 min sin que nadie lo tome, rojo a los 10. */
export const QUEUE_WARNING_MS = 5 * MIN;
export const QUEUE_DANGER_MS = 10 * MIN;

/** Ya tomado y sin retirar: ámbar a los 10 min, rojo a los 20. */
export const PICKUP_WARNING_MS = 10 * MIN;
export const PICKUP_DANGER_MS = 20 * MIN;

/** "Ya lo tengo encima" frena el reloj este rato. */
export const HEADS_UP_GRACE_MS = 10 * MIN;

/** Demoras que se pueden avisar, en minutos. */
export const DELAY_OPTIONS = [10, 20, 30];

/** 'queue' | 'normal' | 'warning' | 'danger' según cuánto hace que nadie toma el pedido. */
export function queueLevel(waitMs) {
  if (waitMs >= QUEUE_DANGER_MS) return 'danger';
  if (waitMs >= QUEUE_WARNING_MS) return 'warning';
  return 'normal';
}

/** "recién", "hace 12 min", "hace 1h 05min". */
export function timeAgoLabel(ms) {
  const totalMin = Math.max(0, Math.floor(ms / MIN));
  if (totalMin < 1) return 'recién';
  if (totalMin < 60) return `hace ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = String(totalMin % 60).padStart(2, '0');
  return `hace ${h}h ${m}min`;
}

/**
 * Etapa de una entrega propia para la barra de pasos.
 * @returns {'cancelled'|'assigned'|'picked_up'}
 */
export function deliveryStage(delivery) {
  if (delivery.status === 'cancelled') return 'cancelled';
  return delivery.status === 'picked_up' ? 'picked_up' : 'assigned';
}

/**
 * Semáforo de una entrega todavía sin retirar.
 *   'notified'  el repartidor ya avisó (demora o "ya lo tengo") y el aviso sigue vigente
 *   'danger' / 'warning' / 'normal'  por cuánto hace que la tomó
 * Fuera de la etapa de retiro no hay semáforo ('none').
 */
export function pickupLevel(delivery, now = Date.now()) {
  if (deliveryStage(delivery) !== 'assigned') return 'none';

  const headsUp = delivery.heads_up_at ? new Date(delivery.heads_up_at).getTime() : null;
  if (headsUp != null && now - headsUp < HEADS_UP_GRACE_MS) return 'notified';

  const delayAt = delivery.delay_notice_at ? new Date(delivery.delay_notice_at).getTime() : null;
  if (delayAt != null && delivery.delay_minutes && now < delayAt + delivery.delay_minutes * MIN) return 'notified';

  const takenAt = new Date(delivery.assigned_at).getTime();
  const waited = now - takenAt;
  if (waited >= PICKUP_DANGER_MS) return 'danger';
  if (waited >= PICKUP_WARNING_MS) return 'warning';
  return 'normal';
}

/** Los 4 dígitos que el repartidor le dice al comercio: #BL-1062 -> "1062". */
export function pickupCode(orderNumber) {
  return String(orderNumber ?? '').slice(-4);
}

/** ¿Puede tomar otro pedido? */
export function canTakeMore(activeCount) {
  return Number(activeCount) < MAX_ACTIVE;
}

const MAPS_CITY = 'Baradero, Buenos Aires, Argentina';

function mapsQuery(address) {
  const text = String(address ?? '').trim();
  if (!text) return null;
  // Si la dirección ya dice la ciudad no se repite.
  return /baradero/i.test(text) ? text : `${text}, ${MAPS_CITY}`;
}

/**
 * Links de mapa de un lugar. `mapsUrl` es el link de Google Maps que cargó el
 * comercio (opcional, ya validado en la base); sin él se busca la dirección de
 * texto. `view` abre el lugar y `directions` arma la ruta ("Cómo llegar").
 * @returns {{ view: string|null, directions: string|null }}
 */
export function mapsLinks({ address, mapsUrl } = {}) {
  const query = mapsQuery(address);
  const own = safeExternalUrl(mapsUrl);
  const search = query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
  const directions = query ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}` : own;
  return { view: own || search, directions };
}

/** `tel:` solo con dígitos y +; null si no hay número usable. */
export function telHref(phone) {
  const digits = String(phone ?? '').replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 6 ? `tel:${digits}` : null;
}

/** Mismo criterio que el CHECK stores_maps_url_check (migración 139). */
const GOOGLE_MAPS_URL = /^https:\/\/((www\.)?google\.([a-z]{2,3}|com?\.[a-z]{2})\/maps|maps\.google\.([a-z]{2,3}|com?\.[a-z]{2})\/|maps\.app\.goo\.gl\/|goo\.gl\/maps)/i;

/**
 * Link de Google Maps que carga el comercio. Vacío es válido (es opcional).
 * @returns {{ ok: true, value: string|null } | { ok: false, message: string }}
 */
export function normalizeMapsUrl(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: true, value: null };
  const url = safeExternalUrl(text);
  if (!url || url.length > 500 || !GOOGLE_MAPS_URL.test(url)) {
    return { ok: false, message: 'El link tiene que ser de Google Maps (por ejemplo https://maps.app.goo.gl/...). Abrí tu local en Google Maps, tocá "Compartir" y pegá el link.' };
  }
  return { ok: true, value: url };
}
