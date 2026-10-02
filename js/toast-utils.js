/**
 * toast-utils.js — Alertas emergentes de notificaciones nuevas (A113-268)
 * Baradero Local
 *
 * Capa nueva y reusable: cualquier página puede llamar a
 * `initNotificationToasts(userId)` para que, mientras esa pestaña esté
 * abierta, cada notificación nueva del usuario aparezca abajo de la pantalla
 * con forma de notificación de celular (2026-10-02, a pedido del usuario: el
 * cartelito chico de la esquina se pasaba sin leer): ícono y nombre de la app,
 * "ahora", título en negrita, una línea de detalle y la acción ("Ver pedido").
 * Se apilan, máximo 3 a la vez. Duran 8 s, pero el tiempo se frena mientras
 * el mouse o el dedo están encima (o tiene el foco), para que dé tiempo a
 * leerla. Se cierra con la X o deslizándola, y tocarla la abre y la marca
 * como leída.
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
import {
  fetchNotifications, buildNotificationTitle, buildNotificationLink, buildNotificationPreview, markNotificationRead,
} from './notifications-utils.js';
import { getPref } from './settings-utils.js';
import { startNotificationsLive, onNotificationsChanged } from './notifications-live.js';

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 8000;
/** Cuánto hay que deslizarla (px) para que se cierre. */
const SWIPE_DISMISS_PX = 70;
const APP_ICON_SRC = '/icon.svg';
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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Muestra una notificación suelta. Exportada aparte de initNotificationToasts
 * para poder reusar la misma capa visual desde cualquier otro flujo (no solo
 * notificaciones de la tabla `notifications`) sin duplicar CSS/DOM.
 *
 * @param {{
 *   title: string,
 *   body?: string|null,         línea de detalle ("Pedido por $5.000")
 *   href?: string|null,         a dónde lleva tocarla
 *   actionLabel?: string|null,  texto de la acción ("Ver pedido")
 *   onOpen?: () => void,        al tocarla (ej. marcarla como leída)
 * }} opts
 * @returns {() => void} para cerrarla
 */
