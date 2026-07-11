import { supabase, showToast, setLoading, guardPage } from './auth-utils.js';
import { isValidPhone } from './validation-utils.js';
import { formatPrice } from './cart-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

const registerView = document.getElementById('register-view');
const statusView = document.getElementById('status-view');
const statusIcon = document.getElementById('status-icon');
const statusTitle = document.getElementById('status-title');
const statusText = document.getElementById('status-text');
const dashboardView = document.getElementById('dashboard-view');

function showStatus({ icon, title, text }) {
  registerView.style.display = 'none';
  dashboardView.style.display = 'none';
  statusView.style.display = 'block';
  statusIcon.className = icon;
  statusTitle.textContent = title;
  statusText.textContent = text;
}

function showDashboard() {
  registerView.style.display = 'none';
  statusView.style.display = 'none';
  dashboardView.style.display = 'block';
}

/** Repartidor ya aprobado, solicitud pendiente, o nada todavía (mostrar form) */
async function checkDeliveryState(user) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'repartidor') {
    showDashboard();
    loadAvailableOrders();
    loadMyDeliveries(user.id);
    return;
  }

  const { data: req } = await supabase
    .from('delivery_requests')
    .select('status')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .maybeSingle();

  if (req?.status === 'pending') {
    showStatus({
      icon: 'fa-regular fa-clock',
      title: 'Solicitud en revisión',
      text: 'Te avisamos apenas el equipo la revise.',
    });
    return;
  }

  if (req?.status === 'rejected') {
    showStatus({
      icon: 'fa-solid fa-circle-xmark',
      title: 'Solicitud rechazada',
      text: 'Podés escribirnos si creés que fue un error, o volver a intentarlo más adelante.',
    });
    return;
  }

  // Sin solicitud todavía: mostrar el formulario
  registerView.style.display = 'block';
  statusView.style.display = 'none';
  dashboardView.style.display = 'none';
}

/** Construye una tarjeta de pedido disponible con botón "Tomar pedido" */
function buildAvailableOrderCard(order, onClaim) {
  const card = document.createElement('div');
  card.className = 'delivery-card';

  const info = document.createElement('div');
  info.className = 'delivery-card__info';

  const storeSpan = document.createElement('span');
  storeSpan.className = 'delivery-card__store';
  storeSpan.textContent = order.stores?.name || 'Comercio';
  info.appendChild(storeSpan);

  const addressSpan = document.createElement('span');
  addressSpan.className = 'delivery-card__address';
  addressSpan.textContent = order.shipping_address || 'Sin dirección';
  info.appendChild(addressSpan);

  const totalSpan = document.createElement('span');
  totalSpan.className = 'delivery-card__address';
  totalSpan.textContent = formatPrice(order.total_price);
  info.appendChild(totalSpan);

  card.appendChild(info);

  const claimBtn = document.createElement('button');
  claimBtn.type = 'button';
  claimBtn.className = 'form-btn';
  claimBtn.style.cssText = 'width: auto; padding: 0.5rem 1.25rem;';
  claimBtn.textContent = 'Tomar pedido';
  claimBtn.addEventListener('click', () => onClaim(order.id, claimBtn));
  card.appendChild(claimBtn);

  return card;
}

