// Contratar: directorio de profesionales/técnicos de Baradero, cargados por
// el admin (vía la solicitud que cada uno envía desde vender.html).
//
// Anti-XSS: todo lo que viene de la base se pinta con DOM API (textContent),
// nunca con innerHTML — misma convención que js/servicios.js.

import { supabase } from './auth-utils.js';
import { PROFESSIONAL_CATEGORIES, categoryLabel, categoryIcon } from './professional-categories.js';
import { renderReviewsSection, buildStarsText } from './reviews-utils.js';
import { getVisibleSocialLinks } from './store-contact-utils.js';
import { formatTarifa } from './professional-service-utils.js';
import { fileToDataUrl } from './storage-utils.js';
import { localIsoDate } from './cart-utils.js';
import {
  agruparPorDia,
  agruparDiasIguales,
  estaAbiertoAhora,
  resumenDisponibilidad,
} from './professional-hours-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

let allProfessionals = [];
let activeCategory = 'todos';
let currentUserId = null;
// Evita volver a pedir las reseñas si se cierra y reabre la misma tarjeta.
// Se vacía en cada render(): las tarjetas se rehacen de cero al filtrar, así
// que un id que quedó acá apunta a un nodo que ya no existe -- y su tarjeta
// nueva se quedaba para siempre con la sección de reseñas vacía.
let loadedReviewSections = new Set();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildCategoryChips() {
  const container = document.getElementById('ct-categories');
  container.textContent = '';

  const all = el('button', 'ct-chip is-active', 'Todos');
  all.type = 'button';
  all.dataset.category = 'todos';
  container.appendChild(all);

  PROFESSIONAL_CATEGORIES.forEach((cat) => {
    const chip = el('button', 'ct-chip');
    chip.type = 'button';
    chip.dataset.category = cat.value;
    const icon = el('i', cat.icon);
    icon.setAttribute('aria-hidden', 'true');
    chip.appendChild(icon);
    chip.append(cat.label);
    container.appendChild(chip);
  });

  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.ct-chip');
    if (!chip) return;
    activeCategory = chip.dataset.category;
    container.querySelectorAll('.ct-chip').forEach((c) => c.classList.toggle('is-active', c === chip));
    applyFilter();
  });
}

function buildStarsSummary(pro) {
  if (!pro._ratingCount) return el('span', 'ct-card__stars ct-card__stars--empty', 'Todavía sin reseñas');
  const stars = el('span', 'ct-card__stars');
  stars.textContent = `${buildStarsText(pro._ratingAvg)} ${pro._ratingAvg.toFixed(1)} (${pro._ratingCount})`;
  return stars;
}

async function toggleCard(card, pro) {
  const isOpen = card.classList.toggle('is-open');
  const head = card.querySelector('.ct-card__head');
  head.setAttribute('aria-expanded', String(isOpen));
  const detail = card.querySelector('.ct-card__detail');
  detail.hidden = !isOpen;
  if (!isOpen || loadedReviewSections.has(pro.id)) return;

  // Se cuenta una visita por tarjeta abierta por carga de página (el Set ya
  // evita repetir), no cada vez que se pliega y despliega.
  registrarMetrica(pro.id, 'profile_view');

  loadedReviewSections.add(pro.id);
  const reviewsBox = detail.querySelector('.ct-card__reviews');
  await renderReviewsSection(reviewsBox, 'professional', pro.id, { hideForm: currentUserId === pro.owner_id });
}

/**
 * Suma 1 al contador del profesional. El RPC es SECURITY DEFINER y valida
 * adentro el tipo de evento y que el profesional esté activo, así que desde
 * acá no hay nada que chequear.
 *
 * Deliberadamente sin await ni toast: si falla, el visitante no tiene por qué
 * enterarse -- una métrica perdida no arruina la visita.
 */
function registrarMetrica(professionalId, evento) {
  supabase
    .rpc('increment_professional_metric', {
      p_professional_id: professionalId,
      p_event_type: evento,
    })
    .then(({ error }) => {
      if (error) console.warn('No se pudo registrar la métrica:', error.message);
    });
}

