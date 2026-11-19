// Servicios: números de emergencia/utilidad de Baradero, cargados por el
// admin y agrupados por categoría (emergencias / veterinarias).
//
// Anti-XSS: todo lo que viene de la base se pinta con DOM API (textContent),
// nunca con innerHTML — misma convención que js/farmacias.js.

import { copyToClipboard } from './transfer-details.js';
import { notify } from './notice.js';
import { initNotificationsBell, initAccountMenu } from './nav-utils.js';
import { updateCartBadge } from './cart-utils.js';
import { loadWithSnapshot, snapshotNotice } from './offline-data.js';
import { SNAPSHOT_KEYS, fetchEmergencyContacts, warmOfflineEssentials } from './offline-essentials.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

const CATEGORIES = [
  {
    key: 'emergencias',
    label: 'Emergencias',
    desc: 'Policía, bomberos, hospital y ambulancia',
    icon: 'fa-solid fa-truck-medical',
    modifier: 'sv-card--emergencias',
  },
  {
    key: 'veterinarias',
    label: 'Veterinarias',
    desc: 'De turno o para urgencias',
    icon: 'fa-solid fa-paw',
    modifier: 'sv-card--veterinarias',
  },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildContact(contact) {
  const row = el('div', 'sv-contact');

  const dot = el('span', 'sv-contact__dot');
  dot.setAttribute('aria-hidden', 'true');
  row.appendChild(dot);

  const info = el('div', 'sv-contact__info');
  info.appendChild(el('span', 'sv-contact__name', contact.name));
  if (contact.notes) info.appendChild(el('span', 'sv-contact__notes', contact.notes));
  row.appendChild(info);

  // El número no llama: al tocarlo se copia al portapapeles.
  const call = el('button', 'sv-contact__call', contact.phone);
  call.type = 'button';
  call.title = 'Tocá para copiar';
  call.setAttribute('aria-label', `Copiar el número ${contact.phone} (${contact.name})`);
  call.addEventListener('click', async () => {
    const ok = await copyToClipboard(contact.phone);
    notify(ok ? `Número copiado: ${contact.phone}` : 'No se pudo copiar el número. Probá de nuevo.', ok ? 'success' : 'error');
  });
  row.appendChild(call);

  return row;
}

function buildCard(category, contacts) {
  const card = el('section', `sv-card ${category.modifier}`);

  const head = el('div', 'sv-card__head');
  const iconWrap = el('span', 'sv-card__icon');
  const icon = el('i', category.icon);
  icon.setAttribute('aria-hidden', 'true');
  iconWrap.appendChild(icon);
  head.appendChild(iconWrap);

  const titleBox = el('div');
  titleBox.appendChild(el('h2', 'sv-card__title', category.label));
  titleBox.appendChild(el('p', 'sv-card__desc', category.desc));
  head.appendChild(titleBox);
  card.appendChild(head);

  const list = el('div', 'sv-card__list');
  contacts.forEach((c) => list.appendChild(buildContact(c)));
  card.appendChild(list);

  return card;
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
  const empty = el('div', 'sv-empty');
  const icon = el('i', 'fa-regular fa-circle-question');
  icon.setAttribute('aria-hidden', 'true');
  empty.appendChild(icon);
  empty.appendChild(el('p', null, message));
  return empty;
}

/** Cartel de "copia guardada" (sin conexión o señal lenta): de cuándo son los números. */
function buildSnapshotNote(info) {
  const note = el('div', info.reason === 'slow' ? 'sv-note' : 'sv-note sv-note--stale');
  note.setAttribute('role', 'status');
  const icon = el('i', info.reason === 'slow' ? 'fa-regular fa-clock' : 'fa-solid fa-triangle-exclamation');
  icon.setAttribute('aria-hidden', 'true');
  note.appendChild(icon);
  note.appendChild(el('span', null, snapshotNotice(info, 'los números')));
  return note;
}

async function loadServicios() {
  const container = document.getElementById('sv-content');
  container.textContent = '';
  // Son números de emergencia: mientras cargan hay que decir que están
  // cargando, no dejar la página vacía como si no hubiera ninguno.
  container.appendChild(buildLoadingBlock('Cargando los números'));

  // Red primero; si no contesta (sin conexión, error o señal muy lenta) se usa
  // la última copia guardada en este aparato y se avisa de cuándo es (ver
  // js/offline-data.js). `pintar` se puede llamar dos veces: con la copia y, si
  // la red contesta tarde, de nuevo con lo fresco.
  const pintar = (data, info) => {
    container.textContent = '';
    if (info.fromSnapshot) container.appendChild(buildSnapshotNote(info));

    const contacts = Array.isArray(data) ? data : [];

    if (contacts.length === 0) {
      container.appendChild(buildEmpty('Todavía no cargamos números de servicios. Vas a encontrarlos acá pronto.'));
      return;
    }

    CATEGORIES.forEach((category) => {
      const inCategory = contacts.filter((c) => c.category === category.key);
      if (inCategory.length > 0) container.appendChild(buildCard(category, inCategory));
    });
  };

  await loadWithSnapshot({
    key: SNAPSHOT_KEYS.servicios,
    fetcher: fetchEmergencyContacts,
    onData: pintar,
    onFail: (error) => {
      console.error('Error al cargar los servicios:', error);
      container.textContent = '';
      container.appendChild(buildEmpty(navigator.onLine === false
        ? 'No hay conexión y todavía no guardamos los números en este dispositivo. Probá de nuevo cuando vuelva la señal.'
        : 'No pudimos cargar los números. Probá de nuevo en un rato.'));
    },
  });
}

initNotificationsBell(); // campanita del navbar (como en comercios/búsqueda)
initAccountMenu(); // menú de cuenta del navbar
updateCartBadge(); // número del carrito
loadServicios();
warmOfflineEssentials(); // deja guardado el resto (farmacias, páginas) para cuando no haya señal
