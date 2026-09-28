/**
 * Panel de repartidor (pages/repartidor.html), a pedido del usuario
 * (2026-09-28): cola de pedidos disponibles en orden de llegada, pintada de
 * amarillo/rojo según cuánto hace que nadie los toma, + las entregas propias
 * en curso.
 *
 * No hay columna `paid_at`/`available_at` en `orders` -- se usa
 * `updated_at` como el momento en que el pedido quedó disponible para
 * repartir (se actualiza con el trigger `set_updated_at` cada vez que el
 * pago pasa a confirmado, sea por MercadoPago, transferencia o simulado; una
 * vez tomado el pedido no vuelve a tocarse `orders.updated_at` hasta que el
 * propio repartidor avanza el estado). Es una aproximación, no un timestamp
 * dedicado, pero cubre el caso real: "cuánto hace que está esperando".
 */
import { supabase, showToast, guardPage } from './auth-utils.js';
import { initNotificationsBell } from './nav-utils.js';
import { confirmDialog } from './confirm-dialog.js';
import { formatPrice } from './cart-utils.js';
import { describeSelectedOptions } from './product-options-utils.js';
import './speed-insights.js';

const WARNING_MS = 5 * 60 * 1000;
const DANGER_MS = 10 * 60 * 1000;
const REFRESH_MS = 20 * 1000;

const estado = { user: null };
let refreshTimer = null;

function shortOrderCode(id) {
  return `#BL-${id.split('-')[0].slice(0, 5).toUpperCase()}`;
}

