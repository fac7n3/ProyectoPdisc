import { supabase } from './auth-utils.js';
import { getCart, saveCart, updateCartBadge, showToast } from './cart-utils.js';
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

  const container = document.getElementById('product-container');
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');

  if (!productId) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: #ef4444;">No se especificó un producto.</div>';
    return;
  }

  try {
    const { data: product, error } = await supabase
      .from('products')
      .select('*, stores(name, id)')
      .eq('id', productId)
      .single();

    if (error || !product) throw error || new Error('Producto no encontrado');

    document.title = `${product.title} — Baradero Local`;
    
    const priceStr = product.price.toLocaleString('es-AR');
    const storeName = product.stores ? product.stores.name : 'Tienda';
    const storeId = product.stores ? product.stores.id : '';
    const imgUrl = product.image_url || '../Assets/images/default-product.png';

    container.innerHTML = `
      <div class="product-gallery">
        <img src="${imgUrl}" alt="${product.title}" />
      </div>
      <div class="product-info">
        <div class="product-shop">
          <i class="fa-solid fa-store"></i> <a href="./comercio.html?id=${storeId}" style="color: inherit; text-decoration: none;">${storeName}</a>
        </div>
        <h1 class="product-title">${product.title}</h1>
        <div class="product-price">$${priceStr}</div>
        <div class="product-description">${product.description || 'Sin descripción disponible.'}</div>
        
        <div class="product-actions">
          <button class="btn-add-cart" id="btn-add-cart">
            <i class="fa-solid fa-cart-plus"></i> Agregar al carrito
          </button>
        </div>
      </div>
    `;

    // Bind Add to Cart
    const btnAdd = document.getElementById('btn-add-cart');
    btnAdd.addEventListener('click', () => {
      const cart = getCart();
      const existing = cart.find(item => item.id === product.id);

      if (existing) {
        existing.qty++;
      } else {
        cart.push({ 
          id: product.id, 
          name: product.title, 
          shop: storeName, 
          price: product.price,
          priceOld: null, 
          image: imgUrl, 
          qty: 1 
        });
      }

      saveCart(cart);
      
      // Animation
      btnAdd.style.transform = 'scale(0.95)';
      setTimeout(() => { btnAdd.style.transform = ''; }, 100);
      
      updateCartBadge();
      showToast(`${product.title} agregado al carrito`, 'success');
    });

  } catch (err) {
    console.error('Error fetching product:', err);
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: #ef4444;">No se pudo cargar el producto.</div>';
  }
});
