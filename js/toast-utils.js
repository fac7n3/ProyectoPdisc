/**
 * toast-utils.js — Alertas emergentes de notificaciones nuevas (A113-268)
 * Baradero Local
 *
 * Capa nueva y reusable: cualquier página puede llamar a
 * `initNotificationToasts(userId)` para que, mientras esa pestaña esté
 * abierta, cada notificación nueva del usuario aparezca como un toast
 * (campanita + texto corto) abajo a la derecha en PC y abajo del todo en
 * celular. Se apilan de a una, máximo 3 a la vez, y desaparecen solas a
 * los ~5s (o con el botón de cerrar).
 *
 * En tiempo real desde el 2026-10-02: antes se pedía la lista cada 30
 * segundos, así que un aviso tardaba hasta medio minuto en aparecer. Ahora
 * llega por Supabase Realtime (js/notifications-live.js) apenas se inserta la
 * fila, en todas las pestañas y dispositivos donde esté abierta la cuenta.
 *
 * El puntero "la última que mostré" (localStorage, por navegador) se sigue
 * usando para ponerse al día cuando pudo perderse algo: al abrir la página,
 * al reconectarse el canal o al volver a la pestaña se pide la lista y se
 * muestra lo que sea más nuevo que ese puntero. La primera vez que corre en
 * un navegador no muestra nada retroactivo -- solo guarda la más reciente
 * como punto de partida, para no inundar de golpe con avisos viejos.
 */
import { fetchNotifications, buildNotificationTitle, buildNotificationLink } from './notifications-utils.js';
import { getPref } from './settings-utils.js';
import { startNotificationsLive, onNotificationsChanged } from './notifications-live.js';

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 5000;
// Fecha (created_at) de la última notificación ya mostrada en este navegador.
// Hasta el 2026-10-02 se guardaba el id (LEGACY_LAST_SEEN_KEY), y eso tenía un
// problema: si la persona borraba justo esa notificación, el id dejaba de
// aparecer en la lista y las 30 más recientes se tomaban como nuevas, todas de
// golpe. Con la fecha eso no pasa.
const LAST_SEEN_KEY = 'bl_toast_last_notif_at';
const LEGACY_LAST_SEEN_KEY = 'bl_toast_last_notif_id';

/** Ya mostradas en esta pestaña: el aviso en vivo y la puesta al día no se duplican. */
const shownIds = new Set();

let container = null;

function ensureContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.id = 'bl-toast-container';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
  return container;
}

/**
 * Muestra un toast suelto. Exportada aparte de initNotificationToasts para
 * poder reusar la misma capa visual desde cualquier otro flujo futuro
 * (no solo notificaciones de la tabla `notifications`) sin duplicar CSS/DOM.
 * @param {{ title: string, href?: string|null }} opts
 */
export function showNotificationToast({ title, href = null }) {
  const c = ensureContainer();

  // Máximo 3 a la vez: si ya hay 3, se saca el más viejo (el primero en el
  // DOM) para que entre el nuevo -- se apilan de a una, no se acumulan.
  while (c.children.length >= MAX_TOASTS) {
    const oldest = c.firstElementChild;
    if (!oldest) break;
    oldest.remove();
  }

  const toast = document.createElement(href ? 'a' : 'div');
  toast.className = 'bl-toast';
  if (href) toast.href = href;

  const icon = document.createElement('i');
  icon.className = 'fa-solid fa-bell bl-toast__icon';
  icon.setAttribute('aria-hidden', 'true');
  toast.appendChild(icon);

  const text = document.createElement('span');
  text.className = 'bl-toast__text';
  text.textContent = title;
  toast.appendChild(text);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'bl-toast__close';
  closeBtn.setAttribute('aria-label', 'Cerrar aviso');
  closeBtn.textContent = '×';
  toast.appendChild(closeBtn);

  c.appendChild(toast);
  // Fuerza el reflow antes de agregar la clase que anima la entrada.
  void toast.offsetHeight;
  requestAnimationFrame(() => toast.classList.add('is-visible'));

  let dismissTimer = null;
  function dismiss() {
    if (!toast.isConnected) return;
    clearTimeout(dismissTimer);
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 250);
  }

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dismiss();
  });

  dismissTimer = setTimeout(dismiss, AUTO_DISMISS_MS);
  return dismiss;
}

/**
 * created_at a milisegundos. Normaliza a mano porque la misma fecha llega con
 * formatos distintos según el camino: la API REST la manda como
 * "2026-10-02T15:04:05.123456+00:00" y Realtime puede mandarla con espacio y
 * zona corta ("2026-10-02 15:04:05.123456+00"); Safari viejo da Invalid Date
 * con más de 3 decimales.
 */
