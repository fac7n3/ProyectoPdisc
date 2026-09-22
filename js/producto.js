import { supabase } from './auth-utils.js';
import { getCart, saveCart, formatPrice, updateCartBadge, showToast, renderErrorState } from './cart-utils.js';
import { sortOptionGroups, missingOptionNames, buildSelectionSnapshot, describeSelectedOptions, cartLineKey, itemLineKey } from './product-options-utils.js';
import { renderReviewsSection } from './reviews-utils.js';
import { initSearchBox, initNotificationsBell, initCategoryBar, initAccountMenu } from './nav-utils.js';
import { buildContactAction } from './store-contact-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

document.addEventListener('DOMContentLoaded', async () => {
  updateCartBadge();
  initNotificationsBell();
  initAccountMenu();
  initCategoryBar({ activeSlug: 'inicio' });

  initSearchBox({
    onSubmit: (term) => { window.location.href = `./search.html?q=${encodeURIComponent(term)}`; },
  });

  const container = document.getElementById('product-container');
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');

  if (!productId) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: #ef4444;">No se especificó un producto.</div>';
    return;
  }

  try {
    const [{ data: product, error }, { data: { session } }] = await Promise.all([
      supabase
        .from('products')
        .select('*, stores(name, id, contact_method, phone, whatsapp, owner_id), product_images(url, position), product_options(id, name, position, product_option_values(id, value, is_available, position))')
        .eq('id', productId)
        .single(),
      supabase.auth.getSession(),
    ]);

    if (error || !product) throw error || new Error('Producto no encontrado');

    document.title = `${product.title} — Baradero Local`;
    // El h1 (invisible) es lo que TalkBack anuncia al entrar y lo que usa
    // para el salto por encabezados: sin esto queda en "Cargando producto".
    const pageH1 = document.getElementById('page-h1');
    if (pageH1) pageH1.textContent = product.title;

    const storeName = product.stores ? product.stores.name : 'Tienda';
    const storeId = product.stores ? product.stores.id : '';
    const imgUrl = product.image_url || '/img/no-image.svg';
    // A113-273: el vendedor viendo su propio producto no necesita comprar,
    // contactarse a sí mismo ni dejarse una reseña.
    const isOwner = !!(session?.user?.id && product.stores?.owner_id && session.user.id === product.stores.owner_id);

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

    // Selector de opciones (color / sabor / talle). Antes acá había una lista
    // informativa con un "consultá con el vendedor" -- F5-03 nunca llegó al
    // carrito. Mismos chips que el modal rápido (Assets/styles/product-modal.css,
    // que esta página ya carga) para que la elección se vea igual en los dos
    // lugares donde se puede comprar.
    const optionGroups = sortOptionGroups(
      (product.product_options || []).map((g) => ({ ...g, values: g.product_option_values || [] }))
    );

    if (optionGroups.length > 0) {
      const optionsWrap = document.createElement('div');
      optionsWrap.className = 'pm-options';
      optionsWrap.id = 'product-options';

      optionGroups.forEach((group) => {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'pm-option';

        const legend = document.createElement('legend');
        legend.className = 'pm-option__title';
        legend.textContent = group.name;
        fieldset.appendChild(legend);

        const chips = document.createElement('div');
        chips.className = 'pm-option__chips';

        group.values.forEach((value) => {
          const label = document.createElement('label');
          label.className = 'pm-option__chip' + (value.is_available ? '' : ' pm-option__chip--out');

          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = `product-opt-${group.id}`;
          radio.value = value.id;
          radio.disabled = !value.is_available;
          label.appendChild(radio);

          const text = document.createElement('span');
          text.textContent = value.value;
          label.appendChild(text);

          chips.appendChild(label);
        });

        fieldset.appendChild(chips);
        optionsWrap.appendChild(fieldset);
      });

      info.appendChild(optionsWrap);
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'product-actions';
    const outOfStock = product.stock <= 0;

    if (isOwner) {
      const ownerNotice = document.createElement('p');
      ownerNotice.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.875rem 1rem; background: var(--bl-surface-alt, #f1f5f9); border: 1px dashed var(--bl-border, #cbd5e1); border-radius: var(--bl-radius-md); color: var(--bl-text-secondary, #4a5568); font-size: 0.875rem; font-weight: 500;';
      ownerNotice.innerHTML = '<i class="fa-solid fa-store" aria-hidden="true"></i> Este es tu producto -- así lo ven tus clientes.';
      actionsDiv.appendChild(ownerNotice);
    } else {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn-add-cart';
      addBtn.id = 'btn-add-cart';
      const cartIcon = document.createElement('i');
      cartIcon.className = 'fa-solid fa-cart-plus';
      addBtn.appendChild(cartIcon);
      addBtn.append(' Agregar al carrito');

      if (outOfStock) {
        addBtn.disabled = true;
        addBtn.style.cssText = 'opacity: 0.5; cursor: not-allowed;';
        addBtn.title = 'Producto sin stock';
      }
      actionsDiv.appendChild(addBtn);

      // Contactar al vendedor por teléfono o WhatsApp (según lo que eligió en
      // su panel, stores.contact_method) con el contexto de este producto.
      const contactAction = buildContactAction(product.stores, product.title);
      if (contactAction) {
        const contactLink = document.createElement('a');
        contactLink.style.cssText = 'display: inline-flex; align-items: center; gap: 0.4rem; margin-left: 0.75rem; padding: 0.6rem 1.25rem; border: 2px solid var(--bl-primary); color: var(--bl-primary); border-radius: var(--bl-radius-md); font-weight: 600; text-decoration: none;';
        contactLink.href = contactAction.href;
        contactLink.target = contactAction.href.startsWith('https://wa.me/') ? '_blank' : '_self';
        contactLink.rel = 'noopener';
        contactLink.title = contactAction.label;
        const icon = document.createElement('i');
        icon.className = contactAction.icon;
        contactLink.appendChild(icon);
        contactLink.append(` Contactar al vendedor`);
        actionsDiv.appendChild(contactLink);
      }
    }

    info.appendChild(actionsDiv);

    // Etiqueta de stock (cantidad en verde/amarillo, "Sin stock" en rojo) +,
    // si está agotado, el botón de avisar (F12-09) a su derecha.
    const stockRow = document.createElement('div');
    stockRow.className = 'product-stock-row';

    const stockBadge = document.createElement('span');
    const LOW_STOCK_THRESHOLD = 5;
    if (outOfStock) {
      stockBadge.className = 'product-stock-badge product-stock-badge--out';
      stockBadge.textContent = 'Sin stock';
    } else if (product.stock <= LOW_STOCK_THRESHOLD) {
      stockBadge.className = 'product-stock-badge product-stock-badge--low';
      stockBadge.textContent = `Stock: ${product.stock}`;
    } else {
      stockBadge.className = 'product-stock-badge product-stock-badge--ok';
      stockBadge.textContent = `Stock: ${product.stock}`;
    }
    stockRow.appendChild(stockBadge);
    info.appendChild(stockRow);

    // F12-09: producto agotado -> ofrecer avisar cuando vuelva el stock.
    // A113-273: el dueño no necesita que le avisen cuando vuelva el stock
    // de su propio producto.
    if (outOfStock && !isOwner) {
      const alertWrap = document.createElement('span');
      stockRow.appendChild(alertWrap);
      renderStockAlertWidget(alertWrap, product.id);
    }

    container.appendChild(info);

    // F7-01: reseñas del producto.
    const reviewsSection = document.createElement('section');
    reviewsSection.style.cssText = 'grid-column: 1/-1; max-width: 700px; margin-top: 2rem;';
    container.appendChild(reviewsSection);
    renderReviewsSection(reviewsSection, 'product', product.id, { hideForm: isOwner });

    // Bind Add to Cart (no existe si isOwner -- no hay botón que cablear)
    const btnAdd = document.getElementById('btn-add-cart');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        const selectedIds = [...document.querySelectorAll('#product-options input[type="radio"]:checked')].map((r) => r.value);

        // Igual que en el modal: sin elegir todo no se agrega. create_order lo
        // rechazaría igual, pero recién al pagar y sin decir qué falta.
        const missing = missingOptionNames(optionGroups, selectedIds);
        if (missing.length > 0) {
          showToast(`Elegí ${missing.map((m) => m.toLowerCase()).join(' y ')} antes de agregar al carrito.`, 'error');
          document.getElementById('product-options')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }

        const lineKey = cartLineKey(product.id, selectedIds);
        const cart = getCart();
        const existing = cart.find(item => itemLineKey(item) === lineKey);

        if (existing) {
          existing.qty++;
          existing.selected = true; // vuelve a entrar en la compra (ver cart-utils)
        } else {
          cart.push({
            id: product.id,
            name: product.title,
            shop: storeName,
            price: product.price,
            priceOld: null,
            image: imgUrl,
            qty: 1,
            options: selectedIds,
            optionsLabel: buildSelectionSnapshot(optionGroups, selectedIds),
            selected: true // un producto recién agregado entra tildado
          });
        }

        saveCart(cart);

        // Animation
        btnAdd.style.transform = 'scale(0.95)';
        setTimeout(() => { btnAdd.style.transform = ''; }, 100);

        updateCartBadge();
        const chosen = describeSelectedOptions(buildSelectionSnapshot(optionGroups, selectedIds));
        showToast(`${product.title}${chosen ? ` (${chosen})` : ''} agregado al carrito`, 'success');
      });
    }

  } catch (err) {
    console.error('Error fetching product:', err);
    renderErrorState(container, 'No se pudo cargar el producto.', () => window.location.reload());
  }
});

