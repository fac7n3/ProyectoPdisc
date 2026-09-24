/**
 * Tarjeta "Cómo transferirle a este comercio": monto, alias, CBU/CVU,
 * titular, banco, número de pedido para el motivo, y WhatsApp del comercio,
 * cada dato con su botón "Copiar". La usan:
 *   - carrito.js, en la pantalla que aparece después de "Iniciar pago" con
 *     "Transferencia bancaria" elegida (una tarjeta por pedido/comercio);
 *   - perfil.js, en "Mis compras", en cada pedido por transferencia que
 *     sigue pendiente (por si el cliente vuelve más tarde a pagar).
 * Estilos en Assets/styles/carrito.css (bloque `trf-`), que carga también
 * perfil.html. Lógica pura y tests en js/transfer-details-utils.js.
 *
 * Todos los datos vienen de lo que cargó el vendedor: se escriben con
 * textContent, nunca innerHTML.
 */

import { formatPrice } from './cart-utils.js';
import {
  buildBankFields, extraTransferNotes, hasTransferData, buildContactInfo,
  shortOrderRef, amountForCopy, buildTransferWhatsappMessage,
} from './transfer-details-utils.js';

const TRANSFER_COLUMNS = 'id, transfer_info, transfer_alias, transfer_cbu, transfer_holder, transfer_bank';

/**
 * Trae nombre, contacto y datos bancarios de los comercios pedidos.
 * Los datos bancarios van en una consulta APARTE, a propósito (mismo
 * criterio que la migración 69): si la 106 no estuviera aplicada en alguna
 * base, pedir sus columnas da 400 -- se reintenta solo con `transfer_info`
 * y lo peor que pasa es que se ve el texto libre, no que se rompa el pago.
 * @returns {Promise<Map<string, object>>} storeId -> fila combinada
 */
export async function fetchStoreTransferData(supabase, storeIds) {
  const ids = [...new Set((storeIds || []).filter(Boolean))];
  const byId = new Map();
  if (ids.length === 0) return byId;

  const [base, bank] = await Promise.all([
    supabase.from('stores').select('id, name, whatsapp, contact_method').in('id', ids),
    supabase.from('stores').select(TRANSFER_COLUMNS).in('id', ids),
  ]);

  if (base.error) console.error('Error al cargar los comercios:', base.error);
  (base.data || []).forEach((s) => byId.set(s.id, { ...s }));

  let bankRows = bank.data;
  if (bank.error) {
    console.error('Error al cargar los datos de transferencia (se reintenta sin las columnas nuevas):', bank.error);
    const legacy = await supabase.from('stores').select('id, transfer_info').in('id', ids);
    if (legacy.error) console.error('Error al cargar los datos de transferencia:', legacy.error);
    bankRows = legacy.data;
  }
  (bankRows || []).forEach((s) => byId.set(s.id, { ...(byId.get(s.id) || { id: s.id }), ...s }));

  return byId;
}

/**
 * Copia al portapapeles. `navigator.clipboard` exige contexto seguro y en
 * algunos navegadores viejos de Android no existe: ahí se cae al truco del
 * textarea + execCommand, que sigue andando dentro del gesto del click.
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* cae al fallback */ }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

/** Botón "Copiar" que confirma en el propio botón (y para lectores de
 *  pantalla, en la región viva de la tarjeta) sin depender de un toast. */
function buildCopyButton(value, label, liveRegion) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'trf-copy';
  btn.setAttribute('aria-label', `Copiar ${label.toLowerCase()}`);

  const icon = document.createElement('i');
  icon.className = 'fa-regular fa-copy';
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = 'Copiar';
  btn.append(icon, text);

  let timer = null;
  btn.addEventListener('click', async () => {
    const ok = await copyToClipboard(value);
    btn.classList.toggle('is-copied', ok);
    icon.className = ok ? 'fa-solid fa-check' : 'fa-solid fa-triangle-exclamation';
    text.textContent = ok ? '¡Copiado!' : 'No se pudo';
    if (liveRegion) liveRegion.textContent = ok ? `${label} copiado.` : `No se pudo copiar ${label.toLowerCase()}. Seleccionalo a mano.`;
    clearTimeout(timer);
    timer = setTimeout(() => {
      btn.classList.remove('is-copied');
      icon.className = 'fa-regular fa-copy';
      text.textContent = 'Copiar';
    }, 2000);
  });
  return btn;
}

function buildRow({ label, display, copy, mono = false, hint = null }, liveRegion) {
  const row = document.createElement('div');
  row.className = 'trf-row';

  const body = document.createElement('div');
  body.className = 'trf-row__body';
  const dt = document.createElement('span');
  dt.className = 'trf-row__label';
  dt.textContent = label;
  const dd = document.createElement('span');
  dd.className = mono ? 'trf-row__value trf-row__value--mono' : 'trf-row__value';
  dd.textContent = display;
  body.append(dt, dd);
  if (hint) {
    const h = document.createElement('span');
    h.className = 'trf-row__hint';
    h.textContent = hint;
    body.appendChild(h);
  }
  row.appendChild(body);

  if (copy) row.appendChild(buildCopyButton(copy, label, liveRegion));
  return row;
}

