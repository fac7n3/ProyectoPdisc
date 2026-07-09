import { supabase } from './auth-utils.js';
import { getCart, saveCart, formatPrice, updateCartBadge, showToast } from './cart-utils.js';
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
    
    const storeName = product.stores ? product.stores.name : 'Tienda';
    const storeId = product.stores ? product.stores.id : '';
    const imgUrl = product.image_url || '../Assets/images/default-product.png';

    // --- Construir con DOM API (anti-XSS: nada de innerHTML con datos de la DB) ---
    container.innerHTML = '';

    const gallery = document.createElement('div');
    gallery.className = 'product-gallery';
    const img = document.createElement('img');
    img.src = imgUrl;
    img.alt = product.title;
    gallery.appendChild(img);
    container.appendChild(gallery);

    const info = document.createElement('div');
    info.className = 'product-info';

    const shopDiv = document.createElement('div');
    shopDiv.className = 'product-shop';
    const storeIcon = document.createElement('i');
    storeIcon.className = 'fa-solid fa-store';
    shopDiv.appendChild(storeIcon);
    shopDiv.append(' ');
    const storeLink = document.createElement('a');
    storeLink.href = `./comercio.html?id=${encodeURIComponent(storeId)}`;
    storeLink.style.cssText = 'color: inherit; text-decoration: none;';
    storeLink.textContent = storeName;
    shopDiv.appendChild(storeLink);
    info.appendChild(shopDiv);

    const titleH1 = document.createElement('h1');
    titleH1.className = 'product-title';
    titleH1.textContent = product.title;
    info.appendChild(titleH1);

    const priceDiv = document.createElement('div');
    priceDiv.className = 'product-price';
    priceDiv.textContent = formatPrice(product.price);
    info.appendChild(priceDiv);

    const descDiv = document.createElement('div');
    descDiv.className = 'product-description';
    descDiv.textContent = product.description || 'Sin descripción disponible.';
    info.appendChild(descDiv);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'product-actions';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add-cart';
    addBtn.id = 'btn-add-cart';
    const cartIcon = document.createElement('i');
    cartIcon.className = 'fa-solid fa-cart-plus';
    addBtn.appendChild(cartIcon);
    addBtn.append(' Agregar al carrito');
    actionsDiv.appendChild(addBtn);
    info.appendChild(actionsDiv);

    container.appendChild(info);

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
