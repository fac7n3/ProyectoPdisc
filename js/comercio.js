import { supabase } from './auth-utils.js';
import { updateCartBadge, showToast, initCartButtons, initWishlist, getFavoriteIds, buildPriceRow, buildShippingBadge, renderErrorState, renderEmptyState, getFavoriteStoreIds, toggleFavoriteStore } from './cart-utils.js';
import { renderReviewsSection } from './reviews-utils.js';
import { initCategoryBar, initSearchBox, initNotificationsBell, initAccountMenu, getCategories } from './nav-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

/** Tarjeta de producto (misma estructura que antes, extraída para poder re-renderizarla al filtrar). */
function buildProductCard(product, store) {
  const article = document.createElement('article');
  article.className = 'product-card';
  article.id = product.id;
  article.dataset.price = product.price;

  const imageDiv = document.createElement('div');
  imageDiv.className = 'product-card__image';

  const img = document.createElement('img');
  img.src = product.image_url || '/img/no-image.svg';
  img.alt = product.title;
  img.loading = 'lazy';
  imageDiv.appendChild(img);

  const wishBtn = document.createElement('button');
  wishBtn.className = 'product-card__wishlist';
  wishBtn.setAttribute('aria-label', 'Agregar a favoritos');
  const heartIcon = document.createElement('i');
  heartIcon.className = 'fa-regular fa-heart';
  wishBtn.appendChild(heartIcon);
  imageDiv.appendChild(wishBtn);

  article.appendChild(imageDiv);

  const body = document.createElement('div');
  body.className = 'product-card__body';

  const shopSpan = document.createElement('span');
  shopSpan.className = 'product-card__shop';
  const storeIcon = document.createElement('i');
  storeIcon.className = 'fa-solid fa-store';
  shopSpan.appendChild(storeIcon);
  shopSpan.append(` ${store.name}`);
  body.appendChild(shopSpan);

  const nameH3 = document.createElement('h3');
  nameH3.className = 'product-card__name';
  nameH3.textContent = product.title;
  body.appendChild(nameH3);

  body.appendChild(buildPriceRow(product));

  const shippingBadge = buildShippingBadge(product, store);
  if (shippingBadge) body.appendChild(shippingBadge);

  const addBtn = document.createElement('button');
  addBtn.className = 'product-card__add';
  addBtn.dataset.productId = product.id;
  const cartIcon = document.createElement('i');
  cartIcon.className = 'fa-solid fa-cart-plus';
  addBtn.appendChild(cartIcon);
  const outOfStock = product.stock <= 0;
  if (outOfStock) {
    addBtn.disabled = true;
    addBtn.style.cssText = 'opacity: 0.5; cursor: not-allowed;';
    addBtn.title = 'Producto sin stock';
  }
  addBtn.append(outOfStock ? ' Sin stock' : ' Agregar');
  body.appendChild(addBtn);

  article.appendChild(body);
  return article;
}

/** Una columna de la barra de datos del header (dirección/categoría/cantidad/horarios). */
function buildMetaItem({ label, value, extraEl }) {
  const item = document.createElement('div');
  item.className = 'store-header__meta-item';

  if (label) {
    const labelEl = document.createElement('span');
    labelEl.className = 'store-header__meta-label';
    labelEl.textContent = label;
    item.appendChild(labelEl);
  }

  const valueEl = document.createElement('span');
  valueEl.className = 'store-header__meta-value';
  valueEl.textContent = value;
  item.appendChild(valueEl);

  if (extraEl) item.appendChild(extraEl);

  return item;
}

/** Aplica (o quita) el color de fondo/letra elegido por el vendedor al header. */
function applyHeaderColors(header, bg, fg) {
  if (bg) header.style.setProperty('--sh-bg', bg); else header.style.removeProperty('--sh-bg');
  if (fg) header.style.setProperty('--sh-fg', fg); else header.style.removeProperty('--sh-fg');
}

