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
    tr.innerHTML = `
      <td>${date}</td>
      <td><strong>${req.shop_name}</strong><br><small>${req.address || ''}</small></td>
      <td>${req.cuit || '-'}</td>
      <td>${req.category_slug || '-'}</td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td>
        ${req.status === 'pending' ? `
          <button class="action-btn btn-approve" data-id="${req.id}" title="Aprobar"><i class="fa-solid fa-check"></i></button>
          <button class="action-btn btn-reject" data-id="${req.id}" title="Rechazar"><i class="fa-solid fa-xmark"></i></button>
        ` : '-'}
      </td>
    `;
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

function initAdminPage() {
  document.getElementById('admin-content').style.display = 'block';
  
  document.getElementById('btn-refresh').addEventListener('click', fetchRequests);
  
  fetchRequests();
}

guardPage({
  requireAuth: true,
  requireRole: 'admin',
  onReady: () => {
    initAdminPage();
  }
});