/** Construye una tarjeta de "mis entregas" (ya tomadas) */
function buildMyDeliveryCard(delivery, clientPhone) {
  const order = delivery.orders;
  const card = document.createElement('div');
  card.className = 'delivery-card';

  const info = document.createElement('div');
  info.className = 'delivery-card__info';

  const storeSpan = document.createElement('span');
  storeSpan.className = 'delivery-card__store';
  storeSpan.textContent = order?.stores?.name || 'Comercio';
  info.appendChild(storeSpan);

  const addressSpan = document.createElement('span');
  addressSpan.className = 'delivery-card__address';
  addressSpan.textContent = order?.shipping_address || 'Sin dirección';
  info.appendChild(addressSpan);

  // F12-05: teléfono del cliente para coordinar la entrega (solo si lo cargó
  // en su perfil).
  if (clientPhone) {
    const phoneSpan = document.createElement('span');
    phoneSpan.className = 'delivery-card__address';
    const phoneIcon = document.createElement('i');
    phoneIcon.className = 'fa-solid fa-phone';
    phoneSpan.appendChild(phoneIcon);
    phoneSpan.append(` ${clientPhone}`);
    info.appendChild(phoneSpan);
  }

  card.appendChild(info);

  const statusSpan = document.createElement('span');
  statusSpan.className = 'delivery-card__address';
  statusSpan.textContent = DELIVERY_STATUS_LABELS[delivery.status] || delivery.status;
  card.appendChild(statusSpan);

  const nextStatus = DELIVERY_NEXT_STATUS[delivery.status];
  if (nextStatus) {
    const advanceBtn = document.createElement('button');
    advanceBtn.type = 'button';
    advanceBtn.className = 'form-btn';
    advanceBtn.style.cssText = 'width: auto; padding: 0.5rem 1.25rem;';
    advanceBtn.textContent = nextStatus.label;
    advanceBtn.addEventListener('click', () => handleAdvanceStatus(delivery.id, nextStatus.value, advanceBtn));
    card.appendChild(advanceBtn);
  }

  return card;
}

const DELIVERY_STATUS_LABELS = {
  assigned: 'Asignado',
  picked_up: 'En camino',
  delivered: 'Entregado',
};

// Qué botón mostrar según el estado actual (assigned -> picked_up -> delivered)
const DELIVERY_NEXT_STATUS = {
  assigned: { value: 'picked_up', label: 'Marcar en camino' },
  picked_up: { value: 'delivered', label: 'Marcar entregado' },
};

async function handleAdvanceStatus(deliveryId, newStatus, btn) {
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Actualizando...';

  const { error } = await supabase.rpc('update_delivery_status', {
    p_delivery_id: deliveryId,
    p_new_status: newStatus,
  });

  if (error) {
    console.error('Error al actualizar el estado de la entrega:', error);
    showToast(error.message || 'No se pudo actualizar el estado.', 'error');
    btn.disabled = false;
    btn.textContent = originalText;
    return;
  }

  showToast('Estado actualizado.', 'success');
  const { data: { user } } = await supabase.auth.getUser();
  if (user) loadMyDeliveries(user.id);
}

async function loadAvailableOrders() {
  const container = document.getElementById('available-orders-container');
  if (!container) return;

  const [{ data: orders, error: ordersError }, { data: takenDeliveries, error: deliveriesError }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, store_id, total_price, shipping_address, created_at, stores ( name )')
      .eq('delivery_method', 'delivery')
      .eq('payment_status', 'paid')
      .order('created_at', { ascending: true }),
    supabase.from('deliveries').select('order_id'),
  ]);

  container.textContent = '';

  if (ordersError || deliveriesError) {
    console.error('Error al cargar pedidos disponibles:', ordersError || deliveriesError);
    const errorMsg = document.createElement('p');
    errorMsg.className = 'delivery-empty';
    errorMsg.textContent = 'Error al cargar los pedidos disponibles.';
    container.appendChild(errorMsg);
    return;
  }

  const takenOrderIds = new Set((takenDeliveries || []).map((d) => d.order_id));
  const available = (orders || []).filter((o) => !takenOrderIds.has(o.id));

  if (available.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'delivery-empty';
    emptyMsg.textContent = 'No hay pedidos disponibles por ahora.';
    container.appendChild(emptyMsg);
    return;
  }

  available.forEach((order) => {
    container.appendChild(buildAvailableOrderCard(order, handleClaim));
  });
}

async function handleClaim(orderId, btn) {
  btn.disabled = true;
  btn.textContent = 'Tomando...';

  const { error } = await supabase.rpc('claim_delivery', { p_order_id: orderId });

  if (error) {
    console.error('Error al tomar el pedido:', error);
    showToast(error.message || 'No se pudo tomar el pedido.', 'error');
    btn.disabled = false;
    btn.textContent = 'Tomar pedido';
    loadAvailableOrders();
    return;
  }

  showToast('¡Pedido tomado! Ya aparece en "Mis entregas".', 'success');
  const { data: { user } } = await supabase.auth.getUser();
  loadAvailableOrders();
  if (user) loadMyDeliveries(user.id);
}

