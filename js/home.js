// Interacciones de la página principal
import { supabase } from './auth-utils.js';
import { getCart, saveCart, parsePrice, formatPrice, updateCartBadge, initCartButtons, initWishlist, buildPriceRow, buildShippingBadge, renderErrorState, renderEmptyState } from './cart-utils.js';
import { initCategoryBar, initSearchBox, initScrollTop, initNavbarScroll, initNotificationsBell } from './nav-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights
// Importamos supabase para que el SDK procese los tokens OAuth
// que llegan en la URL cuando Google redirige de vuelta a esta página.

// Comercios sin logo_url: se les asigna uno de estos diseños genéricos ya
// existentes en el proyecto (ficticios, sin marca real - ver
// public/img/logo-*.webp), rotando entre ellos. Provisorio a pedido del
// usuario: repetir el mismo diseño en más de un comercio está bien por ahora.
const STORE_LOGO_FALLBACKS = [
  '/img/logo-farmacia.webp',
  '/img/logo-ferreteria.webp',
  '/img/logo-kiosco.webp',
  '/img/logo-panaderia.webp',
  '/img/logo-bebidas.webp',
  '/img/logo-limpieza.webp',
  '/img/logo-moda.webp',
  '/img/logo-petshop.webp',
  '/img/logo-tecno.webp',
  '/img/logo-deportes.webp',
];

const PRODUCT_SELECT = `
  id,
  title,
  price,
  compare_at_price,
  offer_expires_at,
  image_url,
  stock,
  stores ( name, free_shipping_threshold )
`;

/** Arma el <article> de una tarjeta de producto. Compartido entre
 *  "Productos recomendados" y "Ofertas" — antes estaba duplicado. */
