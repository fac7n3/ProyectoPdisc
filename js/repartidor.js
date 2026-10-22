/**
 * Panel de repartidor (pages/repartidor.html).
 *
 * Una sola consulta (RPC `get_courier_panel`, migración 138) trae lo que se
 * dibuja: mis entregas y los 20 pedidos más viejos sin repartidor. Se refresca
 * por Realtime (con su respaldo de 30 s); un tick local solo repinta colores y
 * "hace X min" sin pedir nada, y se frena con la pestaña oculta.
 *
 * Flujo de una entrega: Tomado -> (el comercio confirma el retiro con los 4
 * dígitos del número de pedido) -> el repartidor saca la foto y sale "En camino"
 * -> entrega con el código del comprador. Ver docs en el skill
 * `progreso-baradero-local`.
 */
import { supabase, showToast, guardPage } from './auth-utils.js';
import { initNotificationsBell } from './nav-utils.js';
import { confirmDialog, formDialog } from './confirm-dialog.js';
import { formatPrice } from './cart-utils.js';
import { describeSelectedOptions } from './product-options-utils.js';
import { orderLabel } from './order-utils.js';
import { subscribeToChanges, createRefresher } from './realtime-utils.js';
import { friendlyError } from './friendly-error.js';
import { pickPhoto, uploadEvidence } from './delivery-evidence.js';
import {
  MAX_ACTIVE, DELAY_OPTIONS, queueLevel, timeAgoLabel, deliveryStage, pickupLevel,
  pickupCode, canTakeMore, mapsLinks, telHref,
} from './courier-utils.js';
import './speed-insights.js';

const TICK_MS = 30 * 1000;
const TUTORIAL_KEY = 'bl_courier_tutorial_seen';

