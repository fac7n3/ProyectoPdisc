import { supabase } from './auth-utils.js';

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

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  if (unreadCount > 0) {
    const toolbar = document.createElement('div');
    toolbar.className = 'notif-toolbar';
    const markAllBtn = document.createElement('button');
    markAllBtn.type = 'button';
    markAllBtn.className = 'notif-mark-all';
    markAllBtn.textContent = `Marcar las ${unreadCount} como leídas`;
    markAllBtn.addEventListener('click', async () => {
      await markAllNotificationsRead(userId);
      renderNotificationsSection(container, userId);
    });
    toolbar.appendChild(markAllBtn);
    container.appendChild(toolbar);
  }

  const list = document.createElement('div');
  list.className = 'notif-list';

  notifications.forEach((n) => {
    const row = document.createElement('div');
    row.className = n.read_at ? 'notif-item' : 'notif-item notif-item--unread';

    const title = document.createElement('strong');
    title.className = 'notif-item__title';
    // F12-09: a diferencia del resto (siempre texto genérico, ver arriba),
    // un aviso de stock sin decir de qué producto es casi inútil -- el
    // cliente puede tener varios pendientes en productos distintos.
    if (n.type === 'stock_alert' && n.payload?.product_title) {
      title.textContent = `¡Volvió el stock de "${n.payload.product_title}"!`;
    } else if (n.type === 'favorite_price_drop' && n.payload?.product_title) {
      title.textContent = `¡Bajó de precio "${n.payload.product_title}"!`;
    } else if (n.type === 'support_ticket_status_change' && n.payload?.subject) {
      const statusText = SUPPORT_TICKET_STATUS_LABELS[n.payload.status] || n.payload.status;
      title.textContent = `Tu reclamo "${n.payload.subject}" pasó a: ${statusText}`;
    } else if (n.type === 'support_ticket_message' && n.payload?.subject) {
      title.textContent = `Soporte respondió a tu reclamo "${n.payload.subject}"`;
      if (n.payload?.message) {
        const preview = document.createElement('p');
        preview.className = 'notif-item__preview';
        preview.textContent = n.payload.message;
        row.appendChild(preview);
      }
    } else {
      title.textContent = TYPE_LABELS[n.type] || n.type;
    }
    row.appendChild(title);

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

    if (!n.read_at) {
      const markBtn = document.createElement('button');
      markBtn.type = 'button';
      markBtn.className = 'notif-item__mark';
      markBtn.textContent = 'Marcar como leída';
      markBtn.addEventListener('click', async () => {
        await markNotificationRead(n.id);
        renderNotificationsSection(container, userId);
      });
      row.appendChild(markBtn);
    }

    list.appendChild(row);
  });

  container.appendChild(list);
}
