import { supabase } from './auth-utils.js';
import { formatPrice } from './cart-utils.js';
import { buildDropdown } from './dropdown.js';
import { formatDueDate } from './order-utils.js';
import { rememberNotificationIds, onNotificationsChanged, startNotificationsLive } from './notifications-live.js';
import { createRefresher } from './realtime-utils.js';

// Texto genérico de cada tipo. Los avisos de pedidos traen el número en el
// payload (migración 115) y usan ORDER_TITLES; este queda para los viejos.
const TYPE_LABELS = {
  order_created: 'Nuevo pedido recibido',
  order_paid: 'Tu pago fue confirmado',
  order_paid_seller: 'Te pagaron un pedido',
  payment_rejected: 'El comercio no pudo confirmar tu pago',
  transfer_notified: 'Un comprador avisó que transfirió',
  payment_proof_uploaded: 'Te mandaron un comprobante',
  payment_due_soon: 'Un pedido tuyo está por vencer',
  order_ready_for_pickup: 'Tu pedido está listo para retirar',
  order_shipped: 'Tu pedido está en camino',
  order_delivered: 'Tu pedido fue entregado',
  order_cancelled: 'El comercio canceló tu pedido',
  order_cancelled_by_buyer: 'Un comprador canceló su pedido',
  order_expired: 'Un pedido tuyo se canceló por falta de pago',
  order_expired_seller: 'Un pedido se canceló por falta de pago',
  revocation_accepted: 'El comercio aceptó tu arrepentimiento',
  new_review: 'Recibiste una nueva reseña',
  revocation_requested: 'Un cliente solicitó arrepentimiento de compra',
  seller_request_approved: '¡Tu solicitud de vendedor fue aprobada!',
  seller_request_rejected: 'Tu solicitud de vendedor fue rechazada',
  professional_request_approved: '¡Tu publicación como profesional fue aceptada! Ya figurás en Contratar',
  professional_request_rejected: 'Tu solicitud de profesional fue rechazada',
  professional_inquiry_new: 'Alguien te pidió un presupuesto',
  stock_alert: 'Volvió el stock de un producto que te interesaba',
  support_ticket_status_change: 'Tu reclamo cambió de estado',
  support_ticket_message: 'Soporte respondió a tu reclamo',
  favorite_price_drop: 'Bajó de precio un producto de tus favoritos',
  mp_split_needs_review: 'Tu vinculación con Mercado Pago necesita revisión',
  mp_payment_amount_mismatch: 'Un pago no cubre el total del pedido',
  mp_payment_refunded: 'Un pago fue devuelto o desconocido',
};

/** Estados de Mercado Pago en los que la plata ya no está (ver mp-webhook). */
const MP_DISPUTE_LABELS = {
  refunded: 'El pago fue devuelto al cliente',
  charged_back: 'El cliente hizo un contracargo',
  in_mediation: 'Mercado Pago abrió una disputa por este pago',
};

const SUPPORT_TICKET_STATUS_LABELS = {
  open: 'Abierto',
  in_progress: 'En progreso',
  resolved: 'Resuelto',
  cancelled: 'Cancelado',
};

/**
 * Color de cada tipo de notificación (barra izquierda + link "Ver ___"), para
 * distinguir de un vistazo qué clase de aviso es sin tener que leer el
 * título entero. Reutiliza los tokens que ya existen en home.css -- no se
 * suman colores nuevos al sistema.
 *   success (verde, --bl-success): algo avanzó/se aprobó.
 *   danger  (rojo,  --bl-danger):  un rechazo o algo que necesita reversa.
 *   accent  (ámbar, --bl-accent):  una oportunidad/aviso para actuar.
 *   info    (azul,  --bl-primary): comunicación (reseñas, reclamos).
 */
