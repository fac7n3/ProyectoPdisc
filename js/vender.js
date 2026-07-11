import { supabase, showToast, setLoading, guardPage } from './auth-utils.js';
import { formatPrice } from './cart-utils.js';
import { isValidCuit, isValidShopName, isValidPhone, isValidProductTitle, isValidPrice, isValidStock } from './validation-utils.js';
import { renderNotificationsSection } from './notifications-utils.js';
import { renderSupportSection } from './support-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

// --- Verificar si es vendedor y mostrar la vista correcta ---
async function checkSellerState(user) {
  const registerView = document.getElementById('register-view');
  const dashboardView = document.getElementById('dashboard-view');
  const shopNameLabel = document.getElementById('dash-shop-name');

  if (!user) return; // guardPage ya se encarga de redirigir

  // Verificar si ya tiene el rol o una solicitud
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'vendedor' || profile?.role === 'admin') {
    registerView.style.display = 'none';
    dashboardView.style.display = 'block';
    
    // Cargar lógica del dashboard
    await loadDashboard(user);
    return;
  }

  // Si no es vendedor, ver si tiene solicitud pendiente
  const { data: req } = await supabase
    .from('seller_requests')
    .select('status, shop_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (req) {
    registerView.style.display = 'none';
    dashboardView.style.display = 'block';
    shopNameLabel.textContent = `${req.shop_name} (Estado: ${req.status})`;
    
    // Ocultar acciones porque aún no está aprobado
    document.querySelector('.action-buttons').style.display = 'none';
    document.querySelector('.dashboard-stats').style.display = 'none';
    const formulariosYListas = document.querySelector('div[style*="margin-top: 3rem;"]');
    if(formulariosYListas) formulariosYListas.style.display = 'none';
  } else {
    registerView.style.display = 'block';
    dashboardView.style.display = 'none';
  }
}

// --- Inicializar formulario y eventos ---
async function loadCategories() {
  const select = document.getElementById('shop-category');
  if (!select) return;

  const { data: categories, error } = await supabase
    .from('categories')
    .select('name, slug')
    .order('name');

  if (error || !categories) {
    select.innerHTML = '<option value="">Error al cargar rubros</option>';
    return;
  }

  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Seleccioná un rubro...';
  select.appendChild(placeholder);

  categories.forEach(c => {
    const option = document.createElement('option');
    option.value = c.slug;
    option.textContent = c.name;
    select.appendChild(option);
  });
}

function initVenderPage(user) {
  const form = document.getElementById('seller-form');
  const submitBtn = form?.querySelector('button[type="submit"]');
  const logoutBtn = document.getElementById('btn-logout-seller');

  // Cargar categorías y estado del vendedor
  loadCategories();
  checkSellerState(user);

  // Manejar registro de comercio
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nameInput = document.getElementById('shop-name').value.trim();
    const cuitInput = document.getElementById('shop-cuit').value.trim();
    const categoryInput = document.getElementById('shop-category').value;
    const addressInput = document.getElementById('shop-address').value.trim();
    const phoneInput = document.getElementById('shop-phone').value.trim();

    if (!isValidShopName(nameInput)) {
      showToast("El nombre del comercio debe tener entre 3 y 100 caracteres.", "error");
      return;
    }
    if (!isValidCuit(cuitInput)) {
      showToast("El CUIT ingresado no es válido. Verificá el formato (11 dígitos) y el dígito verificador.", "error");
      return;
    }
    if (!addressInput) {
      showToast("Ingresá la dirección de tu comercio.", "error");
      return;
    }
    if (!isValidPhone(phoneInput)) {
      showToast("El teléfono ingresado no es válido.", "error");
      return;
    }

    if (submitBtn) setLoading(submitBtn, true, "Registrarme");

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      showToast("Sesión inválida.", "error");
      if (submitBtn) setLoading(submitBtn, false, "Registrarme");
      return;
    }

    const { error } = await supabase
      .from('seller_requests')
      .insert({ 
        user_id: user.id, 
        shop_name: nameInput,
        cuit: cuitInput,
        category_slug: categoryInput,
        address: addressInput,
        phone: phoneInput
      });

    if (error) {
      console.error("Error al solicitar ser vendedor:", error);
      showToast("Hubo un error al procesar tu solicitud.", "error");
    } else {
      showToast("¡Solicitud enviada exitosamente! Revisaremos tus datos.", "success");
      await checkSellerState();
    }
    
    if (submitBtn) setLoading(submitBtn, false, "Registrarme");
  });

  // Manejar botón de volver al inicio
  logoutBtn?.addEventListener('click', () => {
    window.location.replace('./home.html');
  });
}

// --- Vista y Lógica de Vendedor (Dashboard) ---
let currentStoreId = null;
let editingProductId = null; // F5-02: null = alta nueva, id = editando ese producto
let currentStoreHasProfile = false; // F12-15: onboarding -- ver renderOnboardingChecklist
let currentProductCount = 0;

async function loadDashboard(user) {
  // Obtener la tienda del usuario
  const { data: store, error } = await supabase
    .from('stores')
    .select('id, name, logo_url, address, phone, description, zone, hours, delivery_fee, free_shipping_threshold')
    .eq('owner_id', user.id)
    .single();

  if (error || !store) {
    console.error("Error al cargar la tienda", error);
    return;
  }

  currentStoreId = store.id;
  currentStoreHasProfile = Boolean(store.description && store.description.trim());
  document.getElementById('dash-shop-name').textContent = store.name;
  fillStoreProfileForm(store);

  const notificacionesContainer = document.getElementById('notificaciones-container');
  if (notificacionesContainer) await renderNotificationsSection(notificacionesContainer, user.id);

  const supportContainer = document.getElementById('support-container');
  if (supportContainer) await renderSupportSection(supportContainer);

  await fetchProducts();
  await renderAllOrders();
  await renderPendingPayments();
  await renderShipmentsInProgress();
  await loadDashboardStats();
  await renderMyCoupons();
  setupDashboardEvents();
}

