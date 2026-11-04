/**
 * price-compare-ui.js — "Este producto en otros comercios", en la ficha de un
 * producto (modal de producto y producto.html).
 *
 * Es el mismo comparador de la búsqueda (js/search.js, js/price-compare-utils.js)
 * pero para un solo producto: lista el mismo producto en cada comercio del más
 * barato al más caro, con cuánto más sale que el mejor precio y, si la persona
 * ya compartió su ubicación, a qué distancia queda cada local. La regla de "es
 * el mismo producto" vive en la base (same_product_offers, migración 148).
 *
 * Es un extra: si algo falla (la función no existe, no hay red) no se dibuja
 * nada y la ficha queda como estaba.
 */
import { supabase } from './auth-utils.js';
import { formatPrice } from './cart-utils.js';
import { offersForProduct, distanceMeters, formatDistance } from './price-compare-utils.js';

// La misma clave que usan el mapa del inicio y el comparador de la búsqueda.
const NEARBY_LOCATION_KEY = 'bl_nearby_location';

function savedLocation() {
  try {
    const loc = JSON.parse(sessionStorage.getItem(NEARBY_LOCATION_KEY) || 'null');
    return loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) ? loc : null;
  } catch {
    return null;
  }
}

/** Map store_id -> distancia en metros, solo de los comercios que cargaron su ubicación. */
async function distancesTo(storeIds, loc) {
  const out = new Map();
  if (!loc) return out;
  const { data, error } = await supabase.from('stores').select('id, lat, lng').in('id', storeIds).not('lat', 'is', null);
  if (error) return out;
  (data || []).forEach((s) => out.set(s.id, distanceMeters(loc, { lat: s.lat, lng: s.lng })));
  return out;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Dibuja la lista en `slot`. No hace nada (y deja el hueco vacío) si el producto
 * no está en otro comercio.
 * @param {HTMLElement|null} slot
 * @param {{ productId: string, storeId?: string|null }} product  el de la ficha
 * @param {{ onOpen: (item: object) => void }} opts  al elegir otro comercio
 */
export async function renderSameProductOffers(slot, { productId, storeId = null }, { onOpen }) {
  if (!slot || !productId) return;
  slot.textContent = '';

  const { data, error } = await supabase.rpc('same_product_offers', { p_product_ids: [productId] });
  if (error || !slot.isConnected) return;
  const offers = offersForProduct(data, { productId, storeId });
  if (!offers) return;

  const distances = await distancesTo([...new Set(offers.map((o) => o.store_id))], savedLocation());
  if (!slot.isConnected) return;

  const section = el('section', 'bl-compare');
  section.setAttribute('aria-label', 'Este producto en otros comercios');
  section.appendChild(el('h3', 'bl-compare__title', 'Este producto en otros comercios'));

  const list = el('ul', 'bl-compare__list');
  offers.forEach((o) => {
    const notes = [];
    if (o.isCheapest) notes.push('Mejor precio');
    else notes.push(`+${formatPrice(o.diff)} que el más barato`);
    if (distances.has(o.store_id)) notes.push(`a ${formatDistance(distances.get(o.store_id))}`);
    if (o.isCurrent) notes.unshift('Estás viendo este');

    const li = el('li');
    const row = o.isCurrent ? el('div', 'bl-compare__row is-current') : el('button', 'bl-compare__row');
    if (!o.isCurrent) {
      row.type = 'button';
      row.setAttribute('aria-label', `${o.store_name}, ${formatPrice(o.price)}. ${notes.join(', ')}. Ver producto`);
      row.addEventListener('click', () => onOpen(o));
    }
    const text = el('span', 'bl-compare__text');
    text.append(el('span', 'bl-compare__store', o.store_name), el('span', 'bl-compare__note', notes.join(' · ')));
    row.append(text, el('span', `bl-compare__price${o.isCheapest ? ' is-best' : ''}`, formatPrice(o.price)));
    li.appendChild(row);
    list.appendChild(li);
  });
  section.appendChild(list);
  slot.appendChild(section);
}