const TYPE_TONE = {
  order_created: 'success',
  order_paid: 'success',
  order_paid_seller: 'success',
  order_ready_for_pickup: 'success',
  order_shipped: 'success',
  order_delivered: 'success',
  revocation_accepted: 'info',
  transfer_notified: 'accent',
  payment_proof_uploaded: 'accent',
  payment_due_soon: 'accent',
  order_cancelled: 'danger',
  order_cancelled_by_buyer: 'danger',
  order_expired: 'danger',
  order_expired_seller: 'info',
  seller_request_approved: 'success',
  professional_request_approved: 'success',
  payment_rejected: 'danger',
  seller_request_rejected: 'danger',
  professional_request_rejected: 'danger',
  revocation_requested: 'danger',
  professional_inquiry_new: 'accent',
  stock_alert: 'accent',
  favorite_price_drop: 'accent',
  mp_split_needs_review: 'accent',
  mp_payment_amount_mismatch: 'accent',
  mp_payment_refunded: 'danger',
  support_ticket_status_change: 'accent',
  new_review: 'info',
  support_ticket_message: 'info',
};

const TONE_COLOR_VAR = {
  success: 'var(--bl-success)',
  danger: 'var(--bl-danger)',
  accent: 'var(--bl-accent)',
  info: 'var(--bl-primary)',
};

/**
 * "Importante" = tonos danger/accent (un rechazo, algo que necesita reversa,
 * o una oportunidad que vence si no se actúa). success/info son avisos de
 * curso normal (un pedido que avanzó bien, un mensaje). Reusa TYPE_TONE en
 * vez de mantener un segundo mapa por tipo.
 */
const IMPORTANT_TONES = new Set(['danger', 'accent']);
function isImportant(n) {
  return IMPORTANT_TONES.has(TYPE_TONE[n.type]);
}

/**
 * Vista previa de contenido para los tipos cuyo payload no la trae directo
 * (a diferencia de stock_alert/favorite_price_drop, que ya tienen
 * product_title, o support_ticket_message, que ya trae el texto). Recibe los
 * mapas ya resueltos por reviewId/orderId (ver renderNotificationsSection)
 * para no pedirle a cada notificación su propio round-trip.
 */
function buildPreviewText(n, { reviewMap, orderAmountMap }) {
  const p = n.payload || {};
  switch (n.type) {
    case 'new_review': {
      const review = p.review_id ? reviewMap[p.review_id] : null;
      const rating = review?.rating ?? p.rating;
      const stars = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '';
      // El comentario viaja en el propio payload (migración 119), así el aviso
      // emergente lo muestra al instante sin pedirlo aparte.
      const comment = (review?.comment ?? p.comment)?.trim();
      if (comment) return stars ? `${stars} — ${comment}` : comment;
      return stars || null;
    }
    case 'payment_rejected':
    case 'order_cancelled':
    case 'order_cancelled_by_buyer':
      if (p.reason) return `Motivo: ${p.reason}`;
      return p.total_price ? `Pedido por ${formatPrice(p.total_price)}` : null;
    case 'order_created':
    case 'order_paid_seller':
    case 'transfer_notified':
    case 'payment_proof_uploaded':
    case 'payment_due_soon':
    case 'order_ready_for_pickup':
    case 'order_expired':
    case 'order_expired_seller':
    case 'revocation_accepted':
      return p.total_price ? `Pedido por ${formatPrice(p.total_price)}` : null;
    // Los manda mp-webhook cuando el pago no cierra: sin los dos montos, el
    // aviso no dice nada accionable.
    case 'mp_payment_amount_mismatch':
      return p.paid_amount != null && p.expected_amount != null
        ? `Se cobró ${formatPrice(p.paid_amount)} de ${formatPrice(p.expected_amount)}`
        : null;
    case 'mp_payment_refunded':
      return MP_DISPUTE_LABELS[p.mp_status] || null;
    case 'order_paid':
    case 'order_shipped':
    case 'order_delivered':
    case 'revocation_requested': {
      const total = p.total_price ?? (p.order_id ? orderAmountMap[p.order_id] : null);
      return total ? `Pedido por ${formatPrice(total)}` : null;
    }
    default:
      return null;
  }
}

/**
 * A113-271: a cada notificación le arma el link "Ver ___" hacia el apartado
 * relacionado, según su `type`/`payload`. Antes solo `stock_alert` y
 * `favorite_price_drop` (las únicas con payload.product_id) tenían link --
 * el resto (pedidos, reclamos, reseñas...) no llevaba a ningún
 * lado. Devuelve `{ href, label }` o `null` si el tipo no tiene un destino
 * conocido (ej. avisos que ya se resuelven solos, como los de cadetería).
 */