const estado = { user: null, mine: [], queue: [], activeCount: 0, loaded: false };
let tickTimer = null;
let loading = false;
let reloadAgain = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(text, href, className = 'rp-link') {
  const a = el('a', className, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/** Productos del pedido, compacto: el primero y "+N más". */
function buildItemsSummary(items) {
  const wrap = el('div', 'rp-card__items');
  if (!items?.length) return wrap;
  const first = items[0];
  const options = describeSelectedOptions(first?.selected_options);
  wrap.appendChild(el('span', 'rp-card__item', `${first.quantity}x ${first.title || 'Producto'}${options ? ` — ${options}` : ''}`));
  if (items.length > 1) {
    const rest = items.length - 1;
    wrap.appendChild(el('span', 'rp-card__item-more', `+${rest} producto${rest === 1 ? '' : 's'} más`));
  }
  return wrap;
}

/** "Se retira en {comercio} — {dirección}" con "Ver en el mapa" y "Cómo llegar". */
function buildStoreBlock(o) {
  const block = el('div', 'rp-place');
  block.appendChild(el('span', 'rp-card__store', `Se retira en ${o.store_name || 'el comercio'}${o.store_address ? ` — ${o.store_address}` : ''}`));
  const maps = mapsLinks({ address: o.store_address, mapsUrl: o.store_maps_url });
  if (maps.view || maps.directions) {
    const links = el('span', 'rp-place__links');
    if (maps.view) links.appendChild(link('Ver en el mapa', maps.view));
    if (maps.directions) links.appendChild(link('Cómo llegar', maps.directions));
    block.appendChild(links);
  }
  return block;
}

function buildDestinationBlock(o) {
  const block = el('div', 'rp-place');
  block.appendChild(el('span', 'rp-card__address', `Entregar en: ${o.shipping_address || 'sin dirección cargada'}`));
  const maps = mapsLinks({ address: o.shipping_address });
  if (maps.view) {
    const links = el('span', 'rp-place__links');
    links.appendChild(link('Ver en el mapa', maps.view));
    if (maps.directions) links.appendChild(link('Cómo llegar', maps.directions));
    block.appendChild(links);
  }
  return block;
}

// ---------------------------------------------------------------------------
// Cola de pedidos disponibles
// ---------------------------------------------------------------------------

function buildQueueCard(o) {
  const ms = Date.now() - new Date(o.paid_at).getTime();
  const card = el('article', `rp-card rp-card--${queueLevel(ms)}`);

  const head = el('div', 'rp-card__head');
  head.appendChild(el('span', 'rp-card__code', orderLabel(o)));
  head.appendChild(el('span', 'rp-card__wait', timeAgoLabel(ms)));
  card.appendChild(head);

  card.appendChild(buildStoreBlock(o));
  card.appendChild(el('span', `rp-chip ${o.courier_ready_at ? 'rp-chip--ok' : 'rp-chip--wait'}`,
    o.courier_ready_at ? 'Listo para retirar' : 'El comercio lo está preparando'));
  card.appendChild(buildDestinationBlock(o));
  card.appendChild(buildItemsSummary(o.items));
  card.appendChild(el('span', 'rp-card__price', `Total del pedido: ${formatPrice(o.total_price)}`));

  const canTake = canTakeMore(estado.activeCount);
  const takeBtn = el('button', 'rp-btn rp-btn--primary', 'Tomar pedido');
  takeBtn.type = 'button';
  takeBtn.disabled = !canTake;
  takeBtn.addEventListener('click', () => takeOrder(o, card, takeBtn));
  card.appendChild(takeBtn);
  if (!canTake) card.appendChild(el('span', 'rp-card__hint', `Ya tenés ${MAX_ACTIVE} pedidos en curso. Entregá uno para tomar otro.`));
  return card;
}

async function takeOrder(order, card, btn) {
  btn.disabled = true;
  // Un toque, sin diálogo: es reversible ("Soltar pedido") y la ventana de un
  // diálogo era justo donde otro repartidor se lo llevaba.
  const { error } = await supabase.rpc('claim_delivery', { p_order_id: order.order_id });
  if (error) {
    showToast(friendlyError(error, 'No se pudo tomar el pedido.'), 'error');
    card.remove();
    estado.queue = estado.queue.filter((q) => q.order_id !== order.order_id);
    renderQueue();
    loadPanel();
    return;
  }
  showToast('Pedido tomado. Ya está en "Mis entregas en curso".', 'success');
  loadPanel();
}

// ---------------------------------------------------------------------------
// Mis entregas
// ---------------------------------------------------------------------------

const STEPS = [
  { key: 'assigned', label: 'Tomado' },
  { key: 'picked_up', label: 'En camino' },
  { key: 'delivered', label: 'Entregado' },
];

function buildStepper(stage) {
  const current = stage === 'picked_up' ? 1 : 0;
  const list = el('ol', 'rp-steps');
  STEPS.forEach((step, i) => {
    const li = el('li', 'rp-steps__item', step.label);
    if (i < current) li.classList.add('is-done');
    if (i === current) { li.classList.add('is-current'); li.setAttribute('aria-current', 'step'); }
    list.appendChild(li);
  });
  return list;
}

/** Ejecuta un RPC del repartidor mostrando el error en español; true si salió bien. */
async function runRpc(name, args, fallback) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    showToast(friendlyError(error, fallback), 'error');
    return { ok: false, data: null };
  }
  return { ok: true, data };
}

async function markPickedUp(d, btn) {
  const file = await pickPhoto();
  if (!file) return;
  btn.disabled = true;
  btn.textContent = 'Subiendo foto…';
  try {
    const path = await uploadEvidence(d.order_id, 'pickup', file);
    const { ok } = await runRpc('courier_mark_picked_up',
      { p_delivery_id: d.delivery_id, p_photo_path: path },
      'No se pudo marcar el pedido en camino.');
    if (ok) showToast('Pedido en camino. ¡Buen viaje!', 'success');
  } catch (err) {
    showToast(friendlyError(err, 'No se pudo subir la foto. Probá de nuevo.'), 'error');
  }
  loadPanel();
}

async function markDelivered(d, btn) {
  // El comprador tiene el código de retiro en "Mis compras": sin él no se entrega.
  const res = await formDialog('Pedile al comprador el código de 4 números que tiene en "Mis compras".', {
    title: `Entregar el pedido ${orderLabel(d)}`,
    confirmText: 'Entregar',
    input: { label: 'Código de retiro', placeholder: '0000', inputMode: 'numeric', maxLength: 4, pattern: /^\d{4}$/ },
  });
  if (!res) return;
  btn.disabled = true;
  const { ok } = await runRpc('update_delivery_status',
    { p_delivery_id: d.delivery_id, p_new_status: 'delivered', p_code: res.value },
    'No se pudo marcar el pedido como entregado.');
  if (ok) showToast('Pedido marcado como entregado.', 'success');
  else btn.disabled = false;
  loadPanel();
}

