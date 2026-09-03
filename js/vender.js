import { supabase, showToast, setLoading, guardPage } from './auth-utils.js';
import { formatPrice, buildPriceRow } from './cart-utils.js';
import { isValidCuit, isValidShopName, isValidPhone, isValidProductTitle, isValidPrice, isValidStock } from './validation-utils.js';
import { renderNotificationsSection } from './notifications-utils.js';
import { renderSupportSection } from './support-utils.js';
import { initNotificationsBell } from './nav-utils.js';
import { initVenderShell } from './vender-shell.js';
import { removeStoredObjects } from './storage-utils.js';
import { upgradeDateInputs } from './datepicker.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

// --- Verificar si es vendedor y mostrar la vista correcta ---
async function checkSellerState(user) {
  const registerView = document.getElementById('register-view');
  const dashboardView = document.getElementById('dashboard-view');
  const shopNameLabel = document.getElementById('dash-shop-name');

  if (!user) return; // guardPage ya se encarga de redirigir

  // El rol "real" vive en el JWT (app_metadata), no en profiles.role, que puede
  // quedar desincronizado tras cambios de rol (ver F12-17 / migración 53). Si el
  // JWT ya dice vendedor/admin (caso común) revelamos el shell al instante sin
  // esperar el round-trip a profiles: eso hacía que el dashboard tardara en
  // aparecer. profiles queda solo como fallback si el JWT no trae el rol todavía.
  const appRole = user.app_metadata?.role;

  let isSeller = ['vendedor', 'admin'].includes(appRole);
  if (!isSeller) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    isSeller = ['vendedor', 'admin'].includes(profile?.role);
  }

  if (isSeller) {
    registerView.style.display = 'none';
    dashboardView.style.display = 'flex'; // shell "Mi cuenta" (sidebar + contenido)
    await loadDashboard(user);
    return;
  }

  // F12-16: ¿es empleado de algún comercio? No necesita rol propio de vendedor.
  const { data: staffRow } = await supabase
    .from('store_staff')
    .select('store_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (staffRow) {
    registerView.style.display = 'none';
    dashboardView.style.display = 'flex'; // shell "Mi cuenta"
    await loadDashboard(user, staffRow.store_id);
    return;
  }

  // ¿Tiene una solicitud de vendedor?
  const { data: req } = await supabase
    .from('seller_requests')
    .select('status, shop_name')
    .eq('user_id', user.id)
    .maybeSingle();

  if (req) {
    registerView.style.display = 'none';
    dashboardView.style.display = 'flex';

    // Solicitud APROBADA: es vendedor aunque profiles.role no lo refleje (desincronización
    // de rol) -- mostrar el panel real, no el aviso de "pendiente".
    if (req.status === 'approved') {
      await loadDashboard(user);
      return;
    }

    // Pendiente o rechazada: todavía no hay panel. Ocultamos el sidebar y todas las
    // secciones, y mostramos el estado.
    shopNameLabel.textContent = `${req.shop_name} (Estado: ${req.status})`;
    const sidebar = document.getElementById('mc-sidebar');
    if (sidebar) sidebar.style.display = 'none';
    document.querySelectorAll('.mc-content .mc-section').forEach((s) => { s.hidden = true; });
    const notice = document.getElementById('mc-pending-notice');
    if (notice) {
      notice.style.display = 'block';
      notice.textContent = `Tu solicitud para "${req.shop_name}" está en estado: ${req.status}. Te avisaremos cuando esté aprobada.`;
    }
  } else {
    registerView.style.display = 'block';
    dashboardView.style.display = 'none';
  }
}

// --- Inicializar formulario y eventos ---

/**
 * Categorías del sitio. Se cachean porque las usan dos controles distintos
 * --el select de rubros del alta de comercio y la grilla de categoría del alta
 * de producto-- y antes el segundo se armaba copiando el HTML del primero, lo
 * que ataba uno al otro y dependía de cuál se inicializara antes.
 */
let categoriesCache = [];

/** Selectores de fecha propios, por id. Los arma upgradeDateInputs(). */
let datePickers = {};

async function loadCategories() {
  const { data: categories, error } = await supabase
    .from('categories')
    .select('name, slug, icon')
    .order('name');

  if (error || !categories) {
    console.error('No se pudieron cargar las categorías:', error);
    // Sin categorías no se puede completar ninguno de los dos formularios:
    // conviene decirlo, antes quedaba un "Cargando rubros..." para siempre.
    ['prod-category-options', 'shop-category-options'].forEach((id) => {
      const grid = document.getElementById(id);
      if (grid) grid.textContent = 'No se pudieron cargar los rubros. Recargá la página.';
    });
    return;
  }

  categoriesCache = categories;

  // Los dos controles de categoría se re-dibujan acá: cualquiera de los dos
  // formularios puede haberse armado antes de que resolviera este fetch, así
  // que el orden de inicialización deja de importar.
  renderProductCategoryOptions();
  renderShopCategoryOptions();
}

/**
 * Grilla de categorías. La usan el alta de producto (radio: una sola) y el
 * alta de comercio (checkbox: uno o más rubros); el marcado y los estilos son
 * los mismos, solo cambia el tipo de input.
 */
function renderCategoryPicker(gridId, { name, type, required = false }) {
  const grid = document.getElementById(gridId);
  if (!grid || !categoriesCache.length) return;

  // Conservar lo elegido si ya había algo marcado (ej. al re-dibujar).
  const previos = new Set(
    [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value)
  );

  grid.textContent = '';

  categoriesCache.forEach((c) => {
    const label = document.createElement('label');
    label.className = 'catpick__opt';

    const input = document.createElement('input');
    input.type = type;
    input.name = name;
    input.value = c.slug;
    input.className = 'catpick__input';
    if (required) input.required = true;
    if (previos.has(c.slug)) input.checked = true;
    label.appendChild(input);

    const icon = document.createElement('i');
    // El ícono viene de la DB; se acota a clases de Font Awesome por las dudas.
    icon.className = `${(c.icon || 'fa-solid fa-tag').replace(/[^a-zA-Z0-9 -]/g, '')} catpick__icon`;
    icon.setAttribute('aria-hidden', 'true');
    label.appendChild(icon);

    const nameEl = document.createElement('span');
    nameEl.className = 'catpick__name';
    nameEl.textContent = c.name;
    label.appendChild(nameEl);

    const check = document.createElement('i');
    check.className = 'fa-solid fa-check catpick__check';
    check.setAttribute('aria-hidden', 'true');
    label.appendChild(check);

    grid.appendChild(label);
  });
}

/** Alta de producto: una sola categoría. */
function renderProductCategoryOptions() {
  renderCategoryPicker('prod-category-options', {
    name: 'prod-category', type: 'radio', required: true,
  });
}

/**
 * Alta de comercio: uno o más rubros. Sin `required` en los checkbox: en un
 * grupo de checkbox el required es por casilla (obligaría a marcarlas TODAS),
 * así que el mínimo de uno lo valida el submit, como ya lo hacía.
 */
function renderShopCategoryOptions() {
  renderCategoryPicker('shop-category-options', {
    name: 'shop-category', type: 'checkbox',
  });
}

/** Slug de la categoría elegida en el alta de producto ('' si ninguna). */
function getProductCategorySlug() {
  return document.querySelector('input[name="prod-category"]:checked')?.value || '';
}

/** Marca una categoría (se usa al editar un producto ya guardado). */
function setProductCategorySlug(slug) {
  document.querySelectorAll('input[name="prod-category"]').forEach((r) => {
    r.checked = r.value === slug;
  });
}

/** Rubros marcados en el alta de comercio. */
function getShopCategorySlugs() {
  return [...document.querySelectorAll('input[name="shop-category"]:checked')].map((i) => i.value);
}