function buildCard(pro) {
  const card = el('div', 'ct-card');
  card.id = `ct-pro-${pro.id}`;

  const head = el('button', 'ct-card__head');
  head.type = 'button';
  head.setAttribute('aria-expanded', 'false');

  const photo = el('div', 'ct-card__photo');
  if (pro.photo_url) {
    const img = el('img');
    img.src = pro.photo_url;
    img.alt = '';
    img.loading = 'lazy';
    photo.appendChild(img);
  } else {
    const icon = el('i', 'fa-solid fa-user');
    icon.setAttribute('aria-hidden', 'true');
    photo.appendChild(icon);
  }
  head.appendChild(photo);

  const main = el('div', 'ct-card__main');
  main.appendChild(el('div', 'ct-card__name', pro.full_name));

  const tags = el('div', 'ct-card__tags');
  if (pro.category) {
    const catTag = el('span', 'ct-card__category');
    const catIcon = el('i', categoryIcon(pro.category));
    catIcon.setAttribute('aria-hidden', 'true');
    catTag.appendChild(catIcon);
    catTag.append(categoryLabel(pro.category));
    tags.appendChild(catTag);
  }
  tags.appendChild(el('span', 'ct-card__specialty', pro.specialty));

  // "Abierto ahora" se calcula en el cliente con los horarios que ya vinieron
  // (js/professional-hours-utils.js), sin una consulta extra.
  const disponibilidad = resumenDisponibilidad({ horarios: pro._horarios, serves24h: pro.serves_24h });
  if (disponibilidad) {
    const abierto = estaAbiertoAhora({ horarios: pro._horarios, serves24h: pro.serves_24h });
    tags.appendChild(el('span', `ct-card__open${abierto ? ' ct-card__open--now' : ''}`, disponibilidad));
  }

  main.appendChild(tags);

  main.appendChild(buildStarsSummary(pro));
  head.appendChild(main);

  const chevron = el('i', 'fa-solid fa-chevron-down ct-card__chevron');
  chevron.setAttribute('aria-hidden', 'true');
  head.appendChild(chevron);

  head.addEventListener('click', () => toggleCard(card, pro));
  card.appendChild(head);

  const detail = el('div', 'ct-card__detail');
  detail.hidden = true;

  if (pro.description) detail.appendChild(el('p', 'ct-card__desc', pro.description));

  const actions = el('div', 'ct-card__actions');
  const call = el('a', 'ct-btn ct-btn--call');
  call.href = `tel:${pro.phone.replace(/[^\d+]/g, '')}`;
  call.addEventListener('click', () => registrarMetrica(pro.id, 'call_click'));
  const callIcon = el('i', 'fa-solid fa-phone');
  callIcon.setAttribute('aria-hidden', 'true');
  call.appendChild(callIcon);
  call.append(' Llamar');
  actions.appendChild(call);

  if (pro.whatsapp) {
    const wsp = el('a', 'ct-btn ct-btn--whatsapp');
    wsp.href = `https://wa.me/${pro.whatsapp.replace(/[^\d]/g, '')}`;
    wsp.target = '_blank';
    wsp.rel = 'noopener';
    wsp.addEventListener('click', () => registrarMetrica(pro.id, 'whatsapp_click'));
    const wspIcon = el('i', 'fa-brands fa-whatsapp');
    wspIcon.setAttribute('aria-hidden', 'true');
    wsp.appendChild(wspIcon);
    wsp.append(' WhatsApp');
    actions.appendChild(wsp);
  }
  const presupuesto = el('button', 'ct-btn ct-btn--quote');
  presupuesto.type = 'button';
  const quoteIcon = el('i', 'fa-solid fa-file-lines');
  quoteIcon.setAttribute('aria-hidden', 'true');
  presupuesto.appendChild(quoteIcon);
  presupuesto.append(' Pedir presupuesto');
  presupuesto.addEventListener('click', (e) => {
    e.stopPropagation();
    abrirFormularioConsulta(pro);
  });
  actions.appendChild(presupuesto);

  detail.appendChild(actions);

  // Servicios con su tarifa: lo que más le sirve a quien está decidiendo.
  if (pro._servicios.length) {
    const bloque = el('div', 'ct-card__block');
    bloque.appendChild(el('h4', 'ct-card__block-title', 'Servicios y precios'));
    const lista = el('ul', 'ct-services');
    pro._servicios.forEach((servicio) => {
      const item = el('li', 'ct-service');
      const izq = el('div', 'ct-service__main');
      izq.appendChild(el('span', 'ct-service__title', servicio.title));
      if (servicio.description) izq.appendChild(el('span', 'ct-service__desc', servicio.description));
      item.appendChild(izq);
      item.appendChild(el('span', 'ct-service__price', formatTarifa(servicio)));
      lista.appendChild(item);
    });
    bloque.appendChild(lista);
    detail.appendChild(bloque);
  }

  // Horarios por día, solo los días que atiende.
  if (pro._horarios.length) {
    const bloque = el('div', 'ct-card__block');
    bloque.appendChild(el('h4', 'ct-card__block-title', 'Horarios'));
    const porDia = agruparPorDia(pro._horarios);
    const lista = el('ul', 'ct-hours');
    // Los días seguidos con el mismo horario van en una sola línea.
    agruparDiasIguales(porDia).forEach((grupo) => {
      const item = el('li', 'ct-hours__row');
      item.appendChild(el('span', 'ct-hours__day', grupo.etiqueta));
      item.appendChild(el('span', 'ct-hours__range', grupo.texto));
      lista.appendChild(item);
    });
    bloque.appendChild(lista);
    detail.appendChild(bloque);
  }

  if (pro._zonas.length) {
    const bloque = el('div', 'ct-card__block');
    bloque.appendChild(el('h4', 'ct-card__block-title', 'Zonas donde trabaja'));
    const chips = el('div', 'ct-zones');
    pro._zonas.forEach((zona) => chips.appendChild(el('span', 'ct-zone', zona)));
    bloque.appendChild(chips);
    detail.appendChild(bloque);
  }

  const socialLinks = getVisibleSocialLinks(pro);
  if (socialLinks.length > 0) {
    const socialRow = el('div', 'ct-card__social');
    socialLinks.forEach((s) => {
      const link = el('a', 'ct-card__social-link');
      link.href = s.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', s.label);
      link.title = s.label;
      const icon = el('i', s.icon);
      icon.setAttribute('aria-hidden', 'true');
      link.appendChild(icon);
      socialRow.appendChild(link);
    });
    detail.appendChild(socialRow);
  }

  if (pro._promos && pro._promos.length > 0) {
    const promos = el('div', 'ct-card__promos');
    pro._promos.forEach((promo) => {
      const thumb = el('button', 'ct-card__promo');
      thumb.type = 'button';
      thumb.setAttribute('aria-label', `Ver foto de ${pro.full_name}`);
      const img = el('img');
      img.src = promo.image_url;
      img.alt = '';
      img.loading = 'lazy';
      thumb.appendChild(img);
      thumb.addEventListener('click', (e) => {
        e.stopPropagation();
        openPromoLightbox(promo.image_url);
      });
      promos.appendChild(thumb);
    });
    detail.appendChild(promos);
  }

  detail.appendChild(el('div', 'ct-card__reviews'));
  card.appendChild(detail);

  return card;
}