async function releaseOrder(d) {
  if (!(await confirmDialog(`¿Soltar el pedido ${orderLabel(d)}? Vuelve a la lista para que lo tome otro repartidor.`, { confirmText: 'Soltar pedido', danger: true }))) return;
  const { ok } = await runRpc('release_delivery', { p_delivery_id: d.delivery_id }, 'No se pudo soltar el pedido.');
  if (ok) showToast('Soltaste el pedido. Volvió a la lista.', 'success');
  loadPanel();
}

async function headsUp(d) {
  const { ok } = await runRpc('courier_heads_up', { p_delivery_id: d.delivery_id }, 'No se pudo avisar.');
  if (ok) showToast('Le avisamos al comprador que ya estás retirando su pedido.', 'success');
  loadPanel();
}

async function notifyDelay(d) {
  const res = await formDialog('¿Cuánto más te vas a demorar en buscarlo?', {
    title: `Avisar demora — ${orderLabel(d)}`,
    confirmText: 'Avisar',
    choices: DELAY_OPTIONS.map((m) => `${m} minutos`),
    allowOther: false,
  });
  if (!res || !res.value) return;
  const minutes = parseInt(res.value, 10);
  const { ok, data } = await runRpc('courier_notify_delay', { p_delivery_id: d.delivery_id, p_minutes: minutes }, 'No se pudo avisar la demora.');
  if (ok) {
    showToast(data?.notified_store
      ? 'Le avisamos al comercio que te demorás.'
      : 'Anotamos tu demora. El comercio todavía no marcó el pedido como listo, así que no le avisamos.', 'success');
  }
  loadPanel();
}

async function reportProblem(d) {
  const res = await formDialog('Contanos qué pasó. Le avisamos al comprador y al comercio.', {
    title: `Problema con la entrega — ${orderLabel(d)}`,
    confirmText: 'Avisar',
    choices: ['El comprador no atiende', 'La dirección no existe o es incorrecta'],
  });
  if (!res || !res.value) return;
  const { ok } = await runRpc('report_delivery_problem', { p_delivery_id: d.delivery_id, p_note: res.value }, 'No se pudo avisar el problema.');
  if (ok) showToast('Avisamos del problema. Esperá la respuesta del comercio.', 'success');
  loadPanel();
}

async function ackCancelled(d, btn) {
  btn.disabled = true;
  await runRpc('ack_delivery_cancelled', { p_delivery_id: d.delivery_id }, 'No se pudo cerrar el aviso.');
  loadPanel();
}

/** Menú "Tengo un problema": un <details>, sin JS de apertura. */
function buildMenu(summaryText, items) {
  const menu = el('details', 'rp-menu');
  menu.appendChild(el('summary', 'rp-menu__summary', summaryText));
  const body = el('div', 'rp-menu__body');
  items.forEach(({ text, onClick, danger }) => {
    const b = el('button', `rp-menu__item${danger ? ' rp-menu__item--danger' : ''}`, text);
    b.type = 'button';
    b.addEventListener('click', () => { menu.open = false; onClick(); });
    body.appendChild(b);
  });
  menu.appendChild(body);
  return menu;
}

function buildCancelledCard(d) {
  const card = el('article', 'rp-card rp-card--cancelled');
  const head = el('div', 'rp-card__head');
  head.appendChild(el('span', 'rp-card__code', orderLabel(d)));
  head.appendChild(el('span', 'rp-card__status rp-card__status--cancelled', 'Cancelado'));
  card.appendChild(head);

  const who = d.cancelled_by === 'buyer' ? 'el comprador' : d.cancelled_by === 'admin' ? 'Baradero Local' : 'el comercio';
  const alert = el('div', 'rp-alert rp-alert--danger');
  alert.setAttribute('role', 'alert');
  alert.appendChild(el('strong', null, `Este pedido fue cancelado por ${who}.`));
  alert.appendChild(el('span', null, d.picked_up_at || d.pickup_confirmed_at
    ? 'No lo entregues. Si ya lo retiraste, devolvelo al comercio.'
    : 'No vayas a buscarlo.'));
  if (d.cancel_reason) alert.appendChild(el('span', 'rp-alert__reason', `Motivo: ${d.cancel_reason}`));
  card.appendChild(alert);

  card.appendChild(buildStoreBlock(d));
  card.appendChild(buildItemsSummary(d.items));

  const btn = el('button', 'rp-btn rp-btn--danger', 'Entendido');
  btn.type = 'button';
  btn.addEventListener('click', () => ackCancelled(d, btn));
  card.appendChild(btn);
  return card;
}

