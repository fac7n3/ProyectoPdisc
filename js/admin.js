import { supabase, showToast, guardPage } from './auth-utils.js';
import { statusLabel as supportStatusLabel } from './support-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

async function fetchRequests() {
  const tbody = document.getElementById('requests-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando solicitudes...</td></tr>';

  const { data, error } = await supabase
    .from('seller_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching requests:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error al cargar las solicitudes.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay solicitudes registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach(req => {
    const date = new Date(req.created_at).toLocaleDateString('es-AR');
    let statusClass = '';
    let statusText = '';
    
    if (req.status === 'pending') {
      statusClass = 'status-pending';
      statusText = 'Pendiente';
    } else if (req.status === 'approved') {
      statusClass = 'status-approved';
      statusText = 'Aprobado';
    } else {
      statusClass = 'status-rejected';
      statusText = 'Rechazado';
    }

    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = date;
    tr.appendChild(tdDate);

    const tdShop = document.createElement('td');
    const shopStrong = document.createElement('strong');
    shopStrong.textContent = req.shop_name;
    tdShop.appendChild(shopStrong);
    tdShop.appendChild(document.createElement('br'));
    const addressSmall = document.createElement('small');
    addressSmall.textContent = req.address || '';
    tdShop.appendChild(addressSmall);
    tr.appendChild(tdShop);

    const tdCuit = document.createElement('td');
    tdCuit.textContent = req.cuit || '-';
    tr.appendChild(tdCuit);

    const tdCategory = document.createElement('td');
    tdCategory.textContent = req.category_slug || '-';
    tr.appendChild(tdCategory);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${statusClass}`;
    statusBadge.textContent = statusText;
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');
    if (req.status === 'pending') {
      const approveBtn = document.createElement('button');
      approveBtn.className = 'action-btn btn-approve';
      approveBtn.dataset.id = req.id;
      approveBtn.title = 'Aprobar';
      const checkIcon = document.createElement('i');
      checkIcon.className = 'fa-solid fa-check';
      approveBtn.appendChild(checkIcon);
      tdActions.appendChild(approveBtn);

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'action-btn btn-reject';
      rejectBtn.dataset.id = req.id;
      rejectBtn.title = 'Rechazar';
      const xIcon = document.createElement('i');
      xIcon.className = 'fa-solid fa-xmark';
      rejectBtn.appendChild(xIcon);
      tdActions.appendChild(rejectBtn);
    } else {
      tdActions.textContent = '-';
    }
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });

  // Bind actions
  document.querySelectorAll('.btn-approve').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm('¿Estás seguro de aprobar este comercio?')) {
        await approveRequest(id);
      }
    });
  });

  document.querySelectorAll('.btn-reject').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm('¿Estás seguro de rechazar este comercio?')) {
        await rejectRequest(id);
      }
    });
  });
}

async function approveRequest(id) {
  try {
    // LLama a la función de RPC creada en la base de datos
    const { error } = await supabase.rpc('approve_seller_request', { req_id: id });
    if (error) throw error;
    
    showToast('Comercio aprobado exitosamente', 'success');
    fetchRequests();
  } catch (err) {
    console.error('Error al aprobar:', err);
    showToast('Error al aprobar el comercio. Verifica que corriste los scripts SQL.', 'error');
  }
}

async function rejectRequest(id) {
  try {
    const { error } = await supabase
      .from('seller_requests')
      .update({ status: 'rejected', updated_at: new Date() })
      .eq('id', id);
      
    if (error) throw error;
    
    showToast('Solicitud rechazada', 'success');
    fetchRequests();
  } catch (err) {
    console.error('Error al rechazar:', err);
    showToast('Error al rechazar el comercio', 'error');
  }
}

const VEHICLE_LABELS = {
  bicicleta: 'Bicicleta',
  moto: 'Moto',
  auto: 'Auto',
};

async function fetchDeliveryRequests() {
  const tbody = document.getElementById('delivery-requests-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando solicitudes...</td></tr>';

  const { data, error } = await supabase
    .from('delivery_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching delivery requests:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error al cargar las solicitudes.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay solicitudes registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach(req => {
    const date = new Date(req.created_at).toLocaleDateString('es-AR');
    let statusClass = '';
    let statusText = '';

    if (req.status === 'pending') {
      statusClass = 'status-pending';
      statusText = 'Pendiente';
    } else if (req.status === 'approved') {
      statusClass = 'status-approved';
      statusText = 'Aprobado';
    } else {
      statusClass = 'status-rejected';
      statusText = 'Rechazado';
    }

    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = date;
    tr.appendChild(tdDate);

    const tdName = document.createElement('td');
    tdName.textContent = req.full_name;
    tr.appendChild(tdName);

    const tdPhone = document.createElement('td');
    tdPhone.textContent = req.phone;
    tr.appendChild(tdPhone);

    const tdVehicle = document.createElement('td');
    tdVehicle.textContent = VEHICLE_LABELS[req.vehicle_type] || req.vehicle_type;
    if (req.vehicle_plate) {
      tdVehicle.appendChild(document.createElement('br'));
      const plateSmall = document.createElement('small');
      plateSmall.textContent = req.vehicle_plate;
      tdVehicle.appendChild(plateSmall);
    }
    tr.appendChild(tdVehicle);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${statusClass}`;
    statusBadge.textContent = statusText;
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');
    if (req.status === 'pending') {
      const approveBtn = document.createElement('button');
      approveBtn.className = 'action-btn btn-approve-delivery';
      approveBtn.dataset.id = req.id;
      approveBtn.title = 'Aprobar';
      const checkIcon = document.createElement('i');
      checkIcon.className = 'fa-solid fa-check';
      approveBtn.appendChild(checkIcon);
      tdActions.appendChild(approveBtn);

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'action-btn btn-reject-delivery';
      rejectBtn.dataset.id = req.id;
      rejectBtn.title = 'Rechazar';
      const xIcon = document.createElement('i');
      xIcon.className = 'fa-solid fa-xmark';
      rejectBtn.appendChild(xIcon);
      tdActions.appendChild(rejectBtn);
    } else {
      tdActions.textContent = '-';
    }
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });

  document.querySelectorAll('.btn-approve-delivery').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm('¿Estás seguro de aprobar este repartidor?')) {
        await approveDeliveryRequest(id);
      }
    });
  });

  document.querySelectorAll('.btn-reject-delivery').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm('¿Estás seguro de rechazar esta solicitud?')) {
        await rejectDeliveryRequest(id);
      }
    });
  });
}

