// Interacciones de la página principal
import { supabase, getPanelAccess, SELLER_PANEL_PAGES, HOME_INTENT_KEY } from './auth-utils.js';
import { getCart, saveCart, parsePrice, formatPrice, updateCartBadge, initCartButtons, initWishlist, buildPriceRow, buildShippingBadge, renderErrorState, renderEmptyState } from './cart-utils.js';
import { initCategoryBar, initSearchBox, initScrollTop, initNavbarScroll, initNotificationsBell, initAccountMenu } from './nav-utils.js';
import { getPref } from './settings-utils.js';
import { loadAutoRedirectPreference } from './panel-redirect-utils.js';
import { isPromoLive, promoHref, promoAriaLabel, promoImages, stepIndex } from './home-promos-utils.js';
import { loadViewedProducts } from './interests.js';
import { weightCategories, interleaveByInterest } from './interests-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights
// Importamos supabase para que el SDK procese los tokens OAuth
// que llegan en la URL cuando Google redirige de vuelta a esta página.

/**
 * El botón "Vender" de la fila de accesos pasa a ser "Panel" para quien ya
 * tiene uno propio: no tiene sentido ofrecerle "vender" a quien ya vende.
 * El texto de cada destino es el mismo que usa "Mi perfil"
 * (setRolePanelLink en js/perfil.js).
 */
const PANEL_LABELS = {
  vendedor: 'Panel de vendedor',
  profesional: 'Panel de profesional/técnico',
  repartidor: 'Panel de repartidor',
};

const PANEL_ICONS = {
  vendedor: 'fa-solid fa-shop',
  profesional: 'fa-solid fa-screwdriver-wrench',
  repartidor: 'fa-solid fa-motorcycle',
};

/**
 * ¿Llegaron al home a propósito? Dos señales: el click en el logo del navbar
 * (lo marca markHomeIntent en auth-utils.js) o cualquier navegación interna
 * del sitio (el referrer es de este mismo origen). Si no hay ninguna -- URL
 * tipeada a mano, favorito, buscador -- es una entrada "desde afuera" y al
 * vendedor/profesional lo llevamos a su panel.
 */
