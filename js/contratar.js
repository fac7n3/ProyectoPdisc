// Contratar: directorio de profesionales/técnicos de Baradero, cargados por
// el admin (vía la solicitud que cada uno envía desde vender.html).
//
// Anti-XSS: todo lo que viene de la base se pinta con DOM API (textContent),
// nunca con innerHTML — misma convención que js/servicios.js.

import { supabase } from './auth-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

let allProfessionals = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function buildCard(pro) {
  const card = el('div', 'ct-card');

  const head = el('div', 'ct-card__head');
  const nameBox = el('div');
  nameBox.appendChild(el('div', 'ct-card__name', pro.full_name));
  nameBox.appendChild(el('span', 'ct-card__specialty', pro.specialty));
  head.appendChild(nameBox);
  card.appendChild(head);

  if (pro.description) card.appendChild(el('p', 'ct-card__desc', pro.description));

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

  card.appendChild(actions);
  return card;
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
}

function applyFilter(query) {
  const q = query.trim().toLowerCase();
  if (!q) return render(allProfessionals);

  const filtered = allProfessionals.filter((pro) =>
    pro.full_name.toLowerCase().includes(q) ||
    pro.specialty.toLowerCase().includes(q) ||
    (pro.description || '').toLowerCase().includes(q)
  );
  render(filtered);
}

async function loadProfessionals() {
  const container = document.getElementById('ct-content');
  container.textContent = '';

  const { data, error } = await supabase
    .from('professionals')
    .select('id, full_name, specialty, description, phone, whatsapp')
    .order('specialty', { ascending: true })
    .order('full_name', { ascending: true });

  if (error) {
    console.error('Error al cargar los profesionales:', error);
    container.appendChild(buildEmpty('No pudimos cargar el directorio. Probá de nuevo en un rato.'));
    return;
  }

  allProfessionals = data || [];
  render(allProfessionals);
}

document.getElementById('ct-search-input')?.addEventListener('input', (e) => applyFilter(e.target.value));

loadProfessionals();