/** Popover de color del header (solo lo ve el dueño del comercio). */
function buildColorPopover(store, header) {
  const popover = document.createElement('div');
  popover.className = 'store-color-popover';

  const bgRow = document.createElement('label');
  bgRow.className = 'store-color-popover__row';
  const bgLabel = document.createElement('span');
  bgLabel.textContent = 'Cambiar color';
  bgRow.appendChild(bgLabel);
  const bgInput = document.createElement('input');
  bgInput.type = 'color';
  bgInput.value = store.header_bg_color || '#f5f7fa';
  bgRow.appendChild(bgInput);
  popover.appendChild(bgRow);

  const fgRow = document.createElement('label');
  fgRow.className = 'store-color-popover__row';
  const fgLabel = document.createElement('span');
  fgLabel.textContent = 'Cambiar color de la letra';
  fgRow.appendChild(fgLabel);
  const fgInput = document.createElement('input');
  fgInput.type = 'color';
  fgInput.value = store.header_text_color || '#1a202c';
  fgRow.appendChild(fgInput);
  popover.appendChild(fgRow);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'store-color-popover__reset';
  resetBtn.textContent = 'Quitar color';
  popover.appendChild(resetBtn);

  // Vista previa instantánea mientras se elige (sin guardar todavía).
  bgInput.addEventListener('input', () => applyHeaderColors(header, bgInput.value, fgInput.value || store.header_text_color));
  fgInput.addEventListener('input', () => applyHeaderColors(header, bgInput.value || store.header_bg_color, fgInput.value));

  async function persist(patch) {
    const { error } = await supabase.from('stores').update(patch).eq('id', store.id);
    if (error) {
      showToast('No se pudo guardar el color.', 'error');
      return false;
    }
    Object.assign(store, patch);
    return true;
  }

  bgInput.addEventListener('change', async () => {
    const ok = await persist({ header_bg_color: bgInput.value });
    if (ok) showToast('Color guardado', 'success');
  });
  fgInput.addEventListener('change', async () => {
    const ok = await persist({ header_text_color: fgInput.value });
    if (ok) showToast('Color guardado', 'success');
  });
  resetBtn.addEventListener('click', async () => {
    const ok = await persist({ header_bg_color: null, header_text_color: null });
    if (ok) {
      applyHeaderColors(header, null, null);
      bgInput.value = '#f5f7fa';
      fgInput.value = '#1a202c';
      showToast('Color por defecto restaurado', 'success');
    }
  });

  return popover;
}

/** Header de la tienda: título/descripción + barra de datos, con el ícono
 *  (lápiz de color para el dueño, corazón de favorito para el cliente). */
function buildStoreHeader(store, { isOwner, categoryName, storeId, productCount }) {
  const header = document.createElement('header');
  header.className = 'store-header';
  applyHeaderColors(header, store.header_bg_color, store.header_text_color);

  // --- Bloque superior: título + descripción + ícono ---
  const top = document.createElement('div');
  top.className = 'store-header__top';

  const title = document.createElement('h1');
  title.className = 'store-header__title';
  title.textContent = store.name;
  top.appendChild(title);

  const description = document.createElement('p');
  description.className = 'store-header__description';
  description.textContent = store.description || 'Sin descripción disponible.';
  top.appendChild(description);

  if (!isOwner && store.accepts_contact !== false) {
    const contactLink = document.createElement('a');
    contactLink.className = 'store-header__contact';
    contactLink.href = `./mensajes.html?store=${encodeURIComponent(storeId)}`;
    contactLink.textContent = 'Contactar al vendedor';
    top.appendChild(contactLink);
  }

  header.appendChild(top);

  if (isOwner) {
    const editColorBtn = document.createElement('button');
    editColorBtn.type = 'button';
    editColorBtn.className = 'store-header__icon-btn';
    editColorBtn.title = 'Editar el color de tu perfil';
    editColorBtn.setAttribute('aria-label', 'Editar el color de tu perfil');
    const pencilIcon = document.createElement('i');
    pencilIcon.className = 'fa-solid fa-pen';
    editColorBtn.appendChild(pencilIcon);
    header.appendChild(editColorBtn);

    const popover = buildColorPopover(store, header);
    header.appendChild(popover);

    editColorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.classList.toggle('is-open');
    });
    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== editColorBtn) popover.classList.remove('is-open');
    });
  } else {
    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'store-header__icon-btn';
    favBtn.title = 'Agregar comercio a favoritos';
    favBtn.setAttribute('aria-label', 'Agregar comercio a favoritos');
    const favIcon = document.createElement('i');
    favIcon.className = 'fa-regular fa-heart';
    favBtn.appendChild(favIcon);
    header.appendChild(favBtn);

    let isStoreFavorite = false;
    getFavoriteStoreIds().then((ids) => {
      isStoreFavorite = ids.includes(storeId);
      favIcon.classList.toggle('fa-solid', isStoreFavorite);
      favIcon.classList.toggle('fa-regular', !isStoreFavorite);
      favBtn.classList.toggle('is-favorite', isStoreFavorite);
    });
    favBtn.addEventListener('click', async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('Iniciá sesión para guardar comercios favoritos', 'default');
        return;
      }
      const wasFavorite = isStoreFavorite;
      isStoreFavorite = !wasFavorite;
      favIcon.classList.toggle('fa-solid', isStoreFavorite);
      favIcon.classList.toggle('fa-regular', !isStoreFavorite);
      favBtn.classList.toggle('is-favorite', isStoreFavorite);
      showToast(isStoreFavorite ? 'Comercio agregado a favoritos' : 'Comercio eliminado de favoritos', isStoreFavorite ? 'success' : 'default');
      try {
        await toggleFavoriteStore(storeId, wasFavorite);
      } catch (err) {
        console.error('Error al actualizar comercio favorito:', err);
      }
    });
  }

  // --- Barra de datos ---
  const infoBar = document.createElement('div');
  infoBar.className = 'store-header__info-bar';

  if (store.address) {
    const mapLink = document.createElement('button');
    mapLink.type = 'button';
    mapLink.className = 'store-header__map-link';
    mapLink.textContent = 'ver en mapa';
    mapLink.addEventListener('click', () => openMapModal(store.address));
    infoBar.appendChild(buildMetaItem({ value: store.address, extraEl: mapLink }));
  } else {
    infoBar.appendChild(buildMetaItem({ value: 'Dirección no cargada' }));
  }

  infoBar.appendChild(buildMetaItem({ value: categoryName || 'Sin categoría' }));
  infoBar.appendChild(buildMetaItem({ label: 'Cantidad de productos', value: `(${productCount})` }));
  infoBar.appendChild(buildMetaItem({ label: 'Horarios', value: store.hours || 'No informados' }));

  header.appendChild(infoBar);

  return header;
}