function buildGroupTitle(iconClass, text) {
  const h = document.createElement('h4');
  h.className = 'trf-group__title';
  const i = document.createElement('i');
  i.className = iconClass;
  i.setAttribute('aria-hidden', 'true');
  h.append(i, ` ${text}`);
  return h;
}

/**
 * @param {object} opts
 * @param {object} opts.store  fila de fetchStoreTransferData (puede faltar)
 * @param {string} opts.storeName nombre de respaldo si `store` no llegó
 * @param {string} opts.orderId
 * @param {number} opts.total  monto del pedido, en pesos enteros
 * @param {boolean} [opts.compact] versión para "Mis compras": sin encabezado
 *   propio (la tarjeta del pedido ya muestra comercio y número).
 * @returns {HTMLElement}
 */
export function buildTransferCard({ store, storeName, orderId, total, compact = false }) {
  const name = store?.name || storeName || 'Comercio';
  const orderRef = shortOrderRef(orderId);
  const amountLabel = formatPrice(total);

  const card = document.createElement(compact ? 'div' : 'article');
  card.className = compact ? 'trf-card trf-card--compact' : 'trf-card';

  const live = document.createElement('p');
  live.className = 'sr-only';
  live.setAttribute('aria-live', 'polite');

  if (!compact) {
    const head = document.createElement('header');
    head.className = 'trf-card__head';
    const h3 = document.createElement('h3');
    h3.className = 'trf-card__store';
    h3.textContent = name;
    const ref = document.createElement('span');
    ref.className = 'trf-card__order';
    ref.textContent = `Pedido #${orderRef}`;
    head.append(h3, ref);
    card.appendChild(head);
  }

  // Monto: lo primero que se necesita, y lo que más se tipea mal a mano.
  const amount = document.createElement('div');
  amount.className = 'trf-amount';
  const amountBody = document.createElement('div');
  const amountLabelEl = document.createElement('span');
  amountLabelEl.className = 'trf-amount__label';
  amountLabelEl.textContent = 'Monto exacto a transferir';
  const amountValue = document.createElement('span');
  amountValue.className = 'trf-amount__value';
  amountValue.textContent = amountLabel;
  amountBody.append(amountLabelEl, amountValue);
  amount.append(amountBody, buildCopyButton(amountForCopy(total), 'Monto', live));
  card.appendChild(amount);

  // Datos bancarios.
  const bankGroup = document.createElement('div');
  bankGroup.className = 'trf-group';
  bankGroup.appendChild(buildGroupTitle('fa-solid fa-building-columns', 'Datos para transferir'));

  if (hasTransferData(store)) {
    buildBankFields(store).forEach((f) => {
      bankGroup.appendChild(buildRow({
        label: f.label,
        display: f.display,
        copy: f.copy,
        mono: f.key === 'cbu' || f.key === 'alias',
        hint: f.key === 'holder' ? 'Revisá que coincida antes de confirmar la transferencia.' : null,
      }, live));
    });
    const notes = extraTransferNotes(store);
    if (notes) {
      bankGroup.appendChild(buildRow({ label: 'Otros datos', display: notes, copy: notes }, live));
    }
  } else {
    const missing = document.createElement('p');
    missing.className = 'trf-missing';
    missing.textContent = `${name} todavía no cargó sus datos para transferencia. Escribile para pedírselos antes de pagar.`;
    bankGroup.appendChild(missing);
  }

  // El número de pedido en el motivo/concepto le permite al comercio saber
  // qué pago es cuál sin tener que adivinar por el monto.
  bankGroup.appendChild(buildRow({
    label: 'Motivo / referencia',
    display: `Pedido #${orderRef}`,
    copy: `Pedido ${orderRef}`,
    hint: 'Pegalo en el campo "motivo" o "concepto" de tu banco.',
  }, live));
  card.appendChild(bankGroup);

  // Contacto del comercio: solo WhatsApp -- el comprador nunca puede llamar
  // al vendedor, solo escribirle (ver store-contact-utils.js).
  const contact = buildContactInfo(store);
  if (contact.whatsapp) {
    const contactGroup = document.createElement('div');
    contactGroup.className = 'trf-group';
    contactGroup.appendChild(buildGroupTitle('fa-brands fa-whatsapp', 'Contacto del comercio'));
    contactGroup.appendChild(buildRow({ label: 'WhatsApp', display: contact.whatsapp, copy: contact.whatsappDigits }, live));

    const actions = document.createElement('div');
    actions.className = 'trf-contact-actions';
    const wa = document.createElement('a');
    wa.className = 'trf-action trf-action--wa';
    const text = encodeURIComponent(buildTransferWhatsappMessage({ storeName: name, orderRef, amountLabel }));
    wa.href = `https://wa.me/${contact.whatsappDigits}?text=${text}`;
    wa.target = '_blank';
    wa.rel = 'noopener noreferrer';
    wa.innerHTML = '<i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Avisar que transferí';
    actions.appendChild(wa);
    contactGroup.appendChild(actions);
    card.appendChild(contactGroup);
  }

  card.appendChild(live);
  return card;
}
