// Panel de admin -> "Beneficios de comercios" (migraciones 160 y 161).
//
// El pago y la activación de un combo o servicio se coordinan en privado por WhatsApp, así
// que el equipo trabaja todos los días desde acá:
//   - Otorgar: el admin escribe el email del dueño de un comercio y le da un servicio (con
//     cantidad) o un combo, por los días que quiera. Los topes por comercio los controla la
//     base; acá además se muestra cuánto puede sumar para no ofrecer algo que va a fallar.
//   - Renovaciones: tarjeta con lo que vence en 3 días o menos (y lo vencido hace poco), con un
//     botón para avisarle al comercio por WhatsApp que tiene que abonar de nuevo y otro para
//     "Renovar +30 días" cuando ya abonó. La base le deja a cada admin un recordatorio diario
//     (`boost_renewal_reminder`) que lleva a esta tarjeta.
//   - Redes sociales: comercios que tienen el servicio vigente (para resubirles las historias).
//   - Tabla con todo (compras y regalos): filtros por texto, estado y combo o servicio.
// La lógica de estados, filtros y mensajes es pura y vive en admin-beneficios-utils.js.

import { supabase, showToast } from './auth-utils.js';
import { confirmDialog } from './confirm-dialog.js';
import { formatPrice } from './cart-utils.js';
import { friendlyError } from './friendly-error.js';
import { formatBoostDate, holdingsMap, serviceAvailability, holdingLabel } from './boost-utils.js';
import {
  benefitState, filterBenefits, renewalsDue, summarizeBenefits, storesWithService,
  renewalWhatsAppUrl, renewedEnd, STATE_LABEL, STATE_CLASS, STATE_FILTERS, RENEWAL_DAYS,
} from './admin-beneficios-utils.js';

const SOURCE_LABEL = { purchase: 'Compra', admin: 'Regalo del admin' };
/** Días que se suman con "Renovar". */
const RENEW_DAYS = 30;
/** Máximo de filas que devuelve la RPC (admin_list_benefits). */
const ROWS_LIMIT = 500;

const state = {
  services: [], plans: [], planItems: [], stores: [], holdings: {}, catalogLoaded: false,
  rows: [], phones: {}, filters: { q: '', itemId: '', state: '' }, busy: false,
};

const $ = (id) => document.getElementById(id);