// --- Lightbox de fotos promocionales: mismo componente que el lightbox de
// banners del home (.promo-lightbox-overlay, ya en home.css -- esta página
// ya lo carga), no uno nuevo. Un solo overlay reutilizado para toda la
// página (no uno por tarjeta), toggleado por clase (.is-open), no por
// `hidden`: con `hidden` el overlay quedaba con el fondo oscuro trabado
// porque `.ct-lightbox { display: flex }` (una regla de autor) le ganaba en
// cascada a `[hidden] { display: none }` (regla de user-agent) pese a tener
// la misma especificidad -- por eso "cerrar" apagaba la imagen pero no el
// fondo. Clase en vez de atributo evita el problema de raíz.
let promoLightbox = null;

function buildPromoLightbox() {
  const overlay = el('div', 'promo-lightbox-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Imagen ampliada');

  const box = el('div', 'promo-lightbox');
  overlay.appendChild(box);

  const closeBtn = el('button', 'promo-lightbox__close');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Cerrar');
  const closeIcon = el('i', 'fa-solid fa-xmark');
  closeIcon.setAttribute('aria-hidden', 'true');
  closeBtn.appendChild(closeIcon);
  box.appendChild(closeBtn);

  const img = el('img', 'promo-lightbox__img');
  box.appendChild(img);

  const close = () => closePromoLightbox();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  closeBtn.addEventListener('click', close);

  document.body.appendChild(overlay);
  return { overlay, img };
}

function openPromoLightbox(imageUrl) {
  if (!promoLightbox) promoLightbox = buildPromoLightbox();
  promoLightbox.img.src = imageUrl;
  promoLightbox.overlay.classList.add('is-open');
  document.addEventListener('keydown', onPromoLightboxKeydown);
}

function closePromoLightbox() {
  if (!promoLightbox) return;
  promoLightbox.overlay.classList.remove('is-open');
  promoLightbox.img.src = '';
  document.removeEventListener('keydown', onPromoLightboxKeydown);
}

