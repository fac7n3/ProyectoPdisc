import { supabase } from './auth-utils.js';
import { formatPrice } from './cart-utils.js';

const TYPE_LABELS = {
  order_created: 'Nuevo pedido recibido',
  order_paid: 'Un pedido fue pagado',
  payment_rejected: 'Un comprobante fue rechazado',
  order_shipped: 'Tu pedido está en camino',
  order_delivered: 'Tu pedido fue entregado',
  new_review: 'Recibiste una nueva reseña',
  new_message: 'Tenés un mensaje nuevo',
  revocation_requested: 'Un cliente solicitó arrepentimiento de compra',
  seller_request_approved: '¡Tu solicitud de vendedor fue aprobada!',
  seller_request_rejected: 'Tu solicitud de vendedor fue rechazada',
  delivery_request_approved: '¡Tu solicitud de repartidor fue aprobada!',
  delivery_request_rejected: 'Tu solicitud de repartidor fue rechazada',
  stock_alert: 'Volvió el stock de un producto que te interesaba',
  support_ticket_status_change: 'Tu reclamo cambió de estado',
  support_ticket_message: 'Soporte respondió a tu reclamo',
  favorite_price_drop: 'Bajó de precio un producto de tus favoritos',
  mp_split_needs_review: 'Tu vinculación con Mercado Pago necesita revisión',
};

const SUPPORT_TICKET_STATUS_LABELS = {
  open: 'Abierto',
  in_progress: 'En progreso',
  resolved: 'Resuelto',
};

/**
 * Color de cada tipo de notificación (barra izquierda + link "Ver ___"), para
 * distinguir de un vistazo qué clase de aviso es sin tener que leer el
 * título entero. Reutiliza los tokens que ya existen en home.css -- no se
 * suman colores nuevos al sistema.
 *   success (verde, --bl-success): algo avanzó/se aprobó.
 *   danger  (rojo,  --bl-danger):  un rechazo o algo que necesita reversa.
 *   accent  (ámbar, --bl-accent):  una oportunidad/aviso para actuar.
 *   info    (azul,  --bl-primary): comunicación (mensajes, reseñas).
 */
