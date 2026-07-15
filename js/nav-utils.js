/**
 * nav-utils.js — Navegación compartida entre home.html y search.html
 * Baradero Local
 *
 * Optimización de navbar de categorías + motor de búsqueda, con patrones
 * de e-commerce grande (Mercado Libre/Amazon):
 *  - Barra de categorías: botón "Categorías" con mega-menú (grilla de todas
 *    las categorías con iconos) + tira de acceso rápido scrolleable.
 *  - Buscador: autocompletado con sugerencias de productos reales (vía el RPC
 *    search_products, insensible a acentos) + búsquedas recientes, con
 *    navegación por teclado.
 *
 * Todo con DOM API (anti-XSS): los datos de la DB nunca van por innerHTML.
 */

import { supabase } from './auth-utils.js';
import { formatPrice } from './cart-utils.js';
import { renderNotificationsSection, fetchUnreadCount } from './notifications-utils.js';

// ── Iconos por categoría (Font Awesome, ya cargado) ─────────
const CATEGORY_ICONS = {
  almacen: 'fa-basket-shopping',
  bebidas: 'fa-wine-bottle',
  carniceria: 'fa-drumstick-bite',
  deportes: 'fa-futbol',
  farmacia: 'fa-prescription-bottle-medical',
  ferreteria: 'fa-screwdriver-wrench',
  kiosco: 'fa-store',
  lacteos: 'fa-cheese',
  limpieza: 'fa-spray-can-sparkles',
  mascotas: 'fa-dog',
  panaderia: 'fa-bread-slice',
  ropa: 'fa-shirt',
  tecnologia: 'fa-laptop',
  verduleria: 'fa-carrot',
};
const CATEGORY_ICON_DEFAULT = 'fa-tag';

function iconFor(slug) {
  return CATEGORY_ICONS[slug] || CATEGORY_ICON_DEFAULT;
}

// ── Categorías (cache por pestaña: la usan el mega-menú y el buscador) ──
let _categoriesPromise = null;
export function getCategories() {
  if (!_categoriesPromise) {
    _categoriesPromise = supabase
      .from('categories')
      .select('id, name, slug')
      .order('name')
      .then(({ data, error }) => {
        if (error) { _categoriesPromise = null; throw error; }
        return data || [];
      })
      .catch((err) => {
        console.error('Error al cargar categorías:', err);
        _categoriesPromise = null;
        return [];
      });
  }
  return _categoriesPromise;
}

// ── Categorías destacadas (las más populares, para la tira de acceso rápido) ──
// Patrón de e-commerce grande (Mercado Libre/Amazon): el mega-menú tiene TODAS
// las categorías; la tira inline muestra solo un puñado destacado, no las 14.
// "Destacadas" = las que más productos activos tienen (excluye las vacías).
let _featuredPromise = null;
export function getFeaturedCategories(limit = 6) {
  if (!_featuredPromise) {
    _featuredPromise = (async () => {
      const categories = await getCategories();
      const { data, error } = await supabase
        .from('products')
        .select('category_id')
        .eq('is_active', true);
      if (error || !data) return categories.slice(0, limit); // fallback: primeras N
      const counts = new Map();
      data.forEach((r) => {
        if (r.category_id) counts.set(r.category_id, (counts.get(r.category_id) || 0) + 1);
      });
      return categories
        .map((c) => ({ ...c, _count: counts.get(c.id) || 0 }))
        .filter((c) => c._count > 0)
        .sort((a, b) => b._count - a._count)
        .slice(0, limit);
    })().catch((err) => {
      console.error('Error al cargar categorías destacadas:', err);
      _featuredPromise = null;
      return [];
    });
  }
  return _featuredPromise;
}

// ── Búsquedas recientes (localStorage) ──────────────────────
const RECENT_KEY = 'bl_recent_searches';
const RECENT_MAX = 6;