// --- F5-06: gestión de pedidos ---

const ORDER_STATUS_LABELS_VENDER = {
  pending: 'Pendiente',
  paid: 'Pagado',
  shipped: 'Enviado',
  ready_for_pickup: 'Listo para retirar',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

async function renderAllOrders() {
  const container = document.getElementById('all-orders-container');
  if (!container || !currentStoreId) return;

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, client_id, status, payment_status, delivery_method, total_price, created_at, revocation_requested_at')
    .eq('store_id', currentStoreId)
    .order('created_at', { ascending: false })
    .limit(50);

  container.textContent = '';

  if (error) {
    console.error('Error al cargar pedidos:', error);
    const errorMsg = document.createElement('p');
    errorMsg.style.color = 'var(--bl-text-secondary)';
    errorMsg.textContent = 'Error al cargar los pedidos.';
    container.appendChild(errorMsg);
    return;
  }

  if (!orders || orders.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.style.color = 'var(--bl-text-secondary)';
    emptyMsg.textContent = 'Todavía no tenés pedidos.';
    container.appendChild(emptyMsg);
    return;
  }

  // F12-05: orders.client_id no tiene FK a profiles (sí a auth.users), así
  // que PostgREST no puede embeberlo en el select de arriba -- hace falta
  // una segunda consulta. RLS nueva (profiles_select_order_participants)
  // es la que permite verlo: solo clientes que efectivamente compraron acá.
  const clientIds = [...new Set(orders.map((o) => o.client_id).filter(Boolean))];
  const { data: clientProfiles } = clientIds.length
    ? await supabase.from('profiles').select('id, phone').in('id', clientIds)
    : { data: [] };
  const phoneByClientId = new Map((clientProfiles || []).map((p) => [p.id, p.phone]));

  orders.forEach((order) => container.appendChild(buildOrderRow(order, phoneByClientId.get(order.client_id))));
}

function buildOrderRow(order, clientPhone) {
  const row = document.createElement('div');
  row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; border: 1px solid var(--bl-border); border-radius: var(--bl-radius-md); background: white; flex-wrap: wrap;';

  const info = document.createElement('div');
  const idStrong = document.createElement('strong');
  idStrong.textContent = `Orden #${order.id.split('-')[0].toUpperCase()}`;
  info.appendChild(idStrong);
  const detailsSpan = document.createElement('span');
  detailsSpan.style.cssText = 'color: var(--bl-text-secondary); margin-left: 0.5rem;';
  const methodLabel = order.delivery_method === 'delivery' ? 'Envío' : 'Retiro en el local';
  detailsSpan.textContent = `${formatPrice(order.total_price)} · ${methodLabel}`;
  info.appendChild(detailsSpan);

  // F12-05: teléfono del cliente, para coordinar retiro/envío -- solo
  // visible si lo cargó en su perfil (RLS ya lo permite ver, F12-05).
  if (clientPhone) {
    const phoneSpan = document.createElement('span');
    phoneSpan.style.cssText = 'display: block; color: var(--bl-text-secondary); font-size: 0.875rem; margin-top: 0.15rem;';
    const phoneIcon = document.createElement('i');
    phoneIcon.className = 'fa-solid fa-phone';
    phoneSpan.appendChild(phoneIcon);
    phoneSpan.append(` ${clientPhone}`);
    info.appendChild(phoneSpan);
  }

  // Botón de arrepentimiento (Ley 24.240 / Res. 424/2020): el cliente lo
  // solicitó desde "Mis compras" (request_order_revocation) -- el vendedor
  // tiene que coordinar la devolución y usar "Cancelar" acá una vez resuelta.
  if (order.revocation_requested_at) {
    const revocationBadge = document.createElement('div');
    revocationBadge.style.cssText = 'color: #b45309; background: #fef3c7; padding: 0.25rem 0.6rem; border-radius: var(--bl-radius-md); font-size: 0.8125rem; font-weight: 600; margin-top: 0.35rem; display: inline-block;';
    revocationBadge.textContent = '⚠ Arrepentimiento solicitado por el cliente';
    info.appendChild(revocationBadge);
  }

  row.appendChild(info);

  const statusSpan = document.createElement('span');
  statusSpan.style.cssText = 'font-weight: 600;';
  statusSpan.textContent = ORDER_STATUS_LABELS_VENDER[order.status] || order.status;
  row.appendChild(statusSpan);

  const actions = document.createElement('div');
  actions.style.cssText = 'display: flex; gap: 0.5rem;';

  // El flujo de "delivery" lo maneja el repartidor (F3-03) -- acá el
  // vendedor solo gestiona directamente el retiro en el local.
  if (order.delivery_method === 'pickup' && order.status === 'paid') {
    const readyBtn = document.createElement('button');
    readyBtn.type = 'button';
    readyBtn.className = 'form-btn';
    readyBtn.style.cssText = 'width: auto; padding: 0.5rem 1rem;';
    readyBtn.textContent = 'Listo para retirar';
    readyBtn.addEventListener('click', () => updateOrderStatus(order.id, 'ready_for_pickup'));
    actions.appendChild(readyBtn);
  }

  if (order.delivery_method === 'pickup' && order.status === 'ready_for_pickup') {
    const completeBtn = document.createElement('button');
    completeBtn.type = 'button';
    completeBtn.className = 'form-btn';
    completeBtn.style.cssText = 'width: auto; padding: 0.5rem 1rem;';
    completeBtn.textContent = 'Marcar entregado';
    completeBtn.addEventListener('click', () => updateOrderStatus(order.id, 'completed'));
    actions.appendChild(completeBtn);
  }

  if (['pending', 'paid'].includes(order.status)) {
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-outline';
    cancelBtn.style.cssText = 'border-color: #ef4444; color: #ef4444; padding: 0.5rem 1rem;';
    cancelBtn.textContent = 'Cancelar';
    cancelBtn.addEventListener('click', () => {
      if (confirm('¿Cancelar este pedido?')) updateOrderStatus(order.id, 'cancelled');
    });
    actions.appendChild(cancelBtn);
  }

  row.appendChild(actions);
  return row;
}

async function updateOrderStatus(orderId, newStatus) {
  const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);

  if (error) {
    console.error('Error al actualizar el pedido:', error);
    showToast('No se pudo actualizar el pedido.', 'error');
    return;
  }

  showToast('Pedido actualizado.', 'success');
  renderAllOrders();
}