export function showNotificationToast({ title, body = null, href = null, actionLabel = null, onOpen = null }) {
  const c = ensureContainer();

  // Máximo 3 a la vez: si ya hay 3, se saca la más vieja (la primera en el
  // DOM) para que entre la nueva.
  while (c.children.length >= MAX_TOASTS) {
    const oldest = c.firstElementChild;
    if (!oldest) break;
    oldest.remove();
  }

  const toast = el('div', 'bl-toast');

  // Todo el cuerpo es un solo link (o un bloque sin link): la X queda afuera,
  // como hermana, para no anidar un botón adentro de un <a>.
  const main = el(href ? 'a' : 'div', 'bl-toast__main');
  if (href) main.href = href;

  const head = el('div', 'bl-toast__head');
  const appIcon = el('img', 'bl-toast__app-icon');
  appIcon.src = APP_ICON_SRC;
  appIcon.alt = '';
  appIcon.width = 20;
  appIcon.height = 20;
  head.append(appIcon, el('span', 'bl-toast__app', 'Baradero Local'), el('span', 'bl-toast__time', 'ahora'));
  main.appendChild(head);

  // El número de pedido (#BL-1070) nunca se parte en dos renglones por el guion.
  const titleEl = el('strong', 'bl-toast__title');
  String(title).split(/(#BL-\d+)/).forEach((part) => {
    if (!part) return;
    if (/^#BL-\d+$/.test(part)) {
      const ref = el('span', null, part);
      ref.style.whiteSpace = 'nowrap';
      titleEl.appendChild(ref);
    } else {
      titleEl.appendChild(document.createTextNode(part));
    }
  });
  main.appendChild(titleEl);
  if (body) main.appendChild(el('span', 'bl-toast__body', body));
  if (href && actionLabel) main.appendChild(el('span', 'bl-toast__action', actionLabel));
  toast.appendChild(main);

  const closeBtn = el('button', 'bl-toast__close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Cerrar notificación');
  const closeIcon = el('i', 'fa-solid fa-xmark');
  closeIcon.setAttribute('aria-hidden', 'true');
  closeBtn.appendChild(closeIcon);
  toast.appendChild(closeBtn);

  c.appendChild(toast);
  // Fuerza el reflow antes de agregar la clase que anima la entrada.
  void toast.offsetHeight;
  requestAnimationFrame(() => toast.classList.add('is-visible'));

  // --- Tiempo en pantalla: se frena mientras la persona la está mirando ---
  let remaining = AUTO_DISMISS_MS;
  let startedAt = 0;
  let dismissTimer = null;
  let holds = 0;

  function dismiss(direction = null) {
    if (!toast.isConnected || toast.classList.contains('is-leaving')) return;
    clearTimeout(dismissTimer);
    toast.classList.add('is-leaving');
    if (direction) toast.dataset.leave = direction;
    toast.classList.remove('is-visible');
    setTimeout(() => toast.remove(), 280);
  }
  function runTimer() {
    clearTimeout(dismissTimer);
    startedAt = Date.now();
    dismissTimer = setTimeout(() => dismiss(), remaining);
  }
  function hold() {
    holds += 1;
    if (holds > 1) return;
    clearTimeout(dismissTimer);
    remaining = Math.max(1500, remaining - (Date.now() - startedAt));
  }
  function release() {
    holds = Math.max(0, holds - 1);
    if (holds === 0 && toast.isConnected) runTimer();
  }
  toast.addEventListener('mouseenter', hold);
  toast.addEventListener('mouseleave', release);
  toast.addEventListener('focusin', hold);
  toast.addEventListener('focusout', release);

  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dismiss();
  });

  // --- Deslizar para cerrar (dedo o mouse), como en el celular ---
  let drag = null;
  let suppressClick = false;
  main.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, id: e.pointerId, moved: false };
    hold();
  });
  main.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dx = e.clientX - drag.x;
    drag.dy = Math.max(0, e.clientY - drag.y); // hacia abajo, nunca hacia arriba
    if (!drag.moved && Math.hypot(drag.dx, drag.dy) > 8) {
      drag.moved = true;
      toast.classList.add('is-dragging');
      try { main.setPointerCapture(e.pointerId); } catch { /* no-op */ }
    }
    if (drag.moved) {
      const horizontal = Math.abs(drag.dx) >= drag.dy;
      toast.style.transform = horizontal ? `translateX(${drag.dx}px)` : `translateY(${drag.dy}px)`;
      const distance = horizontal ? Math.abs(drag.dx) : drag.dy;
      toast.style.opacity = String(Math.max(0.35, 1 - distance / 260));
    }
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const { dx, dy, moved } = drag;
    drag = null;
    toast.classList.remove('is-dragging');
    if (moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      const horizontal = Math.abs(dx) >= dy;
      if ((horizontal && Math.abs(dx) > SWIPE_DISMISS_PX) || (!horizontal && dy > SWIPE_DISMISS_PX * 0.6)) {
        toast.style.transform = '';
        toast.style.opacity = '';
        dismiss(horizontal ? (dx > 0 ? 'right' : 'left') : 'down');
        return;
      }
      toast.style.transform = '';
      toast.style.opacity = '';
    }
    release();
  }
  main.addEventListener('pointerup', endDrag);
  main.addEventListener('pointercancel', endDrag);

  main.addEventListener('click', (e) => {
    // Un deslizamiento que termina sobre la tarjeta no es un toque.
    if (suppressClick) {
      e.preventDefault();
      return;
    }
    let pending = null;
    if (onOpen) {
      try { pending = onOpen(); } catch (err) { console.error(err); }
    }
    dismiss();
    // Si abrirla dispara un guardado (marcarla como leída), se espera un
    // momento antes de navegar: si no, el navegador corta el pedido al cambiar
    // de página y la notificación queda sin leer. Con Ctrl/Cmd (pestaña nueva)
    // no hace falta, esta página sigue abierta.
    const newTab = e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1;
    if (href && pending && typeof pending.then === 'function' && !newTab) {
      e.preventDefault();
      const timeout = new Promise((resolve) => { setTimeout(resolve, 800); });
      Promise.race([pending.catch(() => {}), timeout]).then(() => { window.location.href = main.href; });
    }
  });

  runTimer();
  return () => dismiss();
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
      showNotificationToast({
        title: buildNotificationTitle(n),
        body: buildNotificationPreview(n),
        href: link?.href || null,
        actionLabel: link?.label || null,
        // Abrirla desde el aviso es leerla: no queda pendiente en la campanita.
        onOpen: n.read_at ? null : () => markNotificationRead(n.id),
      });
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