function initVenderPage(user) {
  const form = document.getElementById('seller-form');
  const submitBtn = form?.querySelector('button[type="submit"]');
  const logoutBtn = document.getElementById('btn-logout-seller');

  // Cargar categorías y estado del vendedor
  loadCategories();
  checkSellerState(user);
  initNotificationsBell();

  // Manejar registro de comercio
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const nameInput = document.getElementById('shop-name').value.trim();
    const cuitInput = document.getElementById('shop-cuit').value.trim();
    // P2-10: se puede elegir más de un rubro (era un <select multiple>, ahora
    // una grilla de checkbox -- el Ctrl+click no existía en un teléfono).
    const categoriesInput = getShopCategorySlugs();
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
    if (categoriesInput.length === 0) {
      showToast("Elegí al menos un rubro.", "error");
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
        category_slugs: categoriesInput,
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
let currentActiveProductCount = 0; // Resumen: productos activos (para la card de pendientes)
let currentUserFirstName = 'vendedor'; // Resumen: nombre para el saludo "¡Hola, {nombre}!"
let currentUserId = null; // Resumen: para detectar preguntas sin responder (último mensaje no es mío)
let isStoreOwner = true; // F12-16: false si el usuario entra como empleado (store_staff), no dueño

// Sección "Publicaciones" (rediseño ML): productos cacheados + ventas por producto
// + estado de los filtros client-side (búsqueda por título / estado activo-pausado).
let pubProducts = [];
let pubSalesByProduct = new Map();
let pubSearch = '';
let pubStatus = 'all'; // 'all' | 'active' | 'inactive'

// Sección "Pedidos" (stats + tabs + tabla): pedidos cacheados (con sus
// order_items/producto) + estado de los filtros client-side (búsqueda,
// pestaña de estado, orden, filtro de entrega del menú "Filtros").
let ordCache = [];
let ordPhoneByClientId = new Map();
let ordNameByClientId = new Map();
let ordSearch = '';
let pedidosTab = 'all'; // 'all' | 'pending_payment' | 'shipping' | 'completed' | 'cancelled'
let pedidosSort = 'recent'; // 'recent' | 'oldest' | 'amount_desc' | 'amount_asc'
let pedidosDeliveryFilter = 'all'; // 'all' | 'pickup' | 'delivery'

const STORE_SELECT_COLUMNS = 'id, name, logo_url, address, phone, description, zone, hours, delivery_fee, free_shipping_threshold, mp_collector_id, mp_split_pilot, accepts_contact';

/**
 * F12-16: multi-usuario por comercio. `staffStoreId` viene seteado cuando
 * quien entra no es el dueño sino un empleado (store_staff) -- en ese caso
 * se carga la tienda por id en vez de por owner_id, y se ocultan las
 * secciones exclusivas del dueño (perfil del comercio, cupones, empleados).
 * Paridad total en lo operativo (productos/pedidos/comprobantes) vía las
 * policies aditivas de 49_store_staff.sql -- nunca se tocó el acceso del dueño.
 */
async function loadDashboard(user, staffStoreId) {
  isStoreOwner = !staffStoreId;

  // Cache-first del nombre de la tienda: lo pintamos al instante desde
  // localStorage (mismo patrón que bl_catbar_cache) para que el header no
  // muestre "Tu Comercio" y salte al nombre real en cada navegación.
  const shopNameEl = document.getElementById('dash-shop-name');
  const SHOP_NAME_KEY = `bl_vender_shopname_${user.id}`;
  try {
    const cachedName = localStorage.getItem(SHOP_NAME_KEY);
    if (cachedName && shopNameEl) shopNameEl.textContent = cachedName;
  } catch { /* localStorage bloqueado: ignorar */ }

  const { data: store, error } = await supabase
    .from('stores')
    .select(STORE_SELECT_COLUMNS)
    .eq(isStoreOwner ? 'owner_id' : 'id', isStoreOwner ? user.id : staffStoreId)
    .single();

  if (error || !store) {
    console.error("Error al cargar la tienda", error);
    return;
  }

  currentStoreId = store.id;
  const previewLink = document.getElementById('preview-store-link');
  if (previewLink) previewLink.href = `./comercio.html?id=${store.id}`;
  currentStoreHasProfile = Boolean(store.description && store.description.trim());
  const shopLabel = isStoreOwner ? store.name : `${store.name} (como empleado)`;
  if (shopNameEl) shopNameEl.textContent = shopLabel;
  try { localStorage.setItem(SHOP_NAME_KEY, shopLabel); } catch { /* ignore */ }
  currentUserId = user.id;
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || store.name;
  currentUserFirstName = fullName ? fullName.trim().split(/\s+/)[0] : 'vendedor';
  const greetingName = document.getElementById('resumen-greeting-name');
  if (greetingName) greetingName.textContent = currentUserFirstName;

  // Secciones exclusivas del dueño -- un empleado no las ve.
  ['store-profile-section', 'my-coupons-section', 'store-staff-section'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = isStoreOwner ? '' : 'none';
  });
  // Ítems del sidebar exclusivos del dueño (shell "Mi cuenta"): un empleado no los ve.
  document.querySelectorAll('.mc-navitem--owner').forEach((item) => {
    item.style.display = isStoreOwner ? '' : 'none';
  });

  // Mercado Pago (P0-6): además de ser dueño, la tienda tiene que estar en el piloto.
  const mpConnectSection = document.getElementById('mp-connect-section');
  if (mpConnectSection) mpConnectSection.style.display = isStoreOwner && store.mp_split_pilot ? '' : 'none';

  // Cablear el shell YA (sidebar interactivo + mostrar la sección correcta del
  // hash al instante), ANTES de la cadena de renders de datos. Antes esto era lo
  // último: el sidebar aparecía pero no respondía a clicks hasta que resolvían
  // ~10 fetches, y un deep-link (#pedidos) mostraba "Resumen" y saltaba. Ambas
  // funciones solo cablean listeners/nav sobre DOM estático; cada sección
  // rellena su propio placeholder por detrás a medida que llega su data.
  setupDashboardEvents();
  initVenderShell(); // shell "Mi cuenta": sidebar + navegación por sección (Fase 0)

  if (isStoreOwner) {
    fillStoreProfileForm(store);
    if (store.mp_split_pilot) {
      await handleMpOauthReturn(store);
      renderMpConnectSection(store);
    }
  }

  const notificacionesContainer = document.getElementById('notificaciones-container');
  if (notificacionesContainer) await renderNotificationsSection(notificacionesContainer, user.id);

  const supportContainer = document.getElementById('support-container');
  if (supportContainer) await renderSupportSection(supportContainer);

  // fetchProducts primero (setea currentActiveProductCount, que lee renderResumen);
  // el resto son renders independientes → en paralelo, cada sección pinta apenas
  // tiene sus datos en vez de esperar a los de las demás secciones.
  await fetchProducts();
  await Promise.all([
    renderAllOrders(),
    renderPendingPayments(),
    renderShipmentsInProgress(),
    renderResumen(),
  ]);

  if (isStoreOwner) {
    await Promise.all([renderMyCoupons(), renderStoreStaff()]);
  }

  applyOrderDeepLink();
}

/**
 * A113-271: al venir de una notificación de pedido (`vender.html?order=<id>#pedidos`)
 * precarga el buscador de "Pedidos" con el N° corto del pedido, reusando el
 * filtro que ya existe ahí -- no hace falta un anchor por fila.
 */
function applyOrderDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('order');
  if (!orderId) return;

  const shortId = orderId.split('-')[0].toUpperCase();
  const searchInput = document.getElementById('pedidos-search');
  if (searchInput) searchInput.value = shortId;
  ordSearch = shortId;
  setPedidosTab('all');

  const url = new URL(window.location);
  url.searchParams.delete('order');
  window.history.replaceState({}, '', url);
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

const ORDER_STATUS_BADGE_VARIANT = {
  pending: 'pending',
  paid: 'active',
  shipped: 'shipped',
  ready_for_pickup: 'ready',
  completed: 'active',
  cancelled: 'cancelled',
};

async function renderAllOrders() {
  if (!currentStoreId) return;

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, client_id, status, payment_status, delivery_method, total_price, created_at, revocation_requested_at, order_items(quantity, price, products(title, image_url))')
    .eq('store_id', currentStoreId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error al cargar pedidos:', error);
    ordCache = [];
    renderPedidos();
    return;
  }

  ordCache = orders || [];

  // F12-05: orders.client_id no tiene FK a profiles (sí a auth.users), así
  // que PostgREST no puede embeberlo en el select de arriba -- hace falta
  // una segunda consulta. RLS nueva (profiles_select_order_participants)
  // es la que permite verlo: solo clientes que efectivamente compraron acá.
  const clientIds = [...new Set(ordCache.map((o) => o.client_id).filter(Boolean))];
  const { data: clientProfiles } = clientIds.length
    ? await supabase.from('profiles').select('id, phone, full_name').in('id', clientIds)
    : { data: [] };
  ordPhoneByClientId = new Map((clientProfiles || []).map((p) => [p.id, p.phone]));
  ordNameByClientId = new Map((clientProfiles || []).map((p) => [p.id, p.full_name]));

  renderPedidos();
}

/** Ícono + nombre del primer producto del pedido, con "· N productos" si tiene más de uno. */
function buildPedidoProductCell(order) {
  const cell = document.createElement('div');
  cell.className = 'pd-cell-product';
  const items = order.order_items || [];
  const first = items[0];

  const thumb = document.createElement('img');
  thumb.className = 'pd-cell-product__thumb';
  thumb.src = first?.products?.image_url || '/img/no-image.svg';
  thumb.alt = '';
  thumb.loading = 'lazy';
  cell.appendChild(thumb);

  const info = document.createElement('div');
  const name = document.createElement('span');
  name.className = 'pd-cell-product__name';
  name.textContent = first?.products?.title || 'Producto eliminado';
  info.appendChild(name);
  const sub = document.createElement('span');
  sub.className = 'pd-cell-product__sub';
  sub.textContent = items.length > 1 ? `${items.length} productos` : '1 producto';
  info.appendChild(sub);
  cell.appendChild(info);

  return cell;
}

function buildPedidoBuyerCell(order) {
  const cell = document.createElement('div');
  cell.className = 'pd-cell-buyer';
  const name = ordNameByClientId.get(order.client_id) || 'Comprador';

  const avatar = document.createElement('div');
  avatar.className = 'pd-cell-buyer__avatar';
  avatar.textContent = name.trim().charAt(0).toUpperCase() || '?';
  cell.appendChild(avatar);

  const info = document.createElement('div');
  info.appendChild(rsEl('span', 'pd-cell-buyer__name', name));
  info.appendChild(rsEl('span', 'pd-cell-buyer__loc', 'Baradero'));
  cell.appendChild(info);

  return cell;
}

/** Fila de la tabla de Pedidos: N°, producto, comprador, estado, fecha, total, acciones. */
function buildPedidoRow(order) {
  const tr = document.createElement('tr');

  const orderCell = document.createElement('td');
  orderCell.appendChild(rsEl('span', 'pd-cell-order', `#BL-${order.id.split('-')[0].slice(0, 5).toUpperCase()}`));
  if (order.revocation_requested_at) {
    const revocationBadge = rsEl('div', null, '⚠ Arrepentimiento solicitado');
    revocationBadge.style.cssText = 'color: #b45309; background: #fef3c7; padding: 0.15rem 0.5rem; border-radius: var(--bl-radius-md); font-size: 0.7rem; font-weight: 600; margin-top: 0.25rem; display: inline-block;';
    orderCell.appendChild(revocationBadge);
  }
  tr.appendChild(orderCell);

  const productCell = document.createElement('td');
  productCell.appendChild(buildPedidoProductCell(order));
  tr.appendChild(productCell);

  const buyerCell = document.createElement('td');
  buyerCell.appendChild(buildPedidoBuyerCell(order));
  tr.appendChild(buyerCell);

  const statusCell = document.createElement('td');
  const badge = rsEl('span', `pub-status pub-status--${ORDER_STATUS_BADGE_VARIANT[order.status] || 'paused'}`, ORDER_STATUS_LABELS_VENDER[order.status] || order.status);
  statusCell.appendChild(badge);
  tr.appendChild(statusCell);

  const dateCell = document.createElement('td');
  dateCell.className = 'pd-cell-date';
  dateCell.textContent = new Date(order.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  tr.appendChild(dateCell);

  const totalCell = document.createElement('td');
  totalCell.className = 'pd-cell-total';
  totalCell.textContent = formatPrice(order.total_price);
  tr.appendChild(totalCell);

  const actionsCell = document.createElement('td');
  const actionsWrap = rsEl('div', 'pd-row-actions');
  const detailBtn = rsEl('button', 'pd-detail-btn', 'Ver detalle');
  detailBtn.type = 'button';
  detailBtn.addEventListener('click', () => {
    showToast('La vista de detalle del pedido llega pronto. Mientras tanto usá el menú de acciones (⋮) para gestionarlo.', 'success');
  });
  actionsWrap.appendChild(detailBtn);
  const kebab = buildOrdActions(order);
  if (kebab) actionsWrap.appendChild(kebab);
  actionsCell.appendChild(actionsWrap);
  tr.appendChild(actionsCell);

  return tr;
}

/** Menú de acciones (⋮) del pedido -- mismo componente que buildPubActions, sin kebab si no hay ninguna acción disponible. */
function buildOrdActions(order) {
  const menu = document.createElement('div');
  menu.className = 'pub-actions__menu';
  menu.hidden = true;

  // El flujo de "delivery" lo maneja el repartidor (F3-03) -- acá el
  // vendedor solo gestiona directamente el retiro en el local.
  if (order.delivery_method === 'pickup' && order.status === 'paid') {
    menu.appendChild(pubMenuItem('Listo para retirar', 'fa-box', () => {
      closePubMenus();
      updateOrderStatus(order.id, 'ready_for_pickup');
    }));
  }

  if (order.delivery_method === 'pickup' && order.status === 'ready_for_pickup') {
    menu.appendChild(pubMenuItem('Marcar entregado', 'fa-check', () => {
      closePubMenus();
      updateOrderStatus(order.id, 'completed');
    }));
  }

  if (['pending', 'paid'].includes(order.status)) {
    menu.appendChild(pubMenuItem('Cancelar pedido', 'fa-ban', () => {
      closePubMenus();
      if (confirm('¿Cancelar este pedido?')) updateOrderStatus(order.id, 'cancelled');
    }, true));
  }

  if (!menu.childElementCount) return null;

  const wrap = document.createElement('div');
  wrap.className = 'pub-actions';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'pub-actions__toggle';
  toggleBtn.setAttribute('aria-label', 'Acciones del pedido');
  const dots = document.createElement('i');
  dots.className = 'fa-solid fa-ellipsis-vertical';
  toggleBtn.appendChild(dots);
  wrap.appendChild(toggleBtn);
  wrap.appendChild(menu);

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    closePubMenus();
    menu.hidden = !willOpen;
  });

  return wrap;
}

function pedidosTabMatches(order, tab) {
  switch (tab) {
    case 'pending_payment': return order.payment_status === 'pending';
    case 'shipping': return order.delivery_method === 'delivery' && (order.status === 'paid' || order.status === 'shipped');
    case 'completed': return order.status === 'completed';
    case 'cancelled': return order.status === 'cancelled';
    default: return true;
  }
}

