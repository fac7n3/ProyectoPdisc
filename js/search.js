// Lógica para la página de búsqueda (search.html)
import { supabase } from './auth-utils.js';

import { getCart, saveCart, parsePrice, updateCartBadge, showToast, initCartButtons, initWishlist } from './cart-utils.js';



// --- ESTADO DE FILTROS ---
const filterState = {
  query: '',
  zone: 'todas',
  category: 'todas',
  distance: 10,
  sortBy: 'relevancia'
};

async function applyFilters() {
  const grid = document.getElementById('products-grid');
  const countEl = document.getElementById('catalog-count');
  if (!grid) return;

  grid.innerHTML = '';
  const loadingMsg = document.createElement('div');
  loadingMsg.style.cssText = 'grid-column: 1/-1; text-align: center; padding: 2rem; color: #64748b;';
  loadingMsg.textContent = 'Cargando...';
  grid.appendChild(loadingMsg);

  try {
    let query = supabase
      .from('products')
      .select('*, stores(name), categories!inner(slug)', { count: 'exact' })
      .eq('is_active', true);

    // Apply text search
    if (filterState.query) {
      query = query.ilike('title', `%${filterState.query}%`);
    }

    // Apply category filter
    if (filterState.category !== 'todas') {
      query = query.eq('categories.slug', filterState.category);
    }

    // Apply sorting
    if (filterState.sortBy === 'nombre') {
      query = query.order('title', { ascending: true });
    } else if (filterState.sortBy === 'precio-asc') {
      query = query.order('price', { ascending: true });
    } else if (filterState.sortBy === 'precio-desc') {
      query = query.order('price', { ascending: false });
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data: products, count, error } = await query;

    if (error) throw error;

    grid.innerHTML = ''; // clear loading
    
    if (countEl) {
      countEl.textContent = `${count} resultado${count !== 1 ? 's' : ''}`;
    }

    if (!products || products.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'grid-column: 1/-1; text-align: center; padding: 2rem; color: #64748b;';
      emptyMsg.textContent = 'No se encontraron productos con estos filtros.';
      grid.appendChild(emptyMsg);
      return;
    }

    products.forEach(product => {
      const priceStr = product.price.toLocaleString('es-AR');
      const storeName = product.stores ? product.stores.name : 'Tienda';
      
      const article = document.createElement('article');
      article.className = 'product-card';
      article.id = product.id;

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

      const nameH3 = document.createElement('h3');
      nameH3.className = 'product-card__name';
      nameH3.textContent = product.title;
      body.appendChild(nameH3);

      const priceRow = document.createElement('div');
      priceRow.className = 'product-card__price-row';
      const priceSpan = document.createElement('span');
      priceSpan.className = 'product-card__price';
      priceSpan.textContent = `$${priceStr}`;
      priceRow.appendChild(priceSpan);
      body.appendChild(priceRow);

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

    initCartButtons();
    initWishlist();

  } catch (err) {
    console.error('Error fetching products:', err);
    grid.innerHTML = '';
    const errMsg = document.createElement('div');
    errMsg.style.cssText = 'grid-column: 1/-1; text-align: center; color: #ef4444; padding: 2rem;';
    errMsg.textContent = 'Error al buscar productos.';
    grid.appendChild(errMsg);
  }
}

async function loadCategories() {
  const topNav = document.querySelector('.category-bar__inner');
  const sidebarNav = document.getElementById('filter-categories');

  try {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (error) throw error;
    if (!categories || categories.length === 0) return;

    // Top Nav - build with DOM API (safe from XSS)
    if (topNav) {
      topNav.innerHTML = '';

      const inicio = document.createElement('a');
      inicio.href = '#';
      inicio.className = 'category-bar__item category-bar__item--active';
      inicio.id = 'cat-inicio';
      inicio.textContent = 'Inicio';
      topNav.appendChild(inicio);

      const ofertas = document.createElement('a');
      ofertas.href = '#';
      ofertas.className = 'category-bar__item';
      ofertas.id = 'cat-ofertas';
      ofertas.textContent = 'Ofertas';
      topNav.appendChild(ofertas);

      categories.forEach(cat => {
        const link = document.createElement('a');
        link.href = '#';
        link.className = 'category-bar__item';
        link.dataset.filter = cat.slug;
        link.id = `cat-${cat.slug}`;
        link.textContent = cat.name;
        topNav.appendChild(link);
      });

      // Dropdown
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
      topNav.appendChild(dropdown);
    }

    // Sidebar Nav - build with DOM API
    if (sidebarNav) {
      sidebarNav.innerHTML = '';
      const allBtn = document.createElement('button');
      allBtn.className = 'filter-pill filter-pill--active';
      allBtn.dataset.cat = 'todas';
      allBtn.textContent = 'Todas';
      sidebarNav.appendChild(allBtn);

      categories.forEach(cat => {
        const pill = document.createElement('button');
        pill.className = 'filter-pill';
        pill.dataset.cat = cat.slug;
        pill.textContent = cat.name;
        sidebarNav.appendChild(pill);
      });
      
      // Re-bind listeners for newly created pills
      const newPills = sidebarNav.querySelectorAll('.filter-pill');
      newPills.forEach(pill => {
        pill.addEventListener('click', () => {
          newPills.forEach(p => p.classList.remove('filter-pill--active'));
          pill.classList.add('filter-pill--active');
          filterState.category = pill.dataset.cat || 'todas';
          
          const url = new URL(window.location);
          if (filterState.category !== 'todas') url.searchParams.set('cat', filterState.category);
          else url.searchParams.delete('cat');
          window.history.replaceState({}, '', url);

          applyFilters();
        });
      });
    }

    // Initialize top nav category interactions
    initTopCategories();

  } catch (err) {
    console.error('Error fetching categories:', err);
  }
}

function initAdvancedFilters() {
  const navInput = document.getElementById('search-input');
  const sidebarInput = document.getElementById('sidebar-search-input');
  const zoneSelect = document.getElementById('filter-zone');
  const distanceRange = document.getElementById('filter-distance');
  const distanceValue = document.getElementById('distance-value');
  const sortSelect = document.getElementById('filter-sort');
  const applyBtn = document.getElementById('filters-apply-btn');

  // Leer parámetros de URL
  const params = new URLSearchParams(window.location.search);
  if (params.has('q')) {
    filterState.query = params.get('q').toLowerCase();
    if (navInput) navInput.value = params.get('q');
    if (sidebarInput) sidebarInput.value = params.get('q');
  }

  if (params.has('cat')) {
    filterState.category = params.get('cat');
  }

  // Inputs de búsqueda
  const handleSearchInput = (e) => {
    filterState.query = e.target.value.trim().toLowerCase();
    if (sidebarInput && e.target !== sidebarInput) sidebarInput.value = e.target.value;
    if (navInput && e.target !== navInput) navInput.value = e.target.value;
    
    // Actualizar URL sin recargar
    const url = new URL(window.location);
    if (filterState.query) url.searchParams.set('q', filterState.query);
    else url.searchParams.delete('q');
    window.history.replaceState({}, '', url);
    
    applyFilters();
  };

  navInput?.addEventListener('input', handleSearchInput);
  sidebarInput?.addEventListener('input', handleSearchInput);

  zoneSelect?.addEventListener('change', (e) => {
    filterState.zone = e.target.value;
    applyFilters();
  });

  distanceRange?.addEventListener('input', (e) => {
    if (distanceValue) distanceValue.textContent = e.target.value;
  });
  distanceRange?.addEventListener('change', (e) => {
    filterState.distance = parseInt(e.target.value, 10);
    applyFilters();
  });

  sortSelect?.addEventListener('change', (e) => {
    filterState.sortBy = e.target.value;
    applyFilters();
  });

  applyBtn?.addEventListener('click', () => {
    applyFilters();
    showToast('Filtros aplicados');
    document.getElementById('filters-sidebar')?.classList.remove('is-open');
  });

  const mobileBtn = document.getElementById('mobile-filters-btn');
  const sidebarClose = document.getElementById('filters-sidebar-close');
  const sidebar = document.getElementById('filters-sidebar');

  mobileBtn?.addEventListener('click', () => {
    sidebar?.classList.add('is-open');
  });

  sidebarClose?.addEventListener('click', () => {
    sidebar?.classList.remove('is-open');
  });
}

function initTopCategories() {
  const topCategoryItems = document.querySelectorAll('.category-bar__item:not(#cat-mas), .category-bar__dropdown-item');
  
  topCategoryItems.forEach(item => {
    if(item.id === 'cat-mas' || item.getAttribute('href') === './vender.html') return;

    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      if (item.classList.contains('category-bar__item')) {
        document.querySelectorAll('.category-bar__item').forEach(i => i.classList.remove('category-bar__item--active'));
        item.classList.add('category-bar__item--active');
      }
      
      const filter = item.dataset.filter || item.id.replace('cat-', '');
      const mapFilter = filter === 'inicio' ? 'todas' : filter;
      filterState.category = mapFilter;

      document.querySelectorAll('.filter-pill').forEach(pill => {
        if ((pill.dataset.cat === mapFilter) || (mapFilter === 'verduras' && pill.dataset.cat === 'verdulerias') || (mapFilter === 'carnes' && pill.dataset.cat === 'carniceria')) {
           pill.classList.add('filter-pill--active');
           filterState.category = pill.dataset.cat;
        } else {
           pill.classList.remove('filter-pill--active');
        }
      });
      
      const url = new URL(window.location);
      if (filterState.category !== 'todas') url.searchParams.set('cat', filterState.category);
      else url.searchParams.delete('cat');
      window.history.replaceState({}, '', url);

      applyFilters();
      document.getElementById('productos')?.scrollIntoView({ behavior: 'smooth' });
    });
  });
}

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

document.addEventListener('DOMContentLoaded', async () => {
  initAdvancedFilters();
  initScrollTop();
  initNavbarScroll();
  updateCartBadge();

  // Load categories then products
  await loadCategories();
  applyFilters();

  // Modal de detalle de producto
  if (typeof initProductModal === 'function') initProductModal();
});
