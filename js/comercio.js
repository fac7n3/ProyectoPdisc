import { supabase } from './auth-utils.js';
import { getCart, saveCart, updateCartBadge, showToast, formatPrice, initCartButtons, initWishlist } from './cart-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

document.addEventListener('DOMContentLoaded', async () => {
  updateCartBadge();
  
  // Search redirect
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
          window.location.href = `./search.html?q=${encodeURIComponent(query)}`;
        }
      }
    });
  }

  const mainContent = document.getElementById('main-content');
  const params = new URLSearchParams(window.location.search);
  const storeId = params.get('id');

  if (!storeId) {
    mainContent.innerHTML = '<div style="text-align: center; padding: 4rem; color: #ef4444;">No se especificó un comercio.</div>';
    return;
  }

  try {
    // Fetch store
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .single();

    if (storeError || !store) throw storeError || new Error('Comercio no encontrado');

    document.title = `${store.name} — Baradero Local`;

    // Fetch products
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (productsError) throw productsError;

    let productsHtml = '';
    if (!products || products.length === 0) {
      productsHtml = '<div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 2rem;">Este comercio aún no tiene productos publicados.</div>';
    } else {
      productsHtml = products.map(product => {
        return `
          <article class="product-card" id="${product.id}" data-price="${product.price}">
            <div class="product-card__image">
              <img src="${product.image_url || '../Assets/images/default-product.png'}" alt="${product.title}" loading="lazy" />
              <button class="product-card__wishlist" aria-label="Agregar a favoritos"><i class="fa-regular fa-heart"></i></button>
            </div>
            <div class="product-card__body">
              <span class="product-card__shop"><i class="fa-solid fa-store"></i> ${store.name}</span>
              <h3 class="product-card__name">${product.title}</h3>
              <div class="product-card__price-row">
                <span class="product-card__price">${formatPrice(product.price)}</span>
              </div>
              <button class="product-card__add" data-product-id="${product.id}"><i class="fa-solid fa-cart-plus"></i> Agregar</button>
            </div>
          </article>
        `;
      }).join('');
    }

    mainContent.innerHTML = `
      <header class="store-header">
        <h1 class="store-header__title">${store.name}</h1>
        <p class="store-header__description">${store.description || 'Sin descripción disponible.'}</p>
        <div class="store-header__meta">
          <span><i class="fa-solid fa-location-dot"></i> Baradero</span>
          <span><i class="fa-solid fa-box"></i> ${products?.length || 0} productos</span>
        </div>
      </header>
      
      <section class="store-products">
        <div class="products__grid" id="store-products-grid">
          ${productsHtml}
        </div>
      </section>
    `;

    initCartButtons();
    initWishlist();
    if (typeof initProductModal === 'function') initProductModal();

  } catch (err) {
    console.error('Error fetching store:', err);
    mainContent.innerHTML = '<div style="text-align: center; padding: 4rem; color: #ef4444;">No se pudo cargar la información del comercio.</div>';
  }
});
