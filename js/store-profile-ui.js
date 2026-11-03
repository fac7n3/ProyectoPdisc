// Interfaz de "Perfil de mi comercio" (vender.html). No guarda ni lee datos
// para la base: los campos y los radios name="store-category" son los de
// siempre (vender.js los lee igual); esto solo decide qué se ve.
//
//  - PC (>= 960 px): pestañas arriba, una tarjeta por vez.
//  - Celular: una lista de secciones con un resumen de cada una; al tocar una
//    se abre solo esa, con "Volver". Mismo atributo form[data-tab] que las
//    pestañas; #store-profile-section[data-view="menu"|"section"] decide cuál
//    de las dos pantallas se ve (en PC data-view no hace nada).
//  - Categoría: un campo que muestra la elegida; la grilla se abre al tocarlo.

const WIDE = '(min-width: 960px)';
const $ = (id) => document.getElementById(id);

// ---------- categoría ----------

/** Nombre y clase de ícono de la categoría marcada, o null. */
function checkedCategory() {
  const radio = document.querySelector('input[name="store-category"]:checked');
  if (!radio) return null;
  const opt = radio.closest('.catpick__opt');
  return {
    name: opt?.querySelector('.catpick__name')?.textContent || radio.value,
    iconClass: opt?.querySelector('.catpick__icon')?.className || '',
  };
}

/** Muestra en el campo la categoría marcada (llamar tras marcarla por código). */
export function syncStoreCategoryTrigger() {
  const value = $('store-category-value');
  const field = $('store-category-field');
  if (!value || !field) return;
  const cat = checkedCategory();
  value.textContent = '';
  if (cat) {
    if (cat.iconClass) {
      const icon = document.createElement('i');
      icon.className = cat.iconClass.replace('catpick__icon', 'catfield__icon');
      icon.setAttribute('aria-hidden', 'true');
      value.appendChild(icon);
    }
    value.append(cat.name);
  } else {
    value.append('Elegí una categoría');
  }
  value.classList.toggle('is-empty', !cat);
  field.classList.toggle('has-value', Boolean(cat));
}

// ---------- resumen de cada sección (lista del celular) ----------

const SOCIAL_IDS = ['instagram', 'facebook', 'tiktok', 'x', 'youtube', 'website'];
const val = (id) => $(id)?.value.trim() || '';

function summaries() {
  const cat = checkedCategory();
  const name = val('store-name');
  const nets = SOCIAL_IDS.filter((k) => val(`store-social-${k}`)).length;
  const hasTransfer = Boolean(val('store-transfer-alias') || val('store-transfer-cbu'));
  const mp = $('store-mp-toggle')?.checked;
  return {
    datos: { text: [name || 'Sin nombre', cat?.name].filter(Boolean).join(' · '), warn: !name || !cat },
    contacto: { text: [val('store-address') || 'Falta la dirección', val('store-zone')].filter(Boolean).join(' · '), warn: !val('store-address') },
    redes: { text: nets ? `${nets} ${nets === 1 ? 'red cargada' : 'redes cargadas'}` : 'Ninguna cargada', warn: false },
    cobros: {
      text: hasTransfer ? `Transferencia${val('store-transfer-alias') ? ` · ${val('store-transfer-alias')}` : ''}${mp ? ' · Mercado Pago' : ''}` : 'Falta cargar tu alias o CBU',
      warn: !hasTransfer,
    },
  };
}

/** Repinta el resumen de cada fila de la lista. Barato: se llama en cada cambio. */
export function refreshProfileSummaries() {
  const s = summaries();
  document.querySelectorAll('[data-pf-summary]').forEach((el) => {
    const item = s[el.dataset.pfSummary];
    if (!item) return;
    el.textContent = item.text;
    el.classList.toggle('is-warn', item.warn);
  });
}

// ---------- pestañas / lista ----------

function openSection(form, name) {
  const section = $('store-profile-section');
  form.dataset.tab = name;
  if (section) section.dataset.view = 'section';
  document.querySelectorAll('#store-profile-tabs [data-pf-tab]').forEach((btn) => {
    const on = btn.dataset.pfTab === name;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  if (!window.matchMedia(WIDE).matches) section?.scrollIntoView({ block: 'start' });
}

function openMenu() {
  const section = $('store-profile-section');
  if (section) section.dataset.view = 'menu';
  refreshProfileSummaries();
  section?.scrollIntoView({ block: 'start' });
}

/** Lleva a la sección donde está un campo (si hace falta) y lo devuelve. */
export function revealProfileField(id) {
  const form = $('store-profile-form');
  const el = $(id);
  const card = el?.closest('.pf-card[data-tab]');
  if (form && card) openSection(form, card.dataset.tab);
  return el;
}

/** @param {HTMLFormElement} form  #store-profile-form */
export function initStoreProfileUi(form) {
  $('store-profile-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pf-tab]');
    if (btn) openSection(form, btn.dataset.pfTab);
  });
  $('store-profile-menu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-pf-tab]');
    if (btn) openSection(form, btn.dataset.pfTab);
  });
  $('store-profile-back')?.addEventListener('click', openMenu);

  // ---- categoría desplegable ----
  const field = $('store-category-field');
  const trigger = $('store-category-trigger');
  const panel = $('store-category-panel');

  function setOpen(open) {
    if (!panel || !trigger) return;
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    field?.classList.toggle('is-open', open);
    if (open) {
      (panel.querySelector('.catpick__input:checked') || panel.querySelector('.catpick__input'))?.focus({ preventScroll: true });
    }
  }
  trigger?.addEventListener('click', () => setOpen(panel.hidden));
  // Al elegir una, se cierra solo y el campo muestra la elegida.
  panel?.addEventListener('change', () => { syncStoreCategoryTrigger(); setOpen(false); trigger.focus(); });
  document.addEventListener('click', (e) => {
    if (panel && !panel.hidden && !field.contains(e.target)) setOpen(false);
  });
  field?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && !panel.hidden) { e.stopPropagation(); setOpen(false); trigger.focus(); }
  });

  // Un campo obligatorio vacío en una sección o desplegable cerrados no se
  // puede enfocar y el navegador se queda callado: se abre lo que lo esconde.
  form.addEventListener('invalid', (e) => {
    const el = e.target;
    const card = el.closest('.pf-card[data-tab]');
    if (card) openSection(form, card.dataset.tab);
    if (panel && panel.contains(el) && panel.hidden) setOpen(true);
  }, true);

  form.addEventListener('input', refreshProfileSummaries);
  form.addEventListener('change', refreshProfileSummaries);
  syncStoreCategoryTrigger();
  refreshProfileSummaries();
}