function onPromoLightboxKeydown(e) {
  if (e.key === 'Escape') closePromoLightbox();
}

// Destacados: los mejor calificados, en una fila compacta arriba de la
// lista completa (mismo componente .pro-highlight-card que antes vivía en
// el home, ver Assets/styles/home.css -- esta página ya lo carga).
function buildFeaturedCard(pro) {
  const card = el('a', 'pro-highlight-card');
  card.href = `#ct-pro-${pro.id}`;

  const photo = el('div', 'pro-highlight-card__photo');
  if (pro.photo_url) {
    const img = el('img');
    img.src = pro.photo_url;
    img.alt = '';
    img.loading = 'lazy';
    photo.appendChild(img);
  } else {
    const icon = el('i', 'fa-solid fa-user');
    icon.setAttribute('aria-hidden', 'true');
    photo.appendChild(icon);
  }
  card.appendChild(photo);

  card.appendChild(el('span', 'pro-highlight-card__name', pro.full_name));
  card.appendChild(el('span', 'pro-highlight-card__specialty', pro.specialty));

  const stars = el('span', 'pro-highlight-card__stars', `★ ${pro._ratingAvg.toFixed(1)} (${pro._ratingCount})`);
  card.appendChild(stars);

  card.addEventListener('click', (e) => {
    e.preventDefault();
    scrollToProfessional(pro.id);
  });

  return card;
}

function renderFeatured(list) {
  const section = document.getElementById('ct-featured-section');
  const row = document.getElementById('ct-featured-row');
  if (!section || !row) return;

  const featured = list.filter((p) => p._ratingCount > 0).slice(0, 8);
  if (featured.length === 0) {
    section.hidden = true;
    return;
  }

  row.textContent = '';
  featured.forEach((pro) => row.appendChild(buildFeaturedCard(pro)));
  section.hidden = false;
}

// Abre y desplaza a una tarjeta de la lista completa, reseteando los
// filtros si hace falta para que esté presente (mismo criterio que el
// deep link ?pro= que usan las notificaciones/buscador).
function scrollToProfessional(id) {
  if (activeCategory !== 'todos' || document.getElementById('ct-search-input')?.value) {
    activeCategory = 'todos';
    document.querySelectorAll('.ct-chip').forEach((c) => c.classList.toggle('is-active', c.dataset.category === 'todos'));
    const searchInput = document.getElementById('ct-search-input');
    if (searchInput) searchInput.value = '';
    applyFilter();
  }

  const card = document.getElementById(`ct-pro-${id}`);
  const pro = allProfessionals.find((p) => p.id === id);
  if (!card || !pro) return;
  if (!card.classList.contains('is-open')) toggleCard(card, pro);
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Bloque "cargando" con el spinner de 6 puntos del proyecto (home.css). */
function buildLoadingBlock(text) {
  const block = el('div', 'bl-loading-block');
  block.setAttribute('role', 'status');
  block.setAttribute('aria-live', 'polite');
  const spinner = el('div', 'bl-spinner');
  spinner.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 6; i++) spinner.appendChild(el('div', 'bl-spinner__dot'));
  block.appendChild(spinner);
  block.appendChild(el('p', 'bl-loading-block__title', text));
  return block;
}

function buildEmpty(message) {
  const empty = el('div', 'ct-empty');
  const icon = el('i', 'fa-regular fa-circle-question');
  icon.setAttribute('aria-hidden', 'true');
  empty.appendChild(icon);
  empty.appendChild(el('p', null, message));
  return empty;
}