function cameToHomeOnPurpose() {
  try {
    if (sessionStorage.getItem(HOME_INTENT_KEY) === '1') return true;
  } catch { /* sessionStorage bloqueado (navegación privada, etc.) */ }

  if (!document.referrer) return false;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Una cuenta con UN SOLO panel posible (vendedor, empleada de un comercio,
 * profesional publicado, o admin/moderador que no además vende ni ofrece un
 * servicio) entra directo a ese panel en vez de ver el home con los
 * productos, a pedido del usuario (2026-09-16, ampliado a admin/moderador de
 * cuenta única el 2026-09-18). La puerta de vuelta al home es el logo del
 * navbar (ver cameToHomeOnPurpose). Se puede apagar desde Perfil → Ajustes
 * (ver panel-redirect-utils.js); aunque esté apagado, el panel se sigue
 * pudiendo abrir a mano desde el botón que arma renderPanelAction() acá abajo.
 *
 * Quien tiene DOS paneles posibles (ej. vendedor que además es admin) NUNCA
 * se redirige sola: elegir por su cuenta sería adivinar (ver sellerPanelPage
 * en auth-utils.js). Se queda en el home y el botón le abre el menú para
 * elegir.
 *
 * Corre apenas carga el módulo (no espera a DOMContentLoaded) para que la
 * redirección salga lo antes posible y el home no llegue a pintarse.
 */
/** El <a> de "Vender"/"Panel", sea cual sea el texto que tenga ahora. */
function whenPanelLinkReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

/** Cliente sin panel: vuelve a "Vender" (por si el script del HTML lo había
 *  cambiado con una respuesta vieja) y lo muestra. */
function showVenderLink() {
  whenPanelLinkReady(() => {
    const link = document.getElementById('home-panel-action');
    if (!link) return;
    link.textContent = 'Vender';
    link.setAttribute('href', './vender.html');
    link.classList.remove('home-action--menu');
    link.querySelector('i')?.remove();
    link.setAttribute('data-ready', '1');
  });
}

async function initPanelAction() {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return;

  let isAdmin = false;
  let seller = null;
  try {
    ({ isAdmin, seller } = await getPanelAccess(user));
  } catch (err) {
    console.error('No se pudo saber si la cuenta tiene panel:', err);
    showVenderLink();
    return;
  }
  // (La última respuesta se guarda en getPanelAccess: la lee el script de
  // pages/home.html para pintar bien el botón desde el primer momento.)
  if (!isAdmin && !seller) { // cliente común: la fila queda como está
    showVenderLink();
    return;
  }

  // XOR: exactamente un panel posible. Con los dos (isAdmin && seller) esto
  // da false y nunca se auto-redirige, igual que antes.
  const hasSinglePanel = isAdmin !== !!seller;

  if (hasSinglePanel && !cameToHomeOnPurpose()) {
    // Se consulta la preferencia solo acá (no en cada carga del home para
    // cualquier cuenta) para no sumar una consulta de más al resto de los casos.
    const autoRedirect = await loadAutoRedirectPreference();
    if (autoRedirect) {
      const target = isAdmin ? './admin.html' : `./${SELLER_PANEL_PAGES[seller]}`;
      window.location.replace(target);
      return;
    }
  }

  // El <a> puede no estar en el DOM todavía si la sesión resolvió rapidísimo.
  whenPanelLinkReady(() => renderPanelAction({ isAdmin, seller, role: user.app_metadata?.role }));
}
initPanelAction();

/**
 * Reemplaza el "Vender" de la fila de accesos por "Panel". Con un solo panel
 * sigue siendo el mismo link de siempre, apuntando adonde corresponda; con
 * los dos (vendedor/profesional que además es admin) pasa a ser un botón que
 * abre un menú chico para elegir.
 */
function renderPanelAction({ isAdmin, seller, role }) {
  const link = document.getElementById('home-panel-action');
  if (!link) return;
  link.setAttribute('data-ready', '1');

  const adminLabel = role === 'moderador' ? 'Panel de moderación' : 'Panel de administrador';

  if (!isAdmin || !seller) {
    link.textContent = 'Panel';
    link.href = isAdmin ? './admin.html' : `./${SELLER_PANEL_PAGES[seller]}`;
    link.classList.remove('home-action--menu');
    link.querySelector('i')?.remove();
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'home-action-menu';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'home-action home-action--menu';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  btn.append('Panel');
  const caret = document.createElement('i');
  caret.className = 'fa-solid fa-chevron-down';
  btn.appendChild(caret);
  wrap.appendChild(btn);

  const menu = document.createElement('div');
  menu.className = 'home-panel-menu';
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Elegí un panel');

  [
    { href: `./${SELLER_PANEL_PAGES[seller]}`, icon: PANEL_ICONS[seller], label: PANEL_LABELS[seller] },
    { href: './admin.html', icon: 'fa-solid fa-user-shield', label: adminLabel },
  ].forEach(({ href, icon, label }) => {
    const item = document.createElement('a');
    item.className = 'home-panel-menu__item';
    item.href = href;
    item.setAttribute('role', 'menuitem');
    const i = document.createElement('i');
    i.className = icon;
    item.appendChild(i);
    item.append(label);
    menu.appendChild(item);
  });
  wrap.appendChild(menu);

  link.replaceWith(wrap);

  const close = () => {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    if (!menu.hidden) menu.querySelector('.home-panel-menu__item')?.focus();
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target) && !menu.hidden) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); }
  });
}

// Comercios sin logo_url: se les asigna uno de estos diseños genéricos ya
// existentes en el proyecto (ficticios, sin marca real - ver
// public/img/logo-*.webp), rotando entre ellos. Provisorio a pedido del
// usuario: repetir el mismo diseño en más de un comercio está bien por ahora.
// Sin logo-farmacia.webp/logo-deportes.webp: las categorías "Farmacia" y
// "Deportes" ya no existen en el sitio (A113, categorías), así que un
// comercio de otro rubro (ej. un almacén) podía terminar con el diseño
// "Farmacia Central" pegado encima.
const STORE_LOGO_FALLBACKS = [
  '/img/logo-ferreteria.webp',
  '/img/logo-kiosco.webp',
  '/img/logo-panaderia.webp',
  '/img/logo-bebidas.webp',
  '/img/logo-limpieza.webp',
  '/img/logo-moda.webp',
  '/img/logo-petshop.webp',
  '/img/logo-tecno.webp',
];

