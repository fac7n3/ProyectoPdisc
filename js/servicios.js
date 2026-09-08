// Servicios: números de emergencia/utilidad de Baradero, cargados por el
// admin y agrupados por categoría (emergencias / veterinarias).
//
// Anti-XSS: todo lo que viene de la base se pinta con DOM API (textContent),
// nunca con innerHTML — misma convención que js/farmacias.js.

import { supabase } from './auth-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

const CATEGORIES = [
  { key: 'emergencias', label: 'Emergencias', icon: 'fa-solid fa-truck-medical' },
  { key: 'veterinarias', label: 'Veterinarias', icon: 'fa-solid fa-paw' },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildItem(contact) {
  const item = el('div', 'sv-item');

  const body = el('div', 'sv-item__body');
  body.appendChild(el('div', 'sv-item__name', contact.name));
  if (contact.notes) body.appendChild(el('div', 'sv-item__notes', contact.notes));
  item.appendChild(body);

  const call = el('a', 'sv-item__call');
  call.href = `tel:${contact.phone.replace(/[^\d+]/g, '')}`;
  const icon = el('i', 'fa-solid fa-phone');
  icon.setAttribute('aria-hidden', 'true');
  call.appendChild(icon);
  call.append(` ${contact.phone}`);
  item.appendChild(call);

  return item;
}

function buildGroup(category, contacts) {
  const group = el('div', 'sv-group');

  const title = el('h2', 'sv-group__title');
  const icon = el('i', category.icon);
  icon.setAttribute('aria-hidden', 'true');
  title.appendChild(icon);
  title.append(category.label);
  group.appendChild(title);

  const list = el('div', 'sv-list');
  contacts.forEach((c) => list.appendChild(buildItem(c)));
  group.appendChild(list);

  return group;
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
    const empty = el('div', 'sv-empty', 'No pudimos cargar los números. Probá de nuevo en un rato.');
    container.appendChild(empty);
    return;
  }

  const contacts = data || [];

  if (contacts.length === 0) {
    const empty = el('div', 'sv-empty', 'Todavía no cargamos números de servicios. Vas a encontrarlos acá pronto.');
    container.appendChild(empty);
    return;
  }

  CATEGORIES.forEach((category) => {
    const inCategory = contacts.filter((c) => c.category === category.key);
    if (inCategory.length > 0) container.appendChild(buildGroup(category, inCategory));
  });
}

loadServicios();