function sortPedidos(list, sort) {
  const copy = [...list];
  if (sort === 'oldest') return copy.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (sort === 'amount_desc') return copy.sort((a, b) => b.total_price - a.total_price);
  if (sort === 'amount_asc') return copy.sort((a, b) => a.total_price - b.total_price);
  return copy.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function renderPedidosEmptyState(title, sub) {
  const table = document.getElementById('pedidos-table');
  const box = document.getElementById('pedidos-empty');
  if (table) table.hidden = true;
  if (!box) return;
  box.hidden = false;
  box.className = 'pub-empty';
  box.innerHTML = '';
  box.appendChild(rsEl('i', 'fa-regular fa-rectangle-list pub-empty__icon'));
  box.appendChild(rsEl('p', 'pub-empty__title', title));
  box.appendChild(rsEl('p', 'pub-empty__sub', sub));
}

function pdStat(icon, variant, title, value, sub) {
  const card = rsEl('div', 'pd-stat');
  const top = rsEl('div', 'pd-stat__top');
  const iconEl = rsEl('div', `pd-stat__icon pd-stat__icon--${variant}`);
  iconEl.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  top.appendChild(iconEl);
  top.appendChild(rsEl('div', 'pd-stat__title', title));
  card.appendChild(top);
  card.appendChild(rsEl('div', 'pd-stat__value', value));
  if (sub) card.appendChild(rsEl('div', 'pd-stat__sub', sub));
  return card;
}

/** Franja de stats + torta de "Ventas de los últimos 7 días" (misma línea SVG que Resumen) + contadores de las pestañas. */
function renderPedidosStats() {
  const dash = document.getElementById('pedidos-dash');
  if (!dash) return;
  dash.textContent = '';

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const total30d = ordCache.filter((o) => new Date(o.created_at) >= thirtyDaysAgo);
  const pendingPayment = ordCache.filter((o) => pedidosTabMatches(o, 'pending_payment'));
  const shipping = ordCache.filter((o) => pedidosTabMatches(o, 'shipping'));
  const completed = ordCache.filter((o) => pedidosTabMatches(o, 'completed'));
  const cancelled = ordCache.filter((o) => pedidosTabMatches(o, 'cancelled'));
  const sum = (arr) => arr.reduce((s, o) => s + o.total_price, 0);

  dash.appendChild(pdStat('fa-bag-shopping', 'total', 'Total de pedidos', String(total30d.length), 'Últimos 30 días'));
  dash.appendChild(pdStat('fa-hourglass-half', 'pending', 'Pendientes de pago', String(pendingPayment.length), formatPrice(sum(pendingPayment))));
  dash.appendChild(pdStat('fa-truck', 'shipping', 'Envíos en curso', String(shipping.length), formatPrice(sum(shipping))));
  dash.appendChild(pdStat('fa-circle-check', 'completed', 'Completados', String(completed.length), formatPrice(sum(completed))));
  dash.appendChild(pdStat('fa-circle-xmark', 'cancelled', 'Cancelados', String(cancelled.length), formatPrice(sum(cancelled))));

  const chartCard = rsEl('div', 'pd-chart');
  chartCard.appendChild(rsEl('div', 'pd-chart__label', 'Ventas de los últimos 7 días'));
  const dailyTotals = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(sevenDaysAgo);
    day.setDate(day.getDate() + i);
    const key = day.toISOString().slice(0, 10);
    const total = ordCache
      .filter((o) => o.payment_status === 'paid' && o.created_at.slice(0, 10) === key)
      .reduce((s, o) => s + o.total_price, 0);
    dailyTotals.push({ day, total });
  }
  chartCard.appendChild(rsLineChart(dailyTotals));
  dash.appendChild(chartCard);

  ['pending_payment', 'shipping', 'completed', 'cancelled'].forEach((tab) => {
    const el = document.getElementById(`pd-tab-count-${tab}`);
    if (!el) return;
    const map = { pending_payment: pendingPayment, shipping, completed, cancelled };
    el.textContent = map[tab].length ? `(${map[tab].length})` : '';
  });
}

function renderPedidosTips() {
  const list = document.getElementById('pedidos-tips');
  if (!list || list.childElementCount) return; // contenido estático: se arma una sola vez
  [
    'Enviá tus pedidos a tiempo: mantené una buena reputación.',
    'Confirmá los pagos por transferencia para liberar tus ventas.',
    'Ofrecé una buena atención a tus compradores.',
  ].forEach((text) => {
    const li = document.createElement('li');
    li.innerHTML = '<i class="fa-solid fa-circle-check"></i> ';
    li.appendChild(document.createTextNode(text));
    list.appendChild(li);
  });
}

/** Aplica pestaña + filtros del menú "Filtros" + búsqueda (N° de pedido, comprador o producto) sobre ordCache y renderiza la tabla. */
function renderPedidos() {
  renderPedidosStats();

  const tbody = document.getElementById('pedidos-tbody');
  const table = document.getElementById('pedidos-table');
  if (!tbody) return;
  tbody.textContent = '';

  if (!ordCache.length) {
    renderPedidosEmptyState('Todavía no tenés pedidos', 'Cuando alguien te compre, vas a verlo acá.');
    return;
  }

  let filtered = ordCache.filter((o) => pedidosTabMatches(o, pedidosTab));
  if (pedidosDeliveryFilter !== 'all') filtered = filtered.filter((o) => o.delivery_method === pedidosDeliveryFilter);

  const term = ordSearch.trim().toLowerCase();
  if (term) {
    filtered = filtered.filter((o) => {
      const idMatch = o.id.split('-')[0].toLowerCase().includes(term);
      const phone = (ordPhoneByClientId.get(o.client_id) || '').toLowerCase();
      const name = (ordNameByClientId.get(o.client_id) || '').toLowerCase();
      const productMatch = (o.order_items || []).some((it) => (it.products?.title || '').toLowerCase().includes(term));
      return idMatch || phone.includes(term) || name.includes(term) || productMatch;
    });
  }

  filtered = sortPedidos(filtered, pedidosSort);

  if (!filtered.length) {
    renderPedidosEmptyState('No hay pedidos que coincidan', 'Probá con otra búsqueda o filtro.');
    return;
  }

  if (table) table.hidden = false;
  const emptyBox = document.getElementById('pedidos-empty');
  if (emptyBox) emptyBox.hidden = true;
  filtered.forEach((o) => tbody.appendChild(buildPedidoRow(o)));
}

/** Navega a "Pedidos" con una pestaña puntual ya seleccionada (usado desde Resumen). */
function goToPedidos(tab) {
  location.hash = 'pedidos';
  setPedidosTab(tab);
}

function setPedidosTab(tab) {
  pedidosTab = tab;
  document.querySelectorAll('#pedidos-tabs .pd-tab').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.tab === tab));
  document.querySelectorAll('.mc-navitem[data-section="pedidos"]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.pedidosTab === tab));
  renderPedidos();
}

/** Wire de los controles de la sección Pedidos (búsqueda, pestañas, menú Filtros, atajos del sidebar). Una sola vez. */
function initPedidosControls() {
  document.getElementById('pedidos-search')?.addEventListener('input', (e) => {
    ordSearch = e.target.value;
    renderPedidos();
  });

  document.querySelectorAll('#pedidos-tabs .pd-tab').forEach((tab) => {
    tab.addEventListener('click', () => setPedidosTab(tab.dataset.tab));
  });

  const filtersBtn = document.getElementById('pedidos-filters-btn');
  const filtersMenu = document.getElementById('pedidos-filters-menu');
  filtersBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = filtersMenu.hidden;
    filtersMenu.hidden = !willOpen;
    filtersBtn.setAttribute('aria-expanded', String(willOpen));
    filtersBtn.classList.toggle('is-active', willOpen);
  });
  document.addEventListener('click', (e) => {
    if (filtersMenu && !filtersMenu.hidden && !filtersMenu.contains(e.target) && e.target !== filtersBtn) {
      filtersMenu.hidden = true;
      filtersBtn?.setAttribute('aria-expanded', 'false');
      filtersBtn?.classList.remove('is-active');
    }
  });
  filtersMenu?.querySelectorAll('input[name="pd-sort"]').forEach((input) => {
    input.addEventListener('change', () => { pedidosSort = input.value; renderPedidos(); });
  });
  filtersMenu?.querySelectorAll('input[name="pd-delivery"]').forEach((input) => {
    input.addEventListener('change', () => { pedidosDeliveryFilter = input.value; renderPedidos(); });
  });

  // Atajos del sidebar hacia una pestaña específica de Pedidos (p. ej. "Ventas completadas").
  document.querySelectorAll('.mc-navitem[data-section="pedidos"]').forEach((item) => {
    item.addEventListener('click', () => setPedidosTab(item.dataset.pedidosTab || 'all'));
  });

  renderPedidosTips();
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
  const acceptsContactInput = document.getElementById('store-accepts-contact');
  const transferInfoInput = document.getElementById('store-transfer-info');

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
  // P1-12: default true si la columna todavía no llegó desde el select (no debería pasar).
  if (acceptsContactInput) acceptsContactInput.checked = store.accepts_contact !== false;

  // A113-299: texto libre (CBU/alias/banco) que ve el cliente al elegir
  // transferencia. Fetch aparte (no en STORE_SELECT_COLUMNS) a propósito: la
  // columna `stores.transfer_info` viene de una migración nueva
  // (66_store_transfer_info.sql) que puede no estar aplicada todavía en
  // algunas bases -- si se pidiera en el select principal, un 400 ahí
  // tumbaría TODO el dashboard del vendedor en vez de dejar este campo vacío.
  if (transferInfoInput) {
    supabase.from('stores').select('transfer_info').eq('id', store.id).single()
      .then(({ data, error }) => {
        if (error) { console.error('Error al cargar los datos de transferencia:', error); return; }
        transferInfoInput.value = data?.transfer_info || '';
      });
  }
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
        accepts_contact: document.getElementById('store-accepts-contact').checked,
      })
      .eq('id', currentStoreId);

    // A113-299: aparte del resto (ver por qué en fillStoreProfileForm) -- si
    // la migración 66 todavía no está aplicada, que falle esto solo y no
    // todo el guardado del perfil.
    const { error: transferError } = await supabase
      .from('stores')
      .update({ transfer_info: document.getElementById('store-transfer-info').value.trim() || null })
      .eq('id', currentStoreId);
    if (transferError) console.error('Error al guardar los datos de transferencia:', transferError);

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

// --- P0-6: vinculación de Mercado Pago (split payments, solo tiendas piloto) ---

/**
 * Si volvemos de la pantalla de autorización de Mercado Pago (?code=&state=),
 * intercambia el code por tokens vía la Edge Function mp-oauth-callback y
 * muta `store.mp_collector_id` en memoria para que el render siguiente ya
 * refleje el vínculo, sin necesitar un segundo fetch a la tienda.
 */
async function handleMpOauthReturn(store) {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code || state !== store.id) return;

  const { data, error } = await supabase.functions.invoke('mp-oauth-callback', {
    body: { code, store_id: store.id },
  });

  // Limpiar el ?code=&state= de la URL para que no se reintente al refrescar.
  window.history.replaceState({}, '', window.location.pathname);

  if (error || !data || data.error) {
    showToast(data?.error || error?.message || 'No se pudo vincular Mercado Pago.', 'error');
    return;
  }

  store.mp_collector_id = data.mp_collector_id;
  showToast('¡Mercado Pago vinculado! Ya podés cobrar directo a tu cuenta.', 'success');
}