export function getRecentSearches() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(term) {
  const clean = (term || '').trim();
  if (!clean) return;
  try {
    const current = getRecentSearches().filter((t) => t.toLowerCase() !== clean.toLowerCase());
    current.unshift(clean);
    localStorage.setItem(RECENT_KEY, JSON.stringify(current.slice(0, RECENT_MAX)));
  } catch { /* localStorage lleno o bloqueado: ignorar */ }
}

export function clearRecentSearches() {
  try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
}

// ── Barra de categorías con mega-menú ───────────────────────
/**
 * Rellena #category-bar-inner con el botón "Categorías" (mega-menú) + la tira
 * de acceso rápido. `activeSlug` resalta la categoría activa (o 'ofertas'/'inicio').
 */
export async function initCategoryBar({ activeSlug = 'inicio', featuredLimit = 6 } = {}) {
  const inner = document.getElementById('category-bar-inner');
  if (!inner) return;

  const categories = await getCategories();

  inner.textContent = '';

  // --- Botón mega-menú "Categorías" (fijo, no scrollea) ---
  const mega = document.createElement('div');
  mega.className = 'cat-mega';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'cat-mega__trigger';
  trigger.setAttribute('aria-haspopup', 'true');
  trigger.setAttribute('aria-expanded', 'false');
  const barsIcon = document.createElement('i');
  barsIcon.className = 'fa-solid fa-bars';
  trigger.appendChild(barsIcon);
  trigger.append(' Categorías ');
  const caret = document.createElement('i');
  caret.className = 'fa-solid fa-chevron-down cat-mega__caret';
  trigger.appendChild(caret);
  mega.appendChild(trigger);

  const panel = document.createElement('div');
  panel.className = 'cat-mega__panel';
  panel.setAttribute('role', 'menu');
  panel.hidden = true;

  const panelTitle = document.createElement('p');
  panelTitle.className = 'cat-mega__title';
  panelTitle.textContent = 'Todas las categorías';
  panel.appendChild(panelTitle);

  const grid = document.createElement('div');
  grid.className = 'cat-mega__grid';
  categories.forEach((cat) => {
    const link = document.createElement('a');
    link.href = `./search.html?cat=${encodeURIComponent(cat.slug)}`;
    link.className = 'cat-mega__item';
    link.setAttribute('role', 'menuitem');
    const ico = document.createElement('i');
    ico.className = `fa-solid ${iconFor(cat.slug)}`;
    link.appendChild(ico);
    const label = document.createElement('span');
    label.textContent = cat.name;
    link.appendChild(label);
    grid.appendChild(link);
  });
  panel.appendChild(grid);

  // Acceso del panel: Ofertas. Vender/Repartir sacados (P1-13) — ya están en
  // perfil.html > Mis datos > Accesos rápidos, sobraban acá (esto es solo
  // categorías de productos).
  const megaFooter = document.createElement('div');
  megaFooter.className = 'cat-mega__footer';
  const footerLinks = [
    { href: './search.html?cat=ofertas', icon: 'fa-tags', text: 'Ofertas' },
  ];
  footerLinks.forEach((f) => {
    const a = document.createElement('a');
    a.href = f.href;
    a.className = 'cat-mega__footer-link';
    a.setAttribute('role', 'menuitem');
    const i = document.createElement('i');
    i.className = `fa-solid ${f.icon}`;
    a.appendChild(i);
    a.append(` ${f.text}`);
    megaFooter.appendChild(a);
  });
  panel.appendChild(megaFooter);
  mega.appendChild(panel);
  inner.appendChild(mega);

  // Toggle del mega-menú (click, no solo hover -> mejor en mobile y accesible)
  const openMega = () => { panel.hidden = false; trigger.setAttribute('aria-expanded', 'true'); mega.classList.add('is-open'); };
  const closeMega = () => { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); mega.classList.remove('is-open'); };
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.hidden) openMega(); else closeMega();
  });
  document.addEventListener('click', (e) => {
    if (!mega.contains(e.target)) closeMega();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMega();
  });

  // --- Tira de acceso rápido: Inicio + Ofertas + solo las categorías
  //     destacadas (no las 14). El resto vive en el mega-menú de arriba. ---
  const featured = await getFeaturedCategories(featuredLimit);

  const quick = document.createElement('div');
  quick.className = 'category-bar__quick';

  const quickItems = [
    { slug: 'inicio', name: 'Inicio', href: './home.html' },
    { slug: 'ofertas', name: 'Ofertas', href: './search.html?cat=ofertas' },
    ...featured.map((c) => ({ slug: c.slug, name: c.name, href: `./search.html?cat=${encodeURIComponent(c.slug)}` })),
  ];

  // Si la categoría activa no está entre las destacadas, la agrego para que
  // se vea resaltada (ej: entré por el mega-menú a una categoría no destacada).
  if (activeSlug !== 'inicio' && activeSlug !== 'ofertas' && !quickItems.some((q) => q.slug === activeSlug)) {
    const activeCat = categories.find((c) => c.slug === activeSlug);
    if (activeCat) {
      quickItems.push({ slug: activeCat.slug, name: activeCat.name, href: `./search.html?cat=${encodeURIComponent(activeCat.slug)}` });
    }
  }

  quickItems.forEach((item) => {
    const link = document.createElement('a');
    link.href = item.href;
    link.className = 'category-bar__item';
    if (item.slug === activeSlug) link.classList.add('category-bar__item--active');
    if (item.slug === 'ofertas') {
      const i = document.createElement('i');
      i.className = 'fa-solid fa-tags';
      link.appendChild(i);
    }
    link.append(item.slug === 'ofertas' ? ' ' + item.name : item.name);
    quick.appendChild(link);
  });

  inner.appendChild(quick);
}

