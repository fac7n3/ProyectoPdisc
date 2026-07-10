// Interacciones de la página principal
import { supabase } from './auth-utils.js';
import { getCart, saveCart, parsePrice, formatPrice, updateCartBadge, showToast, initCartButtons, initWishlist, buildPriceRow } from './cart-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights
// Importamos supabase para que el SDK procese los tokens OAuth
// que llegan en la URL cuando Google redirige de vuelta a esta página.




/** Búsqueda — redirección a página de resultados */
function initSearchRedirect() {
  const input = document.getElementById('search-input');
  const searchIcon = document.querySelector('.search-icon');

  function doSearch() {
    const query = input?.value.trim();
    if (!query) return;
    window.location.href = `./search.html?q=${encodeURIComponent(query)}`;
  }

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doSearch();
    }
  });

  searchIcon?.addEventListener('click', () => {
    if (input) doSearch();
  });
}

/** Categorías — redirección a página de resultados */
function initCategoriesRedirect() {
  const categoryItems = document.querySelectorAll('.category-bar__item:not(#cat-mas), .category-bar__dropdown-item');

  categoryItems.forEach(item => {
    if(item.id === 'cat-mas' || item.getAttribute('href') === './vender.html') return;

    item.addEventListener('click', (e) => {
      e.preventDefault();
      const filter = item.dataset.filter || item.id.replace('cat-', '');
      const mapFilter = filter === 'inicio' ? 'todas' : filter;
      
      if (mapFilter === 'todas') {
        window.location.href = './search.html';
      } else {
        window.location.href = `./search.html?cat=${encodeURIComponent(mapFilter)}`;
      }
    });
  });
}

/** Botón volver arriba */
function initScrollTop() {
  const btn = document.getElementById('scroll-top-btn');
  if (!btn) return;

  window.addEventListener('scroll', () => {
    btn.classList.toggle('scroll-top--visible', window.scrollY > 400);
  }, { passive: true });

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/** Navbar se compacta al hacer scroll */
function initNavbarScroll() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 10) {
      navbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.2)';
    } else {
      navbar.style.boxShadow = '';
    }
  }, { passive: true });
}

/** Obtener categorías de Supabase */
async function loadCategories() {
  const container = document.querySelector('.category-bar__inner');
  if (!container) return;

  try {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (error) throw error;
    if (!categories || categories.length === 0) return;

    // Limpiar contenedor y reconstruir con DOM API segura
    container.innerHTML = '';

    // Items estáticos: Inicio y Ofertas
    const inicio = document.createElement('a');
    inicio.href = '#';
    inicio.className = 'category-bar__item category-bar__item--active';
    inicio.id = 'cat-inicio';
    inicio.textContent = 'Inicio';
    container.appendChild(inicio);

    const ofertas = document.createElement('a');
    ofertas.href = '#';
    ofertas.className = 'category-bar__item';
    ofertas.id = 'cat-ofertas';
    ofertas.textContent = 'Ofertas';
    container.appendChild(ofertas);

    // Items dinámicos desde Supabase
    categories.forEach(cat => {
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'category-bar__item';
      link.dataset.filter = cat.slug;
      link.id = `cat-${cat.slug}`;
      link.textContent = cat.name;
      container.appendChild(link);
    });

    // Dropdown "Más"
    const dropdown = document.createElement('div');
    dropdown.className = 'category-bar__dropdown';

    const masLink = document.createElement('a');
    masLink.href = '#';
    masLink.className = 'category-bar__item';
    masLink.id = 'cat-mas';
    masLink.textContent = 'Más ';
    const chevron = document.createElement('i');
    chevron.className = 'fa-solid fa-chevron-down';
    chevron.style.cssText = 'font-size:0.625rem; opacity:0.5; margin-left:0.25rem;';
    masLink.appendChild(chevron);
    dropdown.appendChild(masLink);

    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'category-bar__dropdown-menu';
    dropdownMenu.setAttribute('role', 'menu');

    const venderLink = document.createElement('a');
    venderLink.href = './vender.html';
    venderLink.className = 'category-bar__dropdown-item';
    venderLink.setAttribute('role', 'menuitem');
    venderLink.style.cssText = 'color: var(--bl-primary); font-weight: 600;';
    const storeIcon = document.createElement('i');
    storeIcon.className = 'fa-solid fa-store';
    storeIcon.style.color = 'inherit';
    venderLink.appendChild(storeIcon);
    venderLink.append(' Vender');
    dropdownMenu.appendChild(venderLink);

    dropdown.appendChild(dropdownMenu);
    container.appendChild(dropdown);

    initCategoriesRedirect(); // re-bind listeners
  } catch (err) {
    console.error('Error fetching categories:', err);
  }
}

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
        image_url,
        stock,
        stores ( name )
      `)
      .eq('is_active', true)
      .limit(12);

    if (error) throw error;

    grid.innerHTML = ''; // Limpiar skeletons

    if (!products || products.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'grid-column: 1/-1; text-align: center; padding: 2rem; color: #64748b;';
      emptyMsg.textContent = 'Aún no hay productos disponibles.';
      grid.appendChild(emptyMsg);
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
      img.src = product.image_url || '../Assets/images/default-product.png';
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
    const errMsg = document.createElement('div');
    errMsg.style.cssText = 'grid-column: 1/-1; text-align: center; color: #ef4444; padding: 2rem;';
    errMsg.textContent = 'Error al cargar productos.';
    grid.innerHTML = '';
    grid.appendChild(errMsg);
  }
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
    carousel.innerHTML = ''; // Ocultar carrusel en caso de error
  }
}

// Inicializar todo
document.addEventListener('DOMContentLoaded', () => {
  initSearchRedirect();
  initCategoriesRedirect();
  initScrollTop();
  initNavbarScroll();
  initFarmaciaLink();
  updateCartBadge();
  
  // Cargar datos dinámicos
  loadCategories();
  loadStores();
  loadProducts();

  // Modal de detalle de producto
  if (typeof initProductModal === 'function') initProductModal();
});