async function approveDeliveryRequest(id) {
  try {
    const { error } = await supabase.rpc('approve_delivery_request', { req_id: id });
    if (error) throw error;

    showToast('Repartidor aprobado exitosamente', 'success');
    fetchDeliveryRequests();
  } catch (err) {
    console.error('Error al aprobar repartidor:', err);
    showToast('Error al aprobar la solicitud.', 'error');
  }
}

async function rejectDeliveryRequest(id) {
  try {
    const { error } = await supabase
      .from('delivery_requests')
      .update({ status: 'rejected', updated_at: new Date() })
      .eq('id', id);

    if (error) throw error;

    showToast('Solicitud rechazada', 'success');
    fetchDeliveryRequests();
  } catch (err) {
    console.error('Error al rechazar repartidor:', err);
    showToast('Error al rechazar la solicitud.', 'error');
  }
}

// --- F6-05: métricas globales ---

async function loadGlobalMetrics() {
  const grid = document.getElementById('metrics-grid');
  if (!grid) return;

  const [{ data: profiles }, { data: stores }, { data: paidOrders }, { data: deliveries }] = await Promise.all([
    supabase.from('profiles').select('role'),
    supabase.from('stores').select('status'),
    supabase.from('orders').select('total_price').eq('payment_status', 'paid'),
    supabase.from('deliveries').select('status'),
  ]);

  const countBy = (rows, key) => (rows || []).reduce((acc, row) => {
    acc[row[key]] = (acc[row[key]] || 0) + 1;
    return acc;
  }, {});

  const roleCounts = countBy(profiles, 'role');
  const storeCounts = countBy(stores, 'status');
  const deliveryCounts = countBy(deliveries, 'status');
  const totalSales = (paidOrders || []).reduce((sum, o) => sum + o.total_price, 0);

  const metrics = [
    { label: 'Usuarios totales', value: (profiles || []).length },
    { label: 'Vendedores', value: roleCounts.vendedor || 0 },
    { label: 'Repartidores', value: roleCounts.repartidor || 0 },
    { label: 'Comercios aprobados', value: storeCounts.approved || 0 },
    { label: 'Comercios suspendidos', value: storeCounts.suspended || 0 },
    { label: 'Ventas totales', value: `$${totalSales.toLocaleString('es-AR')}` },
    { label: 'Entregas en curso', value: (deliveryCounts.assigned || 0) + (deliveryCounts.picked_up || 0) },
    { label: 'Entregas completadas', value: deliveryCounts.delivered || 0 },
  ];

  grid.textContent = '';
  metrics.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'admin-metric-card';
    const h3 = document.createElement('h3');
    h3.textContent = m.value;
    const p = document.createElement('p');
    p.textContent = m.label;
    card.appendChild(h3);
    card.appendChild(p);
    grid.appendChild(card);
  });
}