function renderMpConnectSection(store) {
  const container = document.getElementById('mp-connect-container');
  if (!container) return;
  container.innerHTML = '';

  if (store.mp_collector_id) {
    const status = document.createElement('p');
    status.style.cssText = 'color: var(--bl-primary); font-weight: 600;';
    status.textContent = '✅ Tu cuenta de Mercado Pago está vinculada. Los pagos con MP de esta tienda van directo a tu cuenta.';
    container.appendChild(status);
    return;
  }

  const status = document.createElement('p');
  status.style.cssText = 'color: var(--bl-text-secondary); font-size: 0.9rem;';
  status.textContent = 'Vinculá tu cuenta de Mercado Pago para poder cobrar directo (piloto). Sin vincular, esta tienda solo puede cobrar por transferencia.';
  container.appendChild(status);

  const connectBtn = document.createElement('button');
  connectBtn.type = 'button';
  connectBtn.className = 'form-btn';
  connectBtn.style.cssText = 'width: auto; padding: 0.75rem 1.5rem;';
  connectBtn.textContent = 'Conectar con Mercado Pago';
  connectBtn.addEventListener('click', () => {
    const redirectUri = `${window.location.origin}/pages/vender.html`;
    const authorizeUrl = `https://auth.mercadopago.com/authorization?client_id=${encodeURIComponent(import.meta.env.VITE_MP_CLIENT_ID)}&response_type=code&platform_id=mp&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(store.id)}`;
    window.location.href = authorizeUrl;
  });
  container.appendChild(connectBtn);
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
    renderCouponsEmpty(container);
    return;
  }

  data.forEach((coupon) => container.appendChild(buildCouponRow(coupon)));
}

function renderCouponsEmpty(container) {
  const box = document.createElement('div');
  box.className = 'pub-empty';
  const icon = document.createElement('i');
  icon.className = 'fa-regular fa-rectangle-list pub-empty__icon';
  box.appendChild(icon);
  const title = document.createElement('p');
  title.className = 'pub-empty__title';
  title.textContent = 'Todavía no creaste ningún cupón';
  box.appendChild(title);
  const sub = document.createElement('p');
  sub.className = 'pub-empty__sub';
  sub.textContent = 'Usá el formulario de arriba para crear el primero.';
  box.appendChild(sub);
  container.appendChild(box);
}

/** Fila estilo ML, mismo patrón que buildPubRow (Publicaciones): kebab con Activar/Desactivar + Borrar. */
function buildCouponRow(coupon) {
  const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();

  const row = document.createElement('div');
  row.className = 'pub-row' + (coupon.is_active && !isExpired ? '' : ' pub-row--paused');

  const icon = document.createElement('div');
  icon.className = 'pub-row__thumb pub-row__thumb--icon';
  const iconEl = document.createElement('i');
  iconEl.className = 'fa-solid fa-ticket';
  icon.appendChild(iconEl);
  row.appendChild(icon);

  const main = document.createElement('div');
  main.className = 'pub-row__main';
  const title = document.createElement('span');
  title.className = 'pub-row__title';
  title.textContent = coupon.code;
  main.appendChild(title);
  const sub = document.createElement('span');
  sub.style.cssText = 'display: block; color: var(--bl-text-secondary); font-size: 0.85rem;';
  sub.textContent = `${coupon.discount_percentage}% de descuento` + (coupon.expires_at ? ` · Vence ${new Date(coupon.expires_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}` : '');
  main.appendChild(sub);
  row.appendChild(main);

  const statusCell = document.createElement('div');
  statusCell.className = 'pub-row__cell';
  const badge = document.createElement('span');
  const statusVariant = isExpired ? 'cancelled' : (coupon.is_active ? 'active' : 'paused');
  const statusLabel = isExpired ? 'Vencido' : (coupon.is_active ? 'Activo' : 'Inactivo');
  badge.className = `pub-status pub-status--${statusVariant}`;
  badge.textContent = statusLabel;
  statusCell.appendChild(badge);
  row.appendChild(statusCell);

  const wrap = document.createElement('div');
  wrap.className = 'pub-actions';
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'pub-actions__toggle';
  toggleBtn.setAttribute('aria-label', 'Acciones del cupón');
  const dots = document.createElement('i');
  dots.className = 'fa-solid fa-ellipsis-vertical';
  toggleBtn.appendChild(dots);
  wrap.appendChild(toggleBtn);

  const menu = document.createElement('div');
  menu.className = 'pub-actions__menu';
  menu.hidden = true;
  menu.appendChild(pubMenuItem(coupon.is_active ? 'Desactivar' : 'Activar', coupon.is_active ? 'fa-eye-slash' : 'fa-eye', async () => {
    closePubMenus();
    const { error: updateError } = await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id);
    if (updateError) {
      showToast('No se pudo actualizar el cupón.', 'error');
      console.error(updateError);
      return;
    }
    renderMyCoupons();
  }));
  menu.appendChild(pubMenuItem('Borrar', 'fa-trash', async () => {
    closePubMenus();
    if (!confirm(`¿Borrar el cupón "${coupon.code}"?`)) return;
    const { error: deleteError } = await supabase.from('coupons').delete().eq('id', coupon.id);
    if (deleteError) {
      showToast('No se pudo borrar el cupón.', 'error');
      console.error(deleteError);
      return;
    }
    showToast('Cupón borrado.', 'success');
    renderMyCoupons();
  }, true));
  wrap.appendChild(menu);

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    closePubMenus();
    menu.hidden = !willOpen;
  });

  row.appendChild(wrap);
  return row;
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

// --- F12-16: empleados del comercio (solo el dueño ve/gestiona esta sección) ---

function renderStaffEmpty(container) {
  const empty = document.createElement('div');
  empty.className = 'pub-empty';
  empty.innerHTML = '<i class="fa-solid fa-users"></i><p>Todavía no agregaste ningún empleado.</p>';
  container.appendChild(empty);
}

function buildStaffRow(s, email) {
  const row = document.createElement('div');
  row.className = 'pub-row';

  const thumb = document.createElement('div');
  thumb.className = 'pub-row__thumb pub-row__thumb--icon';
  thumb.innerHTML = '<i class="fa-solid fa-user"></i>';
  row.appendChild(thumb);

  const main = document.createElement('div');
  main.className = 'pub-row__main';
  const title = document.createElement('p');
  title.className = 'pub-row__title';
  title.textContent = email || 'Cuenta eliminada';
  const sub = document.createElement('p');
  sub.className = 'pub-row__subtitle';
  sub.textContent = `Agregado el ${new Date(s.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}`;
  main.appendChild(title);
  main.appendChild(sub);
  row.appendChild(main);

  // Única acción disponible: se muestra como botón visible, no kebab (mismo criterio que Pagos por confirmar).
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-outline';
  removeBtn.style.cssText = 'border-color: #ef4444; color: #ef4444; padding: 0.5rem 1rem; white-space: nowrap;';
  removeBtn.textContent = 'Quitar acceso';
  removeBtn.addEventListener('click', async () => {
    if (!confirm(`¿Quitarle el acceso a este panel a "${title.textContent}"?`)) return;
    const { error: deleteError } = await supabase.from('store_staff').delete().eq('id', s.id);
    if (deleteError) {
      showToast('No se pudo quitar el acceso.', 'error');
      console.error(deleteError);
      return;
    }
    showToast('Acceso quitado.', 'success');
    renderStoreStaff();
  });
  row.appendChild(removeBtn);

  return row;
}

async function renderStoreStaff() {
  const container = document.getElementById('store-staff-container');
  if (!container || !currentStoreId) return;
  container.textContent = '';

  const { data: staff, error } = await supabase
    .from('store_staff')
    .select('id, user_id, created_at')
    .eq('store_id', currentStoreId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al cargar empleados:', error);
    const errorMsg = document.createElement('p');
    errorMsg.style.color = 'var(--bl-text-secondary)';
    errorMsg.textContent = 'Error al cargar la lista de empleados.';
    container.appendChild(errorMsg);
    return;
  }

  if (!staff || staff.length === 0) {
    renderStaffEmpty(container);
    return;
  }

  // store_staff.user_id referencia auth.users, no profiles -> segunda consulta
  // por los emails (mismo patrón que phoneByClientId en repartidor.js, F12-05).
  const userIds = staff.map((s) => s.user_id);
  const { data: profiles } = await supabase.from('profiles').select('id, email').in('id', userIds);
  const emailByUserId = new Map((profiles || []).map((p) => [p.id, p.email]));

  staff.forEach((s) => container.appendChild(buildStaffRow(s, emailByUserId.get(s.user_id))));
}

function setupStoreStaffForm() {
  const form = document.getElementById('store-staff-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('store-staff-email');
    const email = emailInput.value.trim();
    if (!email) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    setLoading(submitBtn, true, 'Agregar');

    const { error } = await supabase.rpc('add_store_staff', { p_store_id: currentStoreId, p_email: email });

    if (error) {
      showToast(error.message || 'No se pudo agregar al empleado.', 'error');
      console.error(error);
    } else {
      showToast('Empleado agregado — ya puede entrar a este panel.', 'success');
      form.reset();
      renderStoreStaff();
    }
    setLoading(submitBtn, false, 'Agregar');
  });
}

/**
 * Sección "Resumen" (rediseño ML con paleta propia): saludo + fila de 4 stats
 * (reputación / ventas brutas 7d / dinero disponible / ventas totales 30d) +
 * card "Impulsá tus ventas" + pendientes (publicaciones/ventas) + Novedades +
 * "¿Necesitás ayuda?" + Métricas de negocio (línea 7d + torta por categoría
 * 30d). Datos reales -- vacíos hasta que haya reseñas/ventas/mensajes.
 * Reemplaza loadDashboardStats + el insights provisional (F12-13).
 */
