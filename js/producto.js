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
      .select('*, stores(name, id), product_images(url, position), product_variants(id, name, price, stock)')
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

    // F5-04: miniaturas de fotos adicionales (product_images) — clic cambia la principal.
    const extraImages = (product.product_images || []).sort((a, b) => a.position - b.position);
    if (extraImages.length > 0) {
      const thumbsRow = document.createElement('div');
      thumbsRow.className = 'product-gallery__thumbs';
      thumbsRow.style.cssText = 'display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap;';

      const allThumbUrls = [imgUrl, ...extraImages.map((pi) => pi.url)];
      allThumbUrls.forEach((url) => {
        const thumb = document.createElement('img');
        thumb.src = url;
        thumb.alt = product.title;
        thumb.style.cssText = 'width: 56px; height: 56px; object-fit: cover; border-radius: 6px; cursor: pointer; border: 2px solid transparent;';
        thumb.addEventListener('click', () => { img.src = url; });
        thumbsRow.appendChild(thumb);
      });

      gallery.appendChild(thumbsRow);
    }

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

    // F5-03: display informativo de variantes (talle/color/peso) — no integra con el carrito.
    const variants = product.product_variants || [];
    if (variants.length > 0) {
      const variantsDiv = document.createElement('div');
      variantsDiv.className = 'product-variants-info';
      variantsDiv.style.cssText = 'margin: 1rem 0;';

      const variantsTitle = document.createElement('p');
      variantsTitle.style.cssText = 'font-weight: 600; margin-bottom: 0.5rem;';
      variantsTitle.textContent = 'Opciones disponibles:';
      variantsDiv.appendChild(variantsTitle);

      const variantsList = document.createElement('ul');
      variantsList.style.cssText = 'list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.35rem;';
      variants.forEach((variant) => {
        const li = document.createElement('li');
        li.style.cssText = 'font-size: 0.9rem; color: var(--bl-text-muted, #666);';
        const stockNote = variant.stock > 0 ? `stock: ${variant.stock}` : 'sin stock';
        li.textContent = `${variant.name} — ${formatPrice(variant.price)} (${stockNote})`;
        variantsList.appendChild(li);
      });
      variantsDiv.appendChild(variantsList);

      const variantsNote = document.createElement('p');
      variantsNote.style.cssText = 'font-size: 0.8rem; color: var(--bl-text-muted, #999); margin-top: 0.35rem;';
      variantsNote.textContent = 'Para pedir una opción específica, consultá con el vendedor.';
      variantsDiv.appendChild(variantsNote);

      info.appendChild(variantsDiv);
    }

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
