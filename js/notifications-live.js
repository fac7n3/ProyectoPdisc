/**
 * notifications-live.js — Las notificaciones de la cuenta, en tiempo real.
 * Baradero Local
 *
 * Un solo canal por página (no uno por cada cosa que muestra notificaciones)
 * que escucha la tabla `notifications` de la cuenta y avisa por un evento de
 * window. Quien necesite reaccionar se cuelga de ese evento:
 *   - los avisos emergentes (js/toast-utils.js) muestran el nuevo al instante;
 *   - la campanita del navbar (js/nav-utils.js) y la tarjeta de "Mi perfil"
 *     recalculan el número de no leídas;
 *   - el centro de notificaciones abierto (renderNotificationsSection) se
 *     vuelve a dibujar.
 *
 * Como cada dispositivo abre su propio canal, una notificación nueva salta en
 * todos a la vez, y marcarla como leída (o borrarla) en el celular baja la
 * campanita también en la compu.
 *
 * Evento: `bl:notifications-changed`, con `detail` =
 *   { eventType: 'INSERT'|'UPDATE'|'DELETE', new, old }  un cambio puntual, o
 *   { eventType: 'RESYNC' }  pudo haberse perdido algo (reconexión, vuelta a
 *                            la pestaña): hay que volver a pedir todo.
 */
import { subscribeToChanges } from './realtime-utils.js';

export const NOTIFICATIONS_CHANGED_EVENT = 'bl:notifications-changed';

/**
 * Ids de notificaciones de esta cuenta que la página ya conoce. Hace falta
 * para los DELETE: Supabase no deja filtrarlos por user_id y llegan los de
 * todas las cuentas, con solo el id (ver migración 117). Uno que no está acá
 * no es de esta cuenta, o no se estaba mostrando: se ignora.
 */
const knownIds = new Set();

let liveUserId = null;

/** Lo llama fetchNotifications con cada lista que trae de la base. */
export function rememberNotificationIds(list) {
  (list || []).forEach((n) => { if (n?.id) knownIds.add(n.id); });
}

function emit(detail) {
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail }));
}

/**
 * Arranca la escucha para `userId`. Segura de llamar varias veces (desde el
 * navbar, desde auth-utils, desde un panel): solo abre el canal la primera.
 */
export function startNotificationsLive(userId) {
  if (!userId || liveUserId === userId) return;
  liveUserId = userId;

  const filter = `user_id=eq.${userId}`;
  subscribeToChanges('notificaciones', [
    { table: 'notifications', event: 'INSERT', filter },
    { table: 'notifications', event: 'UPDATE', filter },
    { table: 'notifications', event: 'DELETE' },
  ], (change) => {
    if (change.eventType === 'DELETE') {
      const id = change.old?.id;
      if (!id || !knownIds.has(id)) return;
      knownIds.delete(id);
    } else if (change.new?.id) {
      knownIds.add(change.new.id);
    }
    emit({ eventType: change.eventType, new: change.new, old: change.old });
  }, {
    onResync: () => emit({ eventType: 'RESYNC' }),
  });
}

/**
 * Atajo para colgarse del evento.
 * @param {(detail: object) => void} handler
 * @returns {() => void} para descolgarse
 */
export function onNotificationsChanged(handler) {
  const listener = (e) => handler(e.detail || {});
  window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
  return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, listener);
}