// --- F6-02: CRUD de categorías ---

async function fetchCategories() {
  const tbody = document.getElementById('categories-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando categorías...</td></tr>';

  const { data, error } = await supabase.from('categories').select('*').order('name');

  if (error) {
    console.error('Error fetching categories:', error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al cargar las categorías.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay categorías registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((cat) => {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = cat.name;
    tr.appendChild(tdName);

    const tdSlug = document.createElement('td');
    tdSlug.textContent = cat.slug;
    tr.appendChild(tdSlug);

    const tdIcon = document.createElement('td');
    tdIcon.textContent = cat.icon || '-';
    tr.appendChild(tdIcon);

    const tdActions = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn btn-reject';
    deleteBtn.title = 'Borrar';
    const xIcon = document.createElement('i');
    xIcon.className = 'fa-solid fa-trash';
    deleteBtn.appendChild(xIcon);
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`¿Borrar la categoría "${cat.name}"? Los productos que la usaban quedarán sin rubro.`)) return;
      const { error: deleteError } = await supabase.from('categories').delete().eq('id', cat.id);
      if (deleteError) {
        showToast('No se pudo borrar la categoría.', 'error');
        console.error(deleteError);
        return;
      }
      showToast('Categoría borrada.', 'success');
      fetchCategories();
    });
    tdActions.appendChild(deleteBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

function setupCategoryForm() {
  document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cat-name').value.trim();
    const slug = document.getElementById('cat-slug').value.trim().toLowerCase();
    const icon = document.getElementById('cat-icon').value.trim();

    if (!name || !slug) {
      showToast('Nombre y slug son obligatorios.', 'error');
      return;
    }

    const { error } = await supabase.from('categories').insert({ name, slug, icon: icon || null });
    if (error) {
      showToast('No se pudo crear la categoría (¿el slug ya existe?).', 'error');
      console.error(error);
      return;
    }

    showToast('Categoría creada.', 'success');
    e.target.reset();
    fetchCategories();
  });
}

// --- F6-03: CRUD de cupones ---

async function fetchCoupons() {
  const tbody = document.getElementById('coupons-tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando cupones...</td></tr>';

  const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching coupons:', error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error al cargar los cupones.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay cupones registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((coupon) => {
    const tr = document.createElement('tr');
    const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();

    const tdCode = document.createElement('td');
    const codeStrong = document.createElement('strong');
    codeStrong.textContent = coupon.code;
    tdCode.appendChild(codeStrong);
    tr.appendChild(tdCode);

    const tdDiscount = document.createElement('td');
    tdDiscount.textContent = `${coupon.discount_percentage}%`;
    tr.appendChild(tdDiscount);

    const tdExpires = document.createElement('td');
    tdExpires.textContent = coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString('es-AR') : 'Sin vencimiento';
    tr.appendChild(tdExpires);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    if (isExpired) {
      statusBadge.className = 'status-badge status-rejected';
      statusBadge.textContent = 'Vencido';
    } else if (coupon.is_active) {
      statusBadge.className = 'status-badge status-approved';
      statusBadge.textContent = 'Activo';
    } else {
      statusBadge.className = 'status-badge status-suspended';
      statusBadge.textContent = 'Inactivo';
    }
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');

    const toggleBtn = document.createElement('button');
    toggleBtn.className = `action-btn ${coupon.is_active ? 'btn-suspend' : 'btn-reactivate'}`;
    toggleBtn.textContent = coupon.is_active ? 'Desactivar' : 'Activar';
    toggleBtn.addEventListener('click', async () => {
      const { error: updateError } = await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id);
      if (updateError) {
        showToast('No se pudo actualizar el cupón.', 'error');
        console.error(updateError);
        return;
      }
      fetchCoupons();
    });
    tdActions.appendChild(toggleBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn btn-reject';
    deleteBtn.title = 'Borrar';
    const xIcon = document.createElement('i');
    xIcon.className = 'fa-solid fa-trash';
    deleteBtn.appendChild(xIcon);
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`¿Borrar el cupón "${coupon.code}"?`)) return;
      const { error: deleteError } = await supabase.from('coupons').delete().eq('id', coupon.id);
      if (deleteError) {
        showToast('No se pudo borrar el cupón.', 'error');
        console.error(deleteError);
        return;
      }
      showToast('Cupón borrado.', 'success');
      fetchCoupons();
    });
    tdActions.appendChild(deleteBtn);

    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
}

