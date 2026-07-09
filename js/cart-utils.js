import { supabase } from './auth-utils.js';

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
 * Guardar el carrito en localStorage y, si hay sesión, sincronizarlo a la nube
 * (F4-01). El push a la nube es "fire and forget" — no bloquea al llamador
 * ni rompe el guardado local si falla la red.
 * @param {Array} cart
 */
export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  pushCartToCloud(cart).catch((err) => console.error('Error al sincronizar el carrito:', err));
}

/** Sube el carrito actual a user_carts (upsert). No hace nada si no hay sesión. */
export async function pushCartToCloud(cart) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  await supabase
    .from('user_carts')
    .upsert({ user_id: session.user.id, items: cart }, { onConflict: 'user_id' });
}

/**
 * Combina el carrito local con el de la nube: suma cantidades de productos
 * repetidos (tope MAX_QTY) y usa los datos de display (nombre/precio/imagen)
 * de la versión local, que es la más reciente en este navegador.
 */
function mergeCarts(localCart, cloudCart) {
  const merged = new Map();
  (cloudCart || []).forEach((item) => {
    if (item?.id) merged.set(item.id, { ...item });
  });
  (localCart || []).forEach((item) => {
    if (!item?.id) return;
    const existing = merged.get(item.id);
    merged.set(item.id, {
      ...item,
      qty: existing ? Math.min(MAX_QTY, existing.qty + item.qty) : item.qty,
    });
  });
  return Array.from(merged.values());
}

const CART_SYNCED_FLAG = 'bl_cart_synced';

/**
 * Al loguearse (o al abrir cualquier página con sesión activa), trae el
 * carrito de la nube y lo mezcla con el local — así no se pierde lo
 * agregado antes de loguearse ni lo que ya estaba guardado en otro
 * dispositivo. Se ejecuta una sola vez por pestaña (sessionStorage) para no
 * repetir el merge en cada navegación entre páginas.
 */
export async function initCartSync() {
  if (sessionStorage.getItem(CART_SYNCED_FLAG)) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  sessionStorage.setItem(CART_SYNCED_FLAG, '1');

  const { data: cloudRow, error } = await supabase
    .from('user_carts')
    .select('items')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) {
    console.error('Error al traer el carrito de la nube:', error);
    return;
  }

  const merged = mergeCarts(getCart(), cloudRow?.items || []);
  saveCart(merged);
  updateCartBadge();
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

// Se ejecuta al importar este módulo (todas las páginas que usan el
// carrito lo importan) — no bloquea el render, solo mezcla en segundo plano.
initCartSync();