// ── Buscador con autocompletado ─────────────────────────────
/**
 * Conecta #search-input con un dropdown de sugerencias (productos reales +
 * categorías + búsquedas recientes) y navegación por teclado.
 * @param {{ initialQuery?: string, onSubmit: (term: string) => void }} opts
 *   onSubmit se llama al confirmar una búsqueda de texto (Enter, click en
 *   "Buscar X" o en una búsqueda reciente). En home redirige a search.html;
 *   en search filtra en la misma página.
 */
export async function initSearchBox({ initialQuery = '', onSubmit } = {}) {
  const input = document.getElementById('search-input');
  if (!input) return;

  const wrapper = input.closest('.navbar__search') || input.parentElement;
  if (wrapper && getComputedStyle(wrapper).position === 'static') {
    wrapper.style.position = 'relative';
  }

  if (initialQuery) input.value = initialQuery;

  // Dropdown de sugerencias
  const dropdown = document.createElement('div');
  dropdown.className = 'search-suggest';
  dropdown.hidden = true;
  dropdown.setAttribute('role', 'listbox');
  wrapper.appendChild(dropdown);

  const categories = await getCategories();

  let items = [];       // elementos navegables actuales (nodos)
  let activeIndex = -1;
  let debounceTimer = null;
  let lastToken = 0;    // para descartar respuestas viejas del RPC

  function close() {
    dropdown.hidden = true;
    dropdown.textContent = '';
    items = [];
    activeIndex = -1;
  }

  function submitTerm(term) {
    const clean = (term || '').trim();
    close();
    if (!clean) return;
    addRecentSearch(clean);
    input.value = clean;
    onSubmit?.(clean);
  }

  function setActive(idx) {
    items.forEach((el) => el.classList.remove('is-active'));
    activeIndex = idx;
    if (idx >= 0 && items[idx]) {
      items[idx].classList.add('is-active');
      items[idx].scrollIntoView({ block: 'nearest' });
    }
  }

  // Fila genérica de sugerencia
  function makeRow({ icon, thumb, main, meta, onActivate, className }) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'search-suggest__row' + (className ? ' ' + className : '');
    row.setAttribute('role', 'option');

    if (thumb) {
      const img = document.createElement('img');
      img.className = 'search-suggest__thumb';
      img.src = thumb;
      img.alt = '';
      img.loading = 'lazy';
      row.appendChild(img);
    } else if (icon) {
      const i = document.createElement('i');
      i.className = `fa-solid ${icon} search-suggest__icon`;
      row.appendChild(i);
    }

    const textWrap = document.createElement('span');
    textWrap.className = 'search-suggest__text';
    const mainSpan = document.createElement('span');
    mainSpan.className = 'search-suggest__main';
    mainSpan.textContent = main;
    textWrap.appendChild(mainSpan);
    if (meta) {
      const metaSpan = document.createElement('span');
      metaSpan.className = 'search-suggest__meta';
      metaSpan.textContent = meta;
      textWrap.appendChild(metaSpan);
    }
    row.appendChild(textWrap);

    row.addEventListener('click', (e) => { e.preventDefault(); onActivate(); });
    return row;
  }

  function sectionHeader(text, action) {
    const header = document.createElement('div');
    header.className = 'search-suggest__header';
    const span = document.createElement('span');
    span.textContent = text;
    header.appendChild(span);
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'search-suggest__clear';
      btn.textContent = action.label;
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); action.onClick(); });
      header.appendChild(btn);
    }
    return header;
  }

  // Estado vacío: mostrar búsquedas recientes
  function renderRecent() {
    dropdown.textContent = '';
    items = [];
    const recent = getRecentSearches();
    if (recent.length === 0) { close(); return; }

    dropdown.appendChild(sectionHeader('Búsquedas recientes', {
      label: 'Borrar', onClick: () => { clearRecentSearches(); close(); },
    }));

    recent.forEach((term) => {
      const row = makeRow({
        icon: 'fa-clock-rotate-left', main: term,
        onActivate: () => submitTerm(term),
      });
      dropdown.appendChild(row);
      items.push(row);
    });

    dropdown.hidden = false;
    activeIndex = -1;
  }

  // Sugerencias en vivo (productos + categorías)
  async function renderSuggestions(query) {
    const q = query.trim();
    if (q.length < 2) { renderRecent(); return; }

    const token = ++lastToken;
    const { data: products, error } = await supabase.rpc('search_products', {
      p_query: q, p_limit: 6, p_offset: 0, p_sort: 'relevancia',
    });
    if (token !== lastToken) return; // llegó una respuesta más nueva
    if (error) { console.error('Error en sugerencias:', error); close(); return; }

    dropdown.textContent = '';
    items = [];

    // Acción principal: "Buscar 'q'"
    const searchRow = makeRow({
      icon: 'fa-magnifying-glass', main: `Buscar "${q}"`, className: 'search-suggest__row--search',
      onActivate: () => submitTerm(q),
    });
    dropdown.appendChild(searchRow);
    items.push(searchRow);

    // Categorías que matchean el texto
    const matchingCats = categories.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
    if (matchingCats.length) {
      dropdown.appendChild(sectionHeader('Categorías'));
      matchingCats.slice(0, 3).forEach((cat) => {
        const row = makeRow({
          icon: iconFor(cat.slug), main: cat.name, meta: 'Categoría',
          onActivate: () => { close(); window.location.href = `./search.html?cat=${encodeURIComponent(cat.slug)}`; },
        });
        dropdown.appendChild(row);
        items.push(row);
      });
    }

    // Productos sugeridos
    if (products && products.length) {
      dropdown.appendChild(sectionHeader('Productos'));
      products.forEach((p) => {
        const row = makeRow({
          thumb: p.image_url || '/img/no-image.svg',
          main: p.title,
          meta: `${formatPrice(p.price)}${p.store_name ? ' · ' + p.store_name : ''}`,
          onActivate: () => { close(); window.location.href = `./producto.html?id=${encodeURIComponent(p.id)}`; },
        });
        dropdown.appendChild(row);
        items.push(row);
      });
    } else if (!matchingCats.length) {
      const empty = document.createElement('p');
      empty.className = 'search-suggest__empty';
      empty.textContent = 'Sin sugerencias. Presioná Enter para buscar igual.';
      dropdown.appendChild(empty);
    }

    dropdown.hidden = false;
    activeIndex = -1;
  }

  // Eventos del input
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = input.value;
    debounceTimer = setTimeout(() => renderSuggestions(val), 220);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) renderSuggestions(input.value);
    else renderRecent();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (dropdown.hidden) { input.value.trim().length >= 2 ? renderSuggestions(input.value) : renderRecent(); return; }
      setActive(Math.min(activeIndex + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && items[activeIndex]) items[activeIndex].click();
      else submitTerm(input.value);
    } else if (e.key === 'Escape') {
      close();
    }
  });

  // Cerrar al hacer click afuera
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) close();
  });
}

// ── Campanita de notificaciones (navbar) ────────────────────
/**
 * Botón de notificaciones para la navbar: reutiliza el centro de
 * notificaciones ya existente (notifications-utils.js, F8-01 -- el mismo que
 * usan perfil.html y el dashboard del vendedor), pero en formato dropdown
 * compacto en vez de una sección de página completa.
 *
 * Requiere un contenedor `<div id="nav-notifications-wrap">` en el HTML
 * (a la izquierda de #nav-profile en la navbar).
 */
export async function initNotificationsBell() {
  const wrap = document.getElementById('nav-notifications-wrap');
  if (!wrap) return;

  const { data: { session } } = await supabase.auth.getSession();

  wrap.innerHTML = '';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'navbar__action-circle';
  btn.id = 'nav-notifications';
  btn.setAttribute('aria-label', 'Notificaciones');
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');
  const bellIcon = document.createElement('i');
  bellIcon.className = 'fa-regular fa-bell';
  bellIcon.style.fontSize = '0.875rem';
  btn.appendChild(bellIcon);

  const badge = document.createElement('span');
  badge.className = 'cart-badge';
  badge.id = 'notif-badge';
  btn.appendChild(badge);
  wrap.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 'notif-dropdown';
  panel.hidden = true;
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Notificaciones');
  wrap.appendChild(panel);

  async function refreshBadge() {
    if (!session) { badge.textContent = ''; badge.dataset.count = '0'; return; }
    const count = await fetchUnreadCount(session.user.id);
    badge.textContent = count > 0 ? (count > 9 ? '9+' : String(count)) : '';
    badge.dataset.count = String(count);
  }

  function close() {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    refreshBadge(); // el usuario pudo haber marcado leídas mientras estaba abierto
  }

  async function open() {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    panel.textContent = '';

    if (!session) {
      const msg = document.createElement('p');
      msg.className = 'notif-dropdown__guest';
      msg.textContent = 'Iniciá sesión para ver tus notificaciones.';
      panel.appendChild(msg);
      const loginLink = document.createElement('a');
      loginLink.href = './login.html';
      loginLink.className = 'notif-dropdown__login';
      loginLink.textContent = 'Iniciar sesión';
      panel.appendChild(loginLink);
      return;
    }

    const title = document.createElement('p');
    title.className = 'notif-dropdown__title';
    title.textContent = 'Notificaciones';
    panel.appendChild(title);

    const content = document.createElement('div');
    content.className = 'notif-dropdown__content';
    panel.appendChild(content);
    await renderNotificationsSection(content, session.user.id);
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.hidden) open(); else close();
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target) && !panel.hidden) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) close();
  });

  await refreshBadge();
}

// ── Helpers de scroll compartidos ───────────────────────────
export function initScrollTop() {
  const btn = document.getElementById('scroll-top-btn');
  if (!btn) return;
  window.addEventListener('scroll', () => {
    btn.classList.toggle('scroll-top--visible', window.scrollY > 400);
  }, { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

export function initNavbarScroll() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.style.boxShadow = window.scrollY > 10 ? '0 4px 20px rgba(0,0,0,0.2)' : '';
  }, { passive: true });
}