function setupCouponForm() {
  document.getElementById('coupon-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('coupon-code').value.trim().toUpperCase();
    const discount = document.getElementById('coupon-discount').value;
    const expiresAt = document.getElementById('coupon-expires').value;

    const discountNum = parseInt(discount, 10);
    if (!code || !Number.isInteger(discountNum) || discountNum < 1 || discountNum > 100) {
      showToast('Código y descuento (1-100) son obligatorios.', 'error');
      return;
    }

    const { error } = await supabase.from('coupons').insert({
      code,
      discount_percentage: discountNum,
      expires_at: expiresAt || null,
      is_active: true,
    });

    if (error) {
      showToast('No se pudo crear el cupón (¿el código ya existe?).', 'error');
      console.error(error);
      return;
    }

    showToast('Cupón creado.', 'success');
    e.target.reset();
    fetchCoupons();
  });
}

// --- F6-04: moderación ---

async function fetchStoresForModeration() {
  const tbody = document.getElementById('stores-mod-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando comercios...</td></tr>';

  const { data, error } = await supabase.from('stores').select('id, name, cuit, status').order('name');

  if (error) {
    console.error('Error fetching stores for moderation:', error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al cargar los comercios.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay comercios registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((store) => {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = store.name;
    tr.appendChild(tdName);

    const tdCuit = document.createElement('td');
    tdCuit.textContent = store.cuit || '-';
    tr.appendChild(tdCuit);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge status-${store.status}`;
    statusBadge.textContent = store.status;
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');
    if (store.status === 'approved' || store.status === 'suspended') {
      const isSuspended = store.status === 'suspended';
      const toggleBtn = document.createElement('button');
      toggleBtn.className = `action-btn ${isSuspended ? 'btn-reactivate' : 'btn-suspend'}`;
      toggleBtn.textContent = isSuspended ? 'Reactivar' : 'Suspender';
      toggleBtn.addEventListener('click', async () => {
        const newStatus = isSuspended ? 'approved' : 'suspended';
        if (!confirm(`¿${isSuspended ? 'Reactivar' : 'Suspender'} el comercio "${store.name}"?`)) return;
        const { error: updateError } = await supabase.from('stores').update({ status: newStatus }).eq('id', store.id);
        if (updateError) {
          showToast('No se pudo actualizar el comercio.', 'error');
          console.error(updateError);
          return;
        }
        showToast(`Comercio ${isSuspended ? 'reactivado' : 'suspendido'}.`, 'success');
        fetchStoresForModeration();
      });
      tdActions.appendChild(toggleBtn);
    } else {
      tdActions.textContent = '-';
    }
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

async function fetchRepartidoresForModeration() {
  const tbody = document.getElementById('repartidores-mod-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando repartidores...</td></tr>';

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_suspended')
    .eq('role', 'repartidor')
    .order('full_name');

  if (error) {
    console.error('Error fetching repartidores:', error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al cargar los repartidores.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay repartidores registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((rep) => {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = rep.full_name || '-';
    tr.appendChild(tdName);

    const tdEmail = document.createElement('td');
    tdEmail.textContent = rep.email;
    tr.appendChild(tdEmail);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${rep.is_suspended ? 'status-suspended' : 'status-approved'}`;
    statusBadge.textContent = rep.is_suspended ? 'Suspendido' : 'Activo';
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');
    const toggleBtn = document.createElement('button');
    toggleBtn.className = `action-btn ${rep.is_suspended ? 'btn-reactivate' : 'btn-suspend'}`;
    toggleBtn.textContent = rep.is_suspended ? 'Reactivar' : 'Suspender';
    toggleBtn.addEventListener('click', async () => {
      if (!confirm(`¿${rep.is_suspended ? 'Reactivar' : 'Suspender'} a "${rep.full_name || rep.email}"?`)) return;
      const { error: rpcError } = await supabase.rpc('admin_set_repartidor_suspended', {
        p_user_id: rep.id,
        p_suspended: !rep.is_suspended,
      });
      if (rpcError) {
        showToast(rpcError.message || 'No se pudo actualizar el repartidor.', 'error');
        console.error(rpcError);
        return;
      }
      showToast(`Repartidor ${rep.is_suspended ? 'reactivado' : 'suspendido'}.`, 'success');
      fetchRepartidoresForModeration();
    });
    tdActions.appendChild(toggleBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

function setupProductSearch() {
  document.getElementById('product-search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const term = document.getElementById('product-search-input').value.trim();
    const tbody = document.getElementById('products-mod-tbody');
    if (!term) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Buscando...</td></tr>';

    const { data, error } = await supabase
      .from('products')
      .select('id, title, is_active, stores(name)')
      .ilike('title', `%${term}%`)
      .limit(20);

    if (error) {
      console.error('Error searching products:', error);
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al buscar productos.</td></tr>';
      return;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Sin resultados.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.forEach((product) => {
      const tr = document.createElement('tr');

      const tdTitle = document.createElement('td');
      tdTitle.textContent = product.title;
      tr.appendChild(tdTitle);

      const tdStore = document.createElement('td');
      tdStore.textContent = product.stores?.name || '-';
      tr.appendChild(tdStore);

      const tdStatus = document.createElement('td');
      const statusBadge = document.createElement('span');
      statusBadge.className = `status-badge ${product.is_active ? 'status-approved' : 'status-suspended'}`;
      statusBadge.textContent = product.is_active ? 'Activo' : 'Suspendido';
      tdStatus.appendChild(statusBadge);
      tr.appendChild(tdStatus);

      const tdActions = document.createElement('td');
      const toggleBtn = document.createElement('button');
      toggleBtn.className = `action-btn ${product.is_active ? 'btn-suspend' : 'btn-reactivate'}`;
      toggleBtn.textContent = product.is_active ? 'Suspender' : 'Reactivar';
      toggleBtn.addEventListener('click', async () => {
        if (!confirm(`¿${product.is_active ? 'Suspender' : 'Reactivar'} "${product.title}"?`)) return;
        const { error: rpcError } = await supabase.rpc('admin_set_product_active', {
          p_product_id: product.id,
          p_is_active: !product.is_active,
        });
        if (rpcError) {
          showToast(rpcError.message || 'No se pudo actualizar el producto.', 'error');
          console.error(rpcError);
          return;
        }
        showToast(`Producto ${product.is_active ? 'suspendido' : 'reactivado'}.`, 'success');
        document.getElementById('product-search-form').dispatchEvent(new Event('submit'));
      });
      tdActions.appendChild(toggleBtn);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
  });
}

async function fetchPendingProofsAdmin() {
  const tbody = document.getElementById('proofs-mod-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando comprobantes...</td></tr>';

  const { data, error } = await supabase
    .from('payment_proofs')
    .select('id, receipt_url, created_at, orders(id, total_price, stores(name))')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching payment proofs:', error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al cargar los comprobantes.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay comprobantes pendientes.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((proof) => {
    const order = proof.orders;
    const tr = document.createElement('tr');

    const tdOrder = document.createElement('td');
    tdOrder.textContent = order ? `#${order.id.split('-')[0].toUpperCase()}` : '-';
    tr.appendChild(tdOrder);

    const tdStore = document.createElement('td');
    tdStore.textContent = order?.stores?.name || '-';
    tr.appendChild(tdStore);

    const tdAmount = document.createElement('td');
    tdAmount.textContent = order ? `$${order.total_price.toLocaleString('es-AR')}` : '-';
    tr.appendChild(tdAmount);

    const tdActions = document.createElement('td');

    const viewBtn = document.createElement('button');
    viewBtn.className = 'action-btn';
    viewBtn.style.background = 'var(--bl-primary)';
    viewBtn.style.color = 'white';
    viewBtn.textContent = 'Ver';
    viewBtn.addEventListener('click', async () => {
      const { data: signedData, error: signedError } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(proof.receipt_url, 60);
      if (signedError || !signedData?.signedUrl) {
        showToast('No se pudo abrir el comprobante.', 'error');
        return;
      }
      window.open(signedData.signedUrl, '_blank', 'noopener,noreferrer');
    });
    tdActions.appendChild(viewBtn);

    const approveBtn = document.createElement('button');
    approveBtn.className = 'action-btn btn-approve';
    approveBtn.title = 'Confirmar';
    const checkIcon = document.createElement('i');
    checkIcon.className = 'fa-solid fa-check';
    approveBtn.appendChild(checkIcon);
    approveBtn.addEventListener('click', () => handleProofDecisionAdmin(proof.id, true));
    tdActions.appendChild(approveBtn);

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'action-btn btn-reject';
    rejectBtn.title = 'Rechazar';
    const xIcon = document.createElement('i');
    xIcon.className = 'fa-solid fa-xmark';
    rejectBtn.appendChild(xIcon);
    rejectBtn.addEventListener('click', () => handleProofDecisionAdmin(proof.id, false));
    tdActions.appendChild(rejectBtn);

    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
}

async function handleProofDecisionAdmin(proofId, approve) {
  const { error } = await supabase.rpc('confirm_transfer_payment', { p_proof_id: proofId, p_approve: approve });
  if (error) {
    showToast(error.message || 'No se pudo procesar el comprobante.', 'error');
    return;
  }
  showToast(approve ? 'Pago confirmado.' : 'Comprobante rechazado.', 'success');
  fetchPendingProofsAdmin();
}

// --- F7-03: moderación de reseñas reportadas ---

async function fetchReportedReviews() {
  const tbody = document.getElementById('reviews-mod-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando reseñas reportadas...</td></tr>';

  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, comment, is_hidden, report_reason, reported_at')
    .not('report_reason', 'is', null)
    .order('reported_at', { ascending: false });

  if (error) {
    console.error('Error fetching reported reviews:', error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al cargar las reseñas reportadas.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay reseñas reportadas.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((review) => {
    const tr = document.createElement('tr');

    const tdReview = document.createElement('td');
    const starsSpan = document.createElement('span');
    starsSpan.style.color = '#f59e0b';
    starsSpan.textContent = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    tdReview.appendChild(starsSpan);
    if (review.comment) {
      tdReview.appendChild(document.createElement('br'));
      const commentSmall = document.createElement('small');
      commentSmall.textContent = review.comment;
      tdReview.appendChild(commentSmall);
    }
    tr.appendChild(tdReview);

    const tdReason = document.createElement('td');
    tdReason.textContent = review.report_reason;
    tr.appendChild(tdReason);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${review.is_hidden ? 'status-suspended' : 'status-approved'}`;
    statusBadge.textContent = review.is_hidden ? 'Oculta' : 'Visible';
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');
    const toggleBtn = document.createElement('button');
    toggleBtn.className = `action-btn ${review.is_hidden ? 'btn-reactivate' : 'btn-suspend'}`;
    toggleBtn.textContent = review.is_hidden ? 'Mostrar' : 'Ocultar';
    toggleBtn.addEventListener('click', async () => {
      const { error: updateError } = await supabase.from('reviews').update({ is_hidden: !review.is_hidden }).eq('id', review.id);
      if (updateError) {
        showToast('No se pudo actualizar la reseña.', 'error');
        console.error(updateError);
        return;
      }
      fetchReportedReviews();
    });
    tdActions.appendChild(toggleBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

// --- F12-02: solicitudes de arrepentimiento (auditoría cross-tienda) ---
// El admin no resuelve la solicitud acá (eso lo hace el vendedor coordinando
// la devolución y usando "Cancelar" en su propio panel, F5-06) — esta vista
// es solo para auditar que no quede una solicitud sin atender.
async function fetchRevocationRequests() {
  const tbody = document.getElementById('revocations-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando solicitudes...</td></tr>';

  const { data, error } = await supabase
    .from('orders')
    .select('id, status, total_price, revocation_requested_at, stores(name)')
    .not('revocation_requested_at', 'is', null)
    .order('revocation_requested_at', { ascending: false });

  if (error) {
    console.error('Error fetching revocation requests:', error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error al cargar las solicitudes.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay solicitudes de arrepentimiento.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((order) => {
    const tr = document.createElement('tr');

    const tdOrder = document.createElement('td');
    tdOrder.textContent = `#${order.id.slice(0, 8).toUpperCase()}`;
    tr.appendChild(tdOrder);

    const tdStore = document.createElement('td');
    tdStore.textContent = order.stores?.name || 'Comercio';
    tr.appendChild(tdStore);

    const tdTotal = document.createElement('td');
    tdTotal.textContent = `$${order.total_price.toLocaleString('es-AR')}`;
    tr.appendChild(tdTotal);

    const tdRequested = document.createElement('td');
    tdRequested.textContent = new Date(order.revocation_requested_at).toLocaleDateString('es-AR');
    tr.appendChild(tdRequested);

    const tdStatus = document.createElement('td');
    const resolved = order.status === 'cancelled';
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${resolved ? 'status-approved' : 'status-pending'}`;
    statusBadge.textContent = resolved ? 'Resuelto (cancelado)' : 'Pendiente de resolución';
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    tbody.appendChild(tr);
  });
}

// --- F12-10: panel de errores de cliente (error_logs, A113-171) ---
// Hasta ahora solo se podían leer con SQL directo en el dashboard de Supabase.
// Vista de solo lectura -- no hay "resolver"/"archivar", es telemetría de
// diagnóstico, no un flujo con estados. Limitado a los últimos 100 (no es un
// visor de historial completo, es para detectar problemas recientes).
async function fetchErrorLogs() {
  const tbody = document.getElementById('error-logs-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando errores...</td></tr>';

  const { data, error } = await supabase
    .from('error_logs')
    .select('id, message, stack, url, user_id, user_agent, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching error logs:', error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error al cargar los errores.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay errores registrados.</td></tr>';
    return;
  }

  // error_logs.user_id referencia auth.users, no profiles -> segunda consulta
  // por los distintos user_id de la página (mismo patrón que phoneByClientId
  // en vender.js/repartidor.js, F12-05).
  const userIds = [...new Set(data.map((log) => log.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, email').in('id', userIds)
    : { data: [] };
  const emailByUserId = new Map((profiles || []).map((p) => [p.id, p.email]));

  tbody.innerHTML = '';
  data.forEach((log) => {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(log.created_at).toLocaleString('es-AR');
    tr.appendChild(tdDate);

    const tdUser = document.createElement('td');
    tdUser.textContent = log.user_id ? (emailByUserId.get(log.user_id) || 'Usuario eliminado') : 'Invitado';
    tr.appendChild(tdUser);

    const tdMessage = document.createElement('td');
    tdMessage.style.cssText = 'max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    tdMessage.textContent = log.message;
    tdMessage.title = log.message;
    tr.appendChild(tdMessage);

    const tdUrl = document.createElement('td');
    tdUrl.style.cssText = 'max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    tdUrl.textContent = log.url || '—';
    tdUrl.title = log.url || '';
    tr.appendChild(tdUrl);

    const tdActions = document.createElement('td');
    const detailBtn = document.createElement('button');
    detailBtn.type = 'button';
    detailBtn.className = 'action-btn';
    detailBtn.textContent = 'Ver detalle';
    detailBtn.addEventListener('click', () => {
      alert(
        `Mensaje:\n${log.message}\n\nURL: ${log.url || '—'}\n\nUser agent: ${log.user_agent || '—'}\n\nStack:\n${log.stack || '(sin stack trace)'}`
      );
    });
    tdActions.appendChild(detailBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

// --- F12-11: soporte/reclamos (support_tickets, 46_support_tickets.sql) ---
// El admin solo cambia el estado -- no hay respuesta en el hilo acá (ver nota
// de alcance en la migración), sigue usando el email del usuario para eso.
const SUPPORT_STATUSES = ['open', 'in_progress', 'resolved'];

async function fetchSupportTickets() {
  const tbody = document.getElementById('support-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando reclamos...</td></tr>';

  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, user_id, subject, message, status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching support tickets:', error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error al cargar los reclamos.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay reclamos registrados.</td></tr>';
    return;
  }

  const userIds = [...new Set(data.map((t) => t.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, email').in('id', userIds)
    : { data: [] };
  const emailByUserId = new Map((profiles || []).map((p) => [p.id, p.email]));

  tbody.innerHTML = '';
  data.forEach((ticket) => {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(ticket.created_at).toLocaleString('es-AR');
    tr.appendChild(tdDate);

    const tdUser = document.createElement('td');
    tdUser.textContent = emailByUserId.get(ticket.user_id) || 'Usuario eliminado';
    tr.appendChild(tdUser);

    const tdSubject = document.createElement('td');
    tdSubject.textContent = ticket.subject;
    tr.appendChild(tdSubject);

    const tdMessage = document.createElement('td');
    tdMessage.style.cssText = 'max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    tdMessage.textContent = ticket.message;
    tdMessage.title = ticket.message;
    tr.appendChild(tdMessage);

    const tdStatus = document.createElement('td');
    const statusSelect = document.createElement('select');
    statusSelect.style.cssText = 'padding: 0.35rem; width: auto;';
    SUPPORT_STATUSES.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = supportStatusLabel(s);
      if (s === ticket.status) opt.selected = true;
      statusSelect.appendChild(opt);
    });
    statusSelect.addEventListener('change', async () => {
      const newStatus = statusSelect.value;
      statusSelect.disabled = true;
      const { error: updateError } = await supabase
        .from('support_tickets')
        .update({ status: newStatus })
        .eq('id', ticket.id);

      if (updateError) {
        console.error('Error al actualizar el estado del reclamo:', updateError);
        showToast('No se pudo actualizar el estado.', 'error');
        statusSelect.value = ticket.status;
      } else {
        ticket.status = newStatus;
        showToast('Estado actualizado.', 'success');
      }
      statusSelect.disabled = false;
    });
    tdStatus.appendChild(statusSelect);
    tr.appendChild(tdStatus);

    tbody.appendChild(tr);
  });
}

// --- F12-12: log de auditoría de admin (admin_audit_log, 47_admin_audit_log.sql) ---
// Poblado solo por el trigger log_admin_action (SECURITY DEFINER) -- no hay
// insert directo expuesto, esta vista es de solo lectura.
const AUDIT_ACTION_LABELS = { insert: 'Creó', update: 'Modificó', delete: 'Borró' };

async function fetchAuditLog() {
  const tbody = document.getElementById('audit-log-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando log...</td></tr>';

  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('id, admin_id, action, target_table, target_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching audit log:', error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error al cargar el log.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Todavía no hay acciones de admin registradas.</td></tr>';
    return;
  }

  const adminIds = [...new Set(data.map((log) => log.admin_id).filter(Boolean))];
  const { data: profiles } = adminIds.length
    ? await supabase.from('profiles').select('id, email').in('id', adminIds)
    : { data: [] };
  const emailByAdminId = new Map((profiles || []).map((p) => [p.id, p.email]));

  tbody.innerHTML = '';
  data.forEach((log) => {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(log.created_at).toLocaleString('es-AR');
    tr.appendChild(tdDate);

    const tdAdmin = document.createElement('td');
    tdAdmin.textContent = log.admin_id ? (emailByAdminId.get(log.admin_id) || 'Admin eliminado') : '—';
    tr.appendChild(tdAdmin);

    const tdAction = document.createElement('td');
    tdAction.textContent = AUDIT_ACTION_LABELS[log.action] || log.action;
    tr.appendChild(tdAction);

    const tdTable = document.createElement('td');
    tdTable.textContent = log.target_table;
    tr.appendChild(tdTable);

    const tdActions = document.createElement('td');
    const detailBtn = document.createElement('button');
    detailBtn.type = 'button';
    detailBtn.className = 'action-btn';
    detailBtn.textContent = 'Ver detalle';
    detailBtn.addEventListener('click', () => {
      alert(
        `Tabla: ${log.target_table}\nID: ${log.target_id || '—'}\n\nDatos:\n${JSON.stringify(log.details, null, 2)}`
      );
    });
    tdActions.appendChild(detailBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

function initAdminPage() {
  document.getElementById('admin-content').style.display = 'block';

  document.getElementById('btn-refresh').addEventListener('click', fetchRequests);
  document.getElementById('btn-refresh-delivery').addEventListener('click', fetchDeliveryRequests);
  document.getElementById('btn-refresh-metrics').addEventListener('click', loadGlobalMetrics);
  document.getElementById('btn-refresh-categories').addEventListener('click', fetchCategories);
  document.getElementById('btn-refresh-coupons').addEventListener('click', fetchCoupons);
  document.getElementById('btn-refresh-stores-mod').addEventListener('click', fetchStoresForModeration);
  document.getElementById('btn-refresh-repartidores-mod').addEventListener('click', fetchRepartidoresForModeration);
  document.getElementById('btn-refresh-proofs').addEventListener('click', fetchPendingProofsAdmin);
  document.getElementById('btn-refresh-reviews-mod').addEventListener('click', fetchReportedReviews);
  document.getElementById('btn-refresh-revocations').addEventListener('click', fetchRevocationRequests);
  document.getElementById('btn-refresh-error-logs').addEventListener('click', fetchErrorLogs);
  document.getElementById('btn-refresh-support').addEventListener('click', fetchSupportTickets);
  document.getElementById('btn-refresh-audit-log').addEventListener('click', fetchAuditLog);

  setupCategoryForm();
  setupCouponForm();
  setupProductSearch();

  fetchRequests();
  fetchDeliveryRequests();
  loadGlobalMetrics();
  fetchCategories();
  fetchCoupons();
  fetchStoresForModeration();
  fetchRepartidoresForModeration();
  fetchPendingProofsAdmin();
  fetchReportedReviews();
  fetchRevocationRequests();
  fetchErrorLogs();
  fetchSupportTickets();
  fetchAuditLog();
}

guardPage({
  requireAuth: true,
  requireRole: 'admin',
  onReady: () => {
    initAdminPage();
  }
});