/** F5-08: precarga el form de perfil del comercio con los datos actuales. */
function fillStoreProfileForm(store) {
  const logoInput = document.getElementById('store-logo');
  const addressInput = document.getElementById('store-address');
  const phoneInput = document.getElementById('store-phone');
  const zoneInput = document.getElementById('store-zone');
  const hoursInput = document.getElementById('store-hours');
  const descInput = document.getElementById('store-description');
  const deliveryFeeInput = document.getElementById('store-delivery-fee');
  const freeShippingInput = document.getElementById('store-free-shipping-threshold');

  if (logoInput) logoInput.value = store.logo_url || '';
  if (addressInput) addressInput.value = store.address || '';
  if (phoneInput) phoneInput.value = store.phone || '';
  if (zoneInput) zoneInput.value = store.zone || '';
  // hours se guarda como un string JSON simple (ej: '"Lunes a viernes 9 a 18hs"')
  if (hoursInput) hoursInput.value = typeof store.hours === 'string' ? store.hours : '';
  if (descInput) descInput.value = store.description || '';
  // F12-04: envío configurable por comercio (antes era una constante global 350/5000).
  if (deliveryFeeInput) deliveryFeeInput.value = store.delivery_fee ?? 350;
  if (freeShippingInput) freeShippingInput.value = store.free_shipping_threshold ?? 5000;
}

function setupStoreProfileForm() {
  const form = document.getElementById('store-profile-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    setLoading(submitBtn, true, 'Guardar perfil');

    const hoursValue = document.getElementById('store-hours').value.trim();
    const deliveryFeeValue = parseInt(document.getElementById('store-delivery-fee').value, 10);
    const freeShippingValue = parseInt(document.getElementById('store-free-shipping-threshold').value, 10);

    if (!Number.isFinite(deliveryFeeValue) || deliveryFeeValue < 0 || !Number.isFinite(freeShippingValue) || freeShippingValue < 0) {
      showToast('El costo de envío y el umbral de envío gratis tienen que ser números válidos (0 o más).', 'error');
      setLoading(submitBtn, false, 'Guardar perfil');
      return;
    }

    const descriptionValue = document.getElementById('store-description').value.trim();

    const { error } = await supabase
      .from('stores')
      .update({
        logo_url: document.getElementById('store-logo').value.trim() || null,
        address: document.getElementById('store-address').value.trim() || null,
        phone: document.getElementById('store-phone').value.trim() || null,
        zone: document.getElementById('store-zone').value.trim() || null,
        hours: hoursValue || null,
        description: descriptionValue || null,
        delivery_fee: deliveryFeeValue,
        free_shipping_threshold: freeShippingValue,
      })
      .eq('id', currentStoreId);

    if (error) {
      console.error('Error al guardar el perfil del comercio:', error);
      showToast('No se pudo guardar el perfil.', 'error');
    } else {
      showToast('Perfil del comercio actualizado.', 'success');
      // F12-15: onboarding -- si acaba de completar el perfil, el checklist se actualiza solo.
      currentStoreHasProfile = Boolean(descriptionValue);
      renderOnboardingChecklist(currentProductCount > 0);
    }
    setLoading(submitBtn, false, 'Guardar perfil');
  });
}

// --- F12-03: cupones propios del vendedor (solo los de su propia tienda) ---

