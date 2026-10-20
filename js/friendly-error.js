/**
 * Mensajes de error entendibles para la persona.
 *
 * Supabase/Postgres devuelven textos técnicos y en inglés ("duplicate key value
 * violates unique constraint ...", "new row violates row-level security policy",
 * "Edge Function returned a non-2xx status code") o códigos sueltos (42501,
 * 23505, PGRST301). Eso nunca tiene que llegar a la pantalla. Acá se decide:
 *   1. si el error trae un código conocido, se usa su explicación en español;
 *   2. si el mensaje ya es una frase en español escrita para la persona (las
 *      excepciones propias de nuestras funciones SQL y Edge Functions), se muestra;
 *   3. en cualquier otro caso, el texto de respaldo que pasó quien llama.
 * Sin imports: se puede probar con `node js/friendly-error.test.mjs`.
 */

const DEFAULT_MESSAGE = 'Algo salió mal. Probá de nuevo en un rato.';
const OFFLINE_MESSAGE = 'Error de conexión. Verificá tu conexión a internet.';

const CODE_MESSAGES = {
  '42501': 'No tenés permiso para hacer esto.',
  '23505': 'Ese dato ya existe.',
  '23503': 'No se puede completar porque hay datos relacionados.',
  '23502': 'Falta completar un dato obligatorio.',
  '23514': 'Hay un dato que no es válido. Revisalo y probá de nuevo.',
  '22P02': 'Hay un dato que no es válido. Revisalo y probá de nuevo.',
  '22001': 'Uno de los textos es demasiado largo.',
  '22003': 'Uno de los números es demasiado grande.',
  '28000': 'Tenés que iniciar sesión.',
  '28P01': 'Tenés que iniciar sesión.',
  'PGRST301': 'Tu sesión venció. Volvé a iniciar sesión.',
  'PGRST116': 'No encontramos lo que buscabas.',
  'PGRST202': 'Esta función todavía no está disponible. Probá de nuevo más tarde.',
  '42883': 'Esta función todavía no está disponible. Probá de nuevo más tarde.',
  '42P01': 'Esta sección todavía no está disponible. Probá de nuevo más tarde.',
  '40001': 'Hubo un conflicto con otro cambio. Probá de nuevo.',
  '40P01': 'Hubo un conflicto con otro cambio. Probá de nuevo.',
  '57014': 'Tardó demasiado en responder. Probá de nuevo.',
};

// Pistas de que el texto es técnico o está en inglés: nunca se muestra.
const TECHNICAL = new RegExp([
  'violates', 'constraint', 'duplicate key', 'row-level security', 'permission denied',
  'jwt', 'relation "', 'column "', 'syntax', 'pgrst', 'non-2xx', 'failed to fetch',
  'networkerror', 'load failed', 'typeerror', 'referenceerror', 'undefined', 'unexpected token',
  'invalid input', 'does not exist', 'already exists', 'could not', 'cannot ', 'unable to',
  'not found', 'not allowed', 'unauthorized', 'forbidden', 'timeout', 'timed out',
  'internal server', 'bad request', 'edge function', 'supabase', 'postgres', 'fetch',
  '\\bnull\\b', '\\bobject\\b', '\\[object',
  '\\b[a-z0-9]+_[a-z0-9_]+\\b',      // snake_case: nombres de campos y códigos (order_ids, tiene_tienda)
  '^\\s*[A-Z0-9]{5}\\s*$',          // un código de cinco caracteres suelto (42501, 23505)
  '\\b[A-Z]{2,}\\d{2,}\\b',          // PGRST301, A113...
].join('|'), 'i');

// Pistas de que es una frase en castellano rioplatense.
const SPANISH = /[áéíóúñ¿¡]|\b(el|la|los|las|un|una|de|del|en|con|sin|por|para|que|no|ya|se|tu|tus|tenés|podés|debés|elegí|ingresá|probá|pedido|producto|comercio|cuenta|cupón|combo)\b/i;

function isFetchFailure(error, text) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return /failed to fetch|networkerror|load failed|network request failed/i.test(text) || error?.name === 'TypeError' && /fetch/i.test(text);
}

/** ¿Es una frase en español pensada para que la lea una persona? */
export function isHumanMessage(text) {
  if (typeof text !== 'string') return false;
  const t = text.trim();
  if (t.length < 4 || t.length > 400) return false;
  if (TECHNICAL.test(t)) return false;
  return SPANISH.test(t);
}

/**
 * Devuelve algo que se puede mostrar en un aviso.
 * @param {unknown} error  Error de Supabase, excepción o texto suelto.
 * @param {string} [fallback]  Qué decir si no hay nada entendible.
 */
export function friendlyError(error, fallback = DEFAULT_MESSAGE) {
  const text = typeof error === 'string'
    ? error
    : String(error?.message ?? error?.error_description ?? (typeof error?.error === 'string' ? error.error : '') ?? '');
  const code = typeof error === 'object' && error ? String(error.code ?? error.status ?? '') : '';

  if (isHumanMessage(text)) return text.trim();
  if (isFetchFailure(error, text)) return OFFLINE_MESSAGE;
  if (code === '429' || /too many requests|rate limit/i.test(text)) {
    return 'Demasiados intentos. Esperá unos minutos antes de intentar de nuevo.';
  }
  if (CODE_MESSAGES[code]) return CODE_MESSAGES[code];
  return fallback;
}

/**
 * Para `supabase.functions.invoke`: ante un 4xx/5xx devuelve `data: null` y un
 * error cuyo mensaje es "Edge Function returned a non-2xx status code"; la
 * respuesta real (con el motivo en español) está en `error.context`.
 * Lee ese cuerpo y devuelve el mensaje de la función, o el respaldo.
 */
export async function friendlyFunctionError(error, data, fallback = DEFAULT_MESSAGE) {
  let body = data && typeof data === 'object' ? data : null;
  const res = error?.context;
  if (!body && res && typeof res.json === 'function') {
    try { body = await res.json(); } catch { body = null; }
  }
  for (const candidate of [body?.message, body?.error]) {
    if (isHumanMessage(candidate)) return candidate.trim();
  }
  return friendlyError(error, fallback);
}