function rsEl(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function rsReputationLabel(avgRating, reviewCount) {
  if (!reviewCount) return 'Sin calificar';
  if (avgRating >= 4.5) return 'Excelente';
  if (avgRating >= 4) return 'Muy buena';
  if (avgRating >= 3) return 'Buena';
  if (avgRating >= 2) return 'Regular';
  return 'Mala';
}

function rsStatCard({ area, icon, iconVariant, title, value, sub, delta, action }) {
  const card = rsEl('div', 'rs-card rs-stat');
  card.style.gridArea = area;

  const top = rsEl('div', 'rs-stat__top');
  const iconEl = rsEl('div', `rs-stat__icon rs-stat__icon--${iconVariant}`);
  iconEl.innerHTML = `<i class="fa-solid ${icon}"></i>`;
  top.appendChild(iconEl);
  top.appendChild(rsEl('div', 'rs-stat__title', title));
  card.appendChild(top);

  card.appendChild(rsEl('div', 'rs-stat__value', value));
  if (sub) card.appendChild(rsEl('div', 'rs-stat__sub', sub));

  if (delta) {
    const deltaEl = rsEl('div', 'rs-stat__delta' + (delta.positive === false ? ' rs-stat__delta--down' : ''));
    deltaEl.innerHTML = `<i class="fa-solid fa-arrow-${delta.positive === false ? 'down' : 'up'}"></i> `;
    deltaEl.appendChild(document.createTextNode(delta.text));
    card.appendChild(deltaEl);
  }

  if (action) {
    let control;
    if (action.href) {
      control = document.createElement('a');
      control.href = action.href;
    } else {
      control = document.createElement('button');
      control.type = 'button';
      control.addEventListener('click', action.onClick);
    }
    control.className = 'rs-link';
    control.appendChild(document.createTextNode(action.label + ' '));
    control.appendChild(rsEl('i', 'fa-solid fa-chevron-right'));
    card.appendChild(control);
  }

  return card;
}

function rsPendingCard(title, icon, area, rows, footer) {
  const card = rsEl('div', 'rs-card rs-pend');
  card.style.gridArea = area;
  const titleEl = rsEl('div', 'rs-card__title');
  titleEl.innerHTML = `<i class="fa-solid ${icon}"></i> `;
  titleEl.appendChild(document.createTextNode(title));
  card.appendChild(titleEl);

  rows.forEach((r) => {
    const row = rsEl('div', 'rs-pending-row');
    row.addEventListener('click', () => {
      if (r.href) window.location.href = r.href;
      else if (r.section === 'pedidos') goToPedidos(r.tab || 'all');
      else location.hash = r.section;
    });
    row.appendChild(rsEl('span', 'rs-pending-row__label', r.label));
    const right = rsEl('span', 'rs-pending-row__right');
    right.appendChild(rsEl('span', 'rs-badge' + (r.alert ? ' rs-badge--alert' : ''), String(r.count)));
    right.appendChild(rsEl('i', 'fa-solid fa-chevron-right'));
    row.appendChild(right);
    card.appendChild(row);
  });

  if (footer) {
    const link = rsEl('button', 'rs-link', footer.label + ' ›');
    link.type = 'button';
    link.addEventListener('click', () => { location.hash = footer.section; });
    card.appendChild(link);
  }
  return card;
}

function rsPromoCard() {
  const card = rsEl('div', 'rs-promo');

  const nextBtn = rsEl('button', 'rs-promo__next');
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Ver más promociones');
  nextBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
  nextBtn.addEventListener('click', () => showToast('Por ahora tenés una sola promoción disponible.', 'success'));
  card.appendChild(nextBtn);

  const icon = rsEl('div', 'rs-promo__icon');
  icon.innerHTML = '<i class="fa-solid fa-store"></i>';
  card.appendChild(icon);

  card.appendChild(rsEl('div', 'rs-promo__title', 'Impulsá tus ventas'));
  card.appendChild(rsEl('div', 'rs-promo__text', 'Destacá tus publicaciones y llegá a más compradores en Baradero.'));
  const btn = rsEl('button', 'rs-promo__btn', 'Promocionar mis publicaciones');
  btn.type = 'button';
  btn.addEventListener('click', () => showToast('Muy pronto vas a poder promocionar tus publicaciones desde acá.', 'success'));
  card.appendChild(btn);

  return card;
}

function rsNoveltyCard() {
  const card = rsEl('div', 'rs-card');
  const title = rsEl('div', 'rs-card__title');
  title.innerHTML = '<i class="fa-solid fa-bell"></i> ';
  title.appendChild(document.createTextNode('Novedades'));
  card.appendChild(title);
  card.appendChild(rsEl('div', 'rs-empty', 'Aún no tenés novedades. Acá vas a ver los comunicados del equipo cuando estén disponibles.'));
  return card;
}

function rsHelpCard() {
  const card = rsEl('div', 'rs-card');
  const title = rsEl('div', 'rs-card__title');
  title.innerHTML = '<i class="fa-solid fa-headset"></i> ';
  title.appendChild(document.createTextNode('¿Necesitás ayuda?'));
  card.appendChild(title);
  card.appendChild(rsEl('div', 'rs-empty', 'Nuestro equipo está para ayudarte.'));

  const rows = [
    { title: 'Chat en vivo', sub: 'Muy pronto', onClick: () => showToast('El chat en vivo va a estar disponible próximamente. Mientras tanto, podés escribirnos por correo o dejarnos un reclamo en Soporte.', 'success') },
    { title: 'Centro de ayuda', sub: 'Preguntas frecuentes', href: './info.html' },
    { title: 'Soporte por correo', sub: 'soporte@baraderolocal.com.ar', href: 'mailto:soporte@baraderolocal.com.ar' },
  ];
  rows.forEach((r) => {
    const row = rsEl('div', 'rs-help-row');
    if (r.href) {
      row.addEventListener('click', () => { window.location.href = r.href; });
    } else {
      row.addEventListener('click', r.onClick);
    }
    const left = rsEl('div');
    left.appendChild(rsEl('div', 'rs-help-row__title', r.title));
    left.appendChild(rsEl('div', 'rs-help-row__sub', r.sub));
    row.appendChild(left);
    row.appendChild(rsEl('i', 'fa-solid fa-chevron-right'));
    card.appendChild(row);
  });
  return card;
}

/** Línea de ventas brutas de los últimos 7 días (SVG, sin librería). */
function rsLineChart(dailyTotals) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const W = 480, H = 160, padL = 46, padR = 8, padT = 10, padB = 22;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const maxTotal = Math.max(1, ...dailyTotals.map((d) => d.total));
  const n = dailyTotals.length;
  const stepX = n > 1 ? chartW / (n - 1) : 0;
  const points = dailyTotals.map((d, i) => ({
    x: padL + stepX * i,
    y: padT + chartH - (d.total / maxTotal) * chartH,
    d,
  }));

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'rs-line');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  [0, 0.5, 1].forEach((frac) => {
    const y = padT + chartH * (1 - frac);
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('class', 'rs-line__grid');
    line.setAttribute('x1', String(padL));
    line.setAttribute('x2', String(W - padR));
    line.setAttribute('y1', y.toFixed(1));
    line.setAttribute('y2', y.toFixed(1));
    svg.appendChild(line);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('class', 'rs-line__axis');
    label.setAttribute('x', '2');
    label.setAttribute('y', (y + 3).toFixed(1));
    label.textContent = formatPrice(Math.round(maxTotal * frac));
    svg.appendChild(label);
  });

  points.forEach((p) => {
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('class', 'rs-line__axis');
    label.setAttribute('x', p.x.toFixed(1));
    label.setAttribute('y', String(H - 4));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = p.d.day.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    svg.appendChild(label);
  });

  const baseline = (padT + chartH).toFixed(1);
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${points[points.length - 1].x.toFixed(1)},${baseline} L${points[0].x.toFixed(1)},${baseline} Z`;

  const area = document.createElementNS(svgNS, 'path');
  area.setAttribute('class', 'rs-line__area');
  area.setAttribute('d', areaD);
  svg.appendChild(area);

  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('class', 'rs-line__path');
  path.setAttribute('d', pathD);
  svg.appendChild(path);

  points.forEach((p) => {
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('class', 'rs-line__dot');
    dot.setAttribute('cx', p.x.toFixed(1));
    dot.setAttribute('cy', p.y.toFixed(1));
    dot.setAttribute('r', '3');
    svg.appendChild(dot);
  });

  return svg;
}

function rsMetricsCard(dailyTotals, sales7d, pctChange, catItems30d) {
  const card = rsEl('div', 'rs-card');
  const title = rsEl('div', 'rs-card__title');
  title.innerHTML = '<i class="fa-solid fa-chart-line"></i> ';
  title.appendChild(document.createTextNode('Métricas de negocio'));
  card.appendChild(title);

  const metrics = rsEl('div', 'rs-metrics');

  // Columna izquierda: ventas brutas de los últimos 7 días (línea)
  const left = rsEl('div');
  left.appendChild(rsEl('div', 'rs-metrics__label', 'Ventas brutas de los últimos 7 días'));
  left.appendChild(rsEl('div', 'rs-metrics__figure', formatPrice(sales7d)));
  if (pctChange !== null) {
    const delta = rsEl('div', 'rs-stat__delta' + (pctChange < 0 ? ' rs-stat__delta--down' : ''));
    delta.innerHTML = `<i class="fa-solid fa-arrow-${pctChange < 0 ? 'down' : 'up'}"></i> `;
    delta.appendChild(document.createTextNode(`${Math.abs(pctChange)}% vs. semana anterior`));
    left.appendChild(delta);
  }
  left.appendChild(rsLineChart(dailyTotals));
  metrics.appendChild(left);

  // Columna derecha: torta por categoría (últimos 30 días)
  const right = rsEl('div');
  right.appendChild(rsEl('div', 'rs-metrics__label', 'Ventas por categoría (últimos 30 días)'));

  const byCat = new Map();
  catItems30d.forEach((it) => {
    const name = it.products?.categories?.name || 'Otros';
    byCat.set(name, (byCat.get(name) || 0) + it.quantity * it.price);
  });
  const entries = [...byCat.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    right.appendChild(rsEl('div', 'rs-empty', 'Todavía no hay ventas en los últimos 30 días para mostrar el desglose por categoría.'));
  } else {
    const total = entries.reduce((s, [, v]) => s + v, 0);
    const palette = ['#0e7490', '#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#64748b'];
    const top = entries.slice(0, 6);
    const restVal = entries.slice(6).reduce((s, [, v]) => s + v, 0);
    const slices = restVal > 0 ? [...top, ['Otras', restVal]] : top;

    let acc = 0;
    const stops = slices.map(([, v], i) => {
      const start = (acc / total) * 360;
      acc += v;
      const end = (acc / total) * 360;
      return `${palette[i % palette.length]} ${start}deg ${end}deg`;
    });

    const pieWrap = rsEl('div', 'rs-pie');
    const chartWrap = rsEl('div', 'rs-pie__chart-wrap');
    const chart = rsEl('div', 'rs-pie__chart');
    chart.style.background = `conic-gradient(${stops.join(', ')})`;
    chartWrap.appendChild(chart);
    chartWrap.appendChild(rsEl('div', 'rs-pie__hole'));
    pieWrap.appendChild(chartWrap);

    const legend = rsEl('div', 'rs-pie__legend');
    slices.forEach(([name, v], i) => {
      const item = rsEl('div', 'rs-pie__item');
      const dot = rsEl('span', 'rs-pie__dot');
      dot.style.background = palette[i % palette.length];
      item.appendChild(dot);
      item.appendChild(rsEl('span', 'rs-pie__name', name));
      item.appendChild(rsEl('span', 'rs-pie__pct', `${Math.round((v / total) * 100)}%`));
      item.appendChild(rsEl('span', 'rs-pie__amount', formatPrice(v)));
      legend.appendChild(item);
    });
    pieWrap.appendChild(legend);
    right.appendChild(pieWrap);
  }
  metrics.appendChild(right);

  card.appendChild(metrics);
  return card;
}

async function renderResumen() {
  const dash = document.getElementById('resumen-dash');
  const grid2 = document.getElementById('resumen-grid2');
  const metricsContainer = document.getElementById('resumen-metrics');
  if (!dash || !grid2 || !metricsContainer || !currentStoreId) return;

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const prevSevenDaysAgo = new Date(sevenDaysAgo);
  prevSevenDaysAgo.setDate(prevSevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const [rev, ord, cat, pay, msg] = await Promise.all([
    supabase.from('reviews').select('rating, client_id').eq('target_type', 'store').eq('target_id', currentStoreId).eq('is_hidden', false),
    supabase.from('orders').select('total_price, created_at, delivery_method, status, client_id').eq('store_id', currentStoreId).eq('payment_status', 'paid'),
    supabase.from('order_items').select('quantity, price, products(categories(name)), orders!inner(store_id, payment_status, created_at)').eq('orders.store_id', currentStoreId).eq('orders.payment_status', 'paid'),
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('store_id', currentStoreId).eq('payment_method', 'transferencia').eq('payment_status', 'pending'),
    supabase.from('messages').select('conversation_id, sender_id, created_at, conversations!inner(store_id)').eq('conversations.store_id', currentStoreId).order('created_at', { ascending: false }),
  ]);

  const reviews = rev.data || [];
  const paidOrders = ord.data || [];
  const catItems = cat.data || [];
  const pendingPayCount = pay.count || 0;
  const messages = msg.data || [];

  // Preguntas sin responder: última respuesta de cada conversación no fue mía.
  const lastSenderByConv = new Map();
  messages.forEach((m) => { if (!lastSenderByConv.has(m.conversation_id)) lastSenderByConv.set(m.conversation_id, m.sender_id); });
  const questionCount = [...lastSenderByConv.values()].filter((senderId) => senderId !== currentUserId).length;

  const reviewCount = reviews.length;
  const avgRating = reviewCount ? reviews.reduce((s, r) => s + r.rating, 0) / reviewCount : 0;
  const reviewedClientIds = new Set(reviews.map((r) => r.client_id).filter(Boolean));
  const salesToRate = paidOrders.filter((o) => o.status === 'completed' && o.client_id && !reviewedClientIds.has(o.client_id)).length;

  const sales7d = paidOrders.filter((o) => new Date(o.created_at) >= sevenDaysAgo).reduce((s, o) => s + o.total_price, 0);
  const salesPrev7d = paidOrders
    .filter((o) => { const d = new Date(o.created_at); return d >= prevSevenDaysAgo && d < sevenDaysAgo; })
    .reduce((s, o) => s + o.total_price, 0);
  const pctChange = salesPrev7d > 0 ? Math.round(((sales7d - salesPrev7d) / salesPrev7d) * 100) : null;

  const incomeTotal = paidOrders.reduce((s, o) => s + o.total_price, 0);
  const orders30dCount = paidOrders.filter((o) => new Date(o.created_at) >= thirtyDaysAgo).length;
  const shipmentsInProgress = paidOrders.filter((o) => o.delivery_method === 'delivery' && (o.status === 'paid' || o.status === 'shipped')).length;

  const dailyTotals = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(sevenDaysAgo);
    day.setDate(day.getDate() + i);
    const key = day.toISOString().slice(0, 10);
    const total = paidOrders.filter((o) => o.created_at.slice(0, 10) === key).reduce((s, o) => s + o.total_price, 0);
    dailyTotals.push({ day, total });
  }
  const catItems30d = catItems.filter((it) => it.orders?.created_at && new Date(it.orders.created_at) >= thirtyDaysAgo);

  // Fila superior: 4 stats + "Impulsá tus ventas"
  dash.textContent = '';
  dash.appendChild(rsStatCard({
    area: 's1', icon: 'fa-star', iconVariant: 'rep', title: 'Reputación',
    value: rsReputationLabel(avgRating, reviewCount),
    sub: reviewCount ? `${avgRating.toFixed(1)} / 5 ★ · ${reviewCount} reseña${reviewCount === 1 ? '' : 's'}` : 'Sumá tus primeras reseñas',
    action: { label: 'Ver detalle', href: `./comercio.html?id=${currentStoreId}#store-reviews` },
  }));
  dash.appendChild(rsStatCard({
    area: 's2', icon: 'fa-sack-dollar', iconVariant: 'sales', title: 'Ventas brutas',
    value: formatPrice(sales7d), sub: 'Últimos 7 días',
    delta: pctChange !== null ? { text: `${Math.abs(pctChange)}% vs. semana anterior`, positive: pctChange >= 0 } : null,
  }));
  dash.appendChild(rsStatCard({
    area: 's3', icon: 'fa-wallet', iconVariant: 'money', title: 'Dinero disponible',
    value: formatPrice(incomeTotal), sub: 'Para retirar',
    action: { label: 'Retirar dinero', onClick: () => showToast('Muy pronto vas a poder retirar tu dinero desde acá.', 'success') },
  }));
  dash.appendChild(rsStatCard({
    area: 's4', icon: 'fa-cart-shopping', iconVariant: 'orders', title: 'Ventas totales',
    value: String(orders30dCount), sub: 'Últimos 30 días',
    action: { label: 'Ver detalle', onClick: () => goToPedidos('all') },
  }));
  dash.appendChild(rsPromoCard());

  dash.appendChild(rsPendingCard('Pendientes en tus publicaciones', 'fa-clipboard-list', 'p1', [
    { label: 'Publicaciones activas', count: currentActiveProductCount, section: 'publicaciones' },
    { label: 'Preguntas sin responder', count: questionCount, href: './mensajes.html', alert: questionCount > 0 },
  ], { label: 'Ir a publicaciones', section: 'publicaciones' }));

  dash.appendChild(rsPendingCard('Pendientes en tus ventas', 'fa-truck-fast', 'p2', [
    { label: 'Envíos en curso', count: shipmentsInProgress, section: 'envios' },
    { label: 'Pagos por confirmar', count: pendingPayCount, section: 'pagos', alert: pendingPayCount > 0 },
    { label: 'Ventas para calificar', count: salesToRate, section: 'pedidos', tab: 'completed' },
  ], { label: 'Ir a pedidos', section: 'pedidos' }));

  // Novedades / ¿Necesitás ayuda?
  grid2.textContent = '';
  grid2.appendChild(rsNoveltyCard());
  grid2.appendChild(rsHelpCard());

  // Métricas de negocio
  metricsContainer.textContent = '';
  metricsContainer.appendChild(rsMetricsCard(dailyTotals, sales7d, pctChange, catItems30d));
}

