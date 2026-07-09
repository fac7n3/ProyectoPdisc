import { supabase, showToast, guardPage } from './auth-utils.js';
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

function initAdminPage() {
  document.getElementById('admin-content').style.display = 'block';

  document.getElementById('btn-refresh').addEventListener('click', fetchRequests);
  document.getElementById('btn-refresh-delivery').addEventListener('click', fetchDeliveryRequests);

  fetchRequests();
  fetchDeliveryRequests();
}

guardPage({
  requireAuth: true,
  requireRole: 'admin',
  onReady: () => {
    initAdminPage();
  }
});