async function renderMyCoupons() {
  const container = document.getElementById('my-coupons-container');
  if (!container || !currentStoreId) return;
  container.textContent = '';

  const { data, error } = await supabase
    .from('coupons')
    .select('id, code, discount_percentage, is_active, expires_at')
    .eq('store_id', currentStoreId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al cargar cupones:', error);
    const errorMsg = document.createElement('p');
    errorMsg.style.color = 'var(--bl-text-secondary)';
    errorMsg.textContent = 'Error al cargar tus cupones.';
    container.appendChild(errorMsg);
    return;
  }

  if (!data || data.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.style.color = 'var(--bl-text-secondary)';
    emptyMsg.textContent = 'Todavía no creaste ningún cupón.';
    container.appendChild(emptyMsg);
    return;
  }

  data.forEach((coupon) => {
    const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; border: 1px solid var(--bl-border); border-radius: var(--bl-radius-md); background: white; flex-wrap: wrap;';

    const info = document.createElement('div');
    const codeStrong = document.createElement('strong');
    codeStrong.textContent = coupon.code;
    info.appendChild(codeStrong);
    const detailsSpan = document.createElement('span');
    detailsSpan.style.cssText = 'color: var(--bl-text-secondary); margin-left: 0.5rem;';
    detailsSpan.textContent = `${coupon.discount_percentage}% · ${isExpired ? 'Vencido' : (coupon.is_active ? 'Activo' : 'Inactivo')}`;
    info.appendChild(detailsSpan);
    row.appendChild(info);

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 0.5rem;';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn-outline';
    toggleBtn.style.cssText = 'padding: 0.5rem 1rem;';
    toggleBtn.textContent = coupon.is_active ? 'Desactivar' : 'Activar';
    toggleBtn.addEventListener('click', async () => {
      const { error: updateError } = await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id);
      if (updateError) {
        showToast('No se pudo actualizar el cupón.', 'error');
        console.error(updateError);
        return;
      }
      renderMyCoupons();
    });
    actions.appendChild(toggleBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-outline';
    deleteBtn.style.cssText = 'border-color: #ef4444; color: #ef4444; padding: 0.5rem 1rem;';
    deleteBtn.textContent = 'Borrar';
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`¿Borrar el cupón "${coupon.code}"?`)) return;
      const { error: deleteError } = await supabase.from('coupons').delete().eq('id', coupon.id);
      if (deleteError) {
        showToast('No se pudo borrar el cupón.', 'error');
        console.error(deleteError);
        return;
      }
      showToast('Cupón borrado.', 'success');
      renderMyCoupons();
    });
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    container.appendChild(row);
  });
}

function setupMyCouponForm() {
  const form = document.getElementById('my-coupon-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('my-coupon-code').value.trim().toUpperCase();
    const discountNum = parseInt(document.getElementById('my-coupon-discount').value, 10);
    const expiresAt = document.getElementById('my-coupon-expires').value;

    if (!code || !Number.isInteger(discountNum) || discountNum < 1 || discountNum > 100) {
      showToast('Código y descuento (1-100) son obligatorios.', 'error');
      return;
    }

    const { error } = await supabase.from('coupons').insert({
      code,
      discount_percentage: discountNum,
      expires_at: expiresAt || null,
      is_active: true,
      store_id: currentStoreId,
    });

    if (error) {
      showToast('No se pudo crear el cupón (¿el código ya está en uso?).', 'error');
      console.error(error);
      return;
    }

    showToast('Cupón creado — ya se puede usar en el checkout.', 'success');
    form.reset();
    renderMyCoupons();
  });
}

/** F5-07: ventas de hoy + ingresos del mes, ambos desde orders pagadas. */
async function loadDashboardStats() {
  if (!currentStoreId) return;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: paidOrders, error } = await supabase
    .from('orders')
    .select('total_price, created_at')
    .eq('store_id', currentStoreId)
    .eq('payment_status', 'paid')
    .gte('created_at', startOfMonth.toISOString());

  if (error) {
    console.error('Error al cargar estadísticas:', error);
    return;
  }

  const salesToday = (paidOrders || []).filter((o) => new Date(o.created_at) >= startOfToday).length;
  const revenueMonth = (paidOrders || []).reduce((sum, o) => sum + o.total_price, 0);

  const salesTodayEl = document.getElementById('stat-sales-today');
  const revenueMonthEl = document.getElementById('stat-revenue-month');
  if (salesTodayEl) salesTodayEl.textContent = salesToday;
  if (revenueMonthEl) revenueMonthEl.textContent = formatPrice(revenueMonth);
}

// --- F2-04: comprobantes de transferencia por confirmar ---

async function renderPendingPayments() {
  const container = document.getElementById('pending-payments-container');
  if (!container || !currentStoreId) return;

  const { data: orders, error } = await supabase
    .from('orders')
    .select(`
      id, total_price, created_at,
      payment_proofs ( id, status, receipt_url, created_at )
    `)
    .eq('store_id', currentStoreId)
    .eq('payment_method', 'transferencia')
    .eq('payment_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al cargar pagos pendientes', error);
    return;
  }

  // Solo órdenes con un comprobante todavía sin revisar
  const withPendingProof = (orders || [])
    .map((order) => {
      const proof = (order.payment_proofs || [])
        .filter((p) => p.status === 'pending')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      return proof ? { order, proof } : null;
    })
    .filter(Boolean);

  container.textContent = '';

  if (withPendingProof.length === 0) {
    const msg = document.createElement('p');
    msg.style.color = 'var(--bl-text-secondary)';
    msg.textContent = 'No hay comprobantes pendientes de revisión.';
    container.appendChild(msg);
    return;
  }

  withPendingProof.forEach(({ order, proof }) => {
    container.appendChild(buildPendingPaymentRow(order, proof));
  });
}

