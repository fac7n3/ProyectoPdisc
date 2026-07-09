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

  await mergeLocalWishlistIntoFavorites(session.user.id);
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
 * F5-05: fila de precio de una product-card, con precio tachado + % de
 * descuento si el producto tiene `compare_at_price`. Compartida entre
 * home.js/search.js/comercio.js para no repetir el mismo bloque 3 veces.
 * @param {{price: number, compare_at_price?: number|null}} product
 */
export function buildPriceRow(product) {
  const priceRow = document.createElement('div');
  priceRow.className = 'product-card__price-row';

  const priceSpan = document.createElement('span');
  priceSpan.className = 'product-card__price';
  priceSpan.textContent = formatPrice(product.price);
  priceRow.appendChild(priceSpan);

  if (product.compare_at_price && product.compare_at_price > product.price) {
    const oldSpan = document.createElement('span');
    oldSpan.className = 'product-card__price-old';
    oldSpan.textContent = formatPrice(product.compare_at_price);
    priceRow.appendChild(oldSpan);

    const discountPct = Math.round((1 - product.price / product.compare_at_price) * 100);
    const discountSpan = document.createElement('span');
    discountSpan.className = 'product-card__discount';
    discountSpan.textContent = `-${discountPct}%`;
    priceRow.appendChild(discountSpan);
  }

  return priceRow;
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
 * Favoritos (F4-03): fuente única para toda la app — antes había 2
 * implementaciones sin relación entre sí (esta, en localStorage, usada en
 * las grillas de home/search/comercio; y un botón en product-modal.js que
 * solo togglea una clase CSS sin persistir nada). Ahora ambas usan estas
 * mismas funciones: si hay sesión, la fuente de verdad es la tabla
 * `favorites`; si no, localStorage sigue como fallback para invitados.
 */
const WISHLIST_KEY = 'bl_wishlist';

function getLocalWishlist() {
  try {
    const raw = localStorage.getItem(WISHLIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    localStorage.removeItem(WISHLIST_KEY);
    return [];
  }
}

function saveLocalWishlist(list) {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(list));
}

/** IDs de producto favoritos del usuario actual (DB si hay sesión, si no localStorage). */
export async function getFavoriteIds() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return getLocalWishlist();

  const { data, error } = await supabase
    .from('favorites')
    .select('product_id')
    .eq('user_id', session.user.id);

  if (error) {
    console.error('Error al traer favoritos:', error);
    return [];
  }

  return (data || []).map((f) => f.product_id);
}

/**
 * Agrega o quita un producto de favoritos.
 * @param {string} productId
 * @param {boolean} isCurrentlyFavorite - estado ANTES del toggle
 */
export async function toggleFavorite(productId, isCurrentlyFavorite) {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const list = getLocalWishlist();
    if (isCurrentlyFavorite) {
      const idx = list.indexOf(productId);
      if (idx > -1) list.splice(idx, 1);
    } else if (!list.includes(productId)) {
      list.push(productId);
    }
    saveLocalWishlist(list);
    return;
  }

  if (isCurrentlyFavorite) {
    await supabase.from('favorites').delete().eq('user_id', session.user.id).eq('product_id', productId);
  } else {
    await supabase.from('favorites').insert({ user_id: session.user.id, product_id: productId });
  }
}

/**
 * Al loguearse, sube los favoritos que se hayan marcado como invitado
 * (localStorage) a la tabla `favorites` y limpia el localStorage — la DB
 * pasa a ser la única fuente de verdad para ese usuario de acá en más.
 * Llamada desde initCartSync (mismo punto de entrada "sincronizar todo al
 * loguearse", una vez por pestaña).
 */
async function mergeLocalWishlistIntoFavorites(userId) {
  const localWishlist = getLocalWishlist();
  if (localWishlist.length === 0) return;

  const rows = localWishlist.map((productId) => ({ user_id: userId, product_id: productId }));
  const { error } = await supabase.from('favorites').upsert(rows, { onConflict: 'user_id,product_id' });

  if (error) {
    console.error('Error al migrar favoritos locales:', error);
    return;
  }

  localStorage.removeItem(WISHLIST_KEY);
}

/**
 * Inicializar botones de favoritos en product-cards del DOM.
 * @param {string[]} [knownFavoriteIds] - si ya se tienen (ej. desde initWishlistFor
 *   llamado por varias grillas en la misma página), evita repetir la query.
 */
export async function initWishlist(knownFavoriteIds) {
  const favoriteIds = knownFavoriteIds || (await getFavoriteIds());

  document.querySelectorAll('.product-card__wishlist').forEach((btn) => {
    const card = btn.closest('.product-card');
    const productId = card?.id || '';
    const icon = btn.querySelector('i');
    let isActive = Boolean(productId && favoriteIds.includes(productId));

    if (isActive) {
      icon.classList.replace('fa-regular', 'fa-solid');
      btn.style.color = '#ef4444';
    }

    btn.addEventListener('click', async () => {
      const wasActive = isActive;
      isActive = !wasActive;

      if (isActive) {
        icon.classList.replace('fa-regular', 'fa-solid');
        btn.style.color = '#ef4444';
        showToast('Agregado a favoritos', 'success');
      } else {
        icon.classList.replace('fa-solid', 'fa-regular');
        btn.style.color = '';
        showToast('Eliminado de favoritos');
      }

      try {
        await toggleFavorite(productId, wasActive);
      } catch (err) {
        console.error('Error al actualizar favoritos:', err);
      }
    });
  });
}

// Se ejecuta al importar este módulo (todas las páginas que usan el
// carrito lo importan) — no bloquea el render, solo mezcla en segundo plano.
initCartSync();