async function loadMyDeliveries(userId) {
  const container = document.getElementById('my-deliveries-container');
  if (!container) return;

  const { data, error } = await supabase
    .from('deliveries')
    .select('id, status, orders ( client_id, shipping_address, stores ( name ) )')
    .eq('repartidor_id', userId)
    .order('created_at', { ascending: false });

  container.textContent = '';

  if (error) {
    console.error('Error al cargar mis entregas:', error);
    const errorMsg = document.createElement('p');
    errorMsg.className = 'delivery-empty';
    errorMsg.textContent = 'Error al cargar tus entregas.';
    container.appendChild(errorMsg);
    return;
  }

  if (!data || data.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'delivery-empty';
    emptyMsg.textContent = 'Todavía no tomaste ningún pedido.';
    container.appendChild(emptyMsg);
    return;
  }

  // F12-05: teléfono del cliente para coordinar la entrega -- orders.client_id
  // no tiene FK a profiles (sí a auth.users), así que hace falta una segunda
  // consulta. RLS nueva (profiles_select_order_participants) es la que
  // permite verlo: solo clientes con una entrega asignada a este repartidor.
  const clientIds = [...new Set(data.map((d) => d.orders?.client_id).filter(Boolean))];
  const { data: clientProfiles } = clientIds.length
    ? await supabase.from('profiles').select('id, phone').in('id', clientIds)
    : { data: [] };
  const phoneByClientId = new Map((clientProfiles || []).map((p) => [p.id, p.phone]));

  data.forEach((delivery) => {
    container.appendChild(buildMyDeliveryCard(delivery, phoneByClientId.get(delivery.orders?.client_id)));
  });
}

function initRepartidorPage(user) {
  checkDeliveryState(user);

  const form = document.getElementById('delivery-form');
  const submitBtn = form?.querySelector('button[type="submit"]');
  const vehicleTypeSelect = document.getElementById('delivery-vehicle-type');
  const plateGroup = document.getElementById('delivery-plate-group');
  const plateInput = document.getElementById('delivery-plate');

  function updatePlateVisibility() {
    const needsPlate = vehicleTypeSelect.value !== 'bicicleta';
    plateGroup.style.display = needsPlate ? 'block' : 'none';
  }
  vehicleTypeSelect?.addEventListener('change', updatePlateVisibility);
  updatePlateVisibility();

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = document.getElementById('delivery-name').value.trim();
    const phone = document.getElementById('delivery-phone').value.trim();
    const vehicleType = vehicleTypeSelect.value;
    const vehiclePlate = plateInput.value.trim();

    if (fullName.length < 3) {
      showToast('Ingresá tu nombre completo.', 'error');
      return;
    }
    if (!isValidPhone(phone)) {
      showToast('El teléfono ingresado no es válido.', 'error');
      return;
    }
    if (vehicleType !== 'bicicleta' && !vehiclePlate) {
      showToast('Ingresá la patente del vehículo.', 'error');
      return;
    }

    setLoading(submitBtn, true, 'Enviar solicitud');

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) {
      showToast('Sesión inválida.', 'error');
      setLoading(submitBtn, false, 'Enviar solicitud');
      return;
    }

    const { error } = await supabase.from('delivery_requests').insert({
      user_id: currentUser.id,
      full_name: fullName,
      phone,
      vehicle_type: vehicleType,
      vehicle_plate: vehicleType === 'bicicleta' ? null : vehiclePlate,
    });

    if (error) {
      console.error('Error al enviar solicitud de repartidor:', error);
      showToast('Hubo un error al procesar tu solicitud.', 'error');
      setLoading(submitBtn, false, 'Enviar solicitud');
      return;
    }

    showToast('¡Solicitud enviada! Te avisamos cuando la revisemos.', 'success');
    showStatus({
      icon: 'fa-regular fa-clock',
      title: 'Solicitud en revisión',
      text: 'Te avisamos apenas el equipo la revise.',
    });
  });

  document.getElementById('btn-back-home')?.addEventListener('click', () => {
    window.location.href = './home.html';
  });
}

// Página PRIVADA: si no hay sesión → redirigir a Login
guardPage({
  requireAuth: true,
  onReady: (user) => {
    initRepartidorPage(user);
  },
});