// (El insights provisional F12-13 se reemplazó por renderResumen, arriba.)

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
    renderPendingPaymentsEmpty(container);
    return;
  }

  withPendingProof.forEach(({ order, proof }) => {
    container.appendChild(buildPendingPaymentRow(order, proof));
  });
}

function renderPendingPaymentsEmpty(container) {
  const box = document.createElement('div');
  box.className = 'pub-empty';
  const icon = document.createElement('i');
  icon.className = 'fa-regular fa-rectangle-list pub-empty__icon';
  box.appendChild(icon);
  const title = document.createElement('p');
  title.className = 'pub-empty__title';
  title.textContent = 'No hay comprobantes pendientes';
  box.appendChild(title);
  const sub = document.createElement('p');
  sub.className = 'pub-empty__sub';
  sub.textContent = 'Los comprobantes de transferencia que suban tus clientes van a aparecer acá.';
  box.appendChild(sub);
  container.appendChild(box);
}

/** Fila estilo ML (clases pub-*), pero con Confirmar/Rechazar/Ver siempre visibles -- son
 * acciones primarias acá, no tiene sentido esconderlas detrás de un menú ⋮ como en Ventas/Publicaciones. */
function buildPendingPaymentRow(order, proof) {
  const row = document.createElement('div');
  row.className = 'pub-row';

  const icon = document.createElement('div');
  icon.className = 'pub-row__thumb pub-row__thumb--icon';
  const iconEl = document.createElement('i');
  iconEl.className = 'fa-solid fa-receipt';
  icon.appendChild(iconEl);
  row.appendChild(icon);

  const main = document.createElement('div');
  main.className = 'pub-row__main';
  const title = document.createElement('span');
  title.className = 'pub-row__title';
  title.textContent = `Orden #${order.id.split('-')[0].toUpperCase()}`;
  main.appendChild(title);
  const sub = document.createElement('span');
  sub.style.cssText = 'display: block; color: var(--bl-text-secondary); font-size: 0.85rem;';
  const proofDate = new Date(proof.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
  sub.textContent = `${formatPrice(order.total_price)} · Comprobante subido el ${proofDate}`;
  main.appendChild(sub);
  row.appendChild(main);

  const actions = document.createElement('div');
  actions.style.cssText = 'display: flex; gap: 0.5rem; flex-shrink: 0;';

  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.className = 'btn-outline';
  viewBtn.style.cssText = 'padding: 0.5rem 0.9rem;';
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
  approveBtn.textContent = 'Confirmar';
  approveBtn.addEventListener('click', () => handlePaymentDecision(proof.id, true));
  actions.appendChild(approveBtn);

  const rejectBtn = document.createElement('button');
  rejectBtn.type = 'button';
  rejectBtn.className = 'btn-outline';
  rejectBtn.style.cssText = 'padding: 0.5rem 0.9rem; border-color: #ef4444; color: #ef4444;';
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

// Mismas 3 variantes de color que ya usa Ventas (pub-status--*) -- coinciden
// bien semánticamente: esperando/asignado en tonos de "todavía no salió",
// en camino = shipped (azul), entregado = active (verde).
const SHIPMENT_STATUS_BADGE_VARIANT = {
  assigned: 'ready',
  picked_up: 'shipped',
  delivered: 'active',
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
    renderShipmentsEmpty(container);
    return;
  }

  orders.forEach((order) => container.appendChild(buildShipmentRow(order)));
}

function renderShipmentsEmpty(container) {
  const box = document.createElement('div');
  box.className = 'pub-empty';
  const icon = document.createElement('i');
  icon.className = 'fa-regular fa-rectangle-list pub-empty__icon';
  box.appendChild(icon);
  const title = document.createElement('p');
  title.className = 'pub-empty__title';
  title.textContent = 'No hay envíos en curso';
  box.appendChild(title);
  const sub = document.createElement('p');
  sub.className = 'pub-empty__sub';
  sub.textContent = 'Los pedidos con envío pagados van a aparecer acá hasta que se entreguen.';
  box.appendChild(sub);
  container.appendChild(box);
}

/** Fila estilo ML (clases pub-*), solo lectura -- el repartidor gestiona el estado desde
 * su propio panel (F3-03), acá el vendedor solo hace seguimiento, sin acciones. */
function buildShipmentRow(order) {
  const row = document.createElement('div');
  row.className = 'pub-row';

  const icon = document.createElement('div');
  icon.className = 'pub-row__thumb pub-row__thumb--icon';
  const iconEl = document.createElement('i');
  iconEl.className = 'fa-solid fa-truck';
  icon.appendChild(iconEl);
  row.appendChild(icon);

  const main = document.createElement('div');
  main.className = 'pub-row__main';
  const title = document.createElement('span');
  title.className = 'pub-row__title';
  title.textContent = `Orden #${order.id.split('-')[0].toUpperCase()}`;
  main.appendChild(title);
  const sub = document.createElement('span');
  sub.style.cssText = 'display: block; color: var(--bl-text-secondary); font-size: 0.85rem;';
  sub.textContent = `${formatPrice(order.total_price)} · ${order.shipping_address || 'Sin dirección cargada'}`;
  main.appendChild(sub);
  row.appendChild(main);

  const statusCell = document.createElement('div');
  statusCell.className = 'pub-row__cell';
  const badge = document.createElement('span');
  // deliveries.order_id es UNIQUE -> PostgREST lo embebe como objeto único.
  const deliveryStatus = order.deliveries?.status;
  const variant = deliveryStatus ? (SHIPMENT_STATUS_BADGE_VARIANT[deliveryStatus] || 'paused') : 'pending';
  badge.className = `pub-status pub-status--${variant}`;
  badge.textContent = deliveryStatus ? (SHIPMENT_STATUS_LABELS[deliveryStatus] || deliveryStatus) : 'Esperando repartidor';
  statusCell.appendChild(badge);
  row.appendChild(statusCell);

  return row;
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

  // F12-16: el checklist apunta a acciones exclusivas del dueño (perfil,
  // publicar producto) -- un empleado no las puede hacer, no tiene sentido mostrárselo.
  if (!isStoreOwner || (currentStoreHasProfile && hasProducts)) {
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

  // Resumen: "Productos Activos" -- solo los is_active (para la card de pendientes).
  currentActiveProductCount = products.filter((p) => p.is_active).length;
  const statProducts = document.getElementById('stat-products-count');
  if (statProducts) statProducts.textContent = currentActiveProductCount;

  // F12-15: onboarding -- cuenta cualquier producto (activo o no), "publicar el
  // primer producto" ya está cumplido aunque después lo haya desactivado.
  currentProductCount = products.length;
  renderOnboardingChecklist(currentProductCount > 0);

  // Cache para el filtrado client-side + conteo de ventas por producto (ML).
  pubProducts = products;
  await loadSalesByProduct();
  renderPublicaciones();
}

/**
 * Ventas por producto: unidades vendidas en órdenes pagadas de la tienda.
 * Mismo patrón de embed `orders!inner(...)` que renderResumen() -- una sola
 * consulta, agrupada en memoria por product_id.
 */
async function loadSalesByProduct() {
  pubSalesByProduct = new Map();
  if (!currentStoreId) return;

  const { data, error } = await supabase
    .from('order_items')
    .select('product_id, quantity, orders!inner(store_id, payment_status)')
    .eq('orders.store_id', currentStoreId)
    .eq('orders.payment_status', 'paid');

  if (error) {
    console.error('Error al cargar ventas por producto:', error);
    return;
  }

  (data || []).forEach((it) => {
    if (!it.product_id) return;
    pubSalesByProduct.set(it.product_id, (pubSalesByProduct.get(it.product_id) || 0) + (it.quantity || 0));
  });
}

/** Cierra cualquier menú de acciones (⋮) de fila que esté abierto. */
function closePubMenus() {
  document.querySelectorAll('.pub-actions__menu').forEach((m) => { m.hidden = true; });
}

function pubCellLabel(text) {
  const label = document.createElement('span');
  label.className = 'pub-row__cell-label';
  label.textContent = text;
  return label;
}

function pubMenuItem(text, iconClass, onClick, danger) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pub-actions__item' + (danger ? ' pub-actions__item--danger' : '');
  const icon = document.createElement('i');
  icon.className = `fa-solid ${iconClass}`;
  btn.appendChild(icon);
  btn.append(` ${text}`);
  btn.addEventListener('click', onClick);
  return btn;
}

function buildPubActions(p) {
  const wrap = document.createElement('div');
  wrap.className = 'pub-actions';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'pub-actions__toggle';
  toggleBtn.setAttribute('aria-label', 'Acciones de la publicación');
  const dots = document.createElement('i');
  dots.className = 'fa-solid fa-ellipsis-vertical';
  toggleBtn.appendChild(dots);
  wrap.appendChild(toggleBtn);

  const menu = document.createElement('div');
  menu.className = 'pub-actions__menu';
  menu.hidden = true;

  // Editar -- reusa el flujo de edición existente (F5-02).
  menu.appendChild(pubMenuItem('Editar', 'fa-pen', () => {
    closePubMenus();
    openEditProductForm(p.id);
  }));

  // Pausar / Reactivar -- togglea is_active (misma lógica de siempre).
  menu.appendChild(pubMenuItem(p.is_active ? 'Pausar' : 'Reactivar', p.is_active ? 'fa-eye-slash' : 'fa-eye', async () => {
    closePubMenus();
    const { error } = await supabase.from('products').update({ is_active: !p.is_active }).eq('id', p.id);
    if (error) {
      showToast('No se pudo actualizar el producto.', 'error');
      console.error(error);
      return;
    }
    showToast(p.is_active ? 'Publicación pausada' : 'Publicación activada', 'success');
    fetchProducts();
  }));

  // Ver publicación -- link a la página de detalle pública.
  const view = document.createElement('a');
  view.className = 'pub-actions__item';
  view.href = `producto.html?id=${p.id}`;
  const viewIcon = document.createElement('i');
  viewIcon.className = 'fa-solid fa-arrow-up-right-from-square';
  view.appendChild(viewIcon);
  view.append(' Ver publicación');
  menu.appendChild(view);

  // Eliminar (misma confirmación/advertencia que antes).
  menu.appendChild(pubMenuItem('Eliminar', 'fa-trash', async () => {
    closePubMenus();
    if (!confirm('¿Eliminar producto? (Atención: esto fallará si el producto ya fue comprado por alguien, requiere lógica avanzada en un entorno real)')) return;

    // Las URLs se leen ANTES de borrar: al irse el producto, product_images se
    // va en cascada y ya no habría forma de saber qué archivos quedaron sueltos.
    const { data: imgRows } = await supabase
      .from('product_images')
      .select('url')
      .eq('product_id', p.id);
    const imageUrls = [p.image_url, ...(imgRows || []).map((r) => r.url)];

    const { error } = await supabase.from('products').delete().eq('id', p.id);
    if (error) {
      showToast('No se pudo eliminar el producto.', 'error');
      console.error(error);
      return;
    }
    await removeStoredObjects(supabase, 'products', imageUrls);
    fetchProducts();
  }, true));

  wrap.appendChild(menu);

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    closePubMenus();
    menu.hidden = !willOpen;
  });

  return wrap;
}

