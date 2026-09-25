/**
 * Sección "Servicios y precios" del panel del profesional.
 *
 * Cada servicio es una fila de `professional_services` (migración 89) con un
 * precio de referencia en pesos enteros, o "a convenir". Se muestran en la
 * tarjeta pública de contratar.html.
 */

import { supabase, showToast, setLoading } from './auth-utils.js';
import { buildDropdown } from './dropdown.js';
import { confirmDialog } from './confirm-dialog.js';
import {
  PRICE_TYPES,
  formatTarifa,
  parsePrecio,
  validarServicio,
} from './professional-service-utils.js';

let ctx = null;
let servicios = [];
/** id del servicio que se está editando, o null si el formulario está cerrado
 *  o es un alta. */
let editando = null;

export function initServicios(contexto) {
  ctx = contexto;
  document.getElementById('of-service-new')?.addEventListener('click', () => abrirFormulario(null));
  ctx.alMostrar('servicios', cargar);
}

async function cargar() {
  const { data, error } = await supabase
    .from('professional_services')
    .select('id, title, description, price_type, price_pesos, is_active, sort_order')
    .eq('professional_id', ctx.prof.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error cargando servicios:', error);
    showToast('No pudimos cargar tus servicios.');
    return;
  }

  servicios = data || [];
  render();
}

function render() {
  const lista = document.getElementById('of-services-list');
  if (!lista) return;
  const { el, icono } = ctx;

  if (!servicios.length) {
    const vacio = el('div', 'of-empty');
    vacio.appendChild(icono('fa-solid fa-screwdriver-wrench'));
    vacio.appendChild(el('p', null, 'Todavía no cargaste ningún servicio.'));
    vacio.appendChild(el('p', 'of-sub', 'Poné lo que hacés más seguido con un precio de referencia: el vecino llega sabiendo cuánto sale.'));
    lista.replaceChildren(vacio);
    return;
  }

  lista.replaceChildren(...servicios.map((s, i) => fila(s, i)));
}

function fila(servicio, indice) {
  const { el, icono } = ctx;
  const row = el('div', `of-row${servicio.is_active ? '' : ' of-row--muted'}`);

  const main = el('div', 'of-row__main');
  main.appendChild(el('div', 'of-row__title', servicio.title));
  if (servicio.description) main.appendChild(el('div', 'of-row__sub', servicio.description));
  if (!servicio.is_active) main.appendChild(el('div', 'of-row__sub', 'Oculto: no se muestra en tu tarjeta.'));
  row.appendChild(main);

  row.appendChild(el(
    'span',
    `of-price${servicio.price_type === 'quote' ? ' of-price--quote' : ''}`,
    formatTarifa(servicio)
  ));

  const acciones = el('div', 'of-row__actions');

  const subir = botonIcono('fa-solid fa-arrow-up', 'Subir', () => mover(indice, -1));
  subir.disabled = indice === 0;
  const bajar = botonIcono('fa-solid fa-arrow-down', 'Bajar', () => mover(indice, 1));
  bajar.disabled = indice === servicios.length - 1;

  const editar = botonIcono('fa-solid fa-pen', 'Editar', () => abrirFormulario(servicio));
  const ocultar = botonIcono(
    servicio.is_active ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye',
    servicio.is_active ? 'Ocultar' : 'Mostrar',
    () => alternarActivo(servicio)
  );
  const borrar = botonIcono('fa-solid fa-trash', 'Borrar', () => eliminar(servicio));
  borrar.classList.add('of-btn--danger');

  acciones.append(subir, bajar, editar, ocultar, borrar);
  row.appendChild(acciones);
  return row;
}

function botonIcono(clase, titulo, onClick) {
  const btn = ctx.el('button', 'of-btn of-btn--ghost of-btn--sm');
  btn.type = 'button';
  btn.title = titulo;
  btn.setAttribute('aria-label', titulo);
  btn.appendChild(ctx.icono(clase));
  btn.addEventListener('click', onClick);
  return btn;
}

/* ---------------- Alta y edición ---------------- */