function render(list) {
  const container = document.getElementById('ct-content');
  container.textContent = '';
  loadedReviewSections = new Set();

  if (list.length === 0) {
    container.appendChild(buildEmpty(allProfessionals.length === 0
      ? 'Todavía no hay profesionales cargados. Vas a encontrarlos acá pronto.'
      : 'No encontramos a nadie para esa búsqueda.'));
    return;
  }

  const listBox = el('div', 'ct-list');
  list.forEach((pro) => listBox.appendChild(buildCard(pro)));
  container.appendChild(listBox);

  // Deep link desde una notificación ("Ver tu publicación", ?pro=<id>):
  // abre y desplaza a esa tarjeta puntual.
  const proId = new URLSearchParams(window.location.search).get('pro');
  if (proId) {
    const card = document.getElementById(`ct-pro-${proId}`);
    const pro = list.find((p) => p.id === proId);
    if (card && pro && !card.classList.contains('is-open')) {
      toggleCard(card, pro);
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function applyFilter() {
  const q = normalize(document.getElementById('ct-search-input')?.value || '');

  const filtered = allProfessionals.filter((pro) => {
    const matchesCategory = activeCategory === 'todos' || pro.category === activeCategory;
    if (!matchesCategory) return false;
    if (!q) return true;
    return normalize(pro.full_name).includes(q) ||
      normalize(pro.specialty).includes(q) ||
      normalize(pro.description || '').includes(q);
  });

  render(filtered);
}

function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function loadProfessionals() {
  const container = document.getElementById('ct-content');
  container.textContent = '';
  // La consulta tarda (profesionales + reseñas + fotos): sin esto la página
  // queda en blanco abajo de los chips hasta que llega todo.
  container.appendChild(buildLoadingBlock('Cargando el directorio'));

  // Antes eran 2 idas y vueltas seriadas (professionals, y recién con esos
  // ids el Promise.all de 5 consultas más). El RPC junta las 6 en 1 sola ida
  // y vuelta (migración 109) -- con el proyecto en us-west-2 y los usuarios en
  // Baradero, cada ida y vuelta de menos se nota. getSession() no pega a la
  // red (lee la sesión local), así que correrlo en paralelo no ahorra nada
  // real, pero tampoco cuesta nada dejarlo sin bloquear al RPC.
  const [{ data: { session } }, { data, error }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.rpc('get_professionals_directory'),
  ]);
  currentUserId = session?.user?.id || null;

  if (error) {
    console.error('Error al cargar los profesionales:', error);
    container.appendChild(buildEmpty('No pudimos cargar el directorio. Probá de nuevo en un rato.'));
    return;
  }

  const professionals = data || [];

  if (professionals.length === 0) {
    allProfessionals = [];
    renderFeatured([]);
    render([]);
    return;
  }

  // El RPC ya trae horarios/servicios/zonas/fotos agregados por profesional;
  // solo hace falta acomodarlos con el mismo nombre que espera buildCard().
  professionals.forEach((pro) => {
    pro._servicios = pro.servicios || [];
    pro._horarios = pro.horarios || [];
    pro._zonas = pro.zonas || [];
    pro._promos = pro.promos || [];
    pro._ratingAvg = pro.rating_avg || 0;
    pro._ratingCount = pro.rating_count || 0;
  });

  professionals.sort((a, b) => {
    if (b._ratingCount === 0 && a._ratingCount === 0) return a.full_name.localeCompare(b.full_name, 'es');
    if (b._ratingCount === 0) return -1;
    if (a._ratingCount === 0) return 1;
    if (b._ratingAvg !== a._ratingAvg) return b._ratingAvg - a._ratingAvg;
    return a.full_name.localeCompare(b.full_name, 'es');
  });

  allProfessionals = professionals;
  renderFeatured(allProfessionals);
  applyFilter();
}

/* --- Pedir presupuesto -----------------------------------------------------
 *
 * El vecino deja una consulta y le entra al profesional en su panel
 * (pages/profesional.html) con una notificación. Hasta acá "Contratar" era
 * solo informativo: el contacto salía por tel:/wa.me y la plataforma no se
 * enteraba de nada.
 *
 * Pide sesión: la RLS de professional_inquiries exige client_id = auth.uid()
 * (sin eso sería un buzón anónimo sin captcha), y además hace falta la cuenta
 * para poder mostrarle después "tus consultas".
 *
 * Fotos y fecha puntual (migración 109): hasta 5 fotos del problema, subidas
 * a un bucket privado ANTES del insert (mismo orden que support_tickets), y
 * un selector de fecha al lado de los chips de "¿Para cuándo?" para cuando
 * ninguno de los tres alcanza -- selecciona el valor 'fecha' y guarda el día
 * puntual en needed_date.
 */

const CUANDO_OPCIONES = [
  { valor: 'hoy', label: 'Hoy' },
  { valor: 'esta_semana', label: 'Esta semana' },
  { valor: 'sin_apuro', label: 'Sin apuro' },
];

const ATTACH_BUCKET = 'professional-inquiry-attachments';
const MAX_ATTACH_FILES = 5;
const MAX_ATTACH_BYTES = 5 * 1024 * 1024;

let overlayConsulta = null;

/**
 * Selector de fotos del modal de presupuesto: botón "Agregar fotos" + grilla
 * de miniaturas con su quitar. Las miniaturas son `data:` URL (FileReader),
 * no `URL.createObjectURL` -- el `img-src` de la CSP de esta página permite
 * `data:` pero no `blob:` (mismo motivo documentado en storage-utils.js), así
 * que un `blob:` en el <img> se bloquea en silencio y nunca carga.
 */
function construirSelectorDeFotos() {
  const root = el('div', 'ct-modal__attach');

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.hidden = true;

  const boton = el('button', 'ct-modal__attach-btn');
  boton.type = 'button';
  const btnIcon = el('i', 'fa-regular fa-images');
  btnIcon.setAttribute('aria-hidden', 'true');
  boton.append(btnIcon, document.createTextNode(' Agregar fotos'));

  const hint = el('span', 'ct-modal__attach-hint', `Hasta ${MAX_ATTACH_FILES} fotos, 5 MB cada una`);
  const miniaturas = el('div', 'ct-modal__thumbs');
  const error = el('p', 'ct-modal__error');
  error.hidden = true;

  root.append(boton, hint, miniaturas, error, input);

  /** [{ file, dataUrl }] */
  let items = [];

  function fail(msg) {
    error.textContent = msg;
    error.hidden = false;
  }

  function render() {
    miniaturas.replaceChildren(...items.map((item, index) => {
      const thumb = el('div', 'ct-modal__thumb');
      const img = document.createElement('img');
      img.src = item.dataUrl;
      img.alt = '';
      thumb.appendChild(img);

      const quitar = el('button', 'ct-modal__thumb-remove');
      quitar.type = 'button';
      quitar.setAttribute('aria-label', `Quitar ${item.file.name}`);
      const x = el('i', 'fa-solid fa-xmark');
      x.setAttribute('aria-hidden', 'true');
      quitar.appendChild(x);
      quitar.addEventListener('click', () => {
        items.splice(index, 1);
        error.hidden = true;
        render();
      });
      thumb.appendChild(quitar);

      return thumb;
    }));

    boton.disabled = items.length >= MAX_ATTACH_FILES;
    hint.textContent = boton.disabled
      ? `Llegaste al máximo de ${MAX_ATTACH_FILES} fotos`
      : `Hasta ${MAX_ATTACH_FILES} fotos, 5 MB cada una`;
  }

  async function addFiles(fileList) {
    error.hidden = true;
    for (const file of Array.from(fileList || [])) {
      if (items.length >= MAX_ATTACH_FILES) {
        fail(`Podés sumar hasta ${MAX_ATTACH_FILES} fotos. El resto no se agregó.`);
        break;
      }
      if (!file.type.startsWith('image/')) {
        fail(`"${file.name}" no es una imagen.`);
        continue;
      }
      if (file.size > MAX_ATTACH_BYTES) {
        fail(`"${file.name}" pesa más de 5 MB.`);
        continue;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        items.push({ file, dataUrl });
      } catch (e) {
        console.error('Error leyendo la foto:', e);
        fail('No pudimos leer esa foto.');
      }
    }
    render();
  }

  boton.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    addFiles(input.files);
    input.value = ''; // permite volver a elegir el mismo archivo
  });

  render();

  return {
    element: root,
    getFiles: () => items.map((i) => i.file),
  };
}