/** Fila de publicación estilo ML: miniatura + título/precio + stock + ventas + estado + acciones. */
function buildPubRow(p) {
  const row = document.createElement('div');
  row.className = 'pub-row' + (p.is_active ? '' : ' pub-row--paused');

  const thumb = document.createElement('img');
  thumb.className = 'pub-row__thumb';
  thumb.src = p.image_url || '/img/no-image.svg';
  thumb.alt = p.title || 'Producto';
  thumb.loading = 'lazy';
  row.appendChild(thumb);

  const main = document.createElement('div');
  main.className = 'pub-row__main';
  const title = document.createElement('a');
  title.className = 'pub-row__title';
  title.href = `producto.html?id=${p.id}`;
  title.textContent = p.title;
  main.appendChild(title);
  // buildPriceRow (F5-05): precio tachado + badge -N% respetando offer_expires_at vencido.
  main.appendChild(buildPriceRow(p));
  row.appendChild(main);

  const stockCell = document.createElement('div');
  stockCell.className = 'pub-row__cell';
  stockCell.appendChild(pubCellLabel('Stock'));
  const stockVal = document.createElement('span');
  stockVal.className = 'pub-row__cell-val' + ((p.stock ?? 0) <= 0 ? ' pub-row__cell-val--zero' : '');
  stockVal.textContent = p.stock ?? 0;
  stockCell.appendChild(stockVal);
  row.appendChild(stockCell);

  const salesCell = document.createElement('div');
  salesCell.className = 'pub-row__cell';
  salesCell.appendChild(pubCellLabel('Ventas'));
  const salesVal = document.createElement('span');
  salesVal.className = 'pub-row__cell-val';
  salesVal.textContent = pubSalesByProduct.get(p.id) || 0;
  salesCell.appendChild(salesVal);
  row.appendChild(salesCell);

  const statusCell = document.createElement('div');
  statusCell.className = 'pub-row__cell';
  const badge = document.createElement('span');
  badge.className = 'pub-status ' + (p.is_active ? 'pub-status--active' : 'pub-status--paused');
  badge.textContent = p.is_active ? 'Activa' : 'Pausada';
  statusCell.appendChild(badge);
  row.appendChild(statusCell);

  row.appendChild(buildPubActions(p));
  return row;
}

function renderPubEmpty(list) {
  const box = document.createElement('div');
  box.className = 'pub-empty';
  const icon = document.createElement('i');
  icon.className = 'fa-regular fa-rectangle-list pub-empty__icon';
  box.appendChild(icon);
  const title = document.createElement('p');
  title.className = 'pub-empty__title';
  title.textContent = 'Todavía no tenés publicaciones';
  box.appendChild(title);
  const sub = document.createElement('p');
  sub.className = 'pub-empty__sub';
  sub.textContent = 'Publicá tu primer producto para empezar a vender.';
  box.appendChild(sub);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pub-empty__btn';
  btn.textContent = 'Publicar ahora';
  btn.addEventListener('click', () => document.getElementById('btn-show-add-product')?.click());
  box.appendChild(btn);
  list.appendChild(box);
}

/** Aplica los filtros client-side (búsqueda + estado) sobre pubProducts y renderiza. */
function renderPublicaciones() {
  const list = document.getElementById('pub-list');
  if (!list) return;
  list.textContent = '';

  const countEl = document.getElementById('pub-count');

  if (!pubProducts.length) {
    if (countEl) countEl.textContent = '0 publicaciones';
    renderPubEmpty(list);
    return;
  }

  const term = pubSearch.trim().toLowerCase();
  const filtered = pubProducts.filter((p) => {
    if (pubStatus === 'active' && !p.is_active) return false;
    if (pubStatus === 'inactive' && p.is_active) return false;
    if (term && !(p.title || '').toLowerCase().includes(term)) return false;
    return true;
  });

  if (countEl) {
    countEl.textContent = `${filtered.length} ${filtered.length === 1 ? 'publicación' : 'publicaciones'}`;
  }

  if (!filtered.length) {
    const note = document.createElement('p');
    note.className = 'pub-nomatch';
    note.textContent = 'No hay publicaciones que coincidan con el filtro.';
    list.appendChild(note);
    return;
  }

  filtered.forEach((p) => list.appendChild(buildPubRow(p)));
}

/** Wire de los controles de la sección Publicaciones (menú Publicar, búsqueda, chips). Una sola vez. */
function initPublicacionesControls() {
  const menuBtn = document.getElementById('btn-publish-menu');
  const menu = document.getElementById('pub-publish-menu');
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.hidden;
      menu.hidden = !willOpen;
      menuBtn.setAttribute('aria-expanded', String(willOpen));
    });
    menu.querySelectorAll('button, a').forEach((el) => el.addEventListener('click', () => {
      menu.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
    }));
    document.addEventListener('click', () => {
      if (!menu.hidden) {
        menu.hidden = true;
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // "Masivamente": stub (la fuente por código de barras todavía no está definida).
  document.getElementById('btn-bulk-publish')?.addEventListener('click', () => {
    showToast('Publicación masiva: próximamente.', 'default');
  });

  document.getElementById('pub-search')?.addEventListener('input', (e) => {
    pubSearch = e.target.value;
    renderPublicaciones();
  });

  // Scopeado a #pub-toolbar: ningún otro filtro de la página usa .pub-chip
  // fuera de acá (Pedidos usa sus propias .pd-tab), pero se deja el scope
  // por si alguna sección futura reutiliza la clase.
  document.querySelectorAll('#pub-toolbar .pub-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      pubStatus = chip.dataset.status;
      document.querySelectorAll('#pub-toolbar .pub-chip').forEach((c) => c.classList.toggle('is-active', c === chip));
      renderPublicaciones();
    });
  });

  // Cerrar los menús de acciones (⋮) de fila al clickear afuera.
  document.addEventListener('click', closePubMenus);
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
  // Vía el picker, no por .value: escribir el input oculto directo cargaría el
  // valor pero dejaría el campo visible en blanco.
  datePickers['prod-offer-expires']?.setValue(product.offer_expires_at ?? '');
  document.getElementById('prod-desc').value = product.description || '';
  setProductCategorySlug(product.categories?.slug || '');

  const formTitle = document.getElementById('add-product-form-title');
  if (formTitle) formTitle.textContent = 'Editar producto';
  const submitBtn = document.querySelector('#add-product-form button[type="submit"]');
  if (submitBtn) submitBtn.textContent = 'Guardar cambios';

  openProductForm();
  await hydrateProductGallery(product);

  // F5-03: variantes solo tienen sentido con un product_id real, o sea editando.
  const variantsSection = document.getElementById('prod-variants-section');
  if (variantsSection) variantsSection.hidden = false;
  await renderVariantsManager(productId);
}

