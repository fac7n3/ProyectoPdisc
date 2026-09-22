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

/**
 * El rubro que se muestra en la tarjeta es el que el dueño eligió en su panel
 * ("Perfil de mi comercio" -> Categoría, `stores.category_slug`), para que
 * cambiarlo ahí se vea acá enseguida. Antes esta página no leía esa columna:
 * contaba las categorías de los PRODUCTOS del comercio y mostraba la más
 * repetida, así que la etiqueta no cambiaba nunca por más que el dueño
 * eligiera otra (caso real 2026-09-22: un comercio pasó a "Ropa" en su panel y
 * la tarjeta siguió diciendo "Tecnología", que era el rubro de 6 de sus 10
 * productos).
 *
 * El conteo por productos queda SOLO como respaldo para las tiendas viejas que
 * tienen `category_slug` en NULL: son las 14 de seed (F11-06), insertadas a
 * mano sin pasar por approve_seller_request, que es quien copia el rubro desde
 * la solicitud (migración 71). Sin este respaldo esas tarjetas se quedarían sin
 * etiqueta. Se arregla solo en cuanto su dueño guarda el perfil una vez: el
 * formulario exige elegir categoría.
 */
function fallbackCategoryFromProducts(store) {
  const counts = new Map();
  (store.products || []).forEach((p) => {
    const catName = p.categories?.name;
    if (catName) counts.set(catName, (counts.get(catName) || 0) + 1);
  });
  let top = null, topCount = 0;
  counts.forEach((count, name) => { if (count > topCount) { top = name; topCount = count; } });
  return top;
}

async function loadStores() {
  try {
    // El embed de products(categories(name)) sigue solo para el respaldo de
    // arriba -- la RLS de products ya filtra a activos para anon
    // (products_select_public_active), así que no expone nada que la ficha del
    // comercio no muestre ya.
    const [{ data: stores, error }, categories] = await Promise.all([
      supabase
        .from('stores')
        .select('id, name, logo_url, zone, category_slug, products(categories(name))')
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
      store._categoryName = chosen || fallbackCategoryFromProducts(store);
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