/** Sube las fotos elegidas al bucket, en la carpeta del cliente + el profesional al que le escribe. */
async function subirFotosConsulta(files, userId, professionalId) {
  const paths = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // Sanea el nombre: nada de "/" ni ".." que intente escapar de la carpeta
    // {uid}/{professional_id}/ que exige la policy del bucket.
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '') || 'foto';
    const path = `${userId}/${professionalId}/${Date.now() + i}-${safeName}`;
    const { error } = await supabase.storage
      .from(ATTACH_BUCKET)
      .upload(path, file, { contentType: file.type || 'image/jpeg' });
    if (error) {
      await borrarFotosConsulta(paths);
      throw error;
    }
    paths.push(path);
  }
  return paths;
}

async function borrarFotosConsulta(paths) {
  if (!paths?.length) return;
  const { error } = await supabase.storage.from(ATTACH_BUCKET).remove(paths);
  if (error) console.warn('No se pudieron borrar las fotos de la consulta:', error.message);
}

async function abrirFormularioConsulta(pro) {
  const { data: { session } } = await supabase.auth.getSession();

  cerrarFormularioConsulta();

  // Sin sesión no se puede: la RLS exige client_id = auth.uid(). Se avisa en
  // el mismo modal en vez de patear a login de una, así no pierde de vista a
  // quién le estaba por escribir. No se manda un ?redirect= porque el login
  // del proyecto no lo soporta (resolvePostLoginRedirect, auth-utils.js) y
  // sería prometer una vuelta que no pasa.
  if (!session) {
    mostrarModalConsulta(pro, construirAvisoDeSesion());
    return;
  }

  const modal = el('div', 'ct-modal');
  const cerrar = el('button', 'ct-modal__close');
  cerrar.type = 'button';
  cerrar.setAttribute('aria-label', 'Cerrar');
  const cerrarIcon = el('i', 'fa-solid fa-xmark');
  cerrarIcon.setAttribute('aria-hidden', 'true');
  cerrar.appendChild(cerrarIcon);
  cerrar.addEventListener('click', cerrarFormularioConsulta);
  modal.appendChild(cerrar);

  modal.appendChild(el('h3', 'ct-modal__title', `Pedir presupuesto a ${pro.full_name}`));
  modal.appendChild(el('p', 'ct-modal__sub', 'Contale qué necesitás y dejale un teléfono. Le llega al panel y te contesta por su cuenta.'));

  const labelDetalle = el('label', 'ct-modal__label', '¿Qué necesitás?');
  labelDetalle.htmlFor = 'ct-inq-detalle';
  modal.appendChild(labelDetalle);
  const detalle = el('textarea', 'ct-modal__input');
  detalle.id = 'ct-inq-detalle';
  detalle.rows = 4;
  detalle.maxLength = 1000;
  detalle.placeholder = 'Ej: tengo una pérdida abajo de la pileta de la cocina.';
  modal.appendChild(detalle);

  const fotos = construirSelectorDeFotos();
  modal.appendChild(fotos.element);

  modal.appendChild(el('span', 'ct-modal__label', '¿Para cuándo?'));
  const chips = el('div', 'ct-modal__chips');
  let cuandoElegido = 'sin_apuro';
  let fechaElegida = '';

  // Selector de fecha puntual, al lado de los chips de siempre: elegirlo
  // pisa el chip activo (pasa needed_when a 'fecha'); borrarlo a mano vuelve
  // a "Sin apuro".
  const fechaChip = el('label', 'ct-modal__date-chip');
  fechaChip.title = 'Elegir un día puntual';
  const fechaIcon = el('i', 'fa-regular fa-calendar');
  fechaIcon.setAttribute('aria-hidden', 'true');
  const fechaInput = document.createElement('input');
  fechaInput.type = 'date';
  fechaInput.className = 'ct-modal__date-input';
  fechaInput.min = localIsoDate();
  fechaInput.setAttribute('aria-label', 'Elegir un día puntual');
  fechaChip.append(fechaIcon, fechaInput);

  const chipEls = new Map();

  function marcarChipActivo(valor) {
    chipEls.forEach((chip, v) => chip.classList.toggle('is-active', v === valor));
    fechaChip.classList.toggle('is-active', valor === 'fecha');
  }

  function elegirCuando(valor) {
    cuandoElegido = valor;
    fechaElegida = '';
    fechaInput.value = '';
    marcarChipActivo(valor);
  }

  CUANDO_OPCIONES.forEach((op) => {
    const chip = el('button', `ct-chip${op.valor === cuandoElegido ? ' is-active' : ''}`, op.label);
    chip.type = 'button';
    chip.addEventListener('click', () => elegirCuando(op.valor));
    chips.appendChild(chip);
    chipEls.set(op.valor, chip);
  });

  fechaInput.addEventListener('change', () => {
    if (!fechaInput.value) {
      elegirCuando('sin_apuro');
      return;
    }
    cuandoElegido = 'fecha';
    fechaElegida = fechaInput.value;
    marcarChipActivo('fecha');
  });
  chips.appendChild(fechaChip);
  modal.appendChild(chips);

  const labelTel = el('label', 'ct-modal__label', 'Tu teléfono');
  labelTel.htmlFor = 'ct-inq-tel';
  modal.appendChild(labelTel);
  const telefono = el('input', 'ct-modal__input');
  telefono.id = 'ct-inq-tel';
  telefono.type = 'tel';
  telefono.maxLength = 20;
  telefono.placeholder = 'Código de área + número';
  modal.appendChild(telefono);

  const error = el('p', 'ct-modal__error');
  error.hidden = true;
  modal.appendChild(error);

  const enviar = el('button', 'ct-btn ct-btn--quote ct-modal__submit', 'Enviar consulta');
  enviar.type = 'button';
  enviar.addEventListener('click', async () => {
    const texto = detalle.value.trim();
    const tel = telefono.value.trim();

    const mostrarError = (msg) => {
      error.textContent = msg;
      error.hidden = false;
    };

    // Los mismos límites que los CHECK de la migración 90, para avisar acá y
    // no hacer viajar un insert que Postgres va a rebotar.
    if (texto.length < 5) return mostrarError('Contale un poco más de qué se trata.');
    if (tel.replace(/[^0-9]/g, '').length < 6) return mostrarError('Dejale un teléfono para poder contestarte.');

    error.hidden = true;
    enviar.disabled = true;
    enviar.textContent = 'Enviando…';

    // Las fotos suben antes del insert (igual que support_tickets): si el
    // insert falla después, se borran para no dejar archivos huérfanos.
    const archivos = fotos.getFiles();
    let rutasFotos = [];
    if (archivos.length) {
      try {
        rutasFotos = await subirFotosConsulta(archivos, session.user.id, pro.id);
      } catch (e) {
        console.error('Error subiendo las fotos de la consulta:', e);
        enviar.disabled = false;
        enviar.textContent = 'Enviar consulta';
        mostrarError('No pudimos subir las fotos. Probá de nuevo en un rato.');
        return;
      }
    }

    const nuevaConsulta = {
      professional_id: pro.id,
      client_id: session.user.id,
      request_details: texto,
      needed_when: cuandoElegido,
      contact_phone: tel,
    };
    if (cuandoElegido === 'fecha' && fechaElegida) nuevaConsulta.needed_date = fechaElegida;
    if (rutasFotos.length) nuevaConsulta.attachments = rutasFotos;

    const { error: errInsert } = await supabase.from('professional_inquiries').insert(nuevaConsulta);

    enviar.disabled = false;
    enviar.textContent = 'Enviar consulta';

    if (errInsert) {
      console.error('Error enviando la consulta:', errInsert);
      if (rutasFotos.length) await borrarFotosConsulta(rutasFotos);
      mostrarError('No pudimos enviar tu consulta. Probá de nuevo en un rato.');
      return;
    }

    modal.replaceChildren(
      el('h3', 'ct-modal__title', '¡Listo!'),
      el('p', 'ct-modal__sub', `Tu consulta le llegó a ${pro.full_name}. Te va a contestar al teléfono que dejaste.`)
    );
    setTimeout(cerrarFormularioConsulta, 2200);
  });
  modal.appendChild(enviar);

  mostrarModalConsulta(pro, modal);
  detalle.focus();
}

