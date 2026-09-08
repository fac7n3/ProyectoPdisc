// Servicios: números de emergencia/utilidad de Baradero, cargados por el
// admin y agrupados por categoría (emergencias / veterinarias).
//
// Anti-XSS: todo lo que viene de la base se pinta con DOM API (textContent),
// nunca con innerHTML — misma convención que js/farmacias.js.

import { supabase } from './auth-utils.js';
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

  const call = el('a', 'sv-contact__call');
  call.href = `tel:${contact.phone.replace(/[^\d+]/g, '')}`;
  const icon = el('i', 'fa-solid fa-phone');
  icon.setAttribute('aria-hidden', 'true');
  call.appendChild(icon);
  call.append(document.createTextNode(contact.phone));
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

function buildEmpty(message) {
  const empty = el('div', 'sv-empty');
  const icon = el('i', 'fa-regular fa-circle-question');
  icon.setAttribute('aria-hidden', 'true');
  empty.appendChild(icon);
  empty.appendChild(el('p', null, message));
  return empty;
}

async function loadServicios() {
  const container = document.getElementById('sv-content');
  container.textContent = '';

  const { data, error } = await supabase
    .from('emergency_contacts')
    .select('id, category, name, phone, notes, display_order')
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error al cargar los servicios:', error);
    container.appendChild(buildEmpty('No pudimos cargar los números. Probá de nuevo en un rato.'));
    return;
  }

  const contacts = data || [];

  if (contacts.length === 0) {
    container.appendChild(buildEmpty('Todavía no cargamos números de servicios. Vas a encontrarlos acá pronto.'));
    return;
  }

  CATEGORIES.forEach((category) => {
    const inCategory = contacts.filter((c) => c.category === category.key);
    if (inCategory.length > 0) container.appendChild(buildCard(category, inCategory));
  });
}

loadServicios();