function cell(text, child) {
  const td = document.createElement('td');
  if (child) td.appendChild(child); else td.textContent = text ?? '';
  return td;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

async function loadCatalog() {
  if (state.catalogLoaded) return true;
  const [svc, pl, items] = await Promise.all([
    supabase.from('boost_services')
      .select('id, name, price, max_per_store, duration_days, is_active, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('boost_plans').select('id, name, price, is_active, sort_order').eq('is_active', true).order('sort_order'),
    supabase.from('boost_plan_items').select('plan_id, service_id, quantity'),
  ]);
  if (svc.error || pl.error || items.error) {
    console.error('Error al cargar el catálogo de beneficios:', svc.error || pl.error || items.error);
    showToast('No se pudo cargar el catálogo de servicios y combos.', 'error');
    return false;
  }
  state.services = svc.data || [];
  state.plans = pl.data || [];
  state.planItems = items.data || [];
  state.catalogLoaded = true;
  return true;
}

// ---------------------------------------------------------------- otorgar

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

/** Si cambia el email, lo buscado antes deja de valer: no se puede otorgar a un comercio que ya no corresponde al email visible. */
function resetSearch() {
  state.stores = [];
  state.holdings = {};
  $('benefit-store').replaceChildren();
  $('benefit-grant-fields').style.display = 'none';
  $('benefit-found').textContent = '';
}

/** Errores que la base ya redacta en español (tope, dato inválido, no existe): se muestran tal cual. */
function dbMessage(error, fallback) {
  return ['23514', '22023', 'P0002'].includes(error?.code) ? error.message : friendlyError(error, fallback);
}

async function grant(e) {
  e.preventDefault();
  if (state.busy) return;
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
    `Vas a darle a "${store?.store_name}" ${type === 'plan' ? 'el' : `${quantity} x`} ${item?.name} por ${days} días. Empieza ahora. Si el comercio ya lo tiene vigente y lo que querés es renovarlo, usá "Renovar +${RENEW_DAYS} días" en la tabla.`,
    { title: 'Otorgar beneficio', confirmText: 'Otorgar' },
  );
  if (!ok) return;

  state.busy = true;
  const submit = $('benefit-form').querySelector('button[type="submit"]');
  submit.disabled = true;
  const { error } = await supabase.rpc('admin_grant_benefit', {
    p_store_id: storeId,
    p_plan_id: type === 'plan' ? itemId : null,
    p_service_id: type === 'plan' ? null : itemId,
    p_quantity: quantity,
    p_days: days,
    p_note: $('benefit-note').value.trim() || null,
  });
  state.busy = false;
  submit.disabled = false;
  if (error) {
    console.error('Error al otorgar el beneficio:', error);
    showToast(dbMessage(error, 'No se pudo otorgar el beneficio.'), 'error');
    return;
  }
  showToast('Beneficio otorgado. El comercio recibe un aviso.', 'success');
  $('benefit-note').value = '';
  await Promise.all([loadHoldings(), fetchRows()]);
}

// ---------------------------------------------------------- listado y vistas

/** WhatsApp de los comercios que aparecen en la tarjeta de renovaciones (lo lee el admin de `stores`). */
async function loadPhones(rows) {
  const ids = [...new Set(renewalsDue(rows).map((r) => r.store_id).filter((id) => id && !(id in state.phones)))];
  if (!ids.length) return;
  const { data, error } = await supabase.from('stores').select('id, whatsapp').in('id', ids);
  if (error) { console.error('Error al leer el WhatsApp de los comercios:', error); return; }
  ids.forEach((id) => { state.phones[id] = null; });
  (data || []).forEach((s) => { state.phones[s.id] = s.whatsapp || null; });
}

/**
 * Pide las compras y regalos (hasta 500) y redibuja todo. Con `quiet` solo actualiza la
 * insignia del menú (se usa al entrar al panel, sin tocar la pantalla).
 */
async function fetchRows({ quiet = false } = {}) {
  const tbody = $('benefits-tbody');
  if (tbody && !quiet) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando...</td></tr>';
  const { data, error } = await supabase.rpc('admin_list_benefits', { p_limit: ROWS_LIMIT });
  if (error) {
    console.error('Error al listar los beneficios:', error);
    if (tbody && !quiet) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:#ef4444;">Error al cargar los beneficios.</td></tr>';
    return false;
  }
  state.rows = data || [];
  if (quiet) {
    updateBadge(summarizeBenefits(state.rows));
    return true;
  }
  await loadPhones(state.rows);
  renderAll();
  return true;
}

function renderAll() {
  const now = Date.now();
  const summary = summarizeBenefits(state.rows, now);
  updateBadge(summary);
  renderAlert(summary);
  renderChips(summary);
  renderRenewals(now);
  renderRedes(now);
  renderTable(now);
}

/** Insignia roja del menú: compras en revisión + renovaciones por hacer. */
function updateBadge(summary) {
  const badge = $('benefits-badge');
  if (!badge) return;
  badge.textContent = String(summary.badge);
  badge.hidden = summary.badge === 0;
  badge.setAttribute('aria-label', `${summary.badge} pendientes en Beneficios de comercios`);
}

function setStateFilter(value) {
  state.filters.state = value;
  $('bf-state').value = value;
  renderChips(summarizeBenefits(state.rows));
  renderTable(Date.now());
}

function renderAlert(summary) {
  const box = $('benefits-alert');
  if (!box) return;
  box.replaceChildren();
  box.hidden = summary.review === 0;
  if (summary.review === 0) return;
  box.appendChild(el('span', null, `Hay ${summary.review} ${summary.review === 1 ? 'compra en revisión' : 'compras en revisión'}: el pago no cubre el valor, fue devuelto o el comercio ya tenía el máximo. Revisá cada caso y escribile al comercio. `));
  const btn = el('button', 'bf-link', 'Ver las que están en revisión');
  btn.type = 'button';
  btn.addEventListener('click', () => setStateFilter('en_revision'));
  box.appendChild(btn);
}

function renderChips(summary) {
  const chips = [['bf-chip-review', 'en_revision', `En revisión (${summary.review})`], ['bf-chip-expiring', 'vence_pronto', `Vencen pronto (${summary.expiring})`]];
  chips.forEach(([id, value, text]) => {
    const chip = $(id);
    if (!chip) return;
    chip.textContent = text;
    chip.classList.toggle('is-active', state.filters.state === value);
    chip.setAttribute('aria-pressed', String(state.filters.state === value));
  });
}

/** Tarjeta "Renovaciones": lo que vence en 3 días o menos y lo vencido hace poco. */
function renderRenewals(now) {
  const list = $('benefits-renewals');
  if (!list) return;
  const due = renewalsDue(state.rows, now);
  $('benefits-renewals-count').textContent = due.length ? `(${due.length})` : '';
  list.replaceChildren();
  if (!due.length) {
    list.appendChild(el('p', 'bf-empty', `No hay renovaciones por hacer: nada vence en los próximos ${RENEWAL_DAYS} días ni venció esta semana.`));
    return;
  }
  due.forEach((row) => {
    const item = el('div', 'bf-row');
    const main = el('div', 'bf-row__main');
    const title = el('div', 'bf-row__title');
    title.append(el('strong', null, row.store_name || '(comercio eliminado)'), ` · ${row.item_name}${row.plan_id ? ' (combo)' : ''}`);
    main.appendChild(title);
    const meta = el('div', 'bf-row__meta');
    meta.append(el('span', `bf-when${row.expired ? ' bf-when--expired' : ''}`, row.when), ` · ${formatBoostDate(new Date(row.ends_at))} · ${row.owner_email || 'sin email'}`);
    main.appendChild(meta);
    item.appendChild(main);

    const actions = el('div', 'bf-row__actions');
    const url = renewalWhatsAppUrl({ phone: state.phones[row.store_id], storeName: row.store_name, itemName: row.item_name, endsAt: row.ends_at, expired: row.expired });
    if (url) {
      const wa = el('a', 'action-btn btn-approve', 'Avisar por WhatsApp');
      wa.href = url;
      wa.target = '_blank';
      wa.rel = 'noopener noreferrer';
      actions.appendChild(wa);
    } else {
      const none = el('button', 'action-btn', 'Sin WhatsApp cargado');
      none.type = 'button';
      none.disabled = true;
      none.title = 'El comercio no cargó un WhatsApp: escribile al email';
      actions.appendChild(none);
    }
    actions.appendChild(renewButton(row));
    item.appendChild(actions);
    list.appendChild(item);
  });
}

/** Tarjeta "Redes sociales": comercios con el servicio vigente (para resubir sus historias). */
function renderRedes(now) {
  const list = $('benefits-redes');
  if (!list) return;
  const stores = storesWithService(state.rows, 'redes_sociales', state.planItems, now);
  $('benefits-redes-count').textContent = stores.length ? `(${stores.length})` : '';
  list.replaceChildren();
  if (!stores.length) {
    list.appendChild(el('p', 'bf-empty', 'Ningún comercio tiene Redes sociales vigente ahora.'));
    return;
  }
  stores.forEach((s) => {
    const item = el('div', 'bf-row');
    const main = el('div', 'bf-row__main');
    const title = el('div', 'bf-row__title');
    title.append(el('strong', null, s.store_name), ` · ${s.origins.join(', ')}`);
    main.appendChild(title);
    main.appendChild(el('div', 'bf-row__meta', `Hasta el ${formatBoostDate(new Date(s.endsAt))} · ${s.owner_email || 'sin email'}`));
    item.appendChild(main);
    list.appendChild(item);
  });
}

function renewButton(row) {
  const btn = el('button', 'action-btn btn-approve', `Renovar +${RENEW_DAYS} días`);
  btn.type = 'button';
  btn.addEventListener('click', () => renewRow(row));
  return btn;
}

/** Registra que el comercio ya abonó: suma 30 días (desde el fin si sigue vigente; desde hoy si ya venció). */
async function renewRow(row) {
  if (state.busy) return;
  const now = Date.now();
  const expired = benefitState(row, now) === 'vencido';
  const newEnd = renewedEnd(row, RENEW_DAYS, now);
  const ok = await confirmDialog(
    `"${row.item_name}" de ${row.store_name} ${expired ? 'venció' : 'vence'} el ${formatBoostDate(new Date(row.ends_at))} y pasaría a vencer el ${formatBoostDate(newEnd)} (+${RENEW_DAYS} días${expired ? ', contados desde hoy' : ''}). Hacelo solo si el comercio ya abonó: le llega un aviso de que quedó renovado.`,
    { title: 'Renovar', confirmText: `Renovar +${RENEW_DAYS} días` },
  );
  if (!ok) return;

  state.busy = true;
  const { error } = await supabase.rpc('admin_extend_benefit', { p_id: row.id, p_days: RENEW_DAYS });
  state.busy = false;
  if (error) {
    console.error('Error al renovar:', error);
    showToast(dbMessage(error, 'No se pudo renovar.'), 'error');
    return;
  }
  showToast('Renovado. El comercio recibe un aviso.', 'success');
  await fetchRows();
}

function renderTable(now) {
  const tbody = $('benefits-tbody');
  if (!tbody) return;
  const rows = filterBenefits(state.rows, state.filters, now, state.planItems);
  $('bf-count').textContent = `${rows.length} de ${state.rows.length}`;
  if (!rows.length) {
    const text = state.rows.length ? 'Ningún resultado con estos filtros.' : 'Todavía no hay compras ni regalos.';
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;">${text}</td></tr>`;
    return;
  }
  tbody.replaceChildren();
  rows.forEach((b) => {
    const st = benefitState(b, now);
    const tr = document.createElement('tr');
    tr.appendChild(cell(b.store_name || '(comercio eliminado)'));
    tr.appendChild(cell(b.owner_email || '—'));
    tr.appendChild(cell(`${b.item_name}${b.plan_id ? ' (combo)' : ''}`));
    tr.appendChild(cell(String(b.quantity)));
    const src = el('span', b.source === 'admin' ? 'status-badge status-suspended' : 'status-badge status-approved', SOURCE_LABEL[b.source] || b.source);
    tr.appendChild(cell('', src));
    tr.appendChild(cell('', el('span', `status-badge ${STATE_CLASS[st]}`, STATE_LABEL[st])));
    tr.appendChild(cell(b.ends_at ? formatBoostDate(new Date(b.ends_at)) : '—'));

    const actions = document.createElement('td');
    if (['vigente', 'vence_pronto', 'vencido'].includes(st)) actions.appendChild(renewButton(b));
    if (['active', 'needs_review'].includes(b.status) && st !== 'vencido') {
      const btn = el('button', 'action-btn btn-reject', 'Quitar');
      btn.type = 'button';
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog(
          `¿Quitarle "${b.item_name}" a ${b.store_name}?${b.source === 'purchase' ? ' Es una compra pagada: si corresponde, el reembolso se hace aparte en Mercado Pago.' : ''}`,
          { title: 'Quitar beneficio', confirmText: 'Quitar', danger: true },
        );
        if (!ok) return;
        const { error: err } = await supabase.rpc('admin_revoke_benefit', { p_id: b.id });
        if (err) { console.error(err); showToast(friendlyError(err, 'No se pudo quitar.'), 'error'); return; }
        showToast('Beneficio quitado.', 'success');
        await Promise.all([fetchRows(), loadHoldings()]);
      });
      actions.appendChild(btn);
    }
    tr.appendChild(actions);
    tbody.appendChild(tr);
  });
}