/** Cuerpo alternativo del modal para quien todavía no inició sesión. */
function construirAvisoDeSesion() {
  const modal = el('div', 'ct-modal');

  const cerrar = el('button', 'ct-modal__close');
  cerrar.type = 'button';
  cerrar.setAttribute('aria-label', 'Cerrar');
  const cerrarIcon = el('i', 'fa-solid fa-xmark');
  cerrarIcon.setAttribute('aria-hidden', 'true');
  cerrar.appendChild(cerrarIcon);
  cerrar.addEventListener('click', cerrarFormularioConsulta);
  modal.appendChild(cerrar);

  modal.appendChild(el('h3', 'ct-modal__title', 'Entrá para pedir un presupuesto'));
  modal.appendChild(el('p', 'ct-modal__sub', 'Con tu cuenta el profesional sabe quién le escribe y vos podés seguir la consulta. Si preferís, podés llamarlo o escribirle por WhatsApp sin entrar.'));

  const entrar = el('a', 'ct-btn ct-btn--quote ct-modal__submit', 'Iniciar sesión');
  entrar.href = './login.html';
  modal.appendChild(entrar);

  return modal;
}

/** Monta el modal en un overlay con cierre por Escape y por click afuera. */
function mostrarModalConsulta(pro, modal) {
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', `Pedir presupuesto a ${pro.full_name}`);

  const overlay = el('div', 'ct-modal-overlay is-open');
  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) cerrarFormularioConsulta();
  });

  document.body.appendChild(overlay);
  document.addEventListener('keydown', cerrarConEscape);
  overlayConsulta = overlay;
}

function cerrarConEscape(e) {
  if (e.key === 'Escape') cerrarFormularioConsulta();
}

function cerrarFormularioConsulta() {
  overlayConsulta?.remove();
  overlayConsulta = null;
  document.removeEventListener('keydown', cerrarConEscape);
}

buildCategoryChips();
document.getElementById('ct-search-input')?.addEventListener('input', () => applyFilter());

loadProfessionals();
