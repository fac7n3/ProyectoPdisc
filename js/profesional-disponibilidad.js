/**
 * Sección "Horarios y zona" del panel del profesional.
 *
 * Los horarios son filas de `professional_business_hours` (dos franjas por día
 * como máximo, que es el corte del mediodía típico) y las zonas filas de
 * `professional_service_areas` (migración 92). El "atiende 24 h" es una
 * columna de `professionals`.
 *
 * Guardar reemplaza todo: se borran las filas del profesional y se insertan
 * las que quedaron en pantalla. Son pocas filas y evita tener que llevar la
 * cuenta de qué cambió.
 */

import { supabase, showToast, setLoading } from './auth-utils.js';
import { DIAS, ORDEN_SEMANA, agruparPorDia, agruparDiasIguales, formatearHora } from './professional-hours-utils.js';
import { PROFESSIONAL_ZONES } from './professional-zones.js';

let ctx = null;
/** Estado en pantalla: por día, sus franjas {desde, hasta} en 'HH:MM'. */
let porDia = DIAS.map(() => []);
let zonasElegidas = new Set();
/** Lo que se está armando en "Cargar varios días de una vez". */
const rapido = { dias: new Set(), f1: null, f2: null, conSegunda: true };

/** Deja el formulario como nuevo: sin días elegidos y con el horario más común
 *  del pueblo, para poder cargar el grupo siguiente (ej. el sábado). */
function reiniciarRapido(diasElegidos = []) {
  rapido.dias = new Set(diasElegidos);
  rapido.f1 = { desde: '09:00', hasta: '13:00' };
  rapido.f2 = { desde: '16:00', hasta: '20:00' };
  rapido.conSegunda = true;
}
reiniciarRapido();

export function initDisponibilidad(contexto) {
  ctx = contexto;
  document.getElementById('of-availability-save')?.addEventListener('click', guardar);
  ctx.alMostrar('disponibilidad', cargar);
}

async function cargar() {
  const [horarios, zonas] = await Promise.all([
    supabase
      .from('professional_business_hours')
      .select('day_of_week, open_time, close_time')
      .eq('professional_id', ctx.prof.id),
    supabase
      .from('professional_service_areas')
      .select('zone_name')
      .eq('professional_id', ctx.prof.id),
  ]);

  if (horarios.error || zonas.error) {
    console.error('Error cargando disponibilidad:', horarios.error || zonas.error);
    showToast('No pudimos cargar tus horarios.');
    return;
  }

  porDia = agruparPorDia(horarios.data).map((franjas) =>
    franjas.map((f) => ({ desde: formatearHora(f.open_time), hasta: formatearHora(f.close_time) }))
  );
  zonasElegidas = new Set((zonas.data || []).map((z) => z.zone_name));

  const check24h = document.getElementById('of-24h');
  if (check24h) check24h.checked = !!ctx.prof.serves_24h;

  // Si todavía no cargó nada, arranca con lunes a viernes elegido.
  reiniciarRapido(porDia.some((f) => f.length) ? [] : [1, 2, 3, 4, 5]);
  renderRapido();
  renderHorarios();
  renderZonas();
}

/** Lista de lo que ya está cargado, una línea por grupo de días iguales (lo
 *  mismo que va a ver el vecino en la tarjeta). */
function renderHorarios() {
  const cont = document.getElementById('of-hours');
  if (!cont) return;
  const { el, icono } = ctx;

  const grupos = agruparDiasIguales(porDia.map((franjas) =>
    franjas.map((f) => ({ open_time: f.desde, close_time: f.hasta }))
  ));

  if (!grupos.length) {
    cont.replaceChildren(el('p', 'of-loaded__empty', 'Todavía no cargaste ningún horario.'));
    return;
  }

  const lista = el('ul', 'of-loaded');
  for (const grupo of grupos) {
    const item = el('li', 'of-loaded__row');
    item.appendChild(el('span', 'of-loaded__days', grupo.etiqueta));
    item.appendChild(el('span', 'of-loaded__hours', grupo.texto));

    const quitar = el('button', 'of-btn of-btn--ghost of-btn--sm');
    quitar.type = 'button';
    quitar.title = 'Quitar este horario';
    quitar.setAttribute('aria-label', `Quitar el horario de ${grupo.etiqueta}`);
    quitar.appendChild(icono('fa-solid fa-xmark'));
    quitar.addEventListener('click', () => {
      for (const dia of grupo.dias) porDia[dia] = [];
      renderHorarios();
    });
    item.appendChild(quitar);
    lista.appendChild(item);
  }
  cont.replaceChildren(lista);
}