/** Opciones de los filtros (una sola vez, cuando ya se leyó el catálogo). */
function fillFilters() {
  const stateSelect = $('bf-state');
  if (stateSelect && !stateSelect.options.length) {
    STATE_FILTERS.forEach(([value, text]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = text;
      stateSelect.appendChild(opt);
    });
  }
  const itemSelect = $('bf-item');
  if (itemSelect && itemSelect.options.length <= 1) {
    const group = (label, list) => {
      const g = document.createElement('optgroup');
      g.label = label;
      list.forEach((it) => {
        const opt = document.createElement('option');
        opt.value = it.id;
        opt.textContent = it.name;
        g.appendChild(opt);
      });
      return g;
    };
    itemSelect.append(group('Combos', state.plans), group('Servicios (incluye los combos que los traen)', state.services));
  }
}

export async function loadBenefitsSection() {
  await loadCatalog();
  if (state.catalogLoaded && $('benefit-type')) { fillItems(); fillFilters(); }
  await fetchRows();
}

/** Al entrar al panel: deja lista la insignia del menú sin abrir la sección. Solo admin (la RPC lo exige). */
export async function refreshBenefitsBadge() {
  if (!$('benefits-badge')) return;
  await fetchRows({ quiet: true });
}

export function setupBenefitsSection() {
  if (!$('benefit-form')) return;
  $('btn-refresh-benefits').addEventListener('click', loadBenefitsSection);
  $('benefit-search').addEventListener('click', searchStore);
  $('benefit-email').addEventListener('input', resetSearch);
  $('benefit-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchStore(); } });
  $('benefit-type').addEventListener('change', fillItems);
  $('benefit-item').addEventListener('change', updateHint);
  $('benefit-store').addEventListener('change', loadHoldings);
  $('benefit-form').addEventListener('submit', grant);

  $('bf-q').addEventListener('input', (e) => { state.filters.q = e.target.value; renderTable(Date.now()); });
  $('bf-state').addEventListener('change', (e) => setStateFilter(e.target.value));
  $('bf-item').addEventListener('change', (e) => { state.filters.itemId = e.target.value; renderTable(Date.now()); });
  $('bf-chip-review').addEventListener('click', () => setStateFilter(state.filters.state === 'en_revision' ? '' : 'en_revision'));
  $('bf-chip-expiring').addEventListener('click', () => setStateFilter(state.filters.state === 'vence_pronto' ? '' : 'vence_pronto'));
}