function timeAgoLabel(ms) {
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return 'recién';
  if (totalMin < 60) return `hace ${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `hace ${h}h ${m}min`;
}

function waitClass(ms) {
  if (ms >= DANGER_MS) return 'rp-card--danger';
  if (ms >= WARNING_MS) return 'rp-card--warning';
  return 'rp-card--normal';
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Lista de productos del pedido, igual de compacta que en el panel de vendedor. */
function buildItemsSummary(order) {
  const items = order.order_items || [];
  const wrap = el('div', 'rp-card__items');
  if (!items.length) return wrap;

  const first = items[0];
  const firstOptions = describeSelectedOptions(first?.selected_options);
  wrap.appendChild(el('span', 'rp-card__item', `${first.quantity}x ${first.title || 'Producto'}${firstOptions ? ` — ${firstOptions}` : ''}`));

  if (items.length > 1) {
    const rest = items.length - 1;
    wrap.appendChild(el('span', 'rp-card__item-more', `+${rest} producto${rest === 1 ? '' : 's'} más`));
  }
  return wrap;
}

function buildQueueCard(order) {
  const ms = Date.now() - new Date(order.updated_at || order.created_at).getTime();
  const card = el('article', `rp-card ${waitClass(ms)}`);
  card.dataset.updatedAt = order.updated_at || order.created_at;

  const head = el('div', 'rp-card__head');
  head.appendChild(el('span', 'rp-card__code', shortOrderCode(order.id)));
  const waitBadge = el('span', 'rp-card__wait', timeAgoLabel(ms));
  head.appendChild(waitBadge);
  card.appendChild(head);

  card.appendChild(el('span', 'rp-card__store', `Retirar en ${order.stores?.name || 'el comercio'}${order.stores?.address ? ` — ${order.stores.address}` : ''}`));
  card.appendChild(el('span', 'rp-card__address', `Entregar en: ${order.shipping_address || 'sin dirección cargada'}`));
  card.appendChild(buildItemsSummary(order));
  card.appendChild(el('span', 'rp-card__price', formatPrice(order.total_price)));

  const takeBtn = el('button', 'rp-btn rp-btn--primary', 'Tomar pedido');
  takeBtn.type = 'button';
  takeBtn.addEventListener('click', async () => {
    if (!(await confirmDialog(`¿Tomar el pedido ${shortOrderCode(order.id)}?`, { confirmText: 'Tomar pedido' }))) return;
    takeBtn.disabled = true;
    const { error } = await supabase.rpc('claim_delivery', { p_order_id: order.id });
    if (error) {
      showToast(error.message || 'No se pudo tomar el pedido.', 'error');
      takeBtn.disabled = false;
      loadPanel();
      return;
    }
    showToast('Pedido tomado. Ya está en "Mis entregas en curso".', 'success');
    loadPanel();
  });
  card.appendChild(takeBtn);

  return card;
}

function buildMineCard({ delivery, order }, clientById) {
  const ms = Date.now() - new Date(order.updated_at || order.created_at).getTime();
  const card = el('article', 'rp-card rp-card--mine');

  const head = el('div', 'rp-card__head');
  head.appendChild(el('span', 'rp-card__code', shortOrderCode(order.id)));
  const statusLabel = delivery.status === 'picked_up' ? 'En camino' : 'Asignado';
  head.appendChild(el('span', 'rp-card__status', statusLabel));
  card.appendChild(head);

  card.appendChild(el('span', 'rp-card__store', `Retirar en ${order.stores?.name || 'el comercio'}${order.stores?.address ? ` — ${order.stores.address}` : ''}`));
  card.appendChild(el('span', 'rp-card__address', `Entregar en: ${order.shipping_address || 'sin dirección cargada'}`));

  const client = clientById.get(order.client_id);
  if (client) {
    const buyer = client.full_name || 'Comprador';
    const phone = client.phone ? ` — ${client.phone}` : '';
    card.appendChild(el('span', 'rp-card__buyer', `${buyer}${phone}`));
  }

  card.appendChild(buildItemsSummary(order));
  card.appendChild(el('span', 'rp-card__price', formatPrice(order.total_price)));
  card.appendChild(el('span', 'rp-card__wait rp-card__wait--muted', `Esperando desde ${timeAgoLabel(ms)}`));

  const actionBtn = el('button', 'rp-btn rp-btn--primary', delivery.status === 'picked_up' ? 'Marcar entregado' : 'Marcar en camino');
  actionBtn.type = 'button';
  actionBtn.addEventListener('click', async () => {
    const nextStatus = delivery.status === 'picked_up' ? 'delivered' : 'picked_up';
    const label = nextStatus === 'delivered' ? 'entregado' : 'en camino';
    if (!(await confirmDialog(`¿Marcar el pedido ${shortOrderCode(order.id)} como ${label}?`, { confirmText: 'Confirmar' }))) return;
    actionBtn.disabled = true;
    const { error } = await supabase.rpc('update_delivery_status', { p_delivery_id: delivery.id, p_new_status: nextStatus });
    if (error) {
      showToast(error.message || 'No se pudo actualizar el pedido.', 'error');
      actionBtn.disabled = false;
      return;
    }
    showToast(nextStatus === 'delivered' ? 'Pedido marcado como entregado.' : 'Pedido marcado como en camino.', 'success');
    loadPanel();
  });
  card.appendChild(actionBtn);

  return card;
}

function renderList(containerId, cards, emptyText) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (!cards.length) {
    container.appendChild(el('p', 'rp-empty', emptyText));
    return;
  }
  cards.forEach((card) => container.appendChild(card));
}

async function loadPanel() {
  const [{ data: orders, error: ordersError }, { data: deliveries, error: delError }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, client_id, total_price, shipping_address, created_at, updated_at, order_items(quantity, title, selected_options), stores(name, address)')
      .eq('delivery_method', 'delivery')
      .eq('payment_status', 'paid')
      .order('created_at', { ascending: true })
      .limit(200),
    supabase.from('deliveries').select('id, order_id, repartidor_id, status'),
  ]);

  if (ordersError || delError) {
    console.error('Error cargando el panel de repartidor:', ordersError || delError);
    showToast('No se pudo cargar el panel.', 'error');
    return;
  }

  const takenOrderIds = new Set((deliveries || []).map((d) => d.order_id));
  const ordersById = new Map((orders || []).map((o) => [o.id, o]));

  const available = (orders || []).filter((o) => !takenOrderIds.has(o.id));
  const mine = (deliveries || [])
    .filter((d) => d.repartidor_id === estado.user.id && ['assigned', 'picked_up'].includes(d.status))
    .map((d) => ({ delivery: d, order: ordersById.get(d.order_id) }))
    .filter((x) => x.order)
    // Más viejo primero también acá: es la próxima que conviene resolver.
    .sort((a, b) => new Date(a.order.created_at) - new Date(b.order.created_at));

  const clientIds = [...new Set(mine.map((x) => x.order.client_id).filter(Boolean))];
  const { data: clientProfiles } = clientIds.length
    ? await supabase.from('profiles').select('id, phone, full_name').in('id', clientIds)
    : { data: [] };
  const clientById = new Map((clientProfiles || []).map((p) => [p.id, p]));

  renderList('rp-mine-list', mine.map((x) => buildMineCard(x, clientById)), 'No tenés entregas en curso. Tomá un pedido de la lista de abajo.');
  renderList('rp-queue-list', available.map(buildQueueCard), 'No hay pedidos disponibles en este momento.');
}

function showSuspended() {
  document.getElementById('rp-state-loading').hidden = true;
  document.getElementById('rp-suspended-view').hidden = false;
}

async function initPanel() {
  document.getElementById('rp-state-loading').hidden = true;
  document.getElementById('rp-panel-view').hidden = false;

  document.getElementById('rp-refresh').addEventListener('click', () => loadPanel());

  await loadPanel();

  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadPanel, REFRESH_MS);
}

guardPage({
  requireAuth: true,
  requireRole: 'repartidor',
  onReady: async (user) => {
    estado.user = user;
    initNotificationsBell();

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_suspended')
      .eq('id', user.id)
      .single();

    if (profile?.is_suspended) {
      showSuspended();
      return;
    }

    initPanel();
  },
});