function buildNotificationLink(n) {
  const p = n.payload || {};
  switch (n.type) {
    case 'stock_alert':
    case 'favorite_price_drop':
      return p.product_id ? { href: `./producto.html?id=${encodeURIComponent(p.product_id)}`, label: 'Ver producto' } : null;

    // Recibidas por el dueño del comercio -- van a "Pedidos" de su panel,
    // con el N° de pedido precargado en el buscador que ya existe ahí.
    case 'order_created':
    case 'order_paid_seller':
    case 'transfer_notified':
    case 'payment_proof_uploaded':
    case 'order_cancelled_by_buyer':
    case 'order_expired_seller':
    case 'revocation_requested':
    case 'mp_payment_amount_mismatch':
    case 'mp_payment_refunded':
      return p.order_id ? { href: `./vender.html?order=${encodeURIComponent(p.order_id)}#pedidos`, label: 'Ver pedido' } : null;
    case 'mp_split_needs_review': {
      const firstOrderId = Array.isArray(p.order_ids) ? p.order_ids[0] : null;
      return firstOrderId ? { href: `./vender.html?order=${encodeURIComponent(firstOrderId)}#pedidos`, label: 'Ver pedido' } : { href: './vender.html#pedidos', label: 'Revisar' };
    }

    // Recibidas por el cliente -- van a "Mis compras" en su perfil.
    case 'order_paid':
    case 'payment_rejected':
    case 'payment_due_soon':
    case 'order_ready_for_pickup':
    case 'order_shipped':
    case 'order_delivered':
    case 'order_cancelled':
    case 'order_expired':
    case 'revocation_accepted':
      return p.order_id ? { href: `./perfil.html?tab=compras&order=${encodeURIComponent(p.order_id)}`, label: 'Ver pedido' } : null;

    // La reseña la recibe el dueño: lo lleva a la sección "Reseñas" de su panel
    // (donde está lo que escribieron, en vivo), no a la página pública.
    case 'new_review':
      if (p.target_type === 'product' || p.target_type === 'store') return { href: './vender.html#resenas', label: 'Ver reseña' };
      if (p.target_type === 'professional') return { href: './profesional.html#resenas', label: 'Ver reseña' };
      return null;

    case 'support_ticket_status_change':
    case 'support_ticket_message':
      return p.ticket_id ? { href: `./perfil.html?tab=soporte&ticket=${encodeURIComponent(p.ticket_id)}`, label: 'Ver reclamo' } : null;

    case 'seller_request_approved':
    case 'seller_request_rejected':
      return { href: './vender.html', label: 'Ir a mi comercio' };

    case 'professional_request_approved':
      // Recién aprobado: lo útil es su panel, para terminar de cargar
      // servicios y horarios, no el directorio.
      return { href: './profesional.html', label: 'Ir a mi panel' };

    case 'professional_request_rejected':
      return { href: './contratar.html', label: 'Ver Contratar' };

    case 'professional_inquiry_new':
      return { href: './profesional.html#consultas', label: 'Ver la consulta' };

    default:
      return null;
  }
}

/** Títulos de los avisos de pedidos, con el número (#BL-1066) que ve todo el mundo. */
const ORDER_TITLES = {
  order_created: (p, ref) => (p.payment_method === 'efectivo'
    ? `Nuevo pedido ${ref}: se paga en efectivo, ya podés prepararlo`
    : `Nuevo pedido ${ref}: esperando la transferencia`),
  order_paid: (p, ref) => (p.total_price
    ? `Tu pago de ${formatPrice(p.total_price)} fue confirmado (pedido ${ref})`
    : `Tu pago del pedido ${ref} fue confirmado`),
  order_paid_seller: (p, ref) => `¡Te pagaron el pedido ${ref}! Ya podés prepararlo`,
  transfer_notified: (p, ref) => `El comprador avisó que transfirió el pedido ${ref}`,
  payment_proof_uploaded: (p, ref) => `Te mandaron el comprobante del pedido ${ref}`,
  payment_rejected: (p, ref) => `El comercio no pudo confirmar tu pago del pedido ${ref}`,
  payment_due_soon: (p, ref) => (p.payment_due_at
    ? `Tu pedido ${ref} vence ${formatDueDate(p.payment_due_at)}: completá la transferencia`
    : `Tu pedido ${ref} está por vencer: completá la transferencia`),
  order_ready_for_pickup: (p, ref) => `Tu pedido ${ref} está listo para retirar`,
  order_shipped: (p, ref) => `Tu pedido ${ref} está en camino`,
  order_delivered: (p, ref) => `Tu pedido ${ref} fue entregado. ¡Contanos qué tal!`,
  order_cancelled: (p, ref) => `El comercio canceló tu pedido ${ref}`,
  order_cancelled_by_buyer: (p, ref) => `El comprador canceló el pedido ${ref}`,
  order_expired: (p, ref) => `Tu pedido ${ref} se canceló porque no se completó el pago`,
  order_expired_seller: (p, ref) => `El pedido ${ref} se canceló por falta de pago (el stock volvió)`,
  revocation_accepted: (p, ref) => `El comercio aceptó tu arrepentimiento del pedido ${ref}`,
};

