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
const filterEl = document.getElementById('store-filter');

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

    const render = (slug) => {
      const shown = slug ? stores.filter((s) => s.category_slug === slug) : stores;
      grid.textContent = '';
      shown.forEach((store) => grid.appendChild(buildStoreCard(store)));
      countEl.textContent = `${shown.length} comercio${shown.length === 1 ? '' : 's'}`;
      filterEl.querySelectorAll('button').forEach((b) =>
        b.setAttribute('aria-pressed', String((b.dataset.slug || '') === (slug || ''))));
    };

    // Chips de rubro: solo los rubros que tienen al menos un comercio aprobado.
    const counts = new Map();
    stores.forEach((s) => { if (s._categoryName) counts.set(s.category_slug, (counts.get(s.category_slug) || 0) + 1); });
    const chips = [{ slug: '', label: 'Todos' }, ...categories
      .filter((c) => counts.has(c.slug))
      .map((c) => ({ slug: c.slug, label: `${c.name} (${counts.get(c.slug)})` }))];
    filterEl.textContent = '';
    if (chips.length > 2) {
      chips.forEach(({ slug, label }) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'store-filter__chip';
        b.dataset.slug = slug;
        b.textContent = label;
        b.addEventListener('click', () => render(slug));
        filterEl.appendChild(b);
      });
      filterEl.hidden = false;
    }
    render('');
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