/* ---------------- Cargar varios días de una vez ---------------- */

const ATAJOS_DIAS = [
  { texto: 'Lunes a viernes', dias: [1, 2, 3, 4, 5] },
  { texto: 'Lunes a sábado', dias: [1, 2, 3, 4, 5, 6] },
  { texto: 'Todos los días', dias: [1, 2, 3, 4, 5, 6, 0] },
];

/** Un <input type="time"> atado a una propiedad de un objeto. */
function inputHora(objeto, clave, etiqueta) {
  const input = document.createElement('input');
  input.type = 'time';
  input.value = objeto[clave];
  input.setAttribute('aria-label', etiqueta);
  input.addEventListener('change', () => { objeto[clave] = input.value; });
  return input;
}

function renderRapido() {
  const cont = document.getElementById('of-hours-quick');
  if (!cont) return;
  const { el, icono } = ctx;

  const titulo = el('div', 'of-quick__title', 'Cargar varios días de una vez');

  // Días + atajos
  const chips = el('div', 'of-chips');
  for (const valor of ORDEN_SEMANA) {
    const dia = DIAS.find((d) => d.valor === valor);
    const activo = rapido.dias.has(valor);
    const chip = el('button', `of-chip${activo ? ' is-active' : ''}`, dia.corto);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(activo));
    chip.setAttribute('aria-label', dia.nombre);
    chip.addEventListener('click', () => {
      if (rapido.dias.has(valor)) rapido.dias.delete(valor);
      else rapido.dias.add(valor);
      renderRapido();
    });
    chips.appendChild(chip);
  }

  const atajos = el('div', 'of-quick__shortcuts');
  for (const atajo of ATAJOS_DIAS) {
    const b = el('button', 'of-link', atajo.texto);
    b.type = 'button';
    b.addEventListener('click', () => {
      rapido.dias = new Set(atajo.dias);
      renderRapido();
    });
    atajos.appendChild(b);
  }

  // Franjas
  const franjas = el('div', 'of-quick__slots');
  const slot1 = el('div', 'of-slot');
  slot1.append(
    inputHora(rapido.f1, 'desde', 'Primera franja: hora de apertura'),
    el('span', null, 'a'),
    inputHora(rapido.f1, 'hasta', 'Primera franja: hora de cierre'),
  );
  franjas.appendChild(slot1);

  if (rapido.conSegunda) {
    const slot2 = el('div', 'of-slot');
    const quitar = el('button', 'of-btn of-btn--ghost of-btn--sm');
    quitar.type = 'button';
    quitar.title = 'Quitar la segunda franja';
    quitar.setAttribute('aria-label', 'Quitar la segunda franja');
    quitar.appendChild(icono('fa-solid fa-xmark'));
    quitar.addEventListener('click', () => { rapido.conSegunda = false; renderRapido(); });
    slot2.append(
      inputHora(rapido.f2, 'desde', 'Segunda franja: hora de apertura'),
      el('span', null, 'a'),
      inputHora(rapido.f2, 'hasta', 'Segunda franja: hora de cierre'),
      quitar,
    );
    franjas.appendChild(slot2);
  } else {
    const otra = el('button', 'of-btn of-btn--ghost of-btn--sm');
    otra.type = 'button';
    otra.appendChild(icono('fa-solid fa-plus'));
    otra.append(' Agregar otra franja');
    otra.addEventListener('click', () => { rapido.conSegunda = true; renderRapido(); });
    franjas.appendChild(otra);
  }

  const aplicar = el('button', 'of-btn', 'Aplicar a los días elegidos');
  aplicar.type = 'button';
  aplicar.addEventListener('click', aplicarRapido);

  cont.replaceChildren(titulo, chips, atajos, franjas, aplicar);
}

/** Copia el horario armado arriba a cada día elegido (pisa lo que tuvieran:
 *  volver a aplicar sobre los mismos días sirve para corregir un horario). */
