// Contratar: directorio de profesionales/técnicos de Baradero, cargados por
// el admin (vía la solicitud que cada uno envía desde vender.html).
//
// Anti-XSS: todo lo que viene de la base se pinta con DOM API (textContent),
// nunca con innerHTML — misma convención que js/servicios.js.

import { supabase } from './auth-utils.js';
import { PROFESSIONAL_CATEGORIES, categoryLabel, categoryIcon } from './professional-categories.js';
import { renderReviewsSection, buildStarsText } from './reviews-utils.js';
import { getVisibleSocialLinks } from './store-contact-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

let allProfessionals = [];
let activeCategory = 'todos';
let currentUserId = null;
// Evita volver a pedir las reseñas si se cierra y reabre la misma tarjeta.
const loadedReviewSections = new Set();

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

  loadedReviewSections.add(pro.id);
  const reviewsBox = detail.querySelector('.ct-card__reviews');
  await renderReviewsSection(reviewsBox, 'professional', pro.id, { hideForm: currentUserId === pro.owner_id });
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
    const wspIcon = el('i', 'fa-brands fa-whatsapp');
    wspIcon.setAttribute('aria-hidden', 'true');
    wsp.appendChild(wspIcon);
    wsp.append(' WhatsApp');
    actions.appendChild(wsp);
  }
  detail.appendChild(actions);

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

  const { data: { session } } = await supabase.auth.getSession();
  currentUserId = session?.user?.id || null;

  const { data, error } = await supabase
    .from('professionals')
    .select(`id, owner_id, full_name, category, specialty, description, phone, whatsapp, photo_url,
      social_instagram, social_instagram_show, social_facebook, social_facebook_show,
      social_tiktok, social_tiktok_show, social_x, social_x_show,
      social_youtube, social_youtube_show, social_website, social_website_show`)
    .order('full_name', { ascending: true });

  if (error) {
    console.error('Error al cargar los profesionales:', error);
    container.appendChild(buildEmpty('No pudimos cargar el directorio. Probá de nuevo en un rato.'));
    return;
  }

  const professionals = data || [];

  if (professionals.length === 0) {
    allProfessionals = [];
    render([]);
    return;
  }

  // Reseñas y fotos promocionales: una sola consulta de cada una para toda
  // la lista (no una por tarjeta). Las reseñas se agregan en promedio/cantidad
  // -- "mientras más estrellas, mejor" ordena la lista -- las fotos se
  // agrupan por profesional para pintarlas en su tarjeta al desplegarla.
  const [{ data: reviewRows }, { data: promoRows }] = await Promise.all([
    supabase
      .from('reviews')
      .select('target_id, rating')
      .eq('target_type', 'professional')
      .eq('is_hidden', false)
      .in('target_id', professionals.map((p) => p.id)),
    supabase
      .from('professional_promos')
      .select('id, professional_id, image_url')
      .in('professional_id', professionals.map((p) => p.id))
      .order('created_at', { ascending: true }),
  ]);

  const promosByPro = new Map();
  (promoRows || []).forEach((promo) => {
    const list = promosByPro.get(promo.professional_id) || [];
    list.push(promo);
    promosByPro.set(promo.professional_id, list);
  });
  professionals.forEach((pro) => { pro._promos = promosByPro.get(pro.id) || []; });

  const reviewsByPro = new Map();
  (reviewRows || []).forEach((r) => {
    const entry = reviewsByPro.get(r.target_id) || { sum: 0, count: 0 };
    entry.sum += r.rating;
    entry.count += 1;
    reviewsByPro.set(r.target_id, entry);
  });

  professionals.forEach((pro) => {
    const stats = reviewsByPro.get(pro.id);
    pro._ratingAvg = stats ? stats.sum / stats.count : 0;
    pro._ratingCount = stats ? stats.count : 0;
  });

  professionals.sort((a, b) => {
    if (b._ratingCount === 0 && a._ratingCount === 0) return a.full_name.localeCompare(b.full_name, 'es');
    if (b._ratingCount === 0) return -1;
    if (a._ratingCount === 0) return 1;
    if (b._ratingAvg !== a._ratingAvg) return b._ratingAvg - a._ratingAvg;
    return a.full_name.localeCompare(b.full_name, 'es');
  });

  allProfessionals = professionals;
  applyFilter();
}

buildCategoryChips();
document.getElementById('ct-search-input')?.addEventListener('input', () => applyFilter());

loadProfessionals();