function buildPendingPaymentRow(order, proof) {
  const row = document.createElement('div');
  row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; border: 1px solid var(--bl-border); border-radius: var(--bl-radius-md); background: white;';

  const info = document.createElement('div');
  const idStrong = document.createElement('strong');
  idStrong.textContent = `Orden #${order.id.split('-')[0].toUpperCase()}`;
  info.appendChild(idStrong);
  const totalSpan = document.createElement('span');
  totalSpan.style.cssText = 'color: var(--bl-text-secondary); margin-left: 0.5rem;';
  totalSpan.textContent = formatPrice(order.total_price);
  info.appendChild(totalSpan);
  row.appendChild(info);

  const actions = document.createElement('div');
  actions.style.cssText = 'display: flex; gap: 0.5rem;';

  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.className = 'btn-outline';
  viewBtn.textContent = 'Ver comprobante';
  viewBtn.addEventListener('click', async () => {
    const { data, error } = await supabase.storage
      .from('payment-proofs')
      .createSignedUrl(proof.receipt_url, 60);
    if (error || !data?.signedUrl) {
      showToast('No se pudo abrir el comprobante.', 'error');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  });
  actions.appendChild(viewBtn);

  const approveBtn = document.createElement('button');
  approveBtn.type = 'button';
  approveBtn.className = 'form-btn';
  approveBtn.style.cssText = 'width: auto; padding: 0.5rem 1rem;';
  approveBtn.textContent = 'Confirmar pago';
  approveBtn.addEventListener('click', () => handlePaymentDecision(proof.id, true));
  actions.appendChild(approveBtn);

  const rejectBtn = document.createElement('button');
  rejectBtn.type = 'button';
  rejectBtn.className = 'btn-outline';
  rejectBtn.style.cssText = 'border-color: #ef4444; color: #ef4444;';
  rejectBtn.textContent = 'Rechazar';
  rejectBtn.addEventListener('click', () => handlePaymentDecision(proof.id, false));
  actions.appendChild(rejectBtn);

  row.appendChild(actions);
  return row;
}

async function handlePaymentDecision(proofId, approve) {
  const { error } = await supabase.rpc('confirm_transfer_payment', {
    p_proof_id: proofId,
    p_approve: approve,
  });

  if (error) {
    showToast(error.message || 'No se pudo procesar el comprobante.', 'error');
    return;
  }

  showToast(approve ? 'Pago confirmado.' : 'Comprobante rechazado.', 'success');
  await renderPendingPayments();
}

// --- F3-04: estado de envío de los pedidos con delivery ---
// Sin push en tiempo real todavía (se actualiza al recargar el dashboard,
// igual que el resto de los paneles de este proyecto) — F3-05/mejoras futuras.

const SHIPMENT_STATUS_LABELS = {
  assigned: 'Repartidor asignado',
  picked_up: 'En camino',
  delivered: 'Entregado',
};

async function renderShipmentsInProgress() {
  const container = document.getElementById('shipments-container');
  if (!container || !currentStoreId) return;

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, total_price, shipping_address, created_at, deliveries ( status )')
    .eq('store_id', currentStoreId)
    .eq('delivery_method', 'delivery')
    .in('status', ['paid', 'shipped'])
    .order('created_at', { ascending: false });

  container.textContent = '';

  if (error) {
    console.error('Error al cargar envíos en curso:', error);
    const errorMsg = document.createElement('p');
    errorMsg.style.color = 'var(--bl-text-secondary)';
    errorMsg.textContent = 'Error al cargar los envíos.';
    container.appendChild(errorMsg);
    return;
  }

  if (!orders || orders.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.style.color = 'var(--bl-text-secondary)';
    emptyMsg.textContent = 'No hay envíos en curso.';
    container.appendChild(emptyMsg);
    return;
  }

  orders.forEach((order) => {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1rem; border: 1px solid var(--bl-border); border-radius: var(--bl-radius-md); background: white;';

    const info = document.createElement('div');
    const idStrong = document.createElement('strong');
    idStrong.textContent = `Orden #${order.id.split('-')[0].toUpperCase()}`;
    info.appendChild(idStrong);
    const addressSpan = document.createElement('span');
    addressSpan.style.cssText = 'color: var(--bl-text-secondary); margin-left: 0.5rem;';
    addressSpan.textContent = order.shipping_address || '';
    info.appendChild(addressSpan);
    row.appendChild(info);

    const statusSpan = document.createElement('span');
    // deliveries.order_id es UNIQUE -> PostgREST lo embebe como objeto único.
    const deliveryStatus = order.deliveries?.status;
    statusSpan.textContent = deliveryStatus
      ? (SHIPMENT_STATUS_LABELS[deliveryStatus] || deliveryStatus)
      : 'Esperando repartidor';
    row.appendChild(statusSpan);

    container.appendChild(row);
  });
}

/**
 * F12-15: onboarding para el vendedor recién aprobado -- antes caía a un
 * dashboard vacío sin ninguna guía. Se basa en el estado real (perfil
 * completo / al menos un producto cargado), no en una preferencia guardada
 * de "descartado" -- una vez cumplidos los dos pasos, desaparece solo y no
 * vuelve a aparecer (no hay forma de "reabrirlo" a propósito, no hace falta).
 */
function renderOnboardingChecklist(hasProducts) {
  const container = document.getElementById('onboarding-container');
  if (!container) return;

  container.textContent = '';

  if (currentStoreHasProfile && hasProducts) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  const title = document.createElement('h2');
  title.style.cssText = 'font-size: 1.25rem; margin-bottom: 0.35rem;';
  title.textContent = '¡Bienvenido a Baradero Local!';
  container.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.style.cssText = 'color: var(--bl-text-secondary, #4a5568); margin-bottom: 1rem; font-size: 0.9rem;';
  subtitle.textContent = 'Completá estos pasos para que tu comercio esté listo para vender:';
  container.appendChild(subtitle);

  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-direction: column; gap: 0.5rem;';

  const steps = [
    {
      done: currentStoreHasProfile,
      label: 'Completá el perfil de tu comercio (dirección, horarios, descripción)',
      onClick: () => document.getElementById('store-profile-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    },
    {
      done: hasProducts,
      label: 'Publicá tu primer producto',
      onClick: () => document.getElementById('btn-show-add-product')?.click(),
    },
  ];

  steps.forEach((step) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = `display: flex; align-items: center; gap: 0.6rem; padding: 0.65rem 0.9rem; border-radius: var(--bl-radius-md, 0.5rem); text-align: left; width: 100%; cursor: pointer; background: ${step.done ? '#d1fae5' : 'var(--bl-surface-alt, #f0f4f8)'}; border: 1px solid ${step.done ? '#a7f3d0' : 'var(--bl-border, #e2e8f0)'};`;
    btn.addEventListener('click', step.onClick);

    const icon = document.createElement('i');
    icon.className = step.done ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle';
    icon.style.color = step.done ? '#059669' : 'var(--bl-text-muted, #94a3b8)';
    btn.appendChild(icon);

    const text = document.createElement('span');
    text.textContent = step.label;
    if (step.done) text.style.cssText = 'text-decoration: line-through; color: var(--bl-text-muted, #94a3b8);';
    btn.appendChild(text);

    list.appendChild(btn);
  });

  container.appendChild(list);
}

async function fetchProducts() {
  if (!currentStoreId) return;

  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', currentStoreId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error al cargar productos", error);
    return;
  }

  // F5-07: la tarjeta dice "Productos Activos" -- antes contaba todos (incluidos inactivos).
  document.getElementById('stat-products-count').textContent = products.filter((p) => p.is_active).length;

  // F12-15: onboarding -- cuenta cualquier producto (activo o no), "publicar el
  // primer producto" ya está cumplido aunque después lo haya desactivado.
  currentProductCount = products.length;
  renderOnboardingChecklist(currentProductCount > 0);

  const tbody = document.getElementById('seller-products-tbody');
  tbody.innerHTML = '';

  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">No tienes productos cargados aún.</td></tr>';
    return;
  }

  products.forEach(p => {
    const tr = document.createElement('tr');
    if (!p.is_active) tr.style.opacity = '0.55';

    // Image cell
    const tdImg = document.createElement('td');
    tdImg.style.padding = '1rem';
    const img = document.createElement('img');
    img.src = p.image_url || '/img/no-image.svg';
    img.style.cssText = 'width: 50px; height: 50px; border-radius: 8px; object-fit: cover;';
    img.alt = p.title || 'Producto';
    img.loading = 'lazy';
    tdImg.appendChild(img);
    tr.appendChild(tdImg);

    // Name + description cell
    const tdName = document.createElement('td');
    tdName.style.padding = '1rem';
    const strong = document.createElement('strong');
    strong.textContent = p.title;
    tdName.appendChild(strong);
    if (!p.is_active) {
      const badge = document.createElement('span');
      badge.style.cssText = 'margin-left: 0.5rem; font-size: 0.75rem; color: #ef4444; font-weight: 600;';
      badge.textContent = '(Inactivo)';
      tdName.appendChild(badge);
    }
    if (p.description) {
      tdName.appendChild(document.createElement('br'));
      const small = document.createElement('small');
      small.style.color = 'var(--bl-text-secondary)';
      small.textContent = p.description.substring(0, 30) + '...';
      tdName.appendChild(small);
    }
    tr.appendChild(tdName);

    // Price cell
    const tdPrice = document.createElement('td');
    tdPrice.style.cssText = 'padding: 1rem; color: var(--bl-primary); font-weight: 600;';
    tdPrice.textContent = formatPrice(p.price);
    tr.appendChild(tdPrice);

    // Actions cell
    const tdActions = document.createElement('td');
    tdActions.style.padding = '1rem';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-edit-product';
    editBtn.dataset.id = p.id;
    editBtn.title = 'Editar';
    editBtn.style.cssText = 'background: transparent; border: none; color: var(--bl-primary); cursor: pointer; padding: 0.5rem;';
    const editIcon = document.createElement('i');
    editIcon.className = 'fa-solid fa-pen';
    editBtn.appendChild(editIcon);
    tdActions.appendChild(editBtn);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-toggle-product';
    toggleBtn.dataset.id = p.id;
    toggleBtn.dataset.active = p.is_active;
    toggleBtn.title = p.is_active ? 'Desactivar' : 'Activar';
    toggleBtn.style.cssText = 'background: transparent; border: none; color: var(--bl-text-secondary); cursor: pointer; padding: 0.5rem;';
    const toggleIcon = document.createElement('i');
    toggleIcon.className = p.is_active ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    toggleBtn.appendChild(toggleIcon);
    tdActions.appendChild(toggleBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-product';
    deleteBtn.dataset.id = p.id;
    deleteBtn.title = 'Eliminar';
    deleteBtn.style.cssText = 'background: transparent; border: none; color: #ef4444; cursor: pointer; padding: 0.5rem;';
    const trashIcon = document.createElement('i');
    trashIcon.className = 'fa-solid fa-trash';
    deleteBtn.appendChild(trashIcon);
    tdActions.appendChild(deleteBtn);

    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });

  // Bind acciones
  document.querySelectorAll('.btn-delete-product').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm('¿Eliminar producto? (Atención: esto fallará si el producto ya fue comprado por alguien, requiere lógica avanzada en un entorno real)')) {
        await supabase.from('products').delete().eq('id', id);
        fetchProducts();
      }
    });
  });

  document.querySelectorAll('.btn-toggle-product').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      const isActive = e.currentTarget.dataset.active === 'true';
      const { error } = await supabase.from('products').update({ is_active: !isActive }).eq('id', id);
      if (error) {
        showToast('No se pudo actualizar el producto.', 'error');
        console.error(error);
        return;
      }
      showToast(isActive ? 'Producto desactivado' : 'Producto activado', 'success');
      fetchProducts();
    });
  });

  document.querySelectorAll('.btn-edit-product').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      await openEditProductForm(id);
    });
  });
}

