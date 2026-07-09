export const CART_KEY = 'bl_cart';

/**
 * Obtener el carrito actual
 * @returns {Array} Array of cart items
 */
export function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    // Si hay un error al parsear (ej. datos corruptos), limpiamos el localStorage
    localStorage.removeItem(CART_KEY);
    return [];
  }
}

/**
 * Guardar el carrito en localStorage
 * @param {Array} cart 
 */
export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

/**
 * Limpiar el carrito
 */
export function clearCart() {
  localStorage.removeItem(CART_KEY);
}

/**
 * Parsear un precio en formato string a un entero
 * @param {string} text - Ej: "$1.500" o "1500"
 * @returns {number}
 */
export function parsePrice(text) {
  if (!text) return 0;
  return parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;
}

/**
 * Formatear un precio en pesos argentinos (sin centavos)
 * @param {number} price - Ej: 1500
 * @returns {string} Ej: "$1.500"
 */
export function formatPrice(price) {
  return '$' + Number(price || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

/**
 * Actualizar el badge del carrito en el navbar
 */
export function updateCartBadge() {
  const cart = getCart();
  const total = cart.reduce((acc, item) => acc + item.qty, 0);
  const badge = document.getElementById('cart-badge');
  if (badge) {
    badge.textContent = total > 0 ? total : '';
    // Guardar para CSS (ej: count="0" puede ocultarlo)
    badge.dataset.count = total;
  }
}

/** Cantidad máxima por producto en el carrito */
export const MAX_QTY = 99;

export function showToast(message, type = 'default') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast';
  if (type === 'success') toast.classList.add('toast--success');
  toast.classList.add('toast--visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('toast--visible');
  }, 2500);
}

/**
 * Inicializar botones de agregar al carrito en product-cards del DOM.
 * Se puede llamar cada vez que se renderizan nuevas cards.
 */
export function initCartButtons() {
  document.querySelectorAll('.product-card__add').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.product-card');
      const id = btn.dataset.productId || card?.id;
      if (!id) {
        console.error('product-card__add sin id de producto real (data-product-id / card.id)');
        return;
      }

      const name = card?.querySelector('.product-card__name')?.textContent || 'Producto';
      const shop = card?.querySelector('.product-card__shop')?.textContent?.replace(/^\s*/, '') || 'Tienda';
      const priceOldText = card?.querySelector('.product-card__price-old')?.textContent || '';
      const imgSrc = card?.querySelector('.product-card__image img')?.getAttribute('src') || '';

      const price = card?.dataset.price !== undefined
        ? Number(card.dataset.price)
        : parsePrice(card?.querySelector('.product-card__price')?.textContent || '0');
      const priceOld = parsePrice(priceOldText);

      const cart = getCart();
      const existing = cart.find(item => item.id === id);

      if (existing) {
        if (existing.qty >= MAX_QTY) {
          showToast(`Máximo ${MAX_QTY} unidades por producto`, 'default');
          return;
        }
        existing.qty++;
      } else {
        cart.push({ id, name, shop, price, priceOld: priceOld || null, image: imgSrc, qty: 1 });
      }

      saveCart(cart);

      // Animación rápida de escala
      btn.style.transform = 'scale(0.93)';
      setTimeout(() => { btn.style.transform = ''; }, 120);

      updateCartBadge();
      showToast(`${name} agregado al carrito`, 'success');
    });
  });
}

/**
 * Inicializar botones de favoritos en product-cards del DOM.
 * Persiste los favoritos en localStorage.
 */
const WISHLIST_KEY = 'bl_wishlist';

function getWishlist() {
  try {
    const raw = localStorage.getItem(WISHLIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    localStorage.removeItem(WISHLIST_KEY);
    return [];
  }
}

function saveWishlist(list) {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(list));
}

export function initWishlist() {
  const wishlist = getWishlist();

  document.querySelectorAll('.product-card__wishlist').forEach((btn) => {
    const card = btn.closest('.product-card');
    const productId = card?.id || '';
    const icon = btn.querySelector('i');

    // Restaurar estado desde localStorage
    if (productId && wishlist.includes(productId)) {
      icon.classList.replace('fa-regular', 'fa-solid');
      btn.style.color = '#ef4444';
    }

    btn.addEventListener('click', () => {
      const isActive = icon.classList.contains('fa-solid');
      const currentWishlist = getWishlist();

      if (isActive) {
        icon.classList.replace('fa-solid', 'fa-regular');
        btn.style.color = '';
        const idx = currentWishlist.indexOf(productId);
        if (idx > -1) currentWishlist.splice(idx, 1);
        showToast('Eliminado de favoritos');
      } else {
        icon.classList.replace('fa-regular', 'fa-solid');
        btn.style.color = '#ef4444';
        if (productId && !currentWishlist.includes(productId)) {
          currentWishlist.push(productId);
        }
        showToast('Agregado a favoritos', 'success');
      }

      saveWishlist(currentWishlist);
    });
  });
}