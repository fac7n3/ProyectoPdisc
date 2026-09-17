/**
 * Servicios y tarifas del directorio "Contratar" (tabla
 * professional_services). Lógica pura, sin DOM y sin imports, para poder
 * correrla con `node js/professional-service-utils.test.mjs` -- mismo criterio
 * que storage-utils.js / profile-fields.js.
 */

/** Las tres formas de poner precio. 'from' es el "desde $X" típico de un
 *  oficio, donde el precio final depende de lo que haya que hacer. */
export const PRICE_TYPES = [
  { value: 'fixed', label: 'Precio fijo' },
  { value: 'from', label: 'Desde' },
  { value: 'quote', label: 'A convenir' },
];

/** Formato de pesos del proyecto (enteros, sin centavos). Repetido a
 *  propósito y no importado de cart-utils.js: ese módulo importa el cliente de
 *  Supabase, y este tiene que poder correr en un test sin credenciales. */
function pesos(valor) {
  return '$' + Number(valor || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

/**
 * Cómo se muestra la tarifa de un servicio, tanto en el panel como en la
 * tarjeta pública.
 * @param {{ price_type?: string, price_pesos?: number|null }} servicio
 * @returns {string} "$25.000", "Desde $25.000" o "A convenir".
 */
export function formatTarifa(servicio) {
  const tipo = servicio?.price_type;
  if (tipo === 'quote') return 'A convenir';
  const monto = Number(servicio?.price_pesos);
  if (!Number.isFinite(monto) || monto <= 0) return 'A convenir';
  return tipo === 'from' ? `Desde ${pesos(monto)}` : pesos(monto);
}

/** Deja solo los dígitos de lo que se tipeó: la gente escribe "25.000" o
 *  "$ 25.000" y la columna es integer. */
export function parsePrecio(texto) {
  const limpio = String(texto ?? '').replace(/[^0-9]/g, '');
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isSafeInteger(n) ? n : null;
}

/**
 * Valida un servicio antes de mandarlo. Devuelve null si está bien, o el
 * mensaje a mostrar. Los límites son los mismos que los CHECK de la migración
 * 88, así que el error se ve antes de que lo rebote Postgres.
 * @param {{ title?: string, price_type?: string, price_pesos?: number|null, description?: string }} servicio
 * @returns {string|null}
 */
export function validarServicio(servicio) {
  const titulo = String(servicio?.title ?? '').trim();
  if (titulo.length < 3 || titulo.length > 100) {
    return 'El nombre del servicio tiene que tener entre 3 y 100 caracteres.';
  }

  const tipo = servicio?.price_type;
  if (!PRICE_TYPES.some((t) => t.value === tipo)) {
    return 'Elegí cómo querés mostrar el precio.';
  }

  if (tipo === 'quote') return null;

  const monto = Number(servicio?.price_pesos);
  if (!Number.isFinite(monto) || monto <= 0) {
    return 'Poné un precio mayor a cero, o elegí "A convenir".';
  }
  if (!Number.isSafeInteger(monto)) {
    return 'Ese precio es demasiado grande.';
  }

  return null;
}