function buildMineCard(d) {
  const stage = deliveryStage(d);
  if (stage === 'cancelled') return buildCancelledCard(d);

  const level = pickupLevel(d);
  const card = el('article', `rp-card rp-card--${stage === 'assigned' ? level : 'mine'}`);

  const head = el('div', 'rp-card__head');
  head.appendChild(el('span', 'rp-card__code', orderLabel(d)));
  const sinceMs = Date.now() - new Date(stage === 'picked_up' ? d.picked_up_at : d.assigned_at).getTime();
  head.appendChild(el('span', 'rp-card__wait rp-card__wait--muted', `${stage === 'picked_up' ? 'En camino' : 'Tomado'} ${timeAgoLabel(sinceMs)}`));
  card.appendChild(head);
  card.appendChild(buildStepper(stage));

  card.appendChild(buildStoreBlock(d));
  card.appendChild(buildDestinationBlock(d));

  const phone = telHref(d.buyer_phone);
  const buyer = el('span', 'rp-card__buyer', `${d.buyer_name || 'Comprador'}`);
  if (phone) {
    buyer.append(' — ');
    const tel = el('a', 'rp-link', d.buyer_phone);
    tel.href = phone;
    buyer.appendChild(tel);
  }
  card.appendChild(buyer);
  card.appendChild(buildItemsSummary(d.items));
  card.appendChild(el('span', 'rp-card__price', `Total del pedido: ${formatPrice(d.total_price)}`));

  if (stage === 'assigned') {
    card.appendChild(el('span', `rp-chip ${d.courier_ready_at ? 'rp-chip--ok' : 'rp-chip--wait'}`,
      d.courier_ready_at ? 'Listo para retirar' : 'El comercio todavía lo está preparando'));

    if (level === 'notified') {
      const mins = d.delay_minutes && d.delay_notice_at ? ` (demora de ${d.delay_minutes} min avisada)` : '';
      card.appendChild(el('span', 'rp-card__hint rp-card__hint--info', `Ya avisaste que estás en eso${mins}.`));
    } else if (level === 'warning' || level === 'danger') {
      card.appendChild(el('span', 'rp-card__hint', level === 'danger'
        ? 'Hace mucho que tomaste este pedido. Avisá cómo vas o soltalo para que lo tome otro.'
        : 'Hace un rato que lo tomaste. Si te demorás, avisalo.'));
    }

    if (!d.pickup_confirmed_at) {
      const box = el('div', 'rp-code');
      box.appendChild(el('span', 'rp-code__label', 'Al llegar al local, decile al comercio este número de pedido para que confirme el retiro:'));
      box.appendChild(el('strong', 'rp-code__value', pickupCode(d.order_number)));
      card.appendChild(box);
    } else {
      card.appendChild(el('span', 'rp-chip rp-chip--ok', 'El comercio confirmó el retiro'));
    }

    const pickBtn = el('button', 'rp-btn rp-btn--primary', 'Retiré el pedido — sacar foto');
    pickBtn.type = 'button';
    pickBtn.disabled = !d.pickup_confirmed_at;
    pickBtn.addEventListener('click', () => markPickedUp(d, pickBtn));
    card.appendChild(pickBtn);
    if (!d.pickup_confirmed_at) card.appendChild(el('span', 'rp-card__hint', 'Se habilita cuando el comercio confirme. La foto tiene que mostrar todos los productos.'));

    if (!d.pickup_confirmed_at) {
      card.appendChild(buildMenu('Tengo un problema', [
        { text: 'Ya lo tengo encima / lo estoy retirando', onClick: () => headsUp(d) },
        { text: 'Avisar demora', onClick: () => notifyDelay(d) },
        { text: 'Soltar pedido', onClick: () => releaseOrder(d), danger: true },
      ]));
    }
    return card;
  }

  // En camino
  if (d.problem_at) {
    const alert = el('div', 'rp-alert');
    alert.appendChild(el('strong', null, 'Avisaste un problema con la entrega.'));
    alert.appendChild(el('span', null, `${d.problem_note || ''} Esperá la respuesta del comercio.`.trim()));
    card.appendChild(alert);
  }
  const doneBtn = el('button', 'rp-btn rp-btn--primary', 'Marcar entregado');
  doneBtn.type = 'button';
  doneBtn.addEventListener('click', () => markDelivered(d, doneBtn));
  card.appendChild(doneBtn);
  if (!d.problem_at) {
    card.appendChild(buildMenu('Problema con la entrega', [
      { text: 'Avisar un problema', onClick: () => reportProblem(d) },
    ]));
  }
  return card;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderList(containerId, cards, emptyText) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  if (!cards.length) {
    container.appendChild(el('p', 'rp-empty', emptyText));
    return;
  }
  cards.forEach((card) => container.appendChild(card));
}