/** F5-02: trae el producto y precarga el form de alta como form de edición. */
async function openEditProductForm(productId) {
  const { data: product, error } = await supabase
    .from('products')
    .select('*, categories ( slug )')
    .eq('id', productId)
    .single();

  if (error || !product) {
    showToast('No se pudo cargar el producto para editar.', 'error');
    console.error(error);
    return;
  }

  editingProductId = productId;

  document.getElementById('prod-name').value = product.title || '';
  document.getElementById('prod-price').value = product.price ?? '';
  document.getElementById('prod-stock').value = product.stock ?? '';
  document.getElementById('prod-compare-price').value = product.compare_at_price ?? '';
  document.getElementById('prod-offer-expires').value = product.offer_expires_at ?? '';
  document.getElementById('prod-desc').value = product.description || '';
  document.getElementById('prod-image').value = product.image_url || '';
  document.getElementById('prod-category').value = product.categories?.slug || '';

  const formTitle = document.getElementById('add-product-form-title');
  if (formTitle) formTitle.textContent = 'Editar producto';
  const submitBtn = document.querySelector('#add-product-form button[type="submit"]');
  if (submitBtn) submitBtn.textContent = 'Guardar cambios';

  document.getElementById('add-product-form-container').style.display = 'block';
  document.getElementById('add-product-form-container').scrollIntoView({ behavior: 'smooth', block: 'center' });

  await renderExistingProductImages(productId);

  // F5-03: variantes solo tienen sentido con un product_id real, o sea editando.
  const variantsSection = document.getElementById('prod-variants-section');
  if (variantsSection) variantsSection.style.display = 'block';
  await renderVariantsManager(productId);
}