function abrirFormulario(servicio) {
  const slot = document.getElementById('of-service-form-slot');
  if (!slot) return;
  const { el } = ctx;

  editando = servicio?.id || null;

  const card = el('div', 'pf-card');
  card.appendChild(el('h3', 'pf-card__title', servicio ? 'Editar servicio' : 'Nuevo servicio'));

  const grid = el('div', 'pf-grid');

  const campoTitulo = el('div', 'pf-field pf-field--full');
  const lblTitulo = el('label', 'form-label', 'Qué hacés');
  lblTitulo.htmlFor = 'of-service-title';
  const inputTitulo = el('input', 'form-input');
  inputTitulo.type = 'text';
  inputTitulo.id = 'of-service-title';
  inputTitulo.maxLength = 100;
  inputTitulo.placeholder = 'Ej: Destapación de cloacas';
  inputTitulo.value = servicio?.title || '';
  campoTitulo.append(lblTitulo, inputTitulo);

  const campoDesc = el('div', 'pf-field pf-field--full');
  const lblDesc = el('label', 'form-label', 'Detalle (opcional)');
  lblDesc.htmlFor = 'of-service-desc';
  const inputDesc = el('textarea', 'form-input');
  inputDesc.id = 'of-service-desc';
  inputDesc.rows = 2;
  inputDesc.placeholder = 'Qué incluye, cuánto tarda, si va material aparte...';
  inputDesc.value = servicio?.description || '';
  campoDesc.append(lblDesc, inputDesc);

  const campoTipo = el('div', 'pf-field');
  campoTipo.appendChild(el('label', 'form-label', 'Cómo mostrás el precio'));
  const dropdown = buildDropdown({
    options: PRICE_TYPES,
    value: servicio?.price_type || 'from',
    ariaLabel: 'Cómo mostrás el precio',
    onSelect: (valor) => { campoPrecio.hidden = valor === 'quote'; },
  });
  campoTipo.appendChild(dropdown.element);

  const campoPrecio = el('div', 'pf-field');
  const lblPrecio = el('label', 'form-label', 'Precio en pesos');
  lblPrecio.htmlFor = 'of-service-price';
  const inputPrecio = el('input', 'form-input');
  inputPrecio.type = 'text';
  inputPrecio.id = 'of-service-price';
  inputPrecio.inputMode = 'numeric';
  inputPrecio.placeholder = '25000';
  inputPrecio.value = servicio?.price_pesos ? String(servicio.price_pesos) : '';
  campoPrecio.append(lblPrecio, inputPrecio);
  campoPrecio.hidden = (servicio?.price_type || 'from') === 'quote';

  grid.append(campoTitulo, campoDesc, campoTipo, campoPrecio);
  card.appendChild(grid);

  const acciones = el('div', 'of-row__actions');
  acciones.style.justifyContent = 'flex-end';
  acciones.style.marginTop = '1rem';

  const cancelar = el('button', 'of-btn of-btn--ghost', 'Cancelar');
  cancelar.type = 'button';
  cancelar.addEventListener('click', cerrarFormulario);

  const guardar = el('button', 'of-btn', servicio ? 'Guardar cambios' : 'Agregar servicio');
  guardar.type = 'button';
  guardar.addEventListener('click', () => enviar({ dropdown, guardar }));

  acciones.append(cancelar, guardar);
  card.appendChild(acciones);

  slot.replaceChildren(card);
  inputTitulo.focus();
}

function cerrarFormulario() {
  document.getElementById('of-service-form-slot')?.replaceChildren();
  editando = null;
}

async function enviar({ dropdown, guardar }) {
  const tipo = dropdown.getValue();
  const datos = {
    title: document.getElementById('of-service-title').value.trim(),
    description: document.getElementById('of-service-desc').value.trim() || null,
    price_type: tipo,
    price_pesos: tipo === 'quote' ? null : parsePrecio(document.getElementById('of-service-price').value),
  };

  const problema = validarServicio(datos);
  if (problema) {
    showToast(problema);
    return;
  }

  const etiqueta = guardar.textContent;
  setLoading(guardar, true);

  let error;
  if (editando) {
    ({ error } = await supabase.from('professional_services').update(datos).eq('id', editando));
  } else {
    ({ error } = await supabase.from('professional_services').insert({
      ...datos,
      professional_id: ctx.prof.id,
      sort_order: servicios.length,
    }));
  }

  setLoading(guardar, false, etiqueta);

  if (error) {
    console.error('Error guardando el servicio:', error);
    showToast('No pudimos guardar el servicio.');
    return;
  }

  cerrarFormulario();
  await cargar();
  ctx.refrescarResumen?.();
  showToast(editando ? 'Servicio actualizado.' : 'Servicio agregado.', 'success');
}

/* ---------------- Acciones sobre una fila ---------------- */

async function alternarActivo(servicio) {
  const { error } = await supabase
    .from('professional_services')
    .update({ is_active: !servicio.is_active })
    .eq('id', servicio.id);

  if (error) {
    console.error('Error al ocultar/mostrar el servicio:', error);
    showToast('No pudimos cambiar el servicio.');
    return;
  }

  servicio.is_active = !servicio.is_active;
  render();
}

async function eliminar(servicio) {
  if (!(await confirmDialog(`¿Borramos "${servicio.title}"?`, { confirmText: 'Borrar', danger: true }))) return;

  const { error } = await supabase.from('professional_services').delete().eq('id', servicio.id);
  if (error) {
    console.error('Error borrando el servicio:', error);
    showToast('No pudimos borrar el servicio.');
    return;
  }

  if (editando === servicio.id) cerrarFormulario();
  await cargar();
  ctx.refrescarResumen?.();
  showToast('Servicio borrado.', 'success');
}

/** Sube o baja un servicio en la lista y persiste el orden nuevo. */
async function mover(indice, delta) {
  const destino = indice + delta;
  if (destino < 0 || destino >= servicios.length) return;

  const copia = [...servicios];
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  servicios = copia;
  render();

  // Se guarda el orden de toda la lista: es una sola pasada y evita que
  // queden dos servicios con el mismo sort_order.
  const updates = copia.map((s, i) =>
    supabase.from('professional_services').update({ sort_order: i }).eq('id', s.id)
  );
  const resultados = await Promise.all(updates);
  const falla = resultados.find((r) => r.error);
  if (falla) {
    console.error('Error guardando el orden:', falla.error);
    showToast('No pudimos guardar el orden nuevo.');
    cargar();
  }
}