/**
 * F12-09: producto agotado -> el cliente pide que le avisen cuando vuelva el
 * stock (stock_alerts + trigger en products, 45_stock_alerts.sql). Requiere
 * sesión -- a diferencia de favoritos (F4-03), no tiene sentido un modo
 * invitado porque el aviso llega después, a un client_id real.
 */
async function renderStockAlertWidget(container, productId) {
  container.textContent = '';

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.cssText = 'padding: 0.6rem 1.25rem; border: 2px solid var(--bl-text-muted, #94a3b8); color: var(--bl-text-secondary, #4a5568); border-radius: var(--bl-radius-md); font-weight: 600; background: none; cursor: pointer;';
    btn.textContent = 'Avisarme cuando vuelva el stock';
    btn.addEventListener('click', () => {
      showToast('Iniciá sesión para que te avisemos.', 'default');
      window.location.href = './login.html';
    });
    container.appendChild(btn);
    return;
  }

  const { data: existing } = await supabase
    .from('stock_alerts')
    .select('notified_at')
    .eq('product_id', productId)
    .eq('client_id', session.user.id)
    .maybeSingle();

  if (existing && !existing.notified_at) {
    const confirmedLabel = document.createElement('span');
    confirmedLabel.style.cssText = 'color: var(--bl-success, #10b981); font-weight: 600;';
    confirmedLabel.textContent = '✓ Te vamos a avisar cuando vuelva el stock.';
    container.appendChild(confirmedLabel);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.style.cssText = 'display: block; margin-top: 0.35rem; background: none; border: none; color: var(--bl-text-muted, #94a3b8); text-decoration: underline; cursor: pointer; font-size: 0.8rem;';
    cancelBtn.textContent = 'Cancelar aviso';
    cancelBtn.addEventListener('click', async () => {
      await supabase.from('stock_alerts').delete().eq('product_id', productId).eq('client_id', session.user.id);
      renderStockAlertWidget(container, productId);
    });
    container.appendChild(cancelBtn);
    return;
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.style.cssText = 'padding: 0.6rem 1.25rem; border: 2px solid var(--bl-primary); color: var(--bl-primary); border-radius: var(--bl-radius-md); font-weight: 600; background: none; cursor: pointer;';
  btn.textContent = 'Avisarme cuando vuelva el stock';
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    const { error } = await supabase
      .from('stock_alerts')
      .upsert(
        { product_id: productId, client_id: session.user.id, notified_at: null },
        { onConflict: 'product_id,client_id' }
      );

    if (error) {
      console.error('Error al registrar aviso de stock:', error);
      showToast('No se pudo registrar el aviso.', 'error');
      btn.disabled = false;
      btn.textContent = 'Avisarme cuando vuelva el stock';
      return;
    }

    showToast('¡Listo! Te vamos a avisar cuando vuelva el stock.', 'success');
    renderStockAlertWidget(container, productId);
  });
  container.appendChild(btn);
}