/** F5-04: miniaturas de las fotos ya subidas, con botón para borrarlas. */
async function renderExistingProductImages(productId) {
  const container = document.getElementById('prod-existing-images');
  if (!container) return;
  container.textContent = '';

  const { data: images, error } = await supabase
    .from('product_images')
    .select('id, url')
    .eq('product_id', productId)
    .order('position', { ascending: true });

  if (error || !images) return;

  images.forEach((img) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position: relative; width: 64px; height: 64px;';

    const thumb = document.createElement('img');
    thumb.src = img.url;
    thumb.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 6px;';
    wrap.appendChild(thumb);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.style.cssText = 'position: absolute; top: -6px; right: -6px; width: 20px; height: 20px; border-radius: 50%; background: #ef4444; color: white; border: none; cursor: pointer; font-size: 0.75rem; line-height: 1;';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', async () => {
      const { error: deleteError } = await supabase.from('product_images').delete().eq('id', img.id);
      if (deleteError) {
        showToast('No se pudo borrar la foto.', 'error');
        console.error(deleteError);
        return;
      }
      wrap.remove();
    });
    wrap.appendChild(removeBtn);

    container.appendChild(wrap);
  });
}

/** F5-04: sube los archivos elegidos al bucket 'products' y crea las filas en product_images. */
async function uploadProductImages(productId, files) {
  if (!files || files.length === 0) return;

  const { data: existing } = await supabase
    .from('product_images')
    .select('position')
    .eq('product_id', productId)
    .order('position', { ascending: false })
    .limit(1);
  let nextPosition = (existing?.[0]?.position ?? -1) + 1;

  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
    const path = `${productId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage.from('products').upload(path, file);
    if (uploadError) {
      console.error('Error al subir la foto:', uploadError);
      showToast(`No se pudo subir ${file.name}.`, 'error');
      continue;
    }

    const { data: urlData } = supabase.storage.from('products').getPublicUrl(path);
    await supabase.from('product_images').insert({
      product_id: productId,
      url: urlData.publicUrl,
      position: nextPosition,
    });
    nextPosition += 1;
  }
}

/** F5-03: lista las variantes de un producto (talle/color/peso) con botón para borrarlas. */
async function renderVariantsManager(productId) {
  const container = document.getElementById('prod-variants-list');
  if (!container) return;
  container.textContent = '';

  const { data: variants, error } = await supabase
    .from('product_variants')
    .select('id, name, price, stock')
    .eq('product_id', productId)
    .order('created_at', { ascending: true });

  if (error || !variants) return;

  if (variants.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'color: var(--bl-text-muted); font-size: 0.9rem; margin: 0;';
    empty.textContent = 'Todavía no cargaste variantes.';
    container.appendChild(empty);
    return;
  }

  variants.forEach((variant) => {
    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; background: var(--bl-bg-alt, #f5f5f5); border-radius: 6px;';

    const label = document.createElement('span');
    label.style.cssText = 'flex: 1;';
    label.textContent = `${variant.name} — ${formatPrice(variant.price)} — stock: ${variant.stock}`;
    row.appendChild(label);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.style.cssText = 'width: 24px; height: 24px; border-radius: 50%; background: #ef4444; color: white; border: none; cursor: pointer; font-size: 0.8rem; line-height: 1;';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', async () => {
      const { error: deleteError } = await supabase.from('product_variants').delete().eq('id', variant.id);
      if (deleteError) {
        showToast('No se pudo borrar la variante.', 'error');
        console.error(deleteError);
        return;
      }
      row.remove();
      if (!container.children.length) await renderVariantsManager(productId);
    });
    row.appendChild(removeBtn);

    container.appendChild(row);
  });
}

function setupDashboardEvents() {
  setupStoreProfileForm();
  setupMyCouponForm();
  document.getElementById('btn-refresh-orders')?.addEventListener('click', renderAllOrders);

  // F5-03: alta de variante para el producto que se está editando.
  document.getElementById('btn-add-variant')?.addEventListener('click', async () => {
    if (!editingProductId) return;

    const nameInput = document.getElementById('variant-name');
    const priceInput = document.getElementById('variant-price');
    const stockInput = document.getElementById('variant-stock');

    const name = nameInput.value.trim();
    const price = priceInput.value;
    const stock = stockInput.value;

    if (!name) {
      showToast('La variante necesita un nombre.', 'error');
      return;
    }
    if (!isValidPrice(price)) {
      showToast('El precio de la variante debe ser un número entero mayor a 0.', 'error');
      return;
    }
    if (!isValidStock(stock)) {
      showToast('El stock de la variante debe ser un número entero mayor o igual a 0.', 'error');
      return;
    }

    const { error } = await supabase.from('product_variants').insert({
      product_id: editingProductId,
      name,
      price: parseInt(price),
      stock: parseInt(stock),
    });

    if (error) {
      showToast('No se pudo agregar la variante.', 'error');
      console.error(error);
      return;
    }

    nameInput.value = '';
    priceInput.value = '';
    stockInput.value = '';
    await renderVariantsManager(editingProductId);
  });

  const btnShowAdd = document.getElementById('btn-show-add-product');
  const btnCancelAdd = document.getElementById('btn-cancel-add-product');
  const addFormContainer = document.getElementById('add-product-form-container');
  const addForm = document.getElementById('add-product-form');

  // Llenar categorías del form
  const categorySelect = document.getElementById('prod-category');
  const baseCategorySelect = document.getElementById('shop-category');
  if (categorySelect && baseCategorySelect) {
    categorySelect.innerHTML = baseCategorySelect.innerHTML;
  }

  function resetProductForm() {
    editingProductId = null;
    addForm.reset();
    const formTitle = document.getElementById('add-product-form-title');
    if (formTitle) formTitle.textContent = 'Publicar nuevo producto';
    const submitBtn = addForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Guardar Producto';
    const existingImages = document.getElementById('prod-existing-images');
    if (existingImages) existingImages.textContent = '';
    const variantsSection = document.getElementById('prod-variants-section');
    if (variantsSection) variantsSection.style.display = 'none';
    const variantsList = document.getElementById('prod-variants-list');
    if (variantsList) variantsList.textContent = '';
  }

  btnShowAdd.addEventListener('click', () => {
    resetProductForm();
    addFormContainer.style.display = 'block';
  });

  btnCancelAdd.addEventListener('click', () => {
    addFormContainer.style.display = 'none';
    resetProductForm();
  });

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = addForm.querySelector('button[type="submit"]');
    const isEditing = Boolean(editingProductId);
    const submitLabel = isEditing ? 'Guardar cambios' : 'Guardar Producto';

    const titleValue = document.getElementById('prod-name').value.trim();
    const priceValue = document.getElementById('prod-price').value;
    const stockValue = document.getElementById('prod-stock').value;
    const comparePriceValue = document.getElementById('prod-compare-price').value.trim();
    const offerExpiresValue = document.getElementById('prod-offer-expires').value;

    if (!isValidProductTitle(titleValue)) {
      showToast("El nombre del producto debe tener entre 3 y 150 caracteres.", "error");
      return;
    }
    if (!isValidPrice(priceValue)) {
      showToast("El precio debe ser un número entero mayor a 0.", "error");
      return;
    }
    if (!isValidStock(stockValue)) {
      showToast("El stock debe ser un número entero mayor o igual a 0.", "error");
      return;
    }
    if (comparePriceValue && (!isValidPrice(comparePriceValue) || parseInt(comparePriceValue) <= parseInt(priceValue))) {
      showToast("El precio de oferta debe ser un número entero mayor al precio actual.", "error");
      return;
    }

    setLoading(btnSubmit, true, submitLabel);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showToast("Sesión inválida.", "error");
      setLoading(btnSubmit, false, submitLabel);
      return;
    }

    const productData = {
      title: titleValue,
      price: parseInt(priceValue),
      stock: parseInt(stockValue),
      compare_at_price: comparePriceValue ? parseInt(comparePriceValue) : null,
      offer_expires_at: comparePriceValue && offerExpiresValue ? offerExpiresValue : null,
      category_id: null,
      description: document.getElementById('prod-desc').value.trim(),
      image_url: document.getElementById('prod-image').value.trim()
    };

    // El select guarda el slug de la categoría; hay que resolver el UUID real
    const slug = document.getElementById('prod-category').value;
    const { data: catData } = await supabase.from('categories').select('id').eq('slug', slug).single();
    if (catData) productData.category_id = catData.id;

    let error;
    let savedProductId = editingProductId;
    if (isEditing) {
      ({ error } = await supabase.from('products').update(productData).eq('id', editingProductId));
    } else {
      productData.seller_id = user.id;
      productData.store_id = currentStoreId;
      const { data: inserted, error: insertError } = await supabase.from('products').insert([productData]).select('id').single();
      error = insertError;
      savedProductId = inserted?.id;
    }

    if (error) {
      showToast(isEditing ? "Error al guardar los cambios" : "Error al guardar el producto", "error");
      console.error(error);
      setLoading(btnSubmit, false, submitLabel);
      return;
    }

    // F5-04: subir las fotos adicionales elegidas (si hay), ya con el id real del producto
    const extraImagesInput = document.getElementById('prod-extra-images');
    if (savedProductId && extraImagesInput?.files?.length) {
      await uploadProductImages(savedProductId, Array.from(extraImagesInput.files));
    }

    showToast(isEditing ? "Producto actualizado" : "Producto creado", "success");
    addFormContainer.style.display = 'none';
    resetProductForm();
    fetchProducts();
    setLoading(btnSubmit, false, submitLabel);
  });
}

// --- Inicialización con Guard ---
// Página PRIVADA: si no hay sesión → redirigir a Login
guardPage({
  requireAuth: true,
  onReady: (user) => {
    initVenderPage(user);
  },
});
