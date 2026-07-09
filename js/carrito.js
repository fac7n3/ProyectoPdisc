// Lógica del carrito de compras — Baradero Local
// Usa localStorage para persistir los productos entre páginas.
import { supabase } from './auth-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

import { getCart, saveCart, updateCartBadge, MAX_QTY, formatPrice } from './cart-utils.js';

// --- Estado del Carrito ---
let currentDiscount = 0; // Porcentaje de descuento (0 a 1)

/** Renderizar todo el carrito */
function renderCart() {
  const cart = getCart();
  const tableBody = document.getElementById('cart-items');
  const emptyState = document.getElementById('cart-empty');
  const filledState = document.getElementById('cart-filled');
  const summarySubtotal = document.getElementById('summary-subtotal');
  const summaryShipping = document.getElementById('summary-shipping');
  const summaryTotal = document.getElementById('summary-total');
  const cartCount = document.getElementById('cart-count');
  
  // Elementos de descuento
  const summaryDiscountRow = document.getElementById('summary-discount-row');
  const summaryDiscount = document.getElementById('summary-discount');
  const discountPercent = document.getElementById('discount-percent');

  if (!tableBody) return;

  // Mostrar/ocultar estado vacío
  if (cart.length === 0) {
    emptyState.style.display = '';
    filledState.style.display = 'none';
    if (summarySubtotal) summarySubtotal.textContent = '$0';
    if (summaryShipping) summaryShipping.textContent = '$0';
    if (summaryTotal) summaryTotal.textContent = '$0';
    if (summaryDiscountRow) summaryDiscountRow.style.display = 'none';
    if (cartCount) cartCount.textContent = '0 productos';
    return;
  }

  emptyState.style.display = 'none';
  filledState.style.display = '';

  // Construir filas
  tableBody.innerHTML = '';

  let subtotal = 0;
  let totalItems = 0;

  cart.forEach((item, index) => {
    const itemSubtotal = item.price * item.qty;
    subtotal += itemSubtotal;
    totalItems += item.qty;

    const row = document.createElement('div');
    row.className = 'cart-item';
    row.dataset.index = index;

    // --- Producto (imagen + info) ---
    const productDiv = document.createElement('div');
    productDiv.className = 'cart-item__product';

    const img = document.createElement('img');
    img.src = item.image || '';
    img.alt = item.name || 'Producto';
    img.className = 'cart-item__img';
    productDiv.appendChild(img);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'cart-item__info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'cart-item__name';
    nameSpan.textContent = item.name;
    infoDiv.appendChild(nameSpan);

    const shopSpan = document.createElement('span');
    shopSpan.className = 'cart-item__shop';
    const shopIcon = document.createElement('i');
    shopIcon.className = 'fa-solid fa-store';
    shopSpan.appendChild(shopIcon);
    shopSpan.append(` ${item.shop}`);
    infoDiv.appendChild(shopSpan);

    const detailLink = document.createElement('a');
    detailLink.href = './home.html';
    detailLink.className = 'cart-item__detail-link';
    detailLink.textContent = 'Ver detalle';
    infoDiv.appendChild(detailLink);

    productDiv.appendChild(infoDiv);
    row.appendChild(productDiv);

    // --- Precio ---
    const priceSpan = document.createElement('span');
    priceSpan.className = 'cart-item__price';
    priceSpan.textContent = formatPrice(item.price);
    row.appendChild(priceSpan);

    // --- Cantidad ---
    const qtyDiv = document.createElement('div');
    qtyDiv.className = 'cart-qty';

    const minusBtn = document.createElement('button');
    minusBtn.className = 'cart-qty__btn cart-qty__minus';
    minusBtn.dataset.index = index;
    minusBtn.setAttribute('aria-label', 'Disminuir cantidad');
    if (item.qty <= 1) minusBtn.disabled = true;
    const minusIcon = document.createElement('i');
    minusIcon.className = 'fa-solid fa-minus';
    minusBtn.appendChild(minusIcon);
    qtyDiv.appendChild(minusBtn);

    const qtyValue = document.createElement('span');
    qtyValue.className = 'cart-qty__value';
    qtyValue.textContent = item.qty;
    qtyDiv.appendChild(qtyValue);

    const plusBtn = document.createElement('button');
    plusBtn.className = 'cart-qty__btn cart-qty__plus';
    plusBtn.dataset.index = index;
    plusBtn.setAttribute('aria-label', 'Aumentar cantidad');
    const plusIcon = document.createElement('i');
    plusIcon.className = 'fa-solid fa-plus';
    plusBtn.appendChild(plusIcon);
    qtyDiv.appendChild(plusBtn);

    row.appendChild(qtyDiv);

    // --- Subtotal ---
    const subtotalSpan = document.createElement('span');
    subtotalSpan.className = 'cart-item__subtotal';
    subtotalSpan.textContent = formatPrice(itemSubtotal);
    row.appendChild(subtotalSpan);

    // --- Acciones (eliminar) ---
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'cart-item__actions';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'cart-item__delete';
    deleteBtn.dataset.index = index;
    deleteBtn.setAttribute('aria-label', 'Eliminar producto');
    const trashIcon = document.createElement('i');
    trashIcon.className = 'fa-solid fa-trash-can';
    deleteBtn.appendChild(trashIcon);
    actionsDiv.appendChild(deleteBtn);
    row.appendChild(actionsDiv);

    tableBody.appendChild(row);
  });

  // Calcular descuento
  const discountAmount = subtotal * currentDiscount;
  const subtotalWithDiscount = subtotal - discountAmount;

  // Calcular envío (gratis si el subtotal con descuento supera $5000)
  const shipping = subtotalWithDiscount >= 5000 ? 0 : 350;
  const total = subtotalWithDiscount + shipping;

  // Actualizar resumen
  if (summarySubtotal) summarySubtotal.textContent = formatPrice(subtotal);
  
  if (summaryDiscountRow && currentDiscount > 0) {
    summaryDiscountRow.style.display = 'flex';
    if (discountPercent) discountPercent.textContent = `${currentDiscount * 100}%`;
    if (summaryDiscount) summaryDiscount.textContent = `-${formatPrice(discountAmount)}`;
  } else if (summaryDiscountRow) {
    summaryDiscountRow.style.display = 'none';
  }

  if (summaryShipping) summaryShipping.textContent = shipping === 0 ? 'Gratis' : formatPrice(shipping);
  if (summaryTotal) summaryTotal.textContent = formatPrice(total);
  if (cartCount) cartCount.textContent = `${totalItems} producto${totalItems !== 1 ? 's' : ''}`;
}

