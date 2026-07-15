/**
 * comercios.js — pages/comercios.html
 * Baradero Local
 *
 * P1-4: página de listado real de comercios (antes el link "Comercios" del
 * footer apuntaba a search.html como workaround, sin ningún listado propio).
 * Mismo patrón de página que search.js: navbar/footer compartidos vía
 * nav-utils.js, grilla con .product-card reutilizada de home.css.
 */
import { supabase } from './auth-utils.js';
import { updateCartBadge, renderErrorState, renderEmptyState } from './cart-utils.js';
import { initCategoryBar, initSearchBox, initScrollTop, initNavbarScroll, initNotificationsBell } from './nav-utils.js';
import './speed-insights.js';

const grid = document.getElementById('stores-grid');
const countEl = document.getElementById('stores-count');

function buildStoreCard(store) {
  const card = document.createElement('a');
  card.href = `./comercio.html?id=${encodeURIComponent(store.id)}`;
  card.className = 'product-card';

  const imageWrap = document.createElement('div');
  imageWrap.className = 'product-card__image';
  if (store.logo_url) {
    const img = document.createElement('img');
    img.className = 'store-card__logo';
    img.src = store.logo_url;
    img.alt = store.name;
    img.loading = 'lazy';
    img.onerror = () => { img.src = '/img/no-image.svg'; };
    imageWrap.appendChild(img);
  } else {
    const fallback = document.createElement('span');
    fallback.className = 'store-card__logo-fallback';
    fallback.textContent = (store.name || '?').trim().charAt(0).toUpperCase();
    imageWrap.appendChild(fallback);
  }
  card.appendChild(imageWrap);

  const body = document.createElement('div');
  body.className = 'product-card__body';

  const name = document.createElement('h3');
  name.className = 'product-card__name';
  name.textContent = store.name;
  body.appendChild(name);

  const meta = document.createElement('div');
  meta.className = 'store-card__meta';
  if (store.zone) {
    const zoneRow = document.createElement('span');
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-location-dot';
    zoneRow.appendChild(icon);
    zoneRow.append(store.zone);
    meta.appendChild(zoneRow);
  }
  if (store._topCategory) {
    const catRow = document.createElement('span');
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-tag';
    catRow.appendChild(icon);
    catRow.append(store._topCategory);
    meta.appendChild(catRow);
  }
  body.appendChild(meta);

  card.appendChild(body);
  return card;
}

async function loadStores() {
  try {
    // Rubro más común: embed de products(categories(name)) -- RLS de products
    // ya filtra a solo activos para anon (products_select_public_active), así
    // que esto no expone nada que la ficha del comercio no muestre ya.
    const { data: stores, error } = await supabase
      .from('stores')
      .select('id, name, logo_url, zone, products(categories(name))')
      .eq('status', 'approved')
      .order('name');

    if (error) throw error;

    if (!stores || stores.length === 0) {
      renderEmptyState(grid, 'Todavía no hay comercios aprobados para mostrar.', 'fa-store-slash');
      countEl.textContent = '';
      return;
    }

    stores.forEach((store) => {
      const counts = new Map();
      (store.products || []).forEach((p) => {
        const catName = p.categories?.name;
        if (catName) counts.set(catName, (counts.get(catName) || 0) + 1);
      });
      let top = null, topCount = 0;
      counts.forEach((count, name) => { if (count > topCount) { top = name; topCount = count; } });
      store._topCategory = top;
    });

    grid.textContent = '';
    stores.forEach((store) => grid.appendChild(buildStoreCard(store)));
    countEl.textContent = `${stores.length} comercio${stores.length === 1 ? '' : 's'}`;
  } catch (err) {
    console.error('Error al cargar comercios:', err);
    renderErrorState(grid, 'No pudimos cargar los comercios.', loadStores);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  initScrollTop();
  initNavbarScroll();
  initNotificationsBell();

  initCategoryBar({ activeSlug: 'inicio' });
  initSearchBox({
    onSubmit: (term) => { window.location.href = `./search.html?q=${encodeURIComponent(term)}`; },
  });

  loadStores();
});
