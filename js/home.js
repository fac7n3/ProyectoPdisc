// Interacciones de la página principal
import { supabase } from './auth-utils.js';
import { getCart, saveCart, parsePrice, formatPrice, updateCartBadge, showToast, initCartButtons, initWishlist, buildPriceRow, renderErrorState, renderEmptyState, renderActiveCoupons } from './cart-utils.js';
import { initCategoryBar, initSearchBox, initScrollTop, initNavbarScroll } from './nav-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights
// Importamos supabase para que el SDK procese los tokens OAuth
// que llegan en la URL cuando Google redirige de vuelta a esta página.

/** Obtener productos de Supabase */
async function loadProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  try {
    const { data: products, error } = await supabase
      .from('products')
      .select(`
        id,
        title,
        price,
        compare_at_price,
        offer_expires_at,
        image_url,
        stock,
        stores ( name )
      `)
      .eq('is_active', true)
      .limit(12);

    if (error) throw error;

    grid.innerHTML = ''; // Limpiar skeletons

    if (!products || products.length === 0) {
      renderEmptyState(grid, 'Aún no hay productos disponibles.', 'fa-box-open');
      return;
    }

    products.forEach(product => {
      const storeName = product.stores ? product.stores.name : 'Tienda';
      
      const article = document.createElement('article');
      article.className = 'product-card';
      article.id = product.id;
      article.dataset.price = product.price;

      // --- Image container ---
      const imageDiv = document.createElement('div');
      imageDiv.className = 'product-card__image';

      const img = document.createElement('img');
      img.src = product.image_url || '/img/no-image.svg';
      img.alt = product.title;
      img.loading = 'lazy';
      imageDiv.appendChild(img);

      const wishBtn = document.createElement('button');
      wishBtn.className = 'product-card__wishlist';
      wishBtn.setAttribute('aria-label', 'Agregar a favoritos');
      const heartIcon = document.createElement('i');
      heartIcon.className = 'fa-regular fa-heart';
      wishBtn.appendChild(heartIcon);
      imageDiv.appendChild(wishBtn);

      article.appendChild(imageDiv);

      // --- Body ---
      const body = document.createElement('div');
      body.className = 'product-card__body';

      const shopSpan = document.createElement('span');
      shopSpan.className = 'product-card__shop';
      const shopIcon = document.createElement('i');
      shopIcon.className = 'fa-solid fa-store';
      shopSpan.appendChild(shopIcon);
      shopSpan.append(` ${storeName}`);
      body.appendChild(shopSpan);

      const nameH3 = document.createElement('h3');
      nameH3.className = 'product-card__name';
      nameH3.textContent = product.title;
      body.appendChild(nameH3);

      body.appendChild(buildPriceRow(product));

      const shippingSpan = document.createElement('span');
      shippingSpan.className = 'product-card__shipping';
      shippingSpan.style.cursor = 'pointer';
      shippingSpan.title = 'Hacé clic para ver el costo de envío';
      shippingSpan.addEventListener('click', (e) => {
        e.preventDefault();
        import('./auth-utils.js').then(({ showToast }) => {
          showToast('Envío dentro de Baradero: $1.500. ¡Gratis en compras mayores a $20.000!');
        });
      });
      const truckIcon = document.createElement('i');
      truckIcon.className = 'fa-solid fa-truck';
      shippingSpan.appendChild(truckIcon);
      shippingSpan.append(' Calcular envío');
      body.appendChild(shippingSpan);

      const addBtn = document.createElement('button');
      addBtn.className = 'product-card__add';
      addBtn.dataset.productId = product.id;
      const cartIcon = document.createElement('i');
      cartIcon.className = 'fa-solid fa-cart-plus';
      addBtn.appendChild(cartIcon);
      addBtn.append(' Agregar');
      body.appendChild(addBtn);

      article.appendChild(body);
      grid.appendChild(article);
    });

    // Re-bind events to new DOM elements
    initCartButtons();
    initWishlist();

  } catch (err) {
    console.error('Error fetching products:', err);
    renderErrorState(grid, 'No se pudieron cargar los productos.', loadProducts);
  }
}

/** F12-07: cargar cupones/promociones activos, clic copia el código */
function loadCoupons() {
  const row = document.getElementById('coupons-row');
  if (!row) return;

  renderActiveCoupons(row, {
    emptyHide: document.getElementById('coupons-section'),
    onSelect: async (code) => {
      try {
        await navigator.clipboard.writeText(code);
        showToast(`Código "${code}" copiado. Pegalo en el carrito al pagar.`, 'success');
      } catch {
        showToast(`Código: ${code}`, 'default');
      }
    },
  });
}

/** Configurar modal de Farmacia de Turno */
function initFarmaciaLink() {
  const farmaciaLink = document.getElementById('farmacia-link');
  if (!farmaciaLink) return;

  farmaciaLink.addEventListener('click', (e) => {
    e.preventDefault();
    // Modal nativo básico para simular la funcionalidad
    const d = new Date();
    const dia = d.toLocaleDateString('es-AR', { weekday: 'long' });
    alert(`Farmacia de turno hoy (${dia}):\n\nFarmacia Central\n📍 San Martín 1234\n📞 3329-420000\nHorario: 24hs`);
  });
}

/** Obtener locales destacados de Supabase para el carrusel */
async function loadStores() {
  const carousel = document.getElementById('stores-carousel');
  if (!carousel) return;

  try {
    const { data: stores, error } = await supabase
      .from('stores')
      .select('id, name, logo_url')
      .eq('status', 'approved')
      .limit(15);

    if (error) throw error;

    carousel.innerHTML = ''; // Limpiar skeletons

    if (!stores || stores.length === 0) {
      carousel.style.display = 'none';
      return;
    }

    stores.forEach(store => {
      const link = document.createElement('a');
      link.href = `./comercio.html?id=${store.id}`;
      link.className = 'store-logo-link';
      link.setAttribute('aria-label', `Ir a ${store.name}`);

      if (store.logo_url) {
        const img = document.createElement('img');
        img.src = store.logo_url;
        img.alt = store.name;
        img.className = 'store-logo-img';
        img.loading = 'lazy';
        link.appendChild(img);
      } else {
        // Fallback si no tiene logo
        const text = document.createElement('span');
        text.className = 'store-logo-text';
        // Mostrar solo las primeras letras/palabras
        text.textContent = store.name.substring(0, 15) + (store.name.length > 15 ? '...' : '');
        link.appendChild(text);
      }

      carousel.appendChild(link);
    });

  } catch (err) {
    console.error('Error fetching stores:', err);
    carousel.innerHTML = '';
    carousel.style.display = 'none'; // Ocultar carrusel en caso de error (no es contenido crítico)
  }
}

// Inicializar todo
document.addEventListener('DOMContentLoaded', () => {
  initScrollTop();
  initNavbarScroll();
  initFarmaciaLink();
  updateCartBadge();

  // Navbar de categorías (mega-menú) + buscador con autocompletado (compartidos)
  initCategoryBar({ activeSlug: 'inicio' });
  initSearchBox({
    onSubmit: (term) => { window.location.href = `./search.html?q=${encodeURIComponent(term)}`; },
  });

  // Cargar datos dinámicos
  loadStores();
  loadProducts();
  loadCoupons();

  // Modal de detalle de producto
  if (typeof initProductModal === 'function') initProductModal();
});