// --- Manejadores de Eventos ---

/** Inicializar lógica del cupón de descuento */
function initCouponEvents() {
  const header = document.getElementById('coupon-header');
  const content = document.getElementById('coupon-content');
  const input = document.getElementById('coupon-input');
  const applyBtn = document.getElementById('coupon-apply-btn');
  const message = document.getElementById('coupon-message');

  if (!header || !content || !input || !applyBtn || !message) return;

  // Toggle sección
  header.addEventListener('click', () => {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    header.classList.toggle('is-open', isHidden);
  });

  async function applyCoupon() {
    const code = input.value.trim().toUpperCase();
    message.className = 'coupon-message'; // reset
    
    if (!code) {
      currentDiscount = 0;
      message.textContent = '';
      renderCart();
      return;
    }

    applyBtn.disabled = true;
    applyBtn.textContent = 'Validando...';

    try {
      const { data, error } = await supabase
        .from('coupons')
        .select('discount_percentage')
        .eq('code', code)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        currentDiscount = 0;
        message.textContent = 'Código inválido o expirado.';
        message.classList.add('is-error');
      } else {
        currentDiscount = data.discount_percentage / 100;
        message.textContent = `¡Cupón aplicado! Tenés ${data.discount_percentage}% de descuento.`;
        message.classList.add('is-success');
      }
    } catch (err) {
      console.error('Error validando cupón:', err);
      currentDiscount = 0;
      message.textContent = 'Error al validar cupón.';
      message.classList.add('is-error');
    } finally {
      applyBtn.disabled = false;
      applyBtn.textContent = 'Aplicar';
      renderCart();
    }
  }

  applyBtn.addEventListener('click', applyCoupon);
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyCoupon();
    }
  });
}

/** Inicializar eventos de la tabla del carrito */
function initCartEvents() {
  const tableBody = document.getElementById('cart-items');
  if (!tableBody) return;

  // Delegación de eventos para botones dentro de la tabla
  tableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const index = parseInt(btn.dataset.index, 10);
    const cart = getCart();

    if (btn.classList.contains('cart-qty__minus')) {
      if (cart[index] && cart[index].qty > 1) {
        cart[index].qty--;
        saveCart(cart);
        renderCart();
      }
    } else if (btn.classList.contains('cart-qty__plus')) {
      if (cart[index]) {
        if (cart[index].qty >= MAX_QTY) {
          showCartToast(`Máximo ${MAX_QTY} unidades por producto`);
          return;
        }
        cart[index].qty++;
        saveCart(cart);
        renderCart();
      }
    } else if (btn.classList.contains('cart-item__delete')) {
      if (cart[index]) {
        const name = cart[index].name;
        cart.splice(index, 1);
        saveCart(cart);
        renderCart();
        showCartToast(`${name} eliminado del carrito`);
      }
    }
  });

  // Botón vaciar carrito
  const clearBtn = document.getElementById('cart-clear-btn');
  clearBtn?.addEventListener('click', () => {
    saveCart([]);
    renderCart();
    showCartToast('Carrito vaciado');
  });

  // Botón iniciar pago seguro (Validación en servidor)
  const checkoutBtn = document.getElementById('cart-checkout-btn');
  checkoutBtn?.addEventListener('click', async () => {
    const currentCart = getCart();
    if (currentCart.length === 0) return;

    // 1. Requerir autenticación
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      showCartToast('Debes iniciar sesión para comprar');
      setTimeout(() => window.location.href = './login.html', 1500);
      return;
    }

    checkoutBtn.disabled = true;
    checkoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validando...';

    try {
      // 2. Construir payload ligero para validar precios y stock
      const payload = currentCart.map(item => ({ 
        id: item.id, 
        qty: item.qty, 
        price: item.price 
      }));

      // 3. Ejecutar función segura en el backend
      const { data, error } = await supabase.rpc('validate_cart_prices', { cart_payload: payload });

      if (error) {
        console.error('Error del servidor:', error);
        showCartToast('Error al procesar el carrito');
        return;
      }

      // 4. Analizar respuesta de seguridad
      if (!data.valid) {
        showCartToast('Algunos precios cambiaron o no hay stock', 'error');
        // En un caso real, actualizaríamos el localStorage con los precios de data.items
      } else {
        showCartToast(`Precios validados (${formatPrice(data.total)}). ¡Iniciando pasarela de pago!`, 'success');
      }
    } catch (err) {
      console.error(err);
      showCartToast('Error de conexión');
    } finally {
      checkoutBtn.disabled = false;
      checkoutBtn.textContent = 'Proceder al Pago';
    }
  });
}

// --- Toast de notificación ---
function showCartToast(message, type = 'default') {
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

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
  renderCart();
  initCartEvents();
  initCouponEvents();
});