function toMs(ts) {
  if (!ts) return NaN;
  const normalized = String(ts)
    .replace(' ', 'T')
    .replace(/(\.\d{3})\d+/, '$1')
    .replace(/([+-]\d{2})$/, '$1:00');
  return new Date(normalized).getTime();
}

function readLastSeen() {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null; // localStorage puede fallar (navegación privada, etc.)
  }
}

/** Solo avanza: un aviso viejo que llega tarde no hace retroceder el puntero. */
function setLastSeen(createdAt) {
  if (!createdAt) return;
  const current = toMs(readLastSeen());
  if (current >= toMs(createdAt)) return; // NaN >= x da false: se guarda
  try { localStorage.setItem(LAST_SEEN_KEY, createdAt); } catch { /* no-op */ }
}

/**
 * Muestra los toasts de `list` (del más viejo al más nuevo, para que el más
 * reciente quede arriba de la pila) y avisa a la página. Las ya mostradas en
 * esta pestaña se saltean.
 */
function announce(list) {
  const fresh = list.filter((n) => n?.id && !shownIds.has(n.id));
  if (!fresh.length) return;
  fresh.forEach((n) => shownIds.add(n.id));

  if (getPref('notifToasts')) {
    fresh.forEach((n) => {
      const link = buildNotificationLink(n);
      showNotificationToast({ title: buildNotificationTitle(n), href: link?.href || null });
    });
  }
  // La página que quiera reaccionar (ej. el panel del vendedor: sonido +
  // recargar pedidos) escucha esto. Sale aunque los toasts estén apagados:
  // apagarlos en Ajustes no tiene por qué callar el aviso de pedido nuevo.
  window.dispatchEvent(new CustomEvent('bl:new-notifications', { detail: fresh }));
}

/** Una notificación recién insertada, llegada por Realtime. */
function handleLiveInsert(n) {
  if (!n?.id) return;
  setLastSeen(n.created_at);
  announce([n]);
}

/**
 * Puesta al día: pide la lista y anuncia lo que sea más nuevo que el puntero.
 * Corre al abrir la página y cada vez que Realtime avisa que pudo perderse
 * algo (reconexión, vuelta a la pestaña, canal sin conexión).
 */
async function catchUp(userId) {
  // Con los toasts apagados (Perfil → Ajustes) el puntero avanza igual: así,
  // al volver a encenderlos, no llegan de golpe todas las de mientras.
  let notifications;
  try {
    notifications = await fetchNotifications(userId);
  } catch (err) {
    console.error('Error al buscar notificaciones nuevas para el toast:', err);
    return;
  }
  if (!notifications.length) return;

  let lastSeenAt = readLastSeen();
  if (!lastSeenAt) {
    // Navegador que venía con el puntero viejo (por id): se traduce a fecha
    // si esa notificación sigue en la lista; si no, se arranca de cero.
    let legacyId = null;
    try {
      legacyId = localStorage.getItem(LEGACY_LAST_SEEN_KEY);
      localStorage.removeItem(LEGACY_LAST_SEEN_KEY);
    } catch { /* no-op */ }
    lastSeenAt = notifications.find((n) => n.id === legacyId)?.created_at || null;
  }

  if (!lastSeenAt) {
    // Primera vez en este navegador: no mostrar nada retroactivo.
    notifications.forEach((n) => shownIds.add(n.id));
    setLastSeen(notifications[0].created_at);
    return;
  }

  const since = toMs(lastSeenAt);
  const newOnes = notifications.filter((n) => toMs(n.created_at) > since);

  setLastSeen(notifications[0].created_at);
  // notifications viene del más nuevo al más viejo.
  announce(newOnes.reverse());
}

let started = false;

/**
 * Arranca los avisos de notificaciones nuevas para `userId`. Segura de llamar
 * más de una vez por página (solo se engancha una vez).
 */
export function initNotificationToasts(userId) {
  if (!userId || started) return;
  started = true;

  onNotificationsChanged((detail) => {
    if (detail.eventType === 'INSERT') handleLiveInsert(detail.new);
    else if (detail.eventType === 'RESYNC') catchUp(userId);
  });
  startNotificationsLive(userId);

  // Un primer chequeo inmediato: si llegó algo mientras la persona no tenía
  // la página abierta, lo ve apenas vuelve.
  catchUp(userId);
}
