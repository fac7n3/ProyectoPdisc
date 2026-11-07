// Panel de admin -> "Beneficios de comercios" (migración 160).
//
// El admin escribe el email del dueño de un comercio y le otorga un servicio
// (con cantidad) o un combo, por la cantidad de días que quiera. Los topes por
// comercio (boost_services.max_per_store) los controla la base: si no entra, la
// base lo rechaza con un mensaje; acá además se muestra cuánto puede sumar para
// no ofrecer algo que va a fallar. También lista lo que tiene cada comercio
// (compras y regalos) y permite quitarlo.

import { supabase, showToast } from './auth-utils.js';
import { confirmDialog } from './confirm-dialog.js';
import { formatPrice } from './cart-utils.js';
import { friendlyError } from './friendly-error.js';
import { formatBoostDate, holdingsMap, serviceAvailability, holdingLabel } from './boost-utils.js';

const SOURCE_LABEL = { purchase: 'Compra', admin: 'Regalo del admin' };
const STATUS_LABEL = { active: 'Vigente', pending: 'Esperando pago', needs_review: 'En revisión', cancelled: 'Quitado' };
const STATUS_CLASS = { active: 'status-approved', pending: 'status-suspended', needs_review: 'status-suspended', cancelled: 'status-rejected' };

const state = { services: [], plans: [], stores: [], holdings: {}, catalogLoaded: false };

const $ = (id) => document.getElementById(id);

function cell(text, child) {
  const td = document.createElement('td');
  if (child) td.appendChild(child); else td.textContent = text ?? '';
  return td;
}

async function loadCatalog() {
  if (state.catalogLoaded) return true;
  const [svc, pl] = await Promise.all([
    supabase.from('boost_services')
      .select('id, name, price, max_per_store, duration_days, is_active, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('boost_plans').select('id, name, price, is_active, sort_order').eq('is_active', true).order('sort_order'),
  ]);
  if (svc.error || pl.error) {
    console.error('Error al cargar el catálogo de beneficios:', svc.error || pl.error);
    showToast('No se pudo cargar el catálogo de servicios y combos.', 'error');
    return false;
  }
  state.services = svc.data || [];
  state.plans = pl.data || [];
  state.catalogLoaded = true;
  return true;
}

function selectedStoreId() {
  return $('benefit-store')?.value || '';
}

/** Rellena el desplegable de elementos según el tipo (servicio o combo). */
function fillItems() {
  const type = $('benefit-type').value;
  const select = $('benefit-item');
  select.replaceChildren();
  const list = type === 'plan' ? state.plans : state.services;
  list.forEach((it) => {
    const opt = document.createElement('option');
    opt.value = it.id;
    opt.textContent = `${it.name} (${formatPrice(it.price)})`;
    select.appendChild(opt);
  });
  updateHint();
}

/** Muestra cuánto tiene ya el comercio del elemento elegido y ajusta el tope de cantidad. */
function updateHint() {
  const hint = $('benefit-hint');
  const qty = $('benefit-qty');
  const type = $('benefit-type').value;
  const id = $('benefit-item').value;
  qty.disabled = type === 'plan';
  if (type === 'plan') {
    qty.value = '1';
    hint.textContent = 'El combo suma todos sus servicios. Si el comercio ya tiene el máximo de alguno, la base lo va a rechazar y te dice cuál.';
    return;
  }
  const service = state.services.find((s) => s.id === id);
  if (!service || !selectedStoreId()) {
    hint.textContent = 'Buscá primero el email del comercio.';
    return;
  }
  const held = state.holdings[service.id] ?? 0;
  const avail = serviceAvailability(service, held);
  qty.max = String(avail.canBuy ? avail.maxQty : 1);
  if (Number(qty.value) > Number(qty.max)) qty.value = qty.max;
  hint.textContent = `${holdingLabel(service, held)}.${avail.canBuy ? '' : ' No se puede sumar más hasta que venza alguno.'}`;
}

async function searchStore() {
  const email = $('benefit-email').value.trim();
  const found = $('benefit-found');
  if (!email) { showToast('Escribí el email del comercio.', 'error'); return; }
  if (!(await loadCatalog())) return;

  found.textContent = 'Buscando...';
  const { data, error } = await supabase.rpc('admin_find_stores_by_email', { p_email: email });
  if (error) {
    console.error('Error al buscar el comercio:', error);
    found.textContent = '';
    showToast(friendlyError(error, 'No se pudo buscar el comercio.'), 'error');
    return;
  }
  state.stores = data || [];
  const select = $('benefit-store');
  select.replaceChildren();
  $('benefit-grant-fields').style.display = state.stores.length === 0 ? 'none' : 'contents';
  if (state.stores.length === 0) {
    found.textContent = 'No hay ningún comercio con ese email de dueño.';
    return;
  }
  state.stores.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.store_id;
    opt.textContent = `${s.store_name}${s.store_status === 'approved' ? '' : ` (${s.store_status})`}`;
    select.appendChild(opt);
  });
  found.textContent = state.stores.length === 1
    ? `Comercio encontrado: ${state.stores[0].store_name}.`
    : `Se encontraron ${state.stores.length} comercios: elegí uno.`;
  select.hidden = state.stores.length === 1;
  fillItems();
  await loadHoldings();
}