function buildProductCard(product) {
  const storeName = product.stores ? product.stores.name : 'Tienda';

  const article = document.createElement('article');
  article.className = 'product-card';
  article.id = product.id;
  article.dataset.price = product.price;

  // --- Image container ---
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

  // --- Body ---
  const body = document.createElement('div');
  body.className = 'product-card__body';

  const shopSpan = document.createElement('span');
  shopSpan.className = 'product-card__shop';
  const shopIcon = document.createElement('i');
  shopIcon.className = 'fa-solid fa-store';
  shopSpan.appendChild(shopIcon);
  shopSpan.append(` ${storeName}`);
  body.appendChild(shopSpan);

  const nameH3 = document.createElement('h3');
  nameH3.className = 'product-card__name';
  nameH3.textContent = product.title;
  body.appendChild(nameH3);

  body.appendChild(buildPriceRow(product));

  const shippingBadge = buildShippingBadge(product, product.stores);
  if (shippingBadge) body.appendChild(shippingBadge);

  const addBtn = document.createElement('button');
  addBtn.className = 'product-card__add';
  addBtn.dataset.productId = product.id;
  const cartIcon = document.createElement('i');
  cartIcon.className = 'fa-solid fa-cart-plus';
  addBtn.appendChild(cartIcon);
  // P2-9: sin stock, no se puede agregar desde la tarjeta (antes solo se
  // validaba en producto.js/product-modal.js, no acá).
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

/** Obtener productos de Supabase */
async function loadProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  try {
    const { data: products, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      .limit(12);

    if (error) throw error;

    grid.innerHTML = ''; // Limpiar skeletons

    if (!products || products.length === 0) {
      renderEmptyState(grid, 'Aún no hay productos disponibles.', 'fa-box-open');
      return;
    }

    products.forEach(product => grid.appendChild(buildProductCard(product)));

    // Re-bind events to new DOM elements
    initCartButtons();
    initWishlist();

  } catch (err) {
    console.error('Error fetching products:', err);
    renderErrorState(grid, 'No se pudieron cargar los productos.', loadProducts);
  }
}

/** Paginador de a 4 para Esenciales/Ofertas: distinto de "Productos
 *  recomendados", que muestra todo lo que carga de una. Acá se guarda el
 *  array completo ya traído de Supabase y las flechas del header solo
 *  cambian qué 4 se ven — no vuelven a pedirle nada al servidor.
 *  @param {{gridId: string, prevId: string, nextId: string, pageSize?: number}} opts
 *  @returns {{ setItems: (items: object[]) => void }} */
function initGridPager({ gridId, prevId, nextId, pageSize = 4 }) {
  const grid = document.getElementById(gridId);
  const prevBtn = document.getElementById(prevId);
  const nextBtn = document.getElementById(nextId);

  let items = [];
  let page = 0;

  function render() {
    if (!grid) return;
    grid.innerHTML = '';
    items
      .slice(page * pageSize, page * pageSize + pageSize)
      .forEach((item) => grid.appendChild(buildProductCard(item)));

    initCartButtons();
    initWishlist();

    if (prevBtn) prevBtn.disabled = page === 0;
    if (nextBtn) nextBtn.disabled = (page + 1) * pageSize >= items.length;
  }

  prevBtn?.addEventListener('click', () => {
    if (page === 0) return;
    page -= 1;
    render();
  });

  nextBtn?.addEventListener('click', () => {
    if ((page + 1) * pageSize >= items.length) return;
    page += 1;
    render();
  });

  return {
    setItems(newItems) {
      items = newItems;
      page = 0;
      render();
    },
  };
}

const offersPager = initGridPager({ gridId: 'offers-grid', prevId: 'offers-prev', nextId: 'offers-next' });
const essentialsPager = initGridPager({ gridId: 'essentials-grid', prevId: 'essentials-prev', nextId: 'essentials-next' });

/** Ofertas: mismo criterio de "oferta" que usa el resto del sitio
 *  (compare_at_price > price, sin vencer - ver buildPriceRow() en
 *  cart-utils.js). compare_at_price > price no se puede filtrar en la
 *  consulta porque son dos columnas de la misma fila (PostgREST no compara
 *  columna contra columna), así que se trae todo lo que tenga
 *  compare_at_price cargado y se corrobora acá. */
async function loadOffers() {
  const grid = document.getElementById('offers-grid');
  if (!grid) return;

  try {
    const nowIso = new Date().toISOString();
    const { data: products, error } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      .not('compare_at_price', 'is', null)
      .or(`offer_expires_at.is.null,offer_expires_at.gt.${nowIso}`)
      .limit(24);

    if (error) throw error;

    const offers = (products || []).filter((p) => p.compare_at_price > p.price);

    if (offers.length === 0) {
      renderEmptyState(grid, 'No hay ofertas activas por ahora.', 'fa-tags');
      return;
    }

    offersPager.setItems(offers);

  } catch (err) {
    console.error('Error fetching offers:', err);
    renderErrorState(grid, 'No se pudieron cargar las ofertas.', loadOffers);
  }
}

/** Esenciales para tu casa: productos de categorías de consumo del hogar
 *  (almacén, limpieza, lácteos) — filtro real por categoría, no una
 *  selección manual. */
async function loadEssentials() {
  const grid = document.getElementById('essentials-grid');
  if (!grid) return;

  try {
    const { data: products, error } = await supabase
      .from('products')
      .select(`${PRODUCT_SELECT}, categories!inner(slug)`)
      .eq('is_active', true)
      .in('categories.slug', ['almacen', 'limpieza', 'lacteos'])
      .limit(24);

    if (error) throw error;

    if (!products || products.length === 0) {
      renderEmptyState(grid, 'Aún no hay esenciales cargados.', 'fa-house');
      return;
    }

    essentialsPager.setItems(products);

  } catch (err) {
    console.error('Error fetching essentials:', err);
    renderErrorState(grid, 'No se pudieron cargar los esenciales.', loadEssentials);
  }
}

/** Carrusel de promociones del hero.
 *  El desplazamiento es scroll nativo con scroll-snap (así en teléfono se
 *  desliza con el dedo sin JS); las flechas y los puntitos solo empujan ese
 *  mismo scroll, y las flechas se ocultan por CSS en pantallas chicas. */
function initHeroCarousel() {
  const track = document.getElementById('hero-track');
  const dotsWrap = document.getElementById('hero-dots');
  const prevBtn = document.getElementById('hero-prev');
  const nextBtn = document.getElementById('hero-next');
  if (!track) return;

  const slides = Array.from(track.querySelectorAll('.hero__slide'));
  if (slides.length <= 1) {
    // Con una sola promo no hay nada que recorrer: fuera controles.
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    if (dotsWrap) dotsWrap.style.display = 'none';
    return;
  }

  const currentIndex = () => Math.round(track.scrollLeft / track.clientWidth);

  const goTo = (index) => {
    // Da la vuelta en los extremos: de la última se pasa a la primera.
    const target = (index + slides.length) % slides.length;
    track.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' });
  };

  // Puntitos
  const dots = slides.map((_, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'hero__dot';
    dot.setAttribute('aria-label', `Ir a la promoción ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dotsWrap?.appendChild(dot);
    return dot;
  });

  const syncDots = () => {
    const active = currentIndex();
    dots.forEach((dot, i) => {
      dot.classList.toggle('hero__dot--active', i === active);
      dot.setAttribute('aria-current', i === active ? 'true' : 'false');
    });
  };

  prevBtn?.addEventListener('click', () => goTo(currentIndex() - 1));
  nextBtn?.addEventListener('click', () => goTo(currentIndex() + 1));

  // El scroll dispara muchísimos eventos: lo agrupamos por frame.
  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { syncDots(); ticking = false; });
  });

  syncDots();
}

/** Configurar modal de Farmacia de Turno */
function initFarmaciaLink() {
  const farmaciaLink = document.getElementById('farmacia-link');
  if (!farmaciaLink) return;

  farmaciaLink.addEventListener('click', (e) => {
    e.preventDefault();
    // Modal nativo básico para simular la funcionalidad
    const d = new Date();
    const dia = d.toLocaleDateString('es-AR', { weekday: 'long' });
    alert(`Farmacia de turno hoy (${dia}):\n\nFarmacia Central\n📍 San Martín 1234\n📞 3329-420000\nHorario: 24hs`);
  });
}

/** Mapa de "Comercios cerca tuyo": pide la ubicación al navegador (Geolocation
 *  API nativa, sin ningún servicio de Google de por medio) y arma un mapa de
 *  Google embebido con la técnica ?output=embed — no pide API key ni
 *  facturación, a diferencia de la Maps JavaScript API. El botón de abajo
 *  abre Google Maps real en otra pestaña, centrado ahí, donde el usuario ve
 *  los comercios reales que existen alrededor (no los de nuestra base). */
function initNearbyMap() {
  const panel = document.getElementById('nearby-map-panel');
  const locateBtn = document.getElementById('nearby-map-locate');
  if (!panel || !locateBtn) return;

  const renderLoading = () => {
    panel.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'nearby-map__prompt';
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-spinner fa-spin';
    wrap.appendChild(icon);
    const text = document.createElement('p');
    text.textContent = 'Buscando tu ubicación…';
    wrap.appendChild(text);
    panel.appendChild(wrap);
  };

  const renderError = (message) => {
    panel.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'nearby-map__prompt';
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-circle-exclamation';
    wrap.appendChild(icon);
    const text = document.createElement('p');
    text.textContent = message;
    wrap.appendChild(text);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nearby-map__btn';
    btn.textContent = 'Reintentar';
    btn.addEventListener('click', requestLocation);
    wrap.appendChild(btn);
    panel.appendChild(wrap);
  };

  const renderMap = (lat, lng) => {
    panel.innerHTML = '';

    const iframe = document.createElement('iframe');
    iframe.className = 'nearby-map__iframe';
    // output=embed: vista de solo lectura de Google Maps sin API key.
    // z=17: a nivel de cuadra/calle (antes 15, mostraba todo el barrio).
    iframe.src = `https://www.google.com/maps?q=${lat},${lng}&z=17&output=embed`;
    iframe.loading = 'lazy';
    iframe.setAttribute('title', 'Mapa centrado en tu ubicación');
    iframe.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
    panel.appendChild(iframe);

    const openLink = document.createElement('a');
    openLink.className = 'nearby-map__open-link';
    // Acción "Search" documentada de Google con coordenadas como query: deja
    // el mismo pin fijo en el punto exacto, como el mapa embebido de arriba.
    // (La versión anterior armaba una búsqueda de texto -"comercios cerca"-
    // que reemplaza el pin por resultados de búsqueda: por eso desaparecía.)
    openLink.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    const linkIcon = document.createElement('i');
    linkIcon.className = 'fa-solid fa-arrow-up-right-from-square';
    openLink.appendChild(linkIcon);
    openLink.append(' Ver mi ubicación en Google Maps');
    panel.appendChild(openLink);
  };

  function requestLocation() {
    if (!('geolocation' in navigator)) {
      renderError('Tu navegador no soporta geolocalización.');
      return;
    }

    renderLoading();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        renderMap(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        // Log temporal para diagnosticar el caso raro donde el navegador
        // nunca muestra el cartel de permiso y va directo a error.
        console.error('[nearby-map] geolocation error', { code: error.code, message: error.message });
        if (error.code === error.PERMISSION_DENIED) {
          renderError('No nos diste permiso para usar tu ubicación. Podés habilitarlo desde la configuración del navegador.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          renderError('No pudimos determinar tu ubicación (falla del sistema, no del sitio). Probá de nuevo en un rato.');
        } else if (error.code === error.TIMEOUT) {
          renderError('Tardó demasiado en responder. Probá de nuevo.');
        } else {
          renderError('No pudimos obtener tu ubicación. Probá de nuevo.');
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  }

  locateBtn.addEventListener('click', requestLocation);
}

/** Obtener locales destacados de Supabase para el carrusel */
async function loadStores() {
  const carousel = document.getElementById('stores-carousel');
  if (!carousel) return;

  try {
    const { data: stores, error } = await supabase
      .from('stores')
      .select('id, name, logo_url')
      .eq('status', 'approved')
      .limit(15);

    if (error) throw error;

    carousel.innerHTML = ''; // Limpiar skeletons

    if (!stores || stores.length === 0) {
      carousel.style.display = 'none';
      return;
    }

    let fallbackIndex = 0;
    stores.forEach(store => {
      const link = document.createElement('a');
      link.href = `./comercio.html?id=${store.id}`;
      link.className = 'store-logo-link';
      link.setAttribute('aria-label', `Ir a ${store.name}`);

      const img = document.createElement('img');
      img.className = 'store-logo-img';
      img.loading = 'lazy';
      if (store.logo_url) {
        img.src = store.logo_url;
        img.alt = store.name;
        // Al menos un comercio tiene guardada una URL rota como logo_url
        // (una página de resultados de búsqueda, no una imagen — se ve como
        // error de CSP en consola). Si falla la carga, cae al genérico en
        // vez de quedar como ícono roto.
        img.onerror = () => {
          img.onerror = null;
          img.src = STORE_LOGO_FALLBACKS[fallbackIndex % STORE_LOGO_FALLBACKS.length];
          img.alt = '';
          fallbackIndex += 1;
        };
      } else {
        // Sin logo cargado: diseño de logo genérico ya existente en el
        // proyecto (provisorio a pedido del usuario — repetir está bien
        // hasta que cada comercio suba el suyo real).
        img.src = STORE_LOGO_FALLBACKS[fallbackIndex % STORE_LOGO_FALLBACKS.length];
        img.alt = '';
        fallbackIndex += 1;
      }
      link.appendChild(img);

      carousel.appendChild(link);
    });

  } catch (err) {
    console.error('Error fetching stores:', err);
    carousel.innerHTML = '';
    carousel.style.display = 'none'; // Ocultar carrusel en caso de error (no es contenido crítico)
  }
}

/** Flechas del carrusel de comercios: scroll nativo, sin reimplementar nada
 *  (mismo criterio que el carrusel del hero). Cada click mueve casi una
 *  pantalla completa de logos. */
function initStoresCarouselArrows() {
  const carousel = document.getElementById('stores-carousel');
  const prevBtn = document.getElementById('stores-prev');
  const nextBtn = document.getElementById('stores-next');
  if (!carousel || !prevBtn || !nextBtn) return;

  const scrollByPage = (dir) => {
    carousel.scrollBy({ left: dir * carousel.clientWidth * 0.9, behavior: 'smooth' });
  };

  prevBtn.addEventListener('click', () => scrollByPage(-1));
  nextBtn.addEventListener('click', () => scrollByPage(1));
}

// Inicializar todo
document.addEventListener('DOMContentLoaded', () => {
  initScrollTop();
  initNavbarScroll();
  initHeroCarousel();
  initFarmaciaLink();
  initNearbyMap();
  updateCartBadge();

  // Navbar de categorías (mega-menú) + buscador con autocompletado (compartidos)
  // megaMountId: en el home el botón "Categorías" va en el navbar, no en la
  // barra de abajo (que queda libre para otro uso).
  initCategoryBar({ activeSlug: 'inicio', megaMountId: 'nav-categories-slot' });
  initSearchBox({
    onSubmit: (term) => { window.location.href = `./search.html?q=${encodeURIComponent(term)}`; },
  });
  initNotificationsBell();

  // Cargar datos dinámicos
  loadStores();
  initStoresCarouselArrows();
  loadProducts();
  loadOffers();
  loadEssentials();

  // Modal de detalle de producto
  if (typeof initProductModal === 'function') initProductModal();
});