/**
 * Título corto de una notificación (mismo texto que ya arma el centro de
 * notificaciones para cada tipo). Factorizado acá para que el centro de
 * notificaciones (renderNotificationsSection) y los toasts de A113-268
 * (js/toast-utils.js) muestren siempre el mismo texto, sin duplicar el
 * switch en dos archivos.
 */
export function buildNotificationTitle(n) {
  const orderTitle = ORDER_TITLES[n.type];
  if (orderTitle && n.payload?.order_number) return orderTitle(n.payload, `#BL-${n.payload.order_number}`);

  // F12-09: a diferencia del resto (siempre texto genérico), un aviso de
  // stock sin decir de qué producto es casi inútil -- el cliente puede
  // tener varios pendientes en productos distintos.
  if (n.type === 'stock_alert' && n.payload?.product_title) {
    return `¡Volvió el stock de "${n.payload.product_title}"!`;
  }
  if (n.type === 'favorite_price_drop' && n.payload?.product_title) {
    return `¡Bajó de precio "${n.payload.product_title}"!`;
  }
  if (n.type === 'support_ticket_status_change' && n.payload?.subject) {
    const statusText = SUPPORT_TICKET_STATUS_LABELS[n.payload.status] || n.payload.status;
    return `Tu reclamo "${n.payload.subject}" fue ${statusText}`;
  }
  if (n.type === 'support_ticket_message' && n.payload?.subject) {
    return `Soporte respondió a tu reclamo "${n.payload.subject}"`;
  }
  return TYPE_LABELS[n.type] || n.type;
}

export { buildNotificationLink };

/**
 * Línea de detalle de una notificación, sin consultas extra (lo que trae el
 * payload): la usan los avisos emergentes (js/toast-utils.js) debajo del
 * título. El centro de notificaciones arma una más completa con los mapas.
 */
export function buildNotificationPreview(n) {
  if (n.type === 'support_ticket_message' && n.payload?.message) return n.payload.message;
  return buildPreviewText(n, { reviewMap: {}, orderAmountMap: {} });
}

/** Avisos que son del lado "profesional" de la cuenta (directorio Contratar). */
const PROFESSIONAL_ONLY_TYPES = [
  'professional_inquiry_new',
  'professional_request_approved',
  'professional_request_rejected',
];
/** Avisos que valen para cualquier panel (los reclamos son de la cuenta). */
const SHARED_TYPES = ['support_ticket_status_change', 'support_ticket_message'];

/**
 * Una misma cuenta puede ser comerciante, profesional y además comprar, y todos
 * sus avisos caen en la misma tabla. Cada panel muestra solo los suyos:
 *   - 'profesional': consultas de presupuesto, reseñas de SU publicación, el
 *     alta en Contratar y los reclamos.
 *   - 'comercio': todo menos lo del lado profesional.
 *   - sin scope (campanita del navbar, Mi perfil): todo.
 * @param {{ type: string, payload?: object }} n
 * @param {'profesional'|'comercio'|undefined} scope
 */
export function notificationInScope(n, scope) {
  if (!scope) return true;
  const esProfesional = PROFESSIONAL_ONLY_TYPES.includes(n.type)
    || (n.type === 'new_review' && n.payload?.target_type === 'professional');
  if (scope === 'profesional') return esProfesional || SHARED_TYPES.includes(n.type);
  if (scope === 'comercio') return !esProfesional;
  return true;
}