function aplicarRapido() {
  if (!rapido.dias.size) {
    showToast('Elegí al menos un día.');
    return;
  }
  const franjas = [{ ...rapido.f1 }];
  if (rapido.conSegunda) franjas.push({ ...rapido.f2 });

  for (const f of franjas) {
    if (!f.desde || !f.hasta) {
      showToast('Completá las dos horas de cada franja.');
      return;
    }
    if (f.hasta <= f.desde) {
      showToast('El horario de cierre tiene que ser posterior al de apertura.');
      return;
    }
  }
  if (franjas.length === 2 && franjas[1].desde < franjas[0].hasta) {
    showToast('Las dos franjas se pisan.');
    return;
  }

  for (const dia of rapido.dias) {
    porDia[dia] = franjas.map((f) => ({ ...f }));
  }
  // El formulario se limpia para poder cargar el grupo siguiente (ej. el sábado).
  reiniciarRapido();
  renderRapido();
  renderHorarios();
  showToast('Horario agregado. Cuando termines, tocá "Guardar cambios".', 'success');
}

function renderZonas() {
  const cont = document.getElementById('of-zones');
  if (!cont) return;

  cont.replaceChildren(...PROFESSIONAL_ZONES.map((zona) => {
    const chip = ctx.el('button', `of-chip${zonasElegidas.has(zona) ? ' is-active' : ''}`, zona);
    chip.type = 'button';
    chip.setAttribute('aria-pressed', String(zonasElegidas.has(zona)));
    chip.addEventListener('click', () => {
      if (zonasElegidas.has(zona)) zonasElegidas.delete(zona);
      else zonasElegidas.add(zona);
      renderZonas();
    });
    return chip;
  }));
}

/** Revisa lo que hay en pantalla antes de mandarlo. Devuelve null o el
 *  mensaje de error. */
function validar() {
  for (const dia of DIAS) {
    const franjas = porDia[dia.valor];
    for (const f of franjas) {
      if (!f.desde || !f.hasta) {
        return `Completá las dos horas del ${dia.nombre.toLowerCase()}.`;
      }
      if (f.hasta <= f.desde) {
        // Las horas son 'HH:MM', así que comparar los strings alcanza.
        return `El ${dia.nombre.toLowerCase()} el horario de cierre tiene que ser posterior al de apertura.`;
      }
    }
    if (franjas.length === 2) {
      const [a, b] = [...franjas].sort((x, y) => x.desde.localeCompare(y.desde));
      if (b.desde < a.hasta) {
        return `Las dos franjas del ${dia.nombre.toLowerCase()} se pisan.`;
      }
    }
  }
  return null;
}

async function guardar() {
  const problema = validar();
  if (problema) {
    showToast(problema);
    return;
  }

  const btn = document.getElementById('of-availability-save');
  setLoading(btn, true);

  const atiende24h = !!document.getElementById('of-24h')?.checked;

  const filasHorario = DIAS.flatMap((dia) =>
    porDia[dia.valor].map((f) => ({
      professional_id: ctx.prof.id,
      day_of_week: dia.valor,
      open_time: f.desde,
      close_time: f.hasta,
    }))
  );
  const filasZona = [...zonasElegidas].map((zona) => ({
    professional_id: ctx.prof.id,
    zone_name: zona,
  }));

  // Borrar e insertar de nuevo. No es atómico (no hay RPC para esto), pero
  // son pocas filas y el peor caso es que queden los horarios viejos borrados
  // y haya que volver a guardar.
  const borrados = await Promise.all([
    supabase.from('professional_business_hours').delete().eq('professional_id', ctx.prof.id),
    supabase.from('professional_service_areas').delete().eq('professional_id', ctx.prof.id),
  ]);

  const fallaBorrado = borrados.find((r) => r.error);
  if (fallaBorrado) {
    setLoading(btn, false, 'Guardar cambios');
    console.error('Error limpiando disponibilidad:', fallaBorrado.error);
    showToast('No pudimos guardar los cambios.');
    return;
  }

  const inserciones = [];
  if (filasHorario.length) inserciones.push(supabase.from('professional_business_hours').insert(filasHorario));
  if (filasZona.length) inserciones.push(supabase.from('professional_service_areas').insert(filasZona));
  if (atiende24h !== !!ctx.prof.serves_24h) {
    inserciones.push(supabase.from('professionals').update({ serves_24h: atiende24h }).eq('id', ctx.prof.id));
  }

  const resultados = await Promise.all(inserciones);
  setLoading(btn, false, 'Guardar cambios');

  const falla = resultados.find((r) => r.error);
  if (falla) {
    console.error('Error guardando disponibilidad:', falla.error);
    showToast('No pudimos guardar todo. Revisá los horarios y probá de nuevo.');
    return;
  }

  ctx.onProfChange({ serves_24h: atiende24h });
  showToast('Horarios y zonas actualizados.', 'success');
}
