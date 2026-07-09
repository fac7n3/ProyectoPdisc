/**
 * product-modal.js — Modal de detalle de producto premium
 * Baradero Local
 * 
 * Módulo independiente: extrae datos del DOM de la tarjeta clickeada,
 * construye el modal dinámicamente, y maneja todas las interacciones.
 */

import { getCart as _getCart, saveCart as _saveCart, parsePrice as _parsePrice, updateCartBadge as _updateBadge, showToast as _showToast } from './cart-utils.js';

// ── Seguridad ───────────────────────────────────────────────
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ── Datos del producto ──────────────────────────────────────
function extractProductData(card) {
  const id = card.id;
  const price = card.dataset.price !== undefined ? Number(card.dataset.price) : _parsePrice(card.querySelector('.product-card__price')?.textContent || '0');
  const name = escapeHTML(card.querySelector('.product-card__name')?.textContent?.trim() || 'Producto');
  const shopEl = card.querySelector('.product-card__shop');
  const shop = escapeHTML(shopEl?.textContent?.trim()?.replace(/^\s*/, '') || 'Tienda');
  const priceText = escapeHTML(card.querySelector('.product-card__price')?.textContent || '$0');
  const priceOldText = escapeHTML(card.querySelector('.product-card__price-old')?.textContent || '');
  const discountText = escapeHTML(card.querySelector('.product-card__discount')?.textContent || '');
  const imgSrc = encodeURI(card.querySelector('.product-card__image img')?.getAttribute('src') || '');
  const imgAlt = escapeHTML(card.querySelector('.product-card__image img')?.getAttribute('alt') || name);
  const shippingText = escapeHTML(card.querySelector('.product-card__shipping')?.textContent?.trim() || '');

  // Rating
  const starsContainer = card.querySelector('.product-card__stars');
  const fullStars = starsContainer?.querySelectorAll('.fa-star:not(.empty)').length || 0;
  const halfStars = starsContainer?.querySelectorAll('.fa-star-half-stroke').length || 0;
  const emptyStars = starsContainer?.querySelectorAll('.fa-star.empty, .fa-regular.fa-star.empty').length || 0;
  const ratingCount = card.querySelector('.product-card__rating-count')?.textContent?.replace(/[()]/g, '') || '0';

  // Categorías
  const categories = (card.dataset.category || '').split(' ');

  // Badge
  const badgeEl = card.querySelector('.product-card__badge');
  const badgeText = badgeEl?.textContent?.trim() || '';
  const badgeType = badgeEl?.classList.contains('product-card__badge--envio') ? 'envio'
    : badgeEl?.classList.contains('product-card__badge--oferta') ? 'descuento' : '';

  // Stock simulado (aleatorio consistente basado en ID)
  const stockSeed = (id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const stock = (stockSeed % 40) + 5;

  return {
    id, price, name, shop, priceText, priceOldText, discountText,
    imgSrc, imgAlt, shippingText,
    fullStars, halfStars, emptyStars, ratingCount,
    categories, badgeText, badgeType, stock
  };
}

// ── Generar estrellas HTML ──────────────────────────────────
function renderStars(full, half, empty) {
  let html = '';
  for (let i = 0; i < full; i++) html += '<i class="fa-solid fa-star"></i>';
  for (let i = 0; i < half; i++) html += '<i class="fa-solid fa-star-half-stroke"></i>';
  // Calcular las estrellas vacías restantes hasta 5
  const totalEmpty = 5 - full - half;
  for (let i = 0; i < totalEmpty; i++) html += '<i class="fa-regular fa-star empty"></i>';
  return html;
}

// ── Stock visual ───────────────────────────────────────────
function getStockInfo(stock) {
  if (stock <= 10) {
    return { text: `¡Últimas ${stock} unidades!`, cssClass: 'low', fillClass: 'pm-stock__fill--low' };
  } else if (stock <= 25) {
    return { text: `Quedan ${stock} unidades`, cssClass: 'ok', fillClass: 'pm-stock__fill--mid' };
  }
  return { text: `Disponible (${stock} unidades)`, cssClass: 'ok', fillClass: 'pm-stock__fill--high' };
}

// ── Productos relacionados ─────────────────────────────────
function getRelatedProducts(currentId, categories) {
  const allCards = document.querySelectorAll('.product-card');
  const related = [];

  allCards.forEach(card => {
    if (card.id === currentId) return;
    const cardCats = (card.dataset.category || '').split(' ');
    const hasCommon = categories.some(c => c && cardCats.includes(c));
    if (hasCommon) related.push(card);
  });

  // Si no hay suficientes, tomar los demás
  if (related.length < 4) {
    allCards.forEach(card => {
      if (card.id !== currentId && !related.includes(card) && related.length < 6) {
        related.push(card);
      }
    });
  }

  return related.slice(0, 6);
}

// ── Construir HTML del modal ───────────────────────────────
function buildModalHTML(data) {
  const stockInfo = getStockInfo(data.stock);
  const shopInitial = data.shop.replace(/^[\s\W]*/, '').charAt(0).toUpperCase();
  const shopClean = data.shop.replace(/^[\s]*/, '').replace(/^\s*\S+\s*/, ''); // quitar icono text

  // Related products
  const relatedCards = getRelatedProducts(data.id, data.categories);
  let relatedHTML = '';
  relatedCards.forEach(card => {
    const rName = card.querySelector('.product-card__name')?.textContent?.trim() || '';
    const rPrice = card.querySelector('.product-card__price')?.textContent || '';
    const rImg = card.querySelector('.product-card__image img')?.getAttribute('src') || '';
    const rId = card.id || '';
    relatedHTML += `
      <div class="pm-related-card" data-related-id="${rId}" tabindex="0" role="button" aria-label="Ver ${rName}">
        <div class="pm-related-card__img">
          <img src="${rImg}" alt="${rName}" loading="lazy" />
        </div>
        <div class="pm-related-card__body">
          <div class="pm-related-card__name">${rName}</div>
          <div class="pm-related-card__price">${rPrice}</div>
        </div>
      </div>
    `;
  });

  // Badge
  let badgeHTML = '';
  if (data.badgeText) {
    badgeHTML = `<span class="pm-gallery__badge pm-gallery__badge--${data.badgeType || 'descuento'}">${data.badgeText}</span>`;
  }

  // Discount tag
  let discountTagHTML = '';
  if (data.discountText) {
    discountTagHTML = `<span class="pm-discount-tag">${data.discountText}</span>`;
  }

  // Old price
  let oldPriceHTML = '';
  if (data.priceOldText) {
    oldPriceHTML = `<span class="pm-price-old">${data.priceOldText}</span>`;
  }

  return `
    <div class="product-modal" role="dialog" aria-modal="true" aria-label="Detalle de ${data.name}">
      
      <!-- Top Bar -->
      <div class="pm-topbar">
        <button class="pm-topbar__back" id="pm-close-back" aria-label="Volver">
          <i class="fa-solid fa-chevron-left"></i> Atrás
        </button>
        <div class="pm-topbar__actions">
          <button class="pm-topbar__btn" id="pm-share-btn" aria-label="Compartir producto">
            <i class="fa-solid fa-share-nodes"></i>
          </button>
          <button class="pm-topbar__btn pm-topbar__btn--close" id="pm-close-btn" aria-label="Cerrar">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>

      <!-- Main 2-column layout -->
      <div class="pm-main">
        
        <!-- Gallery -->
        <div class="pm-gallery" id="pm-gallery">
          ${badgeHTML}
          <button class="pm-gallery__fav" id="pm-fav-btn" aria-label="Agregar a favoritos">
            <i class="fa-regular fa-heart"></i>
          </button>
          <img class="pm-gallery__img" src="${data.imgSrc}" alt="${data.imgAlt}" />
        </div>

        <!-- Product Info -->
        <div class="pm-info">
          
          <div class="pm-shop" tabindex="0" role="link" aria-label="Ver tienda ${data.shop}">
            <i class="fa-solid fa-store"></i>
            ${data.shop}
          </div>

          <h2 class="pm-name">${data.name}</h2>

          <div class="pm-rating">
            <div class="pm-rating__stars">
              ${renderStars(data.fullStars, data.halfStars, data.emptyStars)}
            </div>
            <span class="pm-rating__count">(${data.ratingCount})</span>
            <span class="pm-rating__sep"></span>
            <span class="pm-rating__sales">${Math.floor(parseInt(data.ratingCount) * 2.3)} vendidos</span>
          </div>

          <div class="pm-price-block">
            <div class="pm-price-row">
              <span class="pm-price">${data.priceText}</span>
              ${oldPriceHTML}
              ${discountTagHTML}
            </div>
            <div class="pm-shipping">
              <i class="fa-solid fa-truck"></i>
              ${data.shippingText || 'Consultá envío'}
            </div>
          </div>

          <!-- Stock -->
          <div class="pm-stock">
            <div class="pm-stock__text pm-stock__text--${stockInfo.cssClass}">
              <i class="fa-solid fa-circle-info"></i>
              ${stockInfo.text}
            </div>
            <div class="pm-stock__bar">
              <div class="pm-stock__fill ${stockInfo.fillClass}"></div>
            </div>
          </div>

          <!-- Quantity -->
          <div class="pm-quantity">
            <span class="pm-quantity__label">Cantidad:</span>
            <div class="pm-quantity__controls">
              <button class="pm-quantity__btn" id="pm-qty-minus" aria-label="Reducir cantidad" disabled>
                <i class="fa-solid fa-minus"></i>
              </button>
              <input type="number" class="pm-quantity__value" id="pm-qty-value" value="1" min="1" max="${data.stock}" aria-label="Cantidad" />
              <button class="pm-quantity__btn" id="pm-qty-plus" aria-label="Aumentar cantidad">
                <i class="fa-solid fa-plus"></i>
              </button>
            </div>
          </div>

          <!-- Actions -->
          <div class="pm-actions">
            <button class="pm-btn pm-btn--cart" id="pm-add-cart">
              <i class="fa-solid fa-cart-plus"></i>
              Añadir al carrito
            </button>
            <button class="pm-btn pm-btn--buy" id="pm-buy-now">
              <i class="fa-solid fa-bolt"></i>
              Comprar ahora
            </button>
          </div>

        </div>
      </div>

      <hr class="pm-divider" />

      <!-- Tabs -->
      <div class="pm-tabs-section">
        <div class="pm-tabs" role="tablist">
          <button class="pm-tab is-active" data-tab="desc" role="tab" aria-selected="true">Descripción</button>
          <button class="pm-tab" data-tab="specs" role="tab" aria-selected="false">Características</button>
          <button class="pm-tab" data-tab="shop" role="tab" aria-selected="false">Sobre la tienda</button>
        </div>

        <div class="pm-tab-content is-visible" data-tab-content="desc">
          <p class="pm-description">
            Descubrí <strong>${data.name}</strong> de <strong>${data.shop}</strong>, un producto de primera calidad 
            disponible en tu zona. Comprando local apoyás a los comercios de Baradero y recibís 
            productos frescos y de confianza directo en tu puerta. 
            <br /><br />
            Ideal para el día a día, con la calidad que ya conocés de los negocios de tu barrio.
          </p>
        </div>

        <div class="pm-tab-content" data-tab-content="specs">
          <div class="pm-features">
            <div class="pm-feature-item"><i class="fa-solid fa-box"></i> Producto original con garantía del comercio</div>
            <div class="pm-feature-item"><i class="fa-solid fa-weight-scale"></i> Peso/volumen según etiqueta</div>
            <div class="pm-feature-item"><i class="fa-solid fa-store"></i> Vendido por ${data.shop}</div>
            <div class="pm-feature-item"><i class="fa-solid fa-truck"></i> ${data.shippingText || 'Consultá disponibilidad de envío'}</div>
            <div class="pm-feature-item"><i class="fa-solid fa-shield-halved"></i> Devolución gratuita dentro de las 48hs</div>
            <div class="pm-feature-item"><i class="fa-solid fa-location-dot"></i> Disponible para envío y retiro en tienda</div>
          </div>
        </div>

        <div class="pm-tab-content" data-tab-content="shop">
          <div class="pm-shop-info">
            <div class="pm-shop-info__avatar">${shopInitial}</div>
            <div class="pm-shop-info__details">
              <div class="pm-shop-info__name">${data.shop}</div>
              <div class="pm-shop-info__meta">
                <i class="fa-solid fa-circle-check"></i> Comercio verificado • Baradero
              </div>
            </div>
            <button class="pm-shop-info__link" aria-label="Ver todos los productos de ${data.shop}">
              Ver tienda
            </button>
          </div>
        </div>
      </div>

      ${relatedCards.length > 0 ? `
        <hr class="pm-divider" />
        <!-- Related Products -->
        <div class="pm-related">
          <h3 class="pm-related__title">Productos relacionados</h3>
          <div class="pm-related__scroll">
            ${relatedHTML}
          </div>
        </div>
      ` : ''}

    </div>
  `;
}

// ── Estado del modal ───────────────────────────────────────
let currentOverlay = null;
let previousFocus = null;
let currentProductData = null;

// ── Abrir modal ────────────────────────────────────────────
function openProductModal(card) {
  if (!card.id) {
    console.error('Se intentó abrir el modal de un producto sin id real (UUID)');
    return;
  }

  // Si ya hay uno abierto, cerrarlo primero
  if (currentOverlay) closeProductModal();

  previousFocus = document.activeElement;
  currentProductData = extractProductData(card);

  // Crear overlay
  const overlay = document.createElement('div');
  overlay.className = 'product-modal-overlay';
  overlay.id = 'pm-overlay';
  overlay.innerHTML = buildModalHTML(currentProductData);
  document.body.appendChild(overlay);
  currentOverlay = overlay;

  // Calcular scrollbar width para evitar layout shift
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.documentElement.style.setProperty('--scrollbar-width', scrollbarWidth + 'px');
  document.body.classList.add('modal-open');

  // Trigger reflow & open
  void overlay.offsetHeight;
  requestAnimationFrame(() => overlay.classList.add('is-open'));

  // Bind events
  bindModalEvents(overlay, currentProductData);

  // Animar la barra de stock
  const stockFill = overlay.querySelector('.pm-stock__fill');
  if (stockFill) {
    const w = stockFill.style.width || window.getComputedStyle(stockFill).width;
    stockFill.style.width = '0%';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        stockFill.style.width = '';
      });
    });
  }
}