const NOTIFICATIONS_LIMIT = 30;

/**
 * A qué "perfil" pertenece la página donde estamos: en el panel de profesional
 * solo se ven los avisos de profesional, y en el de vendedor los del comercio.
 * Todo lo que muestra una campanita, un contador o un aviso emergente dentro de
 * un panel usa esto, para que no se mezcle con los otros perfiles de la cuenta.
 * Fuera de los paneles (inicio, Mi perfil...) es undefined: se ve todo.
 * @returns {'profesional'|'comercio'|undefined}
 */
export function currentPanelScope() {
  const page = (globalThis.location?.pathname || '').split('/').pop();
  if (page === 'profesional.html') return 'profesional';
  if (page === 'vender.html') return 'comercio';
  return undefined;
}

/** `scope` omitido = el del panel donde estamos; `null` = sin filtro. */
export async function fetchNotifications(userId, { scope = currentPanelScope() } = {}) {
  // Con scope se piden más y se filtran acá: si no, los 30 más nuevos podrían
  // ser todos de la otra cara de la cuenta y el panel saldría vacío.
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, payload, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(scope ? 150 : NOTIFICATIONS_LIMIT);

  if (error) {
    console.error('Error al cargar notificaciones:', error);
    return [];
  }
  // El puntero de "último aviso mostrado" es de la cuenta, no del panel.
  rememberNotificationIds(data);
  if (!scope) return data || [];
  return (data || []).filter((n) => notificationInScope(n, scope)).slice(0, NOTIFICATIONS_LIMIT);
}

export async function markNotificationRead(id) {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
}

export async function markAllNotificationsRead(userId, ids) {
  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  // Con ids solo se marcan las que el panel está mostrando.
  if (ids?.length) query = query.in('id', ids);
  await query;
}

export async function deleteNotification(id) {
  await supabase.from('notifications').delete().eq('id', id);
}

/** Cantidad de no leídas -- liviano (head:true), para el badge de la campanita. */
export async function fetchUnreadCount(userId, { scope = currentPanelScope() } = {}) {
  if (scope) {
    // El conteo del servidor no distingue de qué perfil es cada aviso: se traen
    // las no leídas y se cuentan acá.
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, payload')
      .eq('user_id', userId)
      .is('read_at', null)
      .limit(300);
    if (error) {
      console.error('Error al contar notificaciones no leídas:', error);
      return 0;
    }
    return (data || []).filter((n) => notificationInScope(n, scope)).length;
  }

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) {
    console.error('Error al contar notificaciones no leídas:', error);
    return 0;
  }
  return count || 0;
}

/** Texto sobre el que busca el buscador del centro de notificaciones: título + preview. */
function buildSearchableText(n, maps) {
  const parts = [buildNotificationTitle(n)];
  if (n.type === 'support_ticket_message' && n.payload?.message) {
    parts.push(n.payload.message);
  } else {
    const preview = buildPreviewText(n, maps);
    if (preview) parts.push(preview);
  }
  return parts.join(' ').toLowerCase();
}