const TYPE_TONE = {
  order_created: 'success',
  order_paid: 'success',
  order_shipped: 'success',
  order_delivered: 'success',
  seller_request_approved: 'success',
  delivery_request_approved: 'success',
  provider_approved: 'success',
  courier_added: 'success',
  delivery_assigned: 'success',
  payment_rejected: 'danger',
  seller_request_rejected: 'danger',
  delivery_request_rejected: 'danger',
  revocation_requested: 'danger',
  stock_alert: 'accent',
  favorite_price_drop: 'accent',
  mp_split_needs_review: 'accent',
  support_ticket_status_change: 'accent',
  new_review: 'info',
  new_message: 'info',
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
 * mapas ya resueltos por reviewId/messageId/orderId (ver renderNotificationsSection)
 * para no pedirle a cada notificación su propio round-trip.
 */
function buildPreviewText(n, { reviewMap, messageMap, orderAmountMap }) {
  const p = n.payload || {};
  switch (n.type) {
    case 'new_review': {
      const review = p.review_id ? reviewMap[p.review_id] : null;
      const rating = review?.rating ?? p.rating;
      const stars = rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : '';
      const comment = review?.comment?.trim();
      if (comment) return stars ? `${stars} — ${comment}` : comment;
      return stars || null;
    }
    case 'new_message': {
      const body = p.message_id ? messageMap[p.message_id] : null;
      return body || null;
    }
    case 'order_created':
      return p.total_price ? `Pedido por ${formatPrice(p.total_price)}` : null;
    case 'order_paid':
    case 'order_shipped':
    case 'order_delivered':
    case 'payment_rejected':
    case 'revocation_requested': {
      const total = p.order_id ? orderAmountMap[p.order_id] : null;
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
 * el resto (pedidos, mensajes, reclamos, reseñas...) no llevaba a ningún
 * lado. Devuelve `{ href, label }` o `null` si el tipo no tiene un destino
 * conocido (ej. avisos que ya se resuelven solos, como los de cadetería).
 */
function buildNotificationLink(n) {
  const p = n.payload || {};
  switch (n.type) {
    case 'stock_alert':
    case 'favorite_price_drop':
      return p.product_id ? { href: `./producto.html?id=${encodeURIComponent(p.product_id)}`, label: 'Ver producto' } : null;

    // Recibidas por el dueño del comercio -- van a "Ventas" de su panel,
    // con el N° de pedido precargado en el buscador que ya existe ahí.
    case 'order_created':
    case 'revocation_requested':
      return p.order_id ? { href: `./vender.html?order=${encodeURIComponent(p.order_id)}#ventas`, label: 'Ver pedido' } : null;
    case 'mp_split_needs_review': {
      const firstOrderId = Array.isArray(p.order_ids) ? p.order_ids[0] : null;
      return firstOrderId ? { href: `./vender.html?order=${encodeURIComponent(firstOrderId)}#ventas`, label: 'Ver pedido' } : { href: './vender.html#pagos', label: 'Revisar' };
    }

    // Recibidas por el cliente -- van a "Mis compras" en su perfil.
    case 'order_paid':
    case 'payment_rejected':
    case 'order_shipped':
    case 'order_delivered':
      return p.order_id ? { href: `./perfil.html?tab=compras&order=${encodeURIComponent(p.order_id)}`, label: 'Ver pedido' } : null;

    case 'new_message':
      return p.conversation_id ? { href: `./mensajes.html?conversation_id=${encodeURIComponent(p.conversation_id)}`, label: 'Ver mensaje' } : null;

    case 'new_review':
      if (p.target_type === 'product' && p.target_id) return { href: `./producto.html?id=${encodeURIComponent(p.target_id)}`, label: 'Ver producto' };
      if (p.target_type === 'store' && p.target_id) return { href: `./comercio.html?id=${encodeURIComponent(p.target_id)}`, label: 'Ver comercio' };
      return null;

    case 'support_ticket_status_change':
    case 'support_ticket_message':
      return p.ticket_id ? { href: `./perfil.html?tab=soporte&ticket=${encodeURIComponent(p.ticket_id)}`, label: 'Ver reclamo' } : null;

    case 'seller_request_approved':
    case 'seller_request_rejected':
      return { href: './vender.html', label: 'Ir a mi comercio' };

    case 'delivery_request_approved':
    case 'delivery_request_rejected':
    case 'courier_added':
    case 'delivery_assigned':
      return { href: './repartidor.html', label: n.type === 'delivery_assigned' ? 'Ver entrega' : 'Ver' };

    case 'provider_approved':
      return { href: './logistica.html', label: 'Ver' };

    default:
      return null;
  }
}

/**
 * Título corto de una notificación (mismo texto que ya arma el centro de
 * notificaciones para cada tipo). Factorizado acá para que el centro de
 * notificaciones (renderNotificationsSection) y los toasts de A113-268
 * (js/toast-utils.js) muestren siempre el mismo texto, sin duplicar el
 * switch en dos archivos.
 */
export function buildNotificationTitle(n) {
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
    return `Tu reclamo "${n.payload.subject}" pasó a: ${statusText}`;
  }
  if (n.type === 'support_ticket_message' && n.payload?.subject) {
    return `Soporte respondió a tu reclamo "${n.payload.subject}"`;
  }
  return TYPE_LABELS[n.type] || n.type;
}

export { buildNotificationLink };

export async function fetchNotifications(userId) {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, payload, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error al cargar notificaciones:', error);
    return [];
  }
  return data || [];
}

export async function markNotificationRead(id) {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
}

export async function markAllNotificationsRead(userId) {
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
}

export async function deleteNotification(id) {
  await supabase.from('notifications').delete().eq('id', id);
}

/** Cantidad de no leídas -- liviano (head:true), para el badge de la campanita. */
export async function fetchUnreadCount(userId) {
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

/** Arma el centro de notificaciones dentro de `container` (DOM API, sin innerHTML). */
export async function renderNotificationsSection(container, userId) {
  container.textContent = '';

  const notifications = await fetchNotifications(userId);

  if (notifications.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'notif-empty';
    empty.textContent = 'No tenés notificaciones todavía.';
    container.appendChild(empty);
    return;
  }

  // El payload de cada notificación no siempre trae el texto para la vista
  // previa (ej. new_review sólo trae el review_id) -- se junta todo lo que
  // falta y se pide en 3 consultas en lote como mucho, no una por fila.
  const reviewIds = [...new Set(notifications.filter((n) => n.type === 'new_review' && n.payload?.review_id).map((n) => n.payload.review_id))];
  const messageIds = [...new Set(notifications.filter((n) => n.type === 'new_message' && n.payload?.message_id).map((n) => n.payload.message_id))];
  const orderIds = [...new Set(
    notifications
      .filter((n) => ['order_paid', 'order_shipped', 'order_delivered', 'payment_rejected', 'revocation_requested'].includes(n.type) && n.payload?.order_id)
      .map((n) => n.payload.order_id)
  )];

  const reviewMap = {};
  const messageMap = {};
  const orderAmountMap = {};

  const [reviewsRes, messagesRes, ordersRes] = await Promise.all([
    reviewIds.length ? supabase.from('reviews').select('id, comment, rating').in('id', reviewIds) : Promise.resolve({ data: [] }),
    messageIds.length ? supabase.from('messages').select('id, body').in('id', messageIds) : Promise.resolve({ data: [] }),
    orderIds.length ? supabase.from('orders').select('id, total_price').in('id', orderIds) : Promise.resolve({ data: [] }),
  ]);
  (reviewsRes.data || []).forEach((r) => { reviewMap[r.id] = r; });
  (messagesRes.data || []).forEach((m) => { messageMap[m.id] = m.body; });
  (ordersRes.data || []).forEach((o) => { orderAmountMap[o.id] = o.total_price; });

  const maps = { reviewMap, messageMap, orderAmountMap };

  // onChange: mark/delete cambian el estado en el servidor -- se vuelve a
  // pedir todo en vez de mantener un segundo estado local sincronizado
  // (mismo patrón que ya usaban "marcar como leída"/"marcar todas").
  const onChange = () => renderNotificationsSection(container, userId);

  const toolbar = document.createElement('div');
  toolbar.className = 'notif-toolbar';

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'notif-search';
  searchInput.placeholder = 'Buscar en tus notificaciones...';
  searchInput.setAttribute('aria-label', 'Buscar notificaciones');
  toolbar.appendChild(searchInput);

  const filterSelect = document.createElement('select');
  filterSelect.className = 'notif-filter';
  filterSelect.setAttribute('aria-label', 'Filtrar notificaciones');
  [
    ['all', 'Todas'],
    ['unread', 'No leídas'],
    ['important', 'Importantes'],
  ].forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    filterSelect.appendChild(opt);
  });
  toolbar.appendChild(filterSelect);

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  if (unreadCount > 0) {
    const markAllBtn = document.createElement('button');
    markAllBtn.type = 'button';
    markAllBtn.className = 'notif-mark-all';
    markAllBtn.textContent = `Marcar las ${unreadCount} como leídas`;
    markAllBtn.addEventListener('click', async () => {
      await markAllNotificationsRead(userId);
      onChange();
    });
    toolbar.appendChild(markAllBtn);
  }

  container.appendChild(toolbar);

  const list = document.createElement('div');
  list.className = 'notif-list';
  container.appendChild(list);

  function applyFilters() {
    const search = searchInput.value.trim().toLowerCase();
    const mode = filterSelect.value;

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

  searchInput.addEventListener('input', applyFilters);
  filterSelect.addEventListener('change', applyFilters);

  applyFilters();
}