/** Abre el modal con el mapa embebido (no navega afuera de la página). */
function openMapModal(address) {
  const overlay = document.getElementById('store-map-overlay');
  const frameWrap = document.getElementById('store-map-frame-wrap');
  if (!overlay || !frameWrap) return;

  frameWrap.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.loading = 'lazy';
  iframe.referrerPolicy = 'no-referrer-when-downgrade';
  iframe.title = 'Mapa de la tienda';
  iframe.src = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
  frameWrap.appendChild(iframe);

  overlay.classList.add('is-open');
}

function closeMapModal() {
  const overlay = document.getElementById('store-map-overlay');
  const frameWrap = document.getElementById('store-map-frame-wrap');
  if (overlay) overlay.classList.remove('is-open');
  if (frameWrap) frameWrap.innerHTML = ''; // corta la carga del iframe al cerrar
}

/** Fila de búsqueda dentro de la tienda (filtra los productos ya cargados, sin navegar) + lápiz "editar perfil" del dueño. */
function buildProductSearchRow({ isOwner, onSearch }) {
  const row = document.createElement('div');
  row.className = 'store-search-row';

  const searchBox = document.createElement('div');
  searchBox.className = 'store-search';

  const searchIcon = document.createElement('i');
  searchIcon.className = 'fa-solid fa-magnifying-glass store-search__icon';
  searchBox.appendChild(searchIcon);

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = isOwner ? 'Buscar productos' : '¿Qué producto buscás?';
  input.setAttribute('aria-label', isOwner ? 'Buscar productos' : '¿Qué producto buscás?');
  searchBox.appendChild(input);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'store-search__clear';
  clearBtn.setAttribute('aria-label', 'Borrar búsqueda');
  const clearIcon = document.createElement('i');
  clearIcon.className = 'fa-solid fa-xmark';
  clearBtn.appendChild(clearIcon);
  searchBox.appendChild(clearBtn);

  input.addEventListener('input', () => {
    clearBtn.classList.toggle('is-visible', input.value.length > 0);
    onSearch(input.value);
  });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.remove('is-visible');
    onSearch('');
    input.focus();
  });

  row.appendChild(searchBox);

  if (isOwner) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'store-edit-profile-btn';
    editBtn.title = 'Editar perfil';
    editBtn.setAttribute('aria-label', 'Editar perfil');
    const pencilIcon = document.createElement('i');
    pencilIcon.className = 'fa-solid fa-pen';
    editBtn.appendChild(pencilIcon);
    row.appendChild(editBtn);
  }

  return row;
}

