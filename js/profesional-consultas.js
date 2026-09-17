/**
 * Sección "Consultas" del panel del profesional: las solicitudes de
 * presupuesto que dejan los vecinos desde la tarjeta de contratar.html
 * (tabla `professional_inquiries`, migración 89).
 *
 * El profesional solo puede mover el estado. El contenido de la consulta lo
 * protege un trigger en la base, no la UI.
 */

import { supabase, showToast } from './auth-utils.js';

/** Los mismos tres valores que el CHECK de la migración 89. */
const ESTADOS = [
  { valor: 'new', label: 'Sin responder', tag: 'new' },
  { valor: 'answered', label: 'Respondidas', tag: 'answered' },
  { valor: 'closed', label: 'Cerradas', tag: 'closed' },
];

const CUANDO = {
  hoy: 'Lo necesita hoy',
  esta_semana: 'Lo necesita esta semana',
  sin_apuro: 'Sin apuro',
};

let ctx = null;
let consultas = [];
let filtro = 'todas';

export function initConsultas(contexto) {
  ctx = contexto;
  ctx.alMostrar('consultas', cargar);
}

async function cargar() {
  const { data, error } = await supabase
    .from('professional_inquiries')
    .select('id, request_details, needed_when, contact_phone, status, created_at')
    .eq('professional_id', ctx.prof.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando consultas:', error);
    showToast('No pudimos cargar tus consultas.');
    return;
  }

  consultas = data || [];
  renderFiltros();
  render();
}

function renderFiltros() {
  const cont = document.getElementById('of-inquiry-filters');
  if (!cont) return;

  const opciones = [
    { valor: 'todas', label: 'Todas' },
    ...ESTADOS.map(({ valor, label }) => ({ valor, label })),
  ];

  cont.replaceChildren(...opciones.map(({ valor, label }) => {
    const cantidad = valor === 'todas'
      ? consultas.length
      : consultas.filter((c) => c.status === valor).length;

    const chip = ctx.el('button', `of-chip${filtro === valor ? ' is-active' : ''}`, `${label} (${cantidad})`);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(filtro === valor));
    chip.addEventListener('click', () => {
      filtro = valor;
      renderFiltros();
      render();
    });
    return chip;
  }));
}

function render() {
  const lista = document.getElementById('of-inquiries-list');
  if (!lista) return;
  const { el, icono } = ctx;

  const visibles = filtro === 'todas' ? consultas : consultas.filter((c) => c.status === filtro);

  if (!visibles.length) {
    const vacio = el('div', 'of-empty');
    vacio.appendChild(icono('fa-solid fa-envelope-open'));
    vacio.appendChild(el('p', null, consultas.length ? 'No hay consultas en este estado.' : 'Todavía no te dejaron ninguna consulta.'));
    if (!consultas.length) {
      vacio.appendChild(el('p', 'of-sub', 'Cuando alguien te pida un presupuesto desde tu tarjeta, te va a aparecer acá y te avisamos por notificación.'));
    }
    lista.replaceChildren(vacio);
    return;
  }

  lista.replaceChildren(...visibles.map(tarjeta));
}

function tarjeta(consulta) {
  const { el, icono } = ctx;
  const card = el('div', `of-inquiry${consulta.status === 'new' ? ' of-inquiry--new' : ''}`);

  const head = el('div', 'of-inquiry__head');
  const estado = ESTADOS.find((e) => e.valor === consulta.status) || ESTADOS[0];
  head.appendChild(el('span', `of-tag of-tag--${estado.tag}`, estado.label));
  head.appendChild(el('span', 'of-inquiry__when', fechaRelativa(consulta.created_at)));
  card.appendChild(head);

  card.appendChild(el('p', 'of-inquiry__text', consulta.request_details));

  const meta = el('div', 'of-inquiry__meta');
  const tel = el('span');
  tel.appendChild(icono('fa-solid fa-phone'));
  tel.append(` ${consulta.contact_phone}`);
  meta.appendChild(tel);
  if (consulta.needed_when && CUANDO[consulta.needed_when]) {
    const cuando = el('span');
    cuando.appendChild(icono('fa-regular fa-clock'));
    cuando.append(` ${CUANDO[consulta.needed_when]}`);
    meta.appendChild(cuando);
  }
  card.appendChild(meta);

  const acciones = el('div', 'of-inquiry__actions');

  const digitos = String(consulta.contact_phone || '').replace(/[^0-9]/g, '');
  if (digitos) {
    const llamar = el('a', 'of-btn of-btn--ghost of-btn--sm');
    llamar.href = `tel:${digitos}`;
    llamar.appendChild(icono('fa-solid fa-phone'));
    llamar.append(' Llamar');
    acciones.appendChild(llamar);

    const wa = el('a', 'of-btn of-btn--ghost of-btn--sm');
    wa.href = `https://wa.me/${digitos}?text=${encodeURIComponent('Hola! Te escribo por la consulta que dejaste en Baradero Local.')}`;
    wa.target = '_blank';
    wa.rel = 'noopener';
    wa.appendChild(icono('fa-brands fa-whatsapp'));
    wa.append(' WhatsApp');
    acciones.appendChild(wa);
  }

  if (consulta.status === 'new') {
    acciones.appendChild(botonEstado(consulta, 'answered', 'Marcar como respondida'));
  }
  if (consulta.status !== 'closed') {
    acciones.appendChild(botonEstado(consulta, 'closed', 'Cerrar'));
  } else {
    acciones.appendChild(botonEstado(consulta, 'new', 'Reabrir'));
  }

  card.appendChild(acciones);
  return card;
}

function botonEstado(consulta, nuevoEstado, etiqueta) {
  const btn = ctx.el('button', 'of-btn of-btn--sm', etiqueta);
  btn.type = 'button';
  if (nuevoEstado === 'closed') btn.classList.add('of-btn--ghost');
  btn.addEventListener('click', () => cambiarEstado(consulta, nuevoEstado, btn));
  return btn;
}

async function cambiarEstado(consulta, nuevoEstado, btn) {
  btn.disabled = true;
  const { error } = await supabase
    .from('professional_inquiries')
    .update({ status: nuevoEstado })
    .eq('id', consulta.id);
  btn.disabled = false;

  if (error) {
    console.error('Error cambiando el estado de la consulta:', error);
    showToast('No pudimos actualizar la consulta.');
    return;
  }

  consulta.status = nuevoEstado;
  renderFiltros();
  render();
  ctx.refrescarResumen?.();
}

/** "hace 5 minutos" / "ayer" / la fecha, para no mostrar un ISO crudo. */
function fechaRelativa(iso) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';

  const minutos = Math.floor((Date.now() - fecha.getTime()) / 60000);
  if (minutos < 1) return 'Recién';
  if (minutos < 60) return `Hace ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;

  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;

  return fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });
}
