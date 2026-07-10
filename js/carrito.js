// Lógica del carrito de compras — Baradero Local
// Usa localStorage para persistir los productos entre páginas.
import { supabase } from './auth-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

import { getCart, saveCart, clearCart, updateCartBadge, MAX_QTY, formatPrice } from './cart-utils.js';
import { getPaymentProvider } from './payment-providers.js';

// --- Estado del Carrito ---
let currentDiscount = 0; // Porcentaje de descuento (0 a 1)
let appliedCouponCode = null; // Código tal cual lo valida el servidor en create_order
let deliveryMethod = 'pickup'; // 'pickup' | 'delivery' — ver initDeliveryEvents()
let shippingAddress = '';
let paymentMethod = 'simulado'; // 'simulado' | 'transferencia' — ver initPaymentMethodEvents()

// Política de envío unificada (F2-05): igual que en create_order (migración 20)
// para que lo que se muestra en el resumen coincida con lo que se cobra.
const FREE_SHIPPING_THRESHOLD = 5000;
const FLAT_SHIPPING_FEE = 350;

/** Agrupa el carrito por tienda y calcula el envío de cada una (post-descuento). */
function calculateShippingByStore(cart, discount) {
  if (deliveryMethod === 'pickup') return 0;

  const subtotalByStore = cart.reduce((acc, item) => {
    const shop = item.shop || 'Tienda';
    acc[shop] = (acc[shop] || 0) + item.price * item.qty;
    return acc;
  }, {});

  return Object.values(subtotalByStore).reduce((total, storeSubtotal) => {
    const discounted = storeSubtotal * (1 - discount);
    return total + (discounted >= FREE_SHIPPING_THRESHOLD ? 0 : FLAT_SHIPPING_FEE);
  }, 0);
}

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
    img.src = item.image || '/img/no-image.svg';
    img.alt = item.name || 'Producto';
    img.className = 'cart-item__img';
    img.loading = 'lazy';
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

  // Envío: gratis en "retiro"; en "envío a domicilio" se calcula por tienda
  // (mismo criterio que create_order, ver calculateShippingByStore arriba).
  const shipping = calculateShippingByStore(cart, currentDiscount);
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

/** Inicializar selector de retiro/envío a domicilio */
function initDeliveryEvents() {
  const header = document.getElementById('delivery-header');
  const content = document.getElementById('delivery-content');
  const pickupRadio = document.getElementById('delivery-pickup');
  const shippingRadio = document.getElementById('delivery-shipping');
  const addressInput = document.getElementById('delivery-address');
  const shippingLabel = document.getElementById('summary-shipping-label');

  if (!header || !content || !pickupRadio || !shippingRadio || !addressInput) return;

  header.addEventListener('click', () => {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    header.classList.toggle('is-open', isHidden);
  });

  function updateMethod() {
    deliveryMethod = shippingRadio.checked ? 'delivery' : 'pickup';
    addressInput.style.display = deliveryMethod === 'delivery' ? 'block' : 'none';
    if (shippingLabel) {
      shippingLabel.textContent = deliveryMethod === 'delivery'
        ? 'Envío (Envío a domicilio)'
        : 'Envío (Retiro en el local)';
    }
    renderCart();
  }

  pickupRadio.addEventListener('change', updateMethod);
  shippingRadio.addEventListener('change', updateMethod);
  addressInput.addEventListener('input', () => {
    shippingAddress = addressInput.value.trim();
  });
}

