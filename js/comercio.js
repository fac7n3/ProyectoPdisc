import { supabase } from './auth-utils.js';
import { getCart, saveCart, updateCartBadge, showToast, formatPrice, initCartButtons, initWishlist, buildPriceRow } from './cart-utils.js';
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

    // --- Construir con DOM API (anti-XSS: nada de innerHTML con datos de la DB) ---
    mainContent.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'store-header';

    const title = document.createElement('h1');
    title.className = 'store-header__title';
    title.textContent = store.name;
    header.appendChild(title);

    const description = document.createElement('p');
    description.className = 'store-header__description';
    description.textContent = store.description || 'Sin descripción disponible.';
    header.appendChild(description);

    const meta = document.createElement('div');
    meta.className = 'store-header__meta';

    const locationSpan = document.createElement('span');
    const locationIcon = document.createElement('i');
    locationIcon.className = 'fa-solid fa-location-dot';
    locationSpan.appendChild(locationIcon);
    locationSpan.append(' Baradero');
    meta.appendChild(locationSpan);

    const productCountSpan = document.createElement('span');
    const boxIcon = document.createElement('i');
    boxIcon.className = 'fa-solid fa-box';
    productCountSpan.appendChild(boxIcon);
    productCountSpan.append(` ${products?.length || 0} productos`);
    meta.appendChild(productCountSpan);

    header.appendChild(meta);
    mainContent.appendChild(header);

    const section = document.createElement('section');
    section.className = 'store-products';

    const grid = document.createElement('div');
    grid.className = 'products__grid';
    grid.id = 'store-products-grid';

    if (!products || products.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.cssText = 'grid-column: 1/-1; text-align: center; color: #64748b; padding: 2rem;';
      emptyMsg.textContent = 'Este comercio aún no tiene productos publicados.';
      grid.appendChild(emptyMsg);
    } else {
      products.forEach(product => {
        const article = document.createElement('article');
        article.className = 'product-card';
        article.id = product.id;
        article.dataset.price = product.price;

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

        const body = document.createElement('div');
        body.className = 'product-card__body';

        const shopSpan = document.createElement('span');
        shopSpan.className = 'product-card__shop';
        const storeIcon = document.createElement('i');
        storeIcon.className = 'fa-solid fa-store';
        shopSpan.appendChild(storeIcon);
        shopSpan.append(` ${store.name}`);
        body.appendChild(shopSpan);

        const nameH3 = document.createElement('h3');
        nameH3.className = 'product-card__name';
        nameH3.textContent = product.title;
        body.appendChild(nameH3);

        body.appendChild(buildPriceRow(product));

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
    }

    section.appendChild(grid);
    mainContent.appendChild(section);

    initCartButtons();
    initWishlist();
    if (typeof initProductModal === 'function') initProductModal();

  } catch (err) {
    console.error('Error fetching store:', err);
    mainContent.innerHTML = '<div style="text-align: center; padding: 4rem; color: #ef4444;">No se pudo cargar la información del comercio.</div>';
  }
});
