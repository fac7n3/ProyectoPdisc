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
};

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

/** Arma el centro de notificaciones dentro de `container` (DOM API, sin innerHTML). */
export async function renderNotificationsSection(container, userId) {
  container.textContent = '';

  const notifications = await fetchNotifications(userId);

  if (notifications.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color: var(--bl-text-muted, #94a3b8);';
    empty.textContent = 'No tenés notificaciones todavía.';
    container.appendChild(empty);
    return;
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length;
  if (unreadCount > 0) {
    const markAllBtn = document.createElement('button');
    markAllBtn.type = 'button';
    markAllBtn.style.cssText = 'margin-bottom: 0.75rem; background: none; border: 1px solid var(--bl-border, #e2e8f0); border-radius: 6px; padding: 0.4rem 0.8rem; cursor: pointer; font-size: 0.85rem;';
    markAllBtn.textContent = `Marcar las ${unreadCount} como leídas`;
    markAllBtn.addEventListener('click', async () => {
      await markAllNotificationsRead(userId);
      renderNotificationsSection(container, userId);
    });
    container.appendChild(markAllBtn);
  }

  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem;';

  notifications.forEach((n) => {
    const row = document.createElement('div');
    row.style.cssText = `padding: 0.75rem; border-radius: 8px; border: 1px solid var(--bl-border, #e2e8f0); background: ${n.read_at ? 'transparent' : 'var(--bl-surface-alt, #f0f4f8)'};`;

    const title = document.createElement('strong');
    title.textContent = TYPE_LABELS[n.type] || n.type;
    row.appendChild(title);

    const meta = document.createElement('div');
    meta.style.cssText = 'font-size: 0.8rem; color: var(--bl-text-muted, #94a3b8); margin-top: 0.25rem;';
    meta.textContent = new Date(n.created_at).toLocaleString('es-AR');
    row.appendChild(meta);

    if (!n.read_at) {
      const markBtn = document.createElement('button');
      markBtn.type = 'button';
      markBtn.style.cssText = 'display: block; margin-top: 0.4rem; background: none; border: none; color: var(--bl-primary, #2563eb); text-decoration: underline; cursor: pointer; font-size: 0.8rem;';
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