/* --- Galería de fotos del form (portada + adicionales en una sola grilla) ---
 *
 * El lado cliente (js/producto.js, js/product-modal.js) arma la galería como
 * [products.image_url, ...product_images ordenadas por position]. O sea: la
 * portada vive en products.image_url y NO como fila de product_images, o se
 * vería duplicada. persistProductImages() es el único lugar que escribe esto.
 *
 * productImages es el orden final y el índice 0 es la portada:
 *   { kind: 'saved', url }            -> ya está en storage
 *   { kind: 'new', file, previewUrl } -> elegida recién, todavía sin subir
 */
let productImages = [];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
let galleryDragFrom = null;
/**
 * Fotos que el producto tenía al abrirse el formulario. Al guardar, las que ya
 * no estén acá se borran del bucket: sin esta foto del "antes" no hay forma de
 * saber cuáles quitó el vendedor, y quedaban acumulándose en storage.
 * (No se puede listar la carpeta: el bucket `products` no tiene policy de
 * SELECT, así que list() devolvería vacío sin avisar.)
 */
let savedImageUrlsAtLoad = [];

/** Carga en la galería la portada + las adicionales de un producto ya guardado. */
async function hydrateProductGallery(product) {
  resetProductGallery();
  if (product.image_url) productImages.push({ kind: 'saved', url: product.image_url });

  const { data: extra, error } = await supabase
    .from('product_images')
    .select('url, position')
    .eq('product_id', product.id)
    .order('position', { ascending: true });

  if (error) console.error('No se pudieron cargar las fotos del producto:', error);
  (extra || []).forEach((row) => productImages.push({ kind: 'saved', url: row.url }));

  savedImageUrlsAtLoad = productImages.map((item) => item.url);
  renderProductGallery();
}

/** Vacía la galería, liberando las previews en memoria de las fotos sin subir. */
function resetProductGallery() {
  productImages.forEach((item) => {
    if (item.kind === 'new') URL.revokeObjectURL(item.previewUrl);
  });
  productImages = [];
  savedImageUrlsAtLoad = [];
  renderProductGallery();
}

/** Suma archivos elegidos a la galería, descartando los que no sirven. */
function addFilesToGallery(files) {
  Array.from(files || []).forEach((file) => {
    if (!file.type.startsWith('image/')) {
      showToast(`"${file.name}" no es una imagen.`, 'error');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast(`"${file.name}" pesa más de 5 MB.`, 'error');
      return;
    }
    productImages.push({ kind: 'new', file, previewUrl: URL.createObjectURL(file) });
  });
  renderProductGallery();
}

function moveGalleryImage(from, to) {
  if (from == null || to == null || from === to) return;
  const [moved] = productImages.splice(from, 1);
  productImages.splice(to, 0, moved);
  renderProductGallery();
}

function renderProductGallery() {
  const grid = document.getElementById('prod-gallery');
  if (!grid) return;
  grid.textContent = '';

  productImages.forEach((item, index) => {
    const cell = document.createElement('div');
    cell.className = 'pubform__photo';
    cell.draggable = true;

    const img = document.createElement('img');
    img.src = item.kind === 'new' ? item.previewUrl : item.url;
    img.alt = index === 0 ? 'Foto de portada' : `Foto ${index + 1}`;
    cell.appendChild(img);

    if (index === 0) {
      const badge = document.createElement('span');
      badge.className = 'pubform__badge';
      badge.textContent = 'Portada';
      cell.appendChild(badge);
    } else {
      // El drag&drop HTML5 no existe en touch: sin este botón, desde el celular
      // no habría forma de cambiar la portada.
      const coverBtn = document.createElement('button');
      coverBtn.type = 'button';
      coverBtn.className = 'pubform__photo-cover';
      coverBtn.textContent = 'Hacer portada';
      coverBtn.addEventListener('click', () => moveGalleryImage(index, 0));
      cell.appendChild(coverBtn);
    }

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'pubform__photo-del';
    delBtn.setAttribute('aria-label', `Quitar foto ${index + 1}`);
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => {
      const [removed] = productImages.splice(index, 1);
      if (removed?.kind === 'new') URL.revokeObjectURL(removed.previewUrl);
      renderProductGallery();
    });
    cell.appendChild(delBtn);

    cell.addEventListener('dragstart', () => {
      galleryDragFrom = index;
      cell.classList.add('is-dragging');
    });
    cell.addEventListener('dragend', () => {
      galleryDragFrom = null;
      cell.classList.remove('is-dragging');
      grid.querySelectorAll('.pubform__photo').forEach((c) => c.classList.remove('is-over'));
    });
    cell.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (galleryDragFrom !== null && galleryDragFrom !== index) cell.classList.add('is-over');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('is-over'));
    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('is-over');
      moveGalleryImage(galleryDragFrom, index);
      galleryDragFrom = null;
    });

    grid.appendChild(cell);
  });
}

/** Muestra el form ocultando el listado (una cosa a la vez). */
function openProductForm() {
  document.querySelector('.pub-wrap')?.classList.add('is-editing');
  const container = document.getElementById('add-product-form-container');
  if (container) container.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Vuelve al listado. */
function closeProductForm() {
  document.querySelector('.pub-wrap')?.classList.remove('is-editing');
  const container = document.getElementById('add-product-form-container');
  if (container) container.hidden = true;
}

/** F5-04: sube una foto al bucket 'products' y devuelve su URL pública (null si falló). */
async function uploadProductImage(productId, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  const path = `${productId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from('products').upload(path, file);
  if (uploadError) {
    console.error('Error al subir la foto:', uploadError);
    showToast(`No se pudo subir ${file.name}.`, 'error');
    return null;
  }
  return supabase.storage.from('products').getPublicUrl(path).data.publicUrl;
}

/**
 * Sube las fotos nuevas y deja product_images con TODAS menos la portada.
 * Devuelve la URL de portada, que el llamador guarda en products.image_url.
 *
 * Reescribe las filas de cero (borrar + insertar) en vez de diffear: así la
 * portada nunca queda además como fila (se vería duplicada en la vista de
 * cliente) y position siempre coincide con el orden que ve el vendedor.
 * ponytail: reinserta todas las filas en cada guardado; si un producto llegara
 * a tener decenas de fotos, diffear.
 */
async function persistProductImages(productId) {
  const urls = [];
  for (const item of productImages) {
    if (item.kind === 'saved') {
      urls.push(item.url);
      continue;
    }
    const url = await uploadProductImage(productId, item.file);
    if (url) urls.push(url);
  }

  const { error: deleteError } = await supabase.from('product_images').delete().eq('product_id', productId);
  if (deleteError) {
    console.error('No se pudieron limpiar las fotos previas:', deleteError);
    showToast('No se pudo guardar el orden de las fotos.', 'error');
    return urls[0] ?? null;
  }

  const rest = urls.slice(1).map((url, position) => ({ product_id: productId, url, position }));
  let wroteOk = true;
  if (rest.length) {
    const { error: insertError } = await supabase.from('product_images').insert(rest);
    if (insertError) {
      console.error('No se pudieron guardar las fotos adicionales:', insertError);
      showToast('No se pudieron guardar las fotos adicionales.', 'error');
      wroteOk = false;
    }
  }

  // Recién con la DB ya escrita se sabe qué fotos quedaron: las que el vendedor
  // sacó se borran del bucket. Si la escritura falló no se toca nada -- borrar
  // un archivo que todavía referencia una fila sería peor que dejar basura.
  if (wroteOk) {
    const kept = new Set(urls);
    await removeStoredObjects(supabase, 'products', savedImageUrlsAtLoad.filter((u) => !kept.has(u)));
    savedImageUrlsAtLoad = [...urls];
  }

  return urls[0] ?? null;
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
  setupStoreStaffForm();
  initPublicacionesControls();
  initPedidosControls();

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
  const addForm = document.getElementById('add-product-form');

  // Grilla de categorías. Antes se armaba copiando el innerHTML del select de
  // rubros del alta de comercio, lo que ataba un control al otro y dependía de
  // cuál se inicializara primero; ahora los dos salen de categoriesCache.
  renderProductCategoryOptions();

  function resetProductForm() {
    editingProductId = null;
    addForm.reset();
    const formTitle = document.getElementById('add-product-form-title');
    if (formTitle) formTitle.textContent = 'Publicar nuevo producto';
    const submitBtn = addForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.textContent = 'Guardar producto';
    resetProductGallery();
    const variantsSection = document.getElementById('prod-variants-section');
    if (variantsSection) variantsSection.hidden = true;
    const variantsList = document.getElementById('prod-variants-list');
    if (variantsList) variantsList.textContent = '';
  }

  btnShowAdd.addEventListener('click', () => {
    resetProductForm();
    openProductForm();
  });

  // Cancelar (abajo) y "Volver a publicaciones" (arriba) hacen lo mismo.
  [btnCancelAdd, document.getElementById('btn-back-publicaciones')].forEach((btn) => {
    btn?.addEventListener('click', () => {
      closeProductForm();
      resetProductForm();
    });
  });

  // Zona de carga: click, teclado y arrastrar-y-soltar caen en el mismo input.
  const dropZone = document.getElementById('prod-drop');
  const imagesInput = document.getElementById('prod-images');
  if (dropZone && imagesInput) {
    dropZone.addEventListener('click', () => imagesInput.click());
    dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        imagesInput.click();
      }
    });
    imagesInput.addEventListener('change', () => {
      addFilesToGallery(imagesInput.files);
      // Se limpia para que elegir el mismo archivo otra vez vuelva a disparar change.
      imagesInput.value = '';
    });

    ['dragenter', 'dragover'].forEach((evt) =>
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.add('is-over');
      })
    );
    ['dragleave', 'drop'].forEach((evt) =>
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.remove('is-over');
      })
    );
    dropZone.addEventListener('drop', (e) => addFilesToGallery(e.dataTransfer?.files));
  }

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = addForm.querySelector('button[type="submit"]');
    const isEditing = Boolean(editingProductId);
    const submitLabel = isEditing ? 'Guardar cambios' : 'Guardar producto';

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
      // image_url se setea después de subir las fotos: en un alta todavía no
      // existe el id del producto, que hace falta para la ruta en storage.
    };

    // El select guarda el slug de la categoría; hay que resolver el UUID real
    const slug = getProductCategorySlug();
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

    // F5-04: recién acá hay id real, que es lo que necesita la ruta en storage.
    // persistProductImages sube las fotos nuevas, reescribe product_images y
    // devuelve la portada para guardarla en products.image_url.
    if (savedProductId) {
      const coverUrl = await persistProductImages(savedProductId);
      const { error: coverError } = await supabase
        .from('products')
        .update({ image_url: coverUrl })
        .eq('id', savedProductId);
      if (coverError) {
        console.error('No se pudo guardar la foto de portada:', coverError);
        showToast('El producto se guardó, pero falló la foto de portada.', 'error');
      }
    }

    showToast(isEditing ? "Producto actualizado" : "Producto creado", "success");
    closeProductForm();
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
    // Cambia los <input type="date"> por el selector propio. El valor sigue
    // viajando en ISO por un input oculto con el mismo id, así que las
    // lecturas (getElementById(...).value) no cambian. Se guardan los pickers
    // porque el alta de producto escribe la fecha desde afuera al editar.
    datePickers = upgradeDateInputs();
    initVenderPage(user);
  },
});
