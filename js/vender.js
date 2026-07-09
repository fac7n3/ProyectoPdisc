import { supabase, showToast, setLoading, guardPage } from './auth-utils.js';
import { formatPrice } from './cart-utils.js';
import { isValidCuit, isValidShopName, isValidPhone, isValidProductTitle, isValidPrice, isValidStock } from './validation-utils.js';
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

async function loadDashboard(user) {
  // Obtener la tienda del usuario
  const { data: store, error } = await supabase
    .from('stores')
    .select('id, name')
    .eq('owner_id', user.id)
    .single();

  if (error || !store) {
    console.error("Error al cargar la tienda", error);
    return;
  }

  currentStoreId = store.id;
  document.getElementById('dash-shop-name').textContent = store.name;

  await fetchProducts();
  await renderPendingPayments();
  await renderShipmentsInProgress();
  setupDashboardEvents();
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

  document.getElementById('stat-products-count').textContent = products.length;

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
    img.src = p.image_url || 'https://via.placeholder.com/50';
    img.style.cssText = 'width: 50px; height: 50px; border-radius: 8px; object-fit: cover;';
    img.alt = p.title || 'Producto';
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
  document.getElementById('prod-desc').value = product.description || '';
  document.getElementById('prod-image').value = product.image_url || '';
  document.getElementById('prod-category').value = product.categories?.slug || '';

  const formTitle = document.getElementById('add-product-form-title');
  if (formTitle) formTitle.textContent = 'Editar producto';
  const submitBtn = document.querySelector('#add-product-form button[type="submit"]');
  if (submitBtn) submitBtn.textContent = 'Guardar cambios';

  document.getElementById('add-product-form-container').style.display = 'block';
  document.getElementById('add-product-form-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function setupDashboardEvents() {
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
      category_id: null,
      description: document.getElementById('prod-desc').value.trim(),
      image_url: document.getElementById('prod-image').value.trim()
    };

    // El select guarda el slug de la categoría; hay que resolver el UUID real
    const slug = document.getElementById('prod-category').value;
    const { data: catData } = await supabase.from('categories').select('id').eq('slug', slug).single();
    if (catData) productData.category_id = catData.id;

    let error;
    if (isEditing) {
      ({ error } = await supabase.from('products').update(productData).eq('id', editingProductId));
    } else {
      productData.seller_id = user.id;
      productData.store_id = currentStoreId;
      ({ error } = await supabase.from('products').insert([productData]));
    }

    if (error) {
      showToast(isEditing ? "Error al guardar los cambios" : "Error al guardar el producto", "error");
      console.error(error);
    } else {
      showToast(isEditing ? "Producto actualizado" : "Producto creado", "success");
      addFormContainer.style.display = 'none';
      resetProductForm();
      fetchProducts();
    }
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