// ── Cerrar modal ───────────────────────────────────────────
function closeProductModal() {
  if (!currentOverlay) return;

  currentOverlay.classList.remove('is-open');
  document.body.classList.remove('modal-open');
  document.documentElement.style.removeProperty('--scrollbar-width');

  const overlay = currentOverlay;
  currentOverlay = null;

  // Esperar la transición para remover del DOM
  setTimeout(() => {
    overlay.remove();
  }, 400);

  // Restaurar foco
  if (previousFocus) {
    previousFocus.focus();
    previousFocus = null;
  }
}

// ── Bind de eventos ────────────────────────────────────────
function bindModalEvents(overlay, data) {
  const modal = overlay.querySelector('.product-modal');

  // Close buttons
  overlay.querySelector('#pm-close-back')?.addEventListener('click', closeProductModal);
  overlay.querySelector('#pm-close-btn')?.addEventListener('click', closeProductModal);

  // Click fuera del modal
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeProductModal();
  });

  // ESC
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeProductModal();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);

  // Zoom de imagen
  const gallery = overlay.querySelector('#pm-gallery');
  gallery?.addEventListener('click', (e) => {
    if (e.target.closest('.pm-gallery__fav')) return;
    gallery.classList.toggle('is-zoomed');
  });

  // Favoritos
  const favBtn = overlay.querySelector('#pm-fav-btn');
  favBtn?.addEventListener('click', () => {
    const icon = favBtn.querySelector('i');
    const isActive = favBtn.classList.contains('is-active');

    if (isActive) {
      favBtn.classList.remove('is-active');
      icon.classList.replace('fa-solid', 'fa-regular');
      _showToast('Eliminado de favoritos');
    } else {
      favBtn.classList.add('is-active');
      icon.classList.replace('fa-regular', 'fa-solid');
      _showToast('Agregado a favoritos', 'success');
    }
  });

  // Cantidad
  const qtyInput = overlay.querySelector('#pm-qty-value');
  const qtyMinus = overlay.querySelector('#pm-qty-minus');
  const qtyPlus = overlay.querySelector('#pm-qty-plus');

  function updateQtyState() {
    const val = parseInt(qtyInput.value, 10) || 1;
    qtyMinus.disabled = val <= 1;
    qtyPlus.disabled = val >= data.stock;
  }

  qtyMinus?.addEventListener('click', () => {
    const val = parseInt(qtyInput.value, 10) || 1;
    if (val > 1) qtyInput.value = val - 1;
    updateQtyState();
  });

  qtyPlus?.addEventListener('click', () => {
    const val = parseInt(qtyInput.value, 10) || 1;
    if (val < data.stock) qtyInput.value = val + 1;
    updateQtyState();
  });

  qtyInput?.addEventListener('change', () => {
    let val = parseInt(qtyInput.value, 10) || 1;
    val = Math.max(1, Math.min(val, data.stock));
    qtyInput.value = val;
    updateQtyState();
  });

  // Agregar al carrito
  const addCartBtn = overlay.querySelector('#pm-add-cart');
  addCartBtn?.addEventListener('click', () => {
    const qty = parseInt(qtyInput?.value, 10) || 1;
    const priceOld = _parsePrice(data.priceOldText);

    const cart = _getCart();
    const existing = cart.find(item => item.id === data.id);

    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        id: data.id,
        name: data.name,
        shop: data.shop,
        price: data.price,
        priceOld: priceOld || null,
        image: data.imgSrc,
        qty
      });
    }

    _saveCart(cart);
    _updateBadge();

    // Animación de feedback
    addCartBtn.classList.add('pm-btn--added');
    const originalHTML = addCartBtn.innerHTML;
    addCartBtn.innerHTML = '<i class="fa-solid fa-check"></i> ¡Agregado!';

    setTimeout(() => {
      addCartBtn.classList.remove('pm-btn--added');
      addCartBtn.innerHTML = originalHTML;
    }, 1800);

    _showToast(`${data.name} agregado al carrito (x${qty})`, 'success');
  });

  // Comprar ahora
  const buyBtn = overlay.querySelector('#pm-buy-now');
  buyBtn?.addEventListener('click', () => {
    const qty = parseInt(qtyInput?.value, 10) || 1;
    const priceOld = _parsePrice(data.priceOldText);

    const cart = _getCart();
    const existing = cart.find(item => item.id === data.id);

    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        id: data.id,
        name: data.name,
        shop: data.shop,
        price: data.price,
        priceOld: priceOld || null,
        image: data.imgSrc,
        qty
      });
    }

    _saveCart(cart);
    _updateBadge();

    closeProductModal();

    // Redirigir al carrito
    const isInPages = window.location.pathname.includes('/pages/');
    window.location.href = isInPages ? './carrito.html' : './pages/carrito.html';
  });

  // Compartir
  const shareBtn = overlay.querySelector('#pm-share-btn');
  shareBtn?.addEventListener('click', async () => {
    const shareData = {
      title: data.name,
      text: `Mirá ${data.name} en Baradero Local por ${data.priceText}`,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.text} — ${shareData.url}`);
        _showToast('¡Link copiado al portapapeles!', 'success');
      }
    } catch (err) {
      // User cancelled share, ignore
      if (err.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(window.location.href);
          _showToast('¡Link copiado!', 'success');
        } catch { /* silently fail */ }
      }
    }
  });

  // Tabs
  const tabs = overlay.querySelectorAll('.pm-tab');
  const tabContents = overlay.querySelectorAll('.pm-tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tabContents.forEach(tc => tc.classList.remove('is-visible'));

      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');

      const target = tab.dataset.tab;
      const content = overlay.querySelector(`[data-tab-content="${target}"]`);
      if (content) content.classList.add('is-visible');
    });
  });

  // Productos relacionados — click abre el modal de ese producto
  overlay.querySelectorAll('.pm-related-card').forEach(relCard => {
    const handler = () => {
      const relId = relCard.dataset.relatedId;
      const targetCard = document.getElementById(relId);
      if (targetCard) {
        closeProductModal();
        // Pequeño delay para permitir la animación de cierre
        setTimeout(() => openProductModal(targetCard), 450);
      }
    };
    relCard.addEventListener('click', handler);
    relCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
  });

  // Focus trap
  const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const focusableEls = modal.querySelectorAll(focusableSelector);
  const firstFocusable = focusableEls[0];
  const lastFocusable = focusableEls[focusableEls.length - 1];

  modal.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  });

  // Foco inicial al botón de cerrar
  setTimeout(() => firstFocusable?.focus(), 100);
}

// ── Inicializar click en tarjetas ──────────────────────────
function initProductModal() {
  // Delegación de eventos en el grid de productos
  document.querySelectorAll('.products__grid').forEach(grid => {
    grid.addEventListener('click', (e) => {
      // No abrir modal si se clickeó un botón de acción
      const clickedAction = e.target.closest('.product-card__add, .product-card__wishlist');
      if (clickedAction) return;

      const card = e.target.closest('.product-card');
      if (card) {
        e.preventDefault();
        openProductModal(card);
      }
    });
  });
}

// Exportar para uso en módulos
if (typeof window !== 'undefined') {
  window.initProductModal = initProductModal;
  window.openProductModal = openProductModal;
  window.closeProductModal = closeProductModal;
}