/** Arma una fila del centro de notificaciones (DOM API, sin innerHTML). */
function buildNotificationRow(n, maps, { onChange }) {
  const row = document.createElement('div');
  row.className = n.read_at ? 'notif-item' : 'notif-item notif-item--unread';
  row.style.setProperty('--notif-tone', TONE_COLOR_VAR[TYPE_TONE[n.type]] || 'var(--bl-border)');

  if (isImportant(n)) {
    const badge = document.createElement('span');
    badge.className = 'notif-item__badge';
    badge.textContent = 'Importante';
    row.appendChild(badge);
  }

  const title = document.createElement('strong');
  title.className = 'notif-item__title';
  title.textContent = buildNotificationTitle(n);
  row.appendChild(title);

  // support_ticket_message trae el texto de la respuesta directo en el
  // payload -- se muestra como preview acá (no lo cubre buildNotificationTitle,
  // que solo arma el título corto para el ítem del centro y los toasts).
  if (n.type === 'support_ticket_message' && n.payload?.message) {
    const preview = document.createElement('p');
    preview.className = 'notif-item__preview';
    preview.textContent = n.payload.message;
    row.appendChild(preview);
  }

  // support_ticket_message ya arma su propia preview arriba (el texto
  // viene directo en el payload); el resto de los tipos con contenido
  // "de otra tabla" (reseña, mensaje, pedido) usa los mapas en lote.
  if (n.type !== 'support_ticket_message') {
    const previewText = buildPreviewText(n, maps);
    if (previewText) {
      const preview = document.createElement('p');
      preview.className = 'notif-item__preview';
      preview.textContent = previewText;
      row.appendChild(preview);
    }
  }

  const notifLink = buildNotificationLink(n);
  if (notifLink) {
    const link = document.createElement('a');
    link.href = notifLink.href;
    link.className = 'notif-item__link';
    link.textContent = notifLink.label;
    if (!n.read_at) {
      // Al abrir el detalle ya la dio por vista -- no hace falta un
      // segundo click en "Marcar como leída".
      link.addEventListener('click', () => { markNotificationRead(n.id); }, { once: true });
    }
    row.appendChild(link);
  }

  const meta = document.createElement('div');
  meta.className = 'notif-item__meta';
  meta.textContent = new Date(n.created_at).toLocaleString('es-AR');
  row.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'notif-item__actions';

  if (!n.read_at) {
    const markBtn = document.createElement('button');
    markBtn.type = 'button';
    markBtn.className = 'notif-item__mark';
    markBtn.textContent = 'Marcar como leída';
    markBtn.addEventListener('click', async () => {
      await markNotificationRead(n.id);
      onChange();
    });
    actions.appendChild(markBtn);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'notif-item__delete';
  deleteBtn.textContent = 'Borrar';
  deleteBtn.addEventListener('click', async () => {
    await deleteNotification(n.id);
    onChange();
  });
  actions.appendChild(deleteBtn);

  row.appendChild(actions);

  return row;
}

/**
 * Centros de notificaciones dibujados en la página (el desplegable de la
 * campanita, la sección de "Mi perfil", la de los paneles), con lo que la
 * persona tenía escrito en el buscador y el filtro elegido. Cuando llega un
 * cambio por Realtime se vuelven a dibujar todos sin perder eso.
 */
const liveSections = new Map();
let liveListenerReady = false;

function ensureLiveListener() {
  if (liveListenerReady) return;
  liveListenerReady = true;
  onNotificationsChanged(() => {
    liveSections.forEach((entry, container) => {
      // El desplegable arma un contenedor nuevo cada vez que se abre: los
      // que ya no están en la página se sueltan.
      if (!container.isConnected) {
        liveSections.delete(container);
        return;
      }
      entry.refresh();
    });
  });
}

/**
 * Arma el centro de notificaciones dentro de `container` (DOM API, sin
 * innerHTML) y lo deja en vivo: una notificación nueva, leída o borrada desde
 * otro dispositivo aparece sola, sin recargar.
 */
export async function renderNotificationsSection(container, userId, { scope } = {}) {
  if (!container || !userId) return;
  let entry = liveSections.get(container);
  if (!entry) {
    entry = { userId, scope, search: '', filter: 'all' };
    // delay corto: también lo usan "Marcar como leída" y "Borrar" (onChange).
    entry.refresh = createRefresher(() => drawNotificationsSection(container, entry), { delay: 150 });
    liveSections.set(container, entry);
  }
  entry.userId = userId;
  entry.scope = scope;
  ensureLiveListener();
  startNotificationsLive(userId);
  await drawNotificationsSection(container, entry);
}

async function drawNotificationsSection(container, entry) {
  const { userId, scope } = entry;
  const notifications = await fetchNotifications(userId, { scope });

  // Si el buscador tenía el foco, se le devuelve después de redibujar (una
  // actualización en vivo no puede cortarle la escritura a nadie).
  const prevSearch = container.querySelector('.notif-search');
  const hadFocus = Boolean(prevSearch && document.activeElement === prevSearch);
  const caret = hadFocus ? prevSearch.selectionStart : null;

  if (notifications.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'notif-empty';
    empty.textContent = 'No tenés notificaciones todavía.';
    container.replaceChildren(empty);
    return;
  }

  // El payload de cada notificación no siempre trae el texto para la vista
  // previa (ej. new_review sólo trae el review_id) -- se junta todo lo que
  // falta y se pide en 2 consultas en lote como mucho, no una por fila.
  const reviewIds = [...new Set(notifications.filter((n) => n.type === 'new_review' && n.payload?.review_id).map((n) => n.payload.review_id))];
  const orderIds = [...new Set(
    notifications
      .filter((n) => ['order_paid', 'order_shipped', 'order_delivered', 'payment_rejected', 'revocation_requested'].includes(n.type) && n.payload?.order_id)
      .map((n) => n.payload.order_id)
  )];

  const reviewMap = {};
  const orderAmountMap = {};

  const [reviewsRes, ordersRes] = await Promise.all([
    reviewIds.length ? supabase.from('reviews').select('id, comment, rating').in('id', reviewIds) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from('orders').select('id, total_price').in('id', orderIds) : Promise.resolve({ data: [] }),
  ]);
  (reviewsRes.data || []).forEach((r) => { reviewMap[r.id] = r; });
  (ordersRes.data || []).forEach((o) => { orderAmountMap[o.id] = o.total_price; });

  const maps = { reviewMap, orderAmountMap };

  // onChange: mark/delete cambian el estado en el servidor -- se vuelve a
  // pedir todo en vez de mantener un segundo estado local sincronizado
  // (mismo patrón que ya usaban "marcar como leída"/"marcar todas"). El mismo
  // cambio vuelve después por Realtime: el refresher junta los dos en uno.
  const onChange = () => entry.refresh();

  const fragment = document.createDocumentFragment();

  const toolbar = document.createElement('div');
  toolbar.className = 'notif-toolbar';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'notif-search';
  searchInput.placeholder = 'Buscar en tus notificaciones...';
  searchInput.setAttribute('aria-label', 'Buscar notificaciones');
  searchInput.value = entry.search;
  toolbar.appendChild(searchInput);

  const filterDropdown = buildDropdown({
    options: [
      { value: 'all', label: 'Todas' },
      { value: 'unread', label: 'No leídas' },
      { value: 'important', label: 'Importantes' },
    ],
    value: entry.filter,
    ariaLabel: 'Filtrar notificaciones',
    onSelect: (value) => {
      entry.filter = value;
      applyFilters();
    },
  });
  toolbar.appendChild(filterDropdown.element);

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  if (unreadCount > 0) {
    const markAllBtn = document.createElement('button');
    markAllBtn.type = 'button';
    markAllBtn.className = 'notif-mark-all';
    markAllBtn.textContent = `Marcar las ${unreadCount} como leídas`;
    markAllBtn.addEventListener('click', async () => {
      // Solo las de este panel: las del otro lado de la cuenta no se tocan.
      await markAllNotificationsRead(userId, notifications.filter((n) => !n.read_at).map((n) => n.id));
      onChange();
    });
    toolbar.appendChild(markAllBtn);
  }

  fragment.appendChild(toolbar);

  const list = document.createElement('div');
  list.className = 'notif-list';
  fragment.appendChild(list);

  function applyFilters() {
    const search = searchInput.value.trim().toLowerCase();
    const mode = filterDropdown.getValue();

    const filtered = notifications.filter((n) => {
      if (mode === 'unread' && n.read_at) return false;
      if (mode === 'important' && !isImportant(n)) return false;
      if (search && !buildSearchableText(n, maps).includes(search)) return false;
      return true;
    });

    list.textContent = '';
    if (filtered.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'notif-empty';
      empty.textContent = 'No se encontraron notificaciones con ese criterio.';
      list.appendChild(empty);
      return;
    }
    filtered.forEach((n) => list.appendChild(buildNotificationRow(n, maps, { onChange })));
  }

  searchInput.addEventListener('input', () => {
    entry.search = searchInput.value;
    applyFilters();
  });

  applyFilters();
  // Recién ahora se reemplaza lo que había: armar todo antes evita que una
  // actualización en vivo haga parpadear la lista (vacía y llena de nuevo).
  container.replaceChildren(fragment);
  if (hadFocus) {
    searchInput.focus({ preventScroll: true });
    if (caret != null) searchInput.setSelectionRange(caret, caret);
  }
}
