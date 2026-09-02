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
 * Fuente de las notificaciones: la misma tabla `notifications` que ya usa
 * el centro de notificaciones (notifications-utils.js) -- no hay una
 * suscripción realtime de Supabase todavía en este proyecto (no se usa
 * `supabase.channel` en ningún otro lado), así que en vez de sumar esa
 * complejidad nueva se resuelve con un polling simple: cada
 * POLL_INTERVAL_MS se pide la misma lista de notificaciones que ya trae
 * `fetchNotifications`, y lo que sea más nuevo que la última notificación
 * ya mostrada (guardada en localStorage, por navegador) se muestra como
 * toast. La primera vez que corre en un navegador no muestra nada
 * retroactivo -- solo guarda la más reciente como punto de partida, para no
 * inundar de golpe con avisos viejos.
 */
import { fetchNotifications, buildNotificationTitle, buildNotificationLink } from './notifications-utils.js';
import { getPref } from './settings-utils.js';

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 5000;
const POLL_INTERVAL_MS = 30000;
const LAST_SEEN_KEY = 'bl_toast_last_notif_id';

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

async function pollOnce(userId) {
  // Apagados desde Perfil → Ajustes: no se consulta nada (ahorra un fetch cada
  // 30s) y el cambio se siente al instante, sin recargar la página. Se borra
  // el puntero de "la última que mostré" para que al volver a encenderlos se
  // arranque de cero, en vez de llegar de golpe todas las de mientras.
  if (!getPref('notifToasts')) {
    try { localStorage.removeItem(LAST_SEEN_KEY); } catch { /* no-op */ }
    return;
  }

  let notifications;
  try {
    notifications = await fetchNotifications(userId);
  } catch (err) {
    console.error('Error al buscar notificaciones nuevas para el toast:', err);
    return;
  }
  if (!notifications.length) return;

  let lastSeenId;
  try {
    lastSeenId = localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    lastSeenId = null; // localStorage puede fallar (navegación privada, etc.)
  }

  if (!lastSeenId) {
    // Primera vez en este navegador: no mostrar nada retroactivo.
    try { localStorage.setItem(LAST_SEEN_KEY, notifications[0].id); } catch { /* no-op */ }
    return;
  }

  const lastSeenIndex = notifications.findIndex((n) => n.id === lastSeenId);
  // Si no se encuentra (la más vieja de las últimas 30 ya rotó afuera), se
  // asume que todo lo que llegó es nuevo -- mejor mostrar de más que perder avisos.
  const newOnes = lastSeenIndex === -1 ? notifications : notifications.slice(0, lastSeenIndex);

  if (newOnes.length > 0) {
    // notifications viene ordenado del más nuevo al más viejo -- se muestran
    // en orden cronológico (el más viejo primero) para que el más reciente
    // quede arriba de la pila.
    [...newOnes].reverse().forEach((n) => {
      const link = buildNotificationLink(n);
      showNotificationToast({ title: buildNotificationTitle(n), href: link?.href || null });
    });
    try { localStorage.setItem(LAST_SEEN_KEY, notifications[0].id); } catch { /* no-op */ }
  }
}

let pollingStarted = false;

/**
 * Arranca el polling de notificaciones nuevas para `userId`. Segura de
 * llamar más de una vez por página (solo arranca el intervalo una vez).
 */
export function initNotificationToasts(userId) {
  if (!userId || pollingStarted) return;
  pollingStarted = true;

  // Un primer chequeo inmediato: si llegó algo mientras la persona no tenía
  // la página abierta, lo ve apenas vuelve, no recién a los 30s.
  pollOnce(userId);
  setInterval(() => pollOnce(userId), POLL_INTERVAL_MS);
}