function renderMine() {
  renderList('rp-mine-list', estado.mine.map(buildMineCard), 'No tenés entregas en curso. Tomá un pedido de la lista de abajo.');
  const counter = document.getElementById('rp-active-count');
  if (counter) counter.textContent = `${estado.activeCount} de ${MAX_ACTIVE}`;
}

function renderQueue() {
  renderList('rp-queue-list', estado.queue.map(buildQueueCard), 'No hay pedidos disponibles en este momento.');
}

function renderAll() {
  renderMine();
  renderQueue();
}

/** Repinta colores y "hace X min" con lo que ya se tiene: no pide nada a la red. */
function tick() {
  if (document.hidden || !estado.loaded) return;
  // No se toca la pantalla si hay un menú abierto o un diálogo encima.
  if (document.querySelector('.rp-menu[open], .bl-confirm-overlay')) return;
  renderAll();
}

async function loadPanel() {
  if (loading) { reloadAgain = true; return; }
  loading = true;
  try {
    const { data, error } = await supabase.rpc('get_courier_panel');
    if (error) {
      console.error('Error cargando el panel de repartidor:', error);
      showToast(friendlyError(error, 'No se pudo cargar el panel.'), 'error');
      return;
    }
    estado.mine = data?.mine || [];
    estado.queue = data?.queue || [];
    estado.activeCount = data?.active_count ?? 0;
    estado.loaded = true;
    renderAll();
  } finally {
    loading = false;
    if (reloadAgain) { reloadAgain = false; loadPanel(); }
  }
}

// ---------------------------------------------------------------------------
// Tutorial
// ---------------------------------------------------------------------------

function setupTutorial() {
  const box = document.getElementById('rp-tutorial');
  const toggle = document.getElementById('rp-tutorial-toggle');
  if (!box) return;

  let seen = false;
  try { seen = localStorage.getItem(TUTORIAL_KEY) === '1'; } catch { /* sin storage: se muestra abierto */ }
  box.open = !seen;

  box.addEventListener('toggle', () => {
    toggle?.setAttribute('aria-expanded', String(box.open));
    if (!box.open) {
      try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* da igual */ }
    }
  });
  toggle?.setAttribute('aria-expanded', String(box.open));
  toggle?.addEventListener('click', () => { box.open = !box.open; });
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

function showSuspended() {
  document.getElementById('rp-state-loading').hidden = true;
  document.getElementById('rp-suspended-view').hidden = false;
}

async function initPanel() {
  document.getElementById('rp-state-loading').hidden = true;
  document.getElementById('rp-panel-view').hidden = false;

  setupTutorial();
  document.getElementById('rp-refresh').addEventListener('click', () => loadPanel());

  await loadPanel();

  // Tiempo real: un pedido recién pagado aparece al instante, y el que tomó otro
  // repartidor (o el que el comercio confirmó o canceló) se actualiza solo.
  const refreshLive = createRefresher(loadPanel);
  subscribeToChanges('repartidor', [
    { table: 'orders', filter: 'delivery_method=eq.delivery' },
    { table: 'deliveries' },
  ], refreshLive, { onResync: refreshLive });

  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { loadPanel(); }
  });
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
