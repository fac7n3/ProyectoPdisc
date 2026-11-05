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
import { updateCartBadge, renderErrorState, renderEmptyState, buildStoreCard } from './cart-utils.js';
import { initCategoryBar, initSearchBox, initScrollTop, initNavbarScroll, initNotificationsBell, initAccountMenu, getCategories } from './nav-utils.js';
import './speed-insights.js';

const grid = document.getElementById('stores-grid');
const countEl = document.getElementById('stores-count');

// buildStoreCard vive en cart-utils.js: la usan este listado y los resultados
// de búsqueda.

/*
 * El rubro de la tarjeta sale de `stores.category_slug` (el que elige el dueño en
 * "Perfil de mi comercio"), resuelto a nombre con getCategories(). Antes, para los
 * comercios sin rubro cargado, se contaban las categorías de sus productos con un
 * embed products(categories(name)) que sumaba 26 KB a esta página; la migración 154
 * cargó el rubro de esos comercios y se sacó el embed. Un comercio sin rubro (sin
 * productos) sale sin etiqueta hasta que su dueño guarde el perfil.
 */

async function loadStores() {
  try {
    const [{ data: stores, error }, categories] = await Promise.all([
      supabase
        .from('stores')
        .select('id, name, logo_url, zone, category_slug')
        .eq('status', 'approved')
        .order('name'),
      getCategories(),
    ]);

    if (error) throw error;

    if (!stores || stores.length === 0) {
      renderEmptyState(grid, 'Todavía no hay comercios aprobados para mostrar.', 'fa-store-slash');
      countEl.textContent = '';
      return;
    }

    stores.forEach((store) => {
      const chosen = store.category_slug
        ? categories.find((c) => c.slug === store.category_slug)?.name
        : null;
      store._categoryName = chosen || null;
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
  initAccountMenu();

  initCategoryBar({ activeSlug: 'inicio' });
  initSearchBox({
    onSubmit: (term) => { window.location.href = `./search.html?q=${encodeURIComponent(term)}`; },
  });

  loadStores();
});