async function loadHoldings() {
  const id = selectedStoreId();
  state.holdings = {};
  if (id) {
    const { data, error } = await supabase.rpc('get_store_benefits', { p_store_id: id });
    if (error) console.error('Error al leer los beneficios del comercio:', error);
    else state.holdings = holdingsMap(data);
  }
  updateHint();
}

async function grant(e) {
  e.preventDefault();
  const storeId = selectedStoreId();
  if (!storeId) { showToast('Buscá primero el comercio.', 'error'); return; }
  const type = $('benefit-type').value;
  const itemId = $('benefit-item').value;
  const quantity = type === 'plan' ? 1 : parseInt($('benefit-qty').value, 10);
  const days = parseInt($('benefit-days').value, 10);
  if (!itemId || !Number.isInteger(quantity) || quantity < 1 || !Number.isInteger(days) || days < 1 || days > 365) {
    showToast('Revisá el elemento, la cantidad y los días (1 a 365).', 'error');
    return;
  }
  const store = state.stores.find((s) => s.store_id === storeId);
  const item = (type === 'plan' ? state.plans : state.services).find((x) => x.id === itemId);
  const ok = await confirmDialog(
    `Vas a darle a "${store?.store_name}" ${type === 'plan' ? 'el' : `${quantity} x`} ${item?.name} por ${days} días, sin cargo. Empieza ahora.`,
    { title: 'Otorgar beneficio', confirmText: 'Otorgar' },
  );
  if (!ok) return;

  const { error } = await supabase.rpc('admin_grant_benefit', {
    p_store_id: storeId,
    p_plan_id: type === 'plan' ? itemId : null,
    p_service_id: type === 'plan' ? null : itemId,
    p_quantity: quantity,
    p_days: days,
    p_note: $('benefit-note').value.trim() || null,
  });
  if (error) {
    console.error('Error al otorgar el beneficio:', error);
    // 23514 = pasaría el tope por comercio: la base ya dice cuál, en español.
    showToast(error.code === '23514' ? error.message : friendlyError(error, 'No se pudo otorgar el beneficio.'), 'error');
    return;
  }
  showToast('Beneficio otorgado. El comercio recibe un aviso.', 'success');
  $('benefit-note').value = '';
  await Promise.all([loadHoldings(), fetchBenefits()]);
}

export async function fetchBenefits() {
  const tbody = $('benefits-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando...</td></tr>';
  const { data, error } = await supabase.rpc('admin_list_benefits', { p_limit: 200 });
  if (error) {
    console.error('Error al listar los beneficios:', error);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#ef4444;">Error al cargar los beneficios.</td></tr>';
    return;
  }
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Todavía no hay compras ni regalos.</td></tr>';
    return;
  }
  const now = Date.now();
  tbody.replaceChildren();
  data.forEach((b) => {
    const expired = b.status === 'active' && b.ends_at && new Date(b.ends_at).getTime() <= now;
    const tr = document.createElement('tr');
    tr.appendChild(cell(b.store_name || '(comercio eliminado)'));
    tr.appendChild(cell(b.owner_email || '—'));
    tr.appendChild(cell(`${b.item_name}${b.plan_id ? ' (combo)' : ''}`));
    tr.appendChild(cell(String(b.quantity)));
    const src = document.createElement('span');
    src.className = b.source === 'admin' ? 'status-badge status-suspended' : 'status-badge status-approved';
    src.textContent = SOURCE_LABEL[b.source] || b.source;
    tr.appendChild(cell('', src));
    const st = document.createElement('span');
    st.className = `status-badge ${expired ? 'status-rejected' : STATUS_CLASS[b.status] || ''}`;
    st.textContent = expired ? 'Vencido' : STATUS_LABEL[b.status] || b.status;
    tr.appendChild(cell('', st));
    tr.appendChild(cell(b.ends_at ? formatBoostDate(new Date(b.ends_at)) : '—'));

    const actions = document.createElement('td');
    if (['active', 'needs_review'].includes(b.status) && !expired) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'action-btn btn-reject';
      btn.textContent = 'Quitar';
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog(
          `¿Quitarle "${b.item_name}" a ${b.store_name}?${b.source === 'purchase' ? ' Es una compra pagada: si corresponde, el reembolso se hace aparte en Mercado Pago.' : ''}`,
          { title: 'Quitar beneficio', confirmText: 'Quitar', danger: true },
        );
        if (!ok) return;
        const { error: err } = await supabase.rpc('admin_revoke_benefit', { p_id: b.id });
        if (err) { console.error(err); showToast(friendlyError(err, 'No se pudo quitar.'), 'error'); return; }
        showToast('Beneficio quitado.', 'success');
        await Promise.all([fetchBenefits(), loadHoldings()]);
      });
      actions.appendChild(btn);
    }
    tr.appendChild(actions);
    tbody.appendChild(tr);
  });
}

export async function loadBenefitsSection() {
  await loadCatalog();
  if (state.catalogLoaded && $('benefit-type')) fillItems();
  await fetchBenefits();
}

export function setupBenefitsSection() {
  if (!$('benefit-form')) return;
  $('btn-refresh-benefits').addEventListener('click', loadBenefitsSection);
  $('benefit-search').addEventListener('click', searchStore);
  $('benefit-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchStore(); } });
  $('benefit-type').addEventListener('change', fillItems);
  $('benefit-item').addEventListener('change', updateHint);
  $('benefit-store').addEventListener('change', loadHoldings);
  $('benefit-form').addEventListener('submit', grant);
}