document.addEventListener('DOMContentLoaded', async () => {
  updateCartBadge();
  initNotificationsBell();
  initAccountMenu();
  initCategoryBar({ activeSlug: 'inicio' });

  // Buscador con autocompletado (compartido, redirige a la búsqueda global)
  initSearchBox({
    onSubmit: (term) => { window.location.href = `./search.html?q=${encodeURIComponent(term)}`; },
  });

  document.getElementById('store-map-close')?.addEventListener('click', closeMapModal);
  document.getElementById('store-map-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'store-map-overlay') closeMapModal();
  });

  const mainContent = document.getElementById('main-content');
  const params = new URLSearchParams(window.location.search);
  const storeId = params.get('id');

  // A113-281/284/285: el footer queda oculto (atributo `hidden` en el HTML)
  // hasta que se resuelve el fetch de la tienda, para no mostrar un layout
  // "roto" con el footer pegado arriba mientras el skeleton todavía ocupa
  // el resto del alto de la página.
  const footer = document.querySelector('footer.footer');
  const showFooter = () => { if (footer) footer.hidden = false; };

  if (!storeId) {
    mainContent.innerHTML = '<div style="text-align: center; padding: 4rem; color: #ef4444;">No se especificó un comercio.</div>';
    showFooter();
    return;
  }

  try {
    // Tienda, productos, sesión y categorías: todas independientes entre sí.
    const [
      { data: store, error: storeError },
      { data: products, error: productsError },
      { data: { session } },
      categories,
    ] = await Promise.all([
      supabase.from('stores').select('*').eq('id', storeId).single(),
      supabase
        .from('products')
        .select('*')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabase.auth.getSession(),
      getCategories(),
    ]);

    if (storeError || !store) throw storeError || new Error('Comercio no encontrado');
    if (productsError) throw productsError;

    document.title = `${store.name} — Baradero Local`;
    const pageH1 = document.getElementById('page-h1');
    if (pageH1) pageH1.textContent = store.name;

    // El dueño del comercio ve la "vista previa del vendedor" (mismo criterio
    // que producto.js: solo owner_id, un empleado ve la tienda como cliente).
    const isOwner = !!(session?.user?.id && store.owner_id && session.user.id === store.owner_id);
    const categoryName = categories.find((c) => c.slug === store.category_slug)?.name;

    // --- Construir con DOM API (anti-XSS: nada de innerHTML con datos de la DB) ---
    mainContent.innerHTML = '';

    const productList = products || [];
    mainContent.appendChild(buildStoreHeader(store, {
      isOwner,
      categoryName,
      storeId,
      productCount: productList.length,
    }));

    const section = document.createElement('section');
    section.className = 'store-products';

    const grid = document.createElement('div');
    grid.className = 'products__grid';
    grid.id = 'store-products-grid';

    // Se pide una sola vez (no en cada tecla de búsqueda) y se reusa en cada
    // renderGrid -- initWishlist acepta la lista ya resuelta para no repetir
    // el fetch de favoritos por cada re-render de la grilla filtrada.
    const favoriteIdsPromise = getFavoriteIds();

    function renderGrid(list) {
      grid.innerHTML = '';
      if (!list || list.length === 0) {
        renderEmptyState(
          grid,
          productList.length === 0 ? 'Este comercio aún no tiene productos publicados.' : 'No encontramos productos con ese nombre.',
          productList.length === 0 ? 'fa-store-slash' : 'fa-magnifying-glass'
        );
        return;
      }
      list.forEach((product) => grid.appendChild(buildProductCard(product, store)));
      initCartButtons();
      favoriteIdsPromise.then((ids) => initWishlist(ids));
    }

    const searchRow = buildProductSearchRow({
      isOwner,
      onSearch: (query) => {
        const q = query.trim().toLowerCase();
        renderGrid(!q ? productList : productList.filter((p) => p.title.toLowerCase().includes(q)));
      },
    });
    section.appendChild(searchRow);
    section.appendChild(grid);
    renderGrid(productList);

    mainContent.appendChild(section);

    const reviewsSection = document.createElement('section');
    reviewsSection.className = 'store-products';
    mainContent.appendChild(reviewsSection);
    // El dueño no puede dejarse una reseña a sí mismo (mismo criterio que producto.js).
    renderReviewsSection(reviewsSection, 'store', storeId, { hideForm: isOwner });

    if (typeof initProductModal === 'function') initProductModal();

  } catch (err) {
    console.error('Error fetching store:', err);
    renderErrorState(mainContent, 'No se pudo cargar la información del comercio.', () => window.location.reload());
  } finally {
    showFooter();
  }
});