const PRODUCT_SELECT = `
  id,
  title,
  price,
  compare_at_price,
  offer_expires_at,
  image_url,
  stock,
  store_id,
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
  wishBtn.setAttribute('aria-label', `Agregar ${product.title} a favoritos`);
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

/**
 * Combos vigentes de "Impulsá tus ventas" (get_active_boosts, migración 131):
 * { store_id, plan_id }. Si falla o no existe todavía, el inicio se ve como
 * siempre -- un combo nunca puede romper la portada.
 */
async function loadActiveBoosts() {
  try {
    const { data, error } = await supabase.rpc('get_active_boosts');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('No se pudieron leer los combos vigentes:', err);
    return [];
  }
}

/** Planes cuyos productos salen arriba en "Productos recomendados". */
const PLANS_WITH_TOP_PRODUCTS = ['barrio', 'baradero'];

/** Cuántos productos muestra "Productos recomendados". */
const RECOMMENDED_COUNT = 12;
/** Con intereses conocidos, cuántos lugares de arriba conservan los comercios con combo. */
const BOOSTED_TOP_WITH_INTERESTS = 3;

function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Productos de las categorías que la persona viene mirando (guardado en este
 * navegador, ver interests.js): se reparten los lugares entre todas, en
 * proporción a lo que miró de cada una y dando más peso a lo reciente.
 * Excluye lo que ya miró. Si no hay historial o algo falla, devuelve [].
 */
async function loadInterestProducts(limit) {
  try {
    const views = loadViewedProducts();
    if (!views.length) return [];
    const ids = views.map((v) => v.id);

    const { data: viewedRows, error } = await supabase.from('products').select('id, category_id').in('id', ids);
    if (error || !viewedRows?.length) return [];
    const categoryByProduct = Object.fromEntries(viewedRows.filter((r) => r.category_id).map((r) => [r.id, r.category_id]));

    const weighted = weightCategories(views, categoryByProduct, Date.now());
    if (!weighted.length) return [];

    const results = await Promise.all(weighted.map((w) =>
      supabase.from('products').select(PRODUCT_SELECT)
        .eq('is_active', true).gt('stock', 0)
        .eq('category_id', w.categoryId)
        .not('id', 'in', `(${ids.join(',')})`)
        .order('created_at', { ascending: false })
        .limit(limit * 2)
    ));
    const byCategory = {};
    weighted.forEach((w, i) => { byCategory[w.categoryId] = shuffled(results[i].error ? [] : (results[i].data || [])); });
    return interleaveByInterest(byCategory, weighted, limit);
  } catch (err) {
    console.warn('No se pudieron armar las recomendaciones por intereses:', err);
    return [];
  }
}

/** Obtener productos de Supabase */
async function loadProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  try {
    const boosts = await loadActiveBoosts();
    const boostedStoreIds = boosts
      .filter((b) => PLANS_WITH_TOP_PRODUCTS.includes(b.plan_id))
      .map((b) => b.store_id);

    const [generalRes, boostedRes, interestProducts] = await Promise.all([
      supabase.from('products').select(PRODUCT_SELECT).eq('is_active', true).limit(RECOMMENDED_COUNT),
      boostedStoreIds.length
        ? supabase.from('products').select(PRODUCT_SELECT).eq('is_active', true).in('store_id', boostedStoreIds).limit(RECOMMENDED_COUNT)
        : Promise.resolve({ data: [], error: null }),
      loadInterestProducts(RECOMMENDED_COUNT),
    ]);

    if (generalRes.error) throw generalRes.error;
    // Orden: los de comercios con combo van primero (si la persona tiene
    // intereses conocidos, solo los primeros lugares, para que el resto sea de
    // lo que viene mirando), después los de sus categorías y al final la lista
    // general. Si alguna de las consultas extra falla, la portada sigue.
    let boostedProducts = boostedRes.error ? [] : (boostedRes.data || []);
    if (interestProducts.length) boostedProducts = boostedProducts.slice(0, BOOSTED_TOP_WITH_INTERESTS);
    const seen = new Set();
    const products = [...boostedProducts, ...interestProducts, ...(generalRes.data || [])]
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
      .slice(0, RECOMMENDED_COUNT);

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

// El link de "Farmacias de turno" ahora es un <a> común a farmacias.html: no
// necesita JS.
//
// Antes acá había un initFarmaciaLink() que abría un alert() con una farmacia,
// una dirección y un teléfono INVENTADOS ("Farmacia Central, San Martín 1234,
// 3329-420000"), puestos como placeholder y nunca reemplazados. La tarea
// figuraba como terminada en Jira (A113-10). Se quitó porque es el único lugar
// del sistema donde un dato falso puede mandar a un vecino a una puerta
// cerrada de madrugada: acá el placeholder no era gratis.
//
// La página real (turno del día + semana completa + mapa) está pendiente y
// depende de tener una fuente de datos mantenida, no de la interfaz.
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

/** Mapa de "Comercios cerca tuyo": pide la ubicación al navegador (Geolocation
 *  API nativa, sin ningún servicio de Google de por medio) y arma un mapa de
 *  Google embebido con la técnica ?output=embed — no pide API key ni
 *  facturación, a diferencia de la Maps JavaScript API. El botón de abajo
 *  abre Google Maps real en otra pestaña, centrado ahí, donde el usuario ve
 *  los comercios reales que existen alrededor (no los de nuestra base). */
const NEARBY_LOCATION_KEY = 'bl_nearby_location';

function saveNearbyLocation(lat, lng) {
  try {
    sessionStorage.setItem(NEARBY_LOCATION_KEY, JSON.stringify({ lat, lng }));
  } catch (_) { /* sessionStorage no disponible (privado/bloqueado): sin persistencia, no rompe nada */ }
}

function loadNearbyLocation() {
  try {
    const raw = sessionStorage.getItem(NEARBY_LOCATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

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
        saveNearbyLocation(position.coords.latitude, position.coords.longitude);
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

  const saved = loadNearbyLocation();
  if (saved) renderMap(saved.lat, saved.lng);
}

/** Obtener locales destacados de Supabase para el carrusel */
async function loadStores() {
  const carousel = document.getElementById('stores-carousel');
  if (!carousel) return;

  try {
    const [storesRes, boosts] = await Promise.all([
      supabase.from('stores').select('id, name, logo_url').eq('status', 'approved').limit(15),
      loadActiveBoosts(),
    ]);
    if (storesRes.error) throw storesRes.error;

    // Los comercios con un combo vigente (cualquiera de los tres incluye la
    // fila) van primero. Sort estable: el resto queda en el orden de siempre.
    // Con el límite de 15, un comercio con combo que no entró en esos 15 se
    // pide aparte para que no quede afuera de lo que pagó.
    const boostedIds = new Set(boosts.map((b) => b.store_id));
    let stores = storesRes.data || [];
    const missing = [...boostedIds].filter((id) => !stores.some((s) => s.id === id));
    if (missing.length) {
      const extra = await supabase.from('stores').select('id, name, logo_url').eq('status', 'approved').in('id', missing);
      if (!extra.error && extra.data) stores = [...stores, ...extra.data];
    }
    stores = [...stores].sort((a, b) => Number(boostedIds.has(b.id)) - Number(boostedIds.has(a.id)));

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

/** "Explorar productos" del primer slide del hero: baja con scroll suave en vez de saltar de golpe. */
function initHeroExploreCta() {
  const cta = document.querySelector('a.hero__banner-cta[href="#productos"]');
  const target = document.getElementById('productos');
  if (!cta || !target) return;
  cta.addEventListener('click', (e) => {
    e.preventDefault();
    // scrollIntoView({behavior:'smooth'}) ignora el scroll-behavior de CSS,
    // así que "Reducir animaciones" (Ajustes o prefers-reduced-motion del
    // sistema) hay que respetarlo acá a mano -- mismo criterio que a11y.css.
    const reduceMotion = getPref('reduceMotion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  });
}

/**
 * Saca la URL de la foto de un banner leyendo su `background-image` ya
 * resuelto por el navegador (el último `url(...)` de la pila -- el degradé
 * de color va primero). Así el lightbox siempre muestra exactamente la
 * misma imagen que el banner, con el hash que le puso Vite al buildear, sin
 * tener que repetir la ruta a mano en un atributo aparte (que en el build
 * final no se reescribe y termina apuntando a un archivo que no existe).
 */
function getBannerImageUrl(banner) {
  const bg = getComputedStyle(banner).backgroundImage;
  const matches = [...bg.matchAll(/url\((['"]?)(.*?)\1\)/g)];
  return matches.length ? matches[matches.length - 1][2] : '';
}

/**
 * Banners promocionales del home: click/Enter/Espacio en un banner abre
 * SIEMPRE primero la imagen ampliada (data-lightbox-alt, ver
 * .promo-lightbox-overlay en home.css) -- ni el banner fijo ni el de una
 * promo real llevan a ningún lado de un solo toque.
 *  - con promo de un comercio cargada (data-promo-href, lo pone
 *    loadHomePromos) => la 2da interacción (cerrar con la X/afuera/Esc, o
 *    tocar la imagen ampliada de nuevo) recién ahí lleva a la publicación;
 *  - con foto fija sin promo => cerrar no hace nada más que cerrar, como
 *    siempre;
 *  - espacio sin ninguna imagen (no debería pasar, toda promo viva trae
 *    imagen) => por las dudas, el click va directo a la publicación.
 * Se decide en el momento del click, así da igual si las promos terminaron de
 * cargar antes o después de cablear los listeners.
 */
function initPromoBanners() {
  const overlay = document.getElementById('promo-lightbox');
  const img = document.getElementById('promo-lightbox-img');
  const hint = document.getElementById('promo-lightbox-hint');
  const closeBtn = document.getElementById('promo-lightbox-close');
  const stage = document.getElementById('promo-lightbox-stage');
  const prevBtn = document.getElementById('promo-lightbox-prev');
  const nextBtn = document.getElementById('promo-lightbox-next');
  const count = document.getElementById('promo-lightbox-count');
  const banners = document.querySelectorAll('[data-promo-slot]');
  if (!banners.length) return;

  let lastTrigger = null;
  // A dónde lleva la 2da interacción, si la imagen abierta es la de una
  // promo con publicación asignada. null en un banner decorativo.
  let pendingHref = null;
  // Imágenes del banner abierto (una sola en los fijos) y cuál se está viendo.
  let images = [];
  let index = 0;
  let baseAlt = '';
  let openSlider = null;

  const renderImage = () => {
    img.src = images[index] || '';
    img.alt = images.length > 1 ? `${baseAlt} (imagen ${index + 1} de ${images.length})` : baseAlt;
    const many = images.length > 1;
    [prevBtn, nextBtn, count].forEach((node) => { if (node) node.hidden = !many; });
    if (count && many) count.textContent = `${index + 1} / ${images.length}`;
  };

  // Flechas: dan la vuelta (de la última a la primera). El banner de atrás
  // queda en la misma imagen que se estaba mirando.
  const step = (delta) => {
    if (images.length < 2) return;
    index = stepIndex(index, delta, images.length);
    renderImage();
    openSlider?.show(index);
  };

  const openLightbox = (banner) => {
    if (!overlay || !img || !closeBtn) return;
    lastTrigger = banner;
    pendingHref = banner.dataset.promoHref || null;
    openSlider = promoSliders.get(banner) || null;
    images = openSlider ? openSlider.urls : [getBannerImageUrl(banner)];
    index = openSlider ? openSlider.index : 0;
    baseAlt = banner.dataset.lightboxAlt || '';
    openSlider?.pause();
    renderImage();
    if (hint) hint.hidden = !pendingHref;
    overlay.classList.add('is-open');
    closeBtn.focus();
  };

  // "Cerrar" (X, click afuera, Esc) o tocar la imagen de nuevo: las dos
  // formas de la 2da interacción que pide el producto. Si la imagen era la
  // de una promo con publicación, en vez de solo cerrar, lleva ahí.
  const closeLightbox = () => {
    const href = pendingHref;
    overlay.classList.remove('is-open');
    img.src = '';
    pendingHref = null;
    openSlider?.resume();
    openSlider = null;
    if (href) {
      window.location.href = href;
      return;
    }
    if (lastTrigger) lastTrigger.focus();
  };

  const activate = (banner) => {
    if (banner.dataset.lightboxAlt) {
      openLightbox(banner);
    } else if (banner.dataset.promoHref) {
      window.location.href = banner.dataset.promoHref;
    }
  };

  banners.forEach((banner) => {
    banner.addEventListener('click', () => activate(banner));
    banner.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate(banner);
      }
    });
  });

  if (!overlay || !closeBtn) return;
  closeBtn.addEventListener('click', closeLightbox);
  // Click en el fondo (afuera de la imagen/botón) también cierra.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeLightbox();
  });
  // Tocar la imagen ampliada de nuevo: la otra forma de "cerrar".
  img?.addEventListener('click', closeLightbox);
  prevBtn?.addEventListener('click', () => step(-1));
  nextBtn?.addEventListener('click', () => step(1));
  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  // Deslizar el dedo sobre la imagen ampliada también pasa de imagen.
  let touchX = null;
  stage?.addEventListener('touchstart', (e) => { touchX = e.touches[0]?.clientX ?? null; }, { passive: true });
  stage?.addEventListener('touchend', (e) => {
    if (touchX == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
    touchX = null;
    if (Math.abs(dx) >= 40) step(dx < 0 ? 1 : -1);
  }, { passive: true });
}

/** Banner -> { urls, index, show(i), pause(), resume() } de los que tienen más
 *  de una imagen (los de una sola siguen con la imagen de fondo de siempre). */
const promoSliders = new WeakMap();
const PROMO_ROTATE_MS = 4500;

/**
 * Arma dentro del banner una capa por imagen que se van cambiando solas con
 * un fundido. Se frena con el mouse encima, con la pestaña oculta y mientras
 * el banner está abierto ampliado; con "Reducir animaciones" no rota sola
 * (las flechas de la imagen ampliada siguen andando).
 * `startDelay` desfasa un banner de otro para que no cambien todos a la vez.
 */
function mountPromoSlides(banner, urls, startDelay) {
  const wrap = document.createElement('span');
  wrap.className = 'promo-banner__slides';
  wrap.setAttribute('aria-hidden', 'true');
  const slides = urls.map((url) => {
    const slide = document.createElement('span');
    slide.className = 'promo-banner__slide';
    slide.style.backgroundImage = `url("${encodeURI(url)}")`;
    wrap.appendChild(slide);
    return slide;
  });
  const dots = document.createElement('span');
  dots.className = 'promo-banner__dots';
  dots.setAttribute('aria-hidden', 'true');
  const dotEls = urls.map(() => {
    const dot = document.createElement('span');
    dot.className = 'promo-banner__dot';
    dots.appendChild(dot);
    return dot;
  });
  banner.append(wrap, dots);
  banner.classList.add('has-slides');

  const slider = { urls, index: 0, paused: false };
  slider.show = (i) => {
    slider.index = i;
    slides.forEach((slide, n) => slide.classList.toggle('is-active', n === i));
    dotEls.forEach((dot, n) => dot.classList.toggle('is-active', n === i));
  };
  slider.pause = () => { slider.paused = true; };
  slider.resume = () => { slider.paused = false; };
  slider.show(0);
  promoSliders.set(banner, slider);

  const reduceMotion = getPref('reduceMotion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;
  banner.addEventListener('mouseenter', slider.pause);
  banner.addEventListener('mouseleave', slider.resume);
  setTimeout(() => {
    setInterval(() => {
      if (slider.paused || document.hidden) return;
      slider.show(stepIndex(slider.index, 1, urls.length));
    }, PROMO_ROTATE_MS);
  }, startDelay);
}

/**
 * Pinta en cada espacio del mosaico la promo del comercio que el admin le
 * asignó (tabla home_promos, migración 108). Un espacio sin promo "viva"
 * (ver isPromoLive) no se toca: sigue el banner fijo del HTML/CSS. Si la
 * consulta falla también quedan los fijos -- es decoración, no vale la pena
 * mostrar un error en la portada.
 */
async function loadHomePromos() {
  const banners = document.querySelectorAll('[data-promo-slot]');
  if (!banners.length) return;

  const { data, error } = await supabase
    .from('home_promos')
    .select('*, stores(name, status), products(is_active)')
    .eq('is_active', true)
    .not('store_id', 'is', null);
  if (error) {
    console.error('Error al cargar las promociones del home:', error);
    return;
  }

  const bySlot = new Map((data || []).filter(isPromoLive).map((p) => [p.slot, p]));

  banners.forEach((banner, n) => {
    const promo = bySlot.get(banner.dataset.promoSlot);
    if (!promo) return;

    // La imagen del comercio ya trae su propio texto: el rótulo fijo del
    // banner ("Combos", "Espacio para un banner"...) se reemplaza por el
    // nombre del comercio + el título de la promo, si cargó uno.
    banner.textContent = '';
    const eyebrow = document.createElement('span');
    eyebrow.className = 'promo-banner__eyebrow';
    eyebrow.textContent = promo.stores.name;
    banner.appendChild(eyebrow);
    if (promo.title) {
      const title = document.createElement('span');
      title.className = 'promo-banner__title';
      title.textContent = promo.title;
      banner.appendChild(title);
    }

    // Hasta 3 imágenes: con una sola se usa el fondo de siempre; con más,
    // capas que pasan solas (el texto de arriba va sobre todas).
    const images = promoImages(promo);
    if (images.length > 1) {
      mountPromoSlides(banner, images, (n % 3) * 1500);
    } else {
      banner.style.setProperty('--promo-img', `url("${encodeURI(images[0])}")`);
    }
    banner.classList.add('is-store-promo');
    banner.dataset.promoHref = promoHref(promo);
    // El click abre la imagen ampliada primero, igual que un banner fijo
    // (ver initPromoBanners): la publicación recién se abre en la 2da
    // interacción, así que el lightbox-alt se mantiene en vez de borrarse.
    banner.dataset.lightboxAlt = promoAriaLabel(promo);
    banner.setAttribute('role', 'button');
    banner.setAttribute('tabindex', '0');
    banner.setAttribute('aria-label', `${promoAriaLabel(promo)}. Se abre la imagen ampliada; cerrala o tocá de nuevo para ir a la publicación.`);
  });
}

/**
 * Pantalla de bienvenida breve al entrar al home (#welcome-splash en
 * home.html): se saca sola con un fade, no espera datos ni bloquea nada de
 * lo que sigue cargando atrás. Con "Reducir animaciones" activo se saca de
 * una, sin el fade.
 */
function initWelcomeSplash() {
  const splash = document.getElementById('welcome-splash');
  if (!splash) return;
  const reduceMotion = getPref('reduceMotion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const remove = () => splash.remove();
  setTimeout(() => {
    if (reduceMotion) { remove(); return; }
    splash.classList.add('is-hidden');
    splash.addEventListener('transitionend', remove, { once: true });
  }, reduceMotion ? 0 : 900);
}

// Inicializar todo
document.addEventListener('DOMContentLoaded', () => {
  initWelcomeSplash();
  initScrollTop();
  initNavbarScroll();
  initHeroCarousel();
  initHeroExploreCta();
  initPromoBanners();
  loadHomePromos();
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
  initAccountMenu();

  // Cargar datos dinámicos
  loadStores();
  initStoresCarouselArrows();
  loadProducts();
  loadOffers();
  loadEssentials();

  // Modal de detalle de producto
  if (typeof initProductModal === 'function') initProductModal();
});
