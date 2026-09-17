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
import { DIAS, agruparPorDia, formatearHora } from './professional-hours-utils.js';
import { PROFESSIONAL_ZONES } from './professional-zones.js';

const MAX_FRANJAS_POR_DIA = 2;

let ctx = null;
/** Estado en pantalla: por día, sus franjas {desde, hasta} en 'HH:MM'. */
let porDia = DIAS.map(() => []);
let zonasElegidas = new Set();

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

  renderHorarios();
  renderZonas();
}

function renderHorarios() {
  const cont = document.getElementById('of-hours');
  if (!cont) return;
  const { el, icono } = ctx;

  cont.replaceChildren(...DIAS.map((dia) => {
    const fila = el('div', 'of-day');
    fila.appendChild(el('div', 'of-day__name', dia.nombre));

    const slots = el('div', 'of-day__slots');
    const franjas = porDia[dia.valor];

    if (!franjas.length) {
      slots.appendChild(el('span', 'of-day__closed', 'No atiendo este día'));
    } else {
      franjas.forEach((franja, i) => {
        const slot = el('div', 'of-slot');

        const desde = document.createElement('input');
        desde.type = 'time';
        desde.value = franja.desde;
        desde.setAttribute('aria-label', `${dia.nombre}: hora de apertura`);
        desde.addEventListener('change', () => { franja.desde = desde.value; });

        const hasta = document.createElement('input');
        hasta.type = 'time';
        hasta.value = franja.hasta;
        hasta.setAttribute('aria-label', `${dia.nombre}: hora de cierre`);
        hasta.addEventListener('change', () => { franja.hasta = hasta.value; });

        const quitar = el('button', 'of-btn of-btn--ghost of-btn--sm');
        quitar.type = 'button';
        quitar.title = 'Quitar esta franja';
        quitar.setAttribute('aria-label', `Quitar franja de ${dia.nombre}`);
        quitar.appendChild(icono('fa-solid fa-xmark'));
        quitar.addEventListener('click', () => {
          franjas.splice(i, 1);
          renderHorarios();
        });

        slot.append(desde, el('span', null, 'a'), hasta, quitar);
        slots.appendChild(slot);
      });
    }

    if (franjas.length < MAX_FRANJAS_POR_DIA) {
      const agregar = el('button', 'of-btn of-btn--ghost of-btn--sm');
      agregar.type = 'button';
      agregar.appendChild(icono('fa-solid fa-plus'));
      agregar.append(franjas.length ? ' Agregar otra franja' : ' Agregar horario');
      agregar.addEventListener('click', () => {
        // Arranca con el horario más común del pueblo, para que en la mayoría
        // de los casos alcance con tocar "Guardar".
        franjas.push(franjas.length ? { desde: '16:00', hasta: '20:00' } : { desde: '09:00', hasta: '13:00' });
        renderHorarios();
      });
      slots.appendChild(agregar);
    }

    fila.appendChild(slots);
    return fila;
  }));
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
