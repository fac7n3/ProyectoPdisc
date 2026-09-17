/**
 * Horarios de atención del directorio "Contratar" (tabla
 * professional_business_hours). Lógica pura, sin DOM y sin imports, para poder
 * correrla con `node js/professional-hours-utils.test.mjs` -- mismo criterio
 * que storage-utils.js / profile-fields.js.
 *
 * El "abierto ahora" se calcula acá y no con una función SQL: los horarios ya
 * viajan al navegador para mostrarlos en la tarjeta, así que resolverlo del
 * lado del servidor sería escribir la misma regla dos veces.
 *
 * Se usa la hora LOCAL del dispositivo. Para un sitio de Baradero, donde todos
 * están en la misma zona horaria, es lo correcto y lo más simple; alguien que
 * mire desde otro huso vería el chip corrido, y es un precio razonable.
 */

/** 0 = domingo .. 6 = sábado, igual que Date.getDay() y que extract(dow) de
 *  Postgres -- por eso la columna guarda ese mismo número. */
export const DIAS = [
  { valor: 0, nombre: 'Domingo', corto: 'Dom' },
  { valor: 1, nombre: 'Lunes', corto: 'Lun' },
  { valor: 2, nombre: 'Martes', corto: 'Mar' },
  { valor: 3, nombre: 'Miércoles', corto: 'Mié' },
  { valor: 4, nombre: 'Jueves', corto: 'Jue' },
  { valor: 5, nombre: 'Viernes', corto: 'Vie' },
  { valor: 6, nombre: 'Sábado', corto: 'Sáb' },
];

/** 'HH:MM:SS' o 'HH:MM' -> minutos desde medianoche. null si no parsea. */
export function minutosDeHora(valor) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(valor ?? '').trim());
  if (!m) return null;
  const horas = Number(m[1]);
  const minutos = Number(m[2]);
  if (horas > 23 || minutos > 59) return null;
  return horas * 60 + minutos;
}

/** 'HH:MM:SS' -> 'HH:MM' (lo que se muestra y lo que espera un <input type="time">). */
export function formatearHora(valor) {
  const min = minutosDeHora(valor);
  if (min === null) return '';
  const hh = String(Math.floor(min / 60)).padStart(2, '0');
  const mm = String(min % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Agrupa las filas de la tabla en un array de 7 posiciones (una por día),
 * cada una con sus franjas ordenadas por hora de apertura.
 * @param {{day_of_week: number, open_time: string, close_time: string}[]} filas
 * @returns {{open_time: string, close_time: string}[][]}
 */
export function agruparPorDia(filas) {
  const porDia = DIAS.map(() => []);
  for (const fila of filas || []) {
    const dia = Number(fila?.day_of_week);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) continue;
    if (minutosDeHora(fila.open_time) === null) continue;
    if (minutosDeHora(fila.close_time) === null) continue;
    porDia[dia].push({ open_time: fila.open_time, close_time: fila.close_time });
  }
  for (const franjas of porDia) {
    franjas.sort((a, b) => minutosDeHora(a.open_time) - minutosDeHora(b.open_time));
  }
  return porDia;
}

/**
 * Texto de las franjas de un día: "9:00 a 13:00 y 16:00 a 20:00".
 * @param {{open_time: string, close_time: string}[]} franjas
 * @returns {string} '' si ese día no atiende.
 */
export function formatearFranjas(franjas) {
  if (!franjas?.length) return '';
  return franjas
    .map((f) => `${formatearHora(f.open_time)} a ${formatearHora(f.close_time)}`)
    .join(' y ');
}

/**
 * ¿Está atendiendo en este momento?
 *
 * Quien atiende urgencias 24 h siempre cuenta como abierto: es justamente lo
 * que quiere mostrar un cerrajero o un gasista.
 *
 * @param {{ horarios?: object[], serves24h?: boolean }} datos
 * @param {Date} [ahora] inyectable para poder testear sin esperar a las 9 am.
 * @returns {boolean}
 */
export function estaAbiertoAhora({ horarios = [], serves24h = false } = {}, ahora = new Date()) {
  if (serves24h) return true;

  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
  const hoy = ahora.getDay();

  return (horarios || []).some((franja) => {
    if (Number(franja?.day_of_week) !== hoy) return false;
    const desde = minutosDeHora(franja.open_time);
    const hasta = minutosDeHora(franja.close_time);
    if (desde === null || hasta === null) return false;
    // El CHECK de la migración 91 garantiza close_time > open_time, así que
    // no hay franjas que crucen la medianoche que haya que partir en dos.
    return minutosAhora >= desde && minutosAhora < hasta;
  });
}

/**
 * Resumen corto para la tarjeta pública: "Abierto ahora", "Cierra a las
 * 20:00", "Abre el lunes" o '' si no cargó horarios.
 * @param {{ horarios?: object[], serves24h?: boolean }} datos
 * @param {Date} [ahora]
 * @returns {string}
 */
export function resumenDisponibilidad({ horarios = [], serves24h = false } = {}, ahora = new Date()) {
  if (serves24h) return 'Atiende urgencias 24 h';
  if (!horarios?.length) return '';
  if (estaAbiertoAhora({ horarios, serves24h }, ahora)) return 'Abierto ahora';

  const porDia = agruparPorDia(horarios);
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

  // Lo que queda por abrir hoy, y si no, el próximo día con horario. El
  // salto llega hasta 7 y no hasta 6 para cubrir a quien atiende un solo día
  // de la semana: si hoy es ese día y ya cerró, el próximo turno recién es el
  // mismo día de la semana que viene.
  for (let salto = 0; salto <= 7; salto++) {
    const dia = (ahora.getDay() + salto) % 7;
    const proxima = porDia[dia].find(
      (f) => salto > 0 || minutosDeHora(f.open_time) > minutosAhora
    );
    if (!proxima) continue;
    const hora = formatearHora(proxima.open_time);
    if (salto === 0) return `Abre a las ${hora}`;
    if (salto === 1) return `Abre mañana a las ${hora}`;
    return `Abre el ${DIAS[dia].nombre.toLowerCase()} a las ${hora}`;
  }

  return 'Cerrado';
}