/** Inicializar selector de método de pago (simulado / transferencia) */
function initPaymentMethodEvents() {
  const header = document.getElementById('payment-header');
  const content = document.getElementById('payment-content');
  const simuladoRadio = document.getElementById('payment-simulado');
  const transferenciaRadio = document.getElementById('payment-transferencia');

  if (!header || !content || !simuladoRadio || !transferenciaRadio) return;

  header.addEventListener('click', () => {
    const isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    header.classList.toggle('is-open', isHidden);
  });

  function updateMethod() {
    paymentMethod = transferenciaRadio.checked ? 'transferencia' : 'simulado';
  }

  simuladoRadio.addEventListener('change', updateMethod);
  transferenciaRadio.addEventListener('change', updateMethod);
}

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
      appliedCouponCode = null;
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
        appliedCouponCode = null;
        message.textContent = 'Código inválido o expirado.';
        message.classList.add('is-error');
      } else {
        currentDiscount = data.discount_percentage / 100;
        appliedCouponCode = code;
        message.textContent = `¡Cupón aplicado! Tenés ${data.discount_percentage}% de descuento.`;
        message.classList.add('is-success');
      }
    } catch (err) {
      console.error('Error validando cupón:', err);
      currentDiscount = 0;
      appliedCouponCode = null;
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

  // Botón iniciar pago: crea la(s) orden(es) de verdad vía el RPC create_order.
  // El método de entrega queda fijo en "pickup" sin dirección por ahora —
  // elegir retiro/envío + calcular delivery_fee es F2-05, todavía no tiene UI.
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

    // 2. Si eligió envío a domicilio, necesita una dirección (el servidor
    // también lo valida, pero avisar acá evita el viaje de red al pedo).
    if (deliveryMethod === 'delivery' && !shippingAddress) {
      showCartToast('Ingresá una dirección de envío.', 'error');
      return;
    }

    checkoutBtn.disabled = true;
    checkoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

    try {
      // create_order vuelve a leer el precio real de cada producto en el
      // servidor — no hace falta (ni conviene) mandarle el precio del carrito.
      const payload = currentCart.map(item => ({ id: item.id, qty: item.qty }));

      const { data, error } = await supabase.rpc('create_order', {
        cart_payload: payload,
        coupon_code: appliedCouponCode,
        p_delivery_method: deliveryMethod,
        p_payment_method: paymentMethod,
        p_shipping_address: deliveryMethod === 'delivery' ? shippingAddress : null,
      });

      if (error) {
        console.error('Error al crear la orden:', error);
        showCartToast(error.message || 'No se pudo procesar tu pedido.', 'error');
        return;
      }

      const orders = data?.orders || [];
      const orderIds = orders.map((o) => o.order_id);
      const total = orders.reduce((acc, o) => acc + o.total_price, 0);

      // La orden ya existe (pending); "pagarla" es un paso aparte a través
      // del provider correspondiente al método elegido.
      const provider = getPaymentProvider(paymentMethod);
      const paymentResult = await provider.pay(orderIds);

      // mercadopago ya disparó la redirección al checkout hospedado dentro de
      // pay() — el navegador está por salir de la página, no hay nada más
      // para mostrar acá (el pago real se confirma después vía webhook).
      if (paymentResult.redirecting) {
        clearCart();
        return;
      }

      if (!paymentResult.success) {
        // La orden quedó creada (pending) aunque el pago haya fallado; el
        // cliente la puede reintentar después (ver historial, F2-06).
        console.error('Error al confirmar el pago:', paymentResult.message);
        showCartToast('Pedido creado, pero hubo un problema al confirmar el pago.', 'error');
        clearCart();
        setTimeout(() => window.location.href = './home.html', 2000);
        return;
      }

      // "transferencia" no confirma nada en el momento — queda pending hasta
      // que el cliente suba el comprobante (F2-04, ver perfil.js).
      const mensaje = paymentResult.pending
        ? `Pedido creado (Total: ${formatPrice(total)}). Subí el comprobante desde "Mis compras" para confirmar el pago.`
        : orders.length > 1
          ? `¡${orders.length} pedidos pagados! Total: ${formatPrice(total)}`
          : `¡Pedido pagado! Total: ${formatPrice(total)}`;

      clearCart();
      showCartToast(mensaje, 'success');
      setTimeout(() => window.location.href = paymentResult.pending ? './perfil.html' : './home.html', 2500);
    } catch (err) {
      console.error(err);
      showCartToast('Error de conexión al procesar el pedido.', 'error');
    } finally {
      checkoutBtn.disabled = false;
      checkoutBtn.innerHTML = 'Iniciar pago <i class="fa-solid fa-arrow-right"></i>';
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

/**
 * F4-02: revalida el carrito contra el catálogo real (el localStorage puede
 * tener productos que el vendedor desactivó, borró, o les bajó el stock
 * desde la última vez que se abrió el carrito). Quita lo que ya no está
 * disponible, ajusta cantidades al stock real y actualiza precios
 * desactualizados — igual que hace create_order en el checkout, pero acá
 * mostrado ANTES de llegar a pagar.
 */
async function validateCartFreshness() {
  const cart = getCart();
  if (cart.length === 0) return;

  const { data: products, error } = await supabase
    .from('products')
    .select('id, price, stock, is_active')
    .in('id', cart.map((item) => item.id));

  if (error) {
    console.error('Error al revalidar el carrito:', error);
    return;
  }

  const byId = new Map((products || []).map((p) => [p.id, p]));
  const removedNames = [];
  const adjustedNames = [];

  const validatedCart = cart.reduce((acc, item) => {
    const product = byId.get(item.id);

    if (!product || !product.is_active || product.stock <= 0) {
      removedNames.push(item.name);
      return acc;
    }

    const clampedQty = Math.min(item.qty, product.stock);
    if (clampedQty !== item.qty || product.price !== item.price) {
      adjustedNames.push(item.name);
    }

    acc.push({ ...item, qty: clampedQty, price: product.price });
    return acc;
  }, []);

  if (removedNames.length === 0 && adjustedNames.length === 0) return;

  saveCart(validatedCart);
  renderCart();

  if (removedNames.length > 0) {
    showCartToast(`Ya no están disponibles: ${removedNames.join(', ')}`, 'error');
  } else {
    showCartToast('Actualizamos precios o cantidades de tu carrito según disponibilidad actual.', 'default');
  }
}

// --- Inicialización ---
document.addEventListener('DOMContentLoaded', () => {
  renderCart();
  initCartEvents();
  initCouponEvents();
  initDeliveryEvents();
  initPaymentMethodEvents();
  validateCartFreshness();
});
