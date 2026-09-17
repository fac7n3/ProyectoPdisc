/**
 * Sección "Estadísticas" del panel del profesional.
 *
 * Lee `professional_metrics_daily` (migración 90), que guarda contadores por
 * día y tipo de evento. Los incrementa contratar.html vía el RPC
 * increment_professional_metric cuando alguien mira la tarjeta o toca Llamar
 * o WhatsApp.
 *
 * Son números orientativos y el panel lo dice: el RPC no tiene rate-limit ni
 * deduplica por sesión, así que quien recarga su propia tarjeta se suma
 * visitas. Para el tamaño de Baradero alcanza para ver una tendencia.
 */

import { supabase, showToast } from './auth-utils.js';

const DIAS_VENTANA = 30;

const EVENTOS = [
  { tipo: 'profile_view', label: 'Vieron tu tarjeta', icono: 'fa-solid fa-eye' },
  { tipo: 'call_click', label: 'Tocaron Llamar', icono: 'fa-solid fa-phone' },
  { tipo: 'whatsapp_click', label: 'Tocaron WhatsApp', icono: 'fa-brands fa-whatsapp' },
];

let ctx = null;

export function initMetricas(contexto) {
  ctx = contexto;
  ctx.alMostrar('metricas', cargar);
}

async function cargar() {
  const desde = new Date();
  desde.setDate(desde.getDate() - DIAS_VENTANA);

  const [metricas, consultas] = await Promise.all([
    supabase
      .from('professional_metrics_daily')
      .select('event_type, count, day')
      .eq('professional_id', ctx.prof.id)
      .gte('day', desde.toISOString().slice(0, 10)),
    supabase
      .from('professional_inquiries')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', ctx.prof.id)
      .gte('created_at', desde.toISOString()),
  ]);

  if (metricas.error) {
    console.error('Error cargando métricas:', metricas.error);
    showToast('No pudimos cargar tus estadísticas.');
    return;
  }

  render(metricas.data || [], consultas.count || 0);
}

function render(filas, cantConsultas) {
  const cont = document.getElementById('of-metrics');
  if (!cont) return;
  const { el, icono } = ctx;

  const totales = new Map(EVENTOS.map((e) => [e.tipo, 0]));
  for (const fila of filas) {
    if (totales.has(fila.event_type)) {
      totales.set(fila.event_type, totales.get(fila.event_type) + Number(fila.count || 0));
    }
  }

  const vistas = totales.get('profile_view');
  const contactos = totales.get('call_click') + totales.get('whatsapp_click');

  if (!vistas && !contactos && !cantConsultas) {
    const vacio = el('div', 'of-empty');
    vacio.appendChild(icono('fa-solid fa-chart-simple'));
    vacio.appendChild(el('p', null, 'Todavía no hay movimiento para mostrar.'));
    vacio.appendChild(el('p', 'of-sub', 'En cuanto alguien abra tu tarjeta en Contratar vas a empezar a ver los números acá.'));
    cont.replaceChildren(vacio);
    return;
  }

  const card = el('div', 'pf-card');
  card.appendChild(el('h3', 'pf-card__title', `Últimos ${DIAS_VENTANA} días`));
  card.appendChild(el('p', 'pf-card__hint', 'Cuánta gente llegó a tu publicación y cuántos quisieron contactarte.'));

  // El máximo manda el ancho de la barra más larga; si todo es cero se evita
  // dividir por cero.
  const maximo = Math.max(1, ...EVENTOS.map((e) => totales.get(e.tipo)));

  const barras = el('div', 'of-bars');
  for (const evento of EVENTOS) {
    const valor = totales.get(evento.tipo);
    const barra = el('div');

    const head = el('div', 'of-bar__head');
    const etiqueta = el('span', 'of-bar__label');
    etiqueta.appendChild(icono(evento.icono));
    etiqueta.append(` ${evento.label}`);
    head.appendChild(etiqueta);
    head.appendChild(el('span', 'of-bar__value', String(valor)));
    barra.appendChild(head);

    const track = el('div', 'of-bar__track');
    const fill = el('div', 'of-bar__fill');
    fill.style.width = `${Math.round((valor / maximo) * 100)}%`;
    track.appendChild(fill);
    barra.appendChild(track);

    barras.appendChild(barra);
  }
  card.appendChild(barras);

  // De cada 100 que miran, cuántos hacen algo. Es el número que le dice al
  // profesional si su tarjeta está convenciendo o no.
  if (vistas) {
    const tasa = Math.round((contactos / vistas) * 100);
    const resumen = el('p', 'of-sub');
    resumen.style.marginTop = '1.25rem';
    resumen.textContent = `De cada 100 personas que vieron tu tarjeta, ${tasa} te quisieron contactar.`;
    card.appendChild(resumen);
  }

  const consultasCard = el('div', 'pf-card');
  consultasCard.appendChild(el('h3', 'pf-card__title', 'Consultas recibidas'));
  consultasCard.appendChild(el('p', 'pf-card__hint', `Presupuestos que te pidieron en los últimos ${DIAS_VENTANA} días.`));
  consultasCard.appendChild(el('div', 'rs-stat__value', String(cantConsultas)));

  const nota = el('p', 'of-sub');
  nota.style.marginTop = '1rem';
  nota.textContent = 'Son números orientativos: contamos cada vez que se abre tu tarjeta, así que tus propias visitas también suman.';

  cont.replaceChildren(card, consultasCard, nota);
}
