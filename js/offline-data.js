// Datos que tienen que seguir viéndose sin conexión (farmacias de turno y
// números de emergencia).
//
// El service worker (public/sw.js) deja guardadas las PÁGINAS, pero los datos
// salen de Supabase y esas respuestas no se cachean. Acá se guarda la última
// copia buena de cada lista en el aparato (localStorage) y se usa cuando la red
// no contesta: sin señal, con el modo avión, o con una señal tan mala que el
// pedido queda colgado.
//
// Criterio (el mismo de js/farmacias.js): ante la duda, NO mostrar el dato como
// si fuera fresco. Quien usa esto tiene que avisar que es una copia guardada y
// de cuándo es (ver `snapshotNotice`).
//
// Todo acepta `storage`/relojes por parámetro para poder probarlo en Node
// (js/offline-data.test.mjs).

const PREFIX = 'bl_offline_';
const VERSION = 1;

function defaultStorage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    // Navegación privada o datos del sitio bloqueados: el acceso mismo puede tirar.
    return null;
  }
}

/** Guarda la copia. Devuelve false si no se pudo (sin lugar, bloqueado): nunca tira. */
export function saveSnapshot(key, data, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!storage) return false;
  try {
    storage.setItem(PREFIX + key, JSON.stringify({ v: VERSION, savedAt: now, data }));
    return true;
  } catch {
    return false;
  }
}

/** Lee la copia guardada: `{ data, savedAt }` o null si no hay, está rota o es de otra versión. */
export function readSnapshot(key, { storage = defaultStorage() } = {}) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== VERSION || !Number.isFinite(parsed.savedAt) || parsed.data == null) return null;
    return { data: parsed.data, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

/**
 * Pide los datos a la red y, si no llegan, usa la última copia guardada.
 *
 * `fetcher` devuelve `{ data, error }` (como supabase-js) o tira.
 * `onData(data, { fromSnapshot, savedAt, reason })` se llama UNA o DOS veces:
 *   - con la copia guardada (`fromSnapshot: true`) si el aparato dice que no hay
 *     conexión (`reason: 'offline'`), si la red tarda más de `slowAfterMs`
 *     (`'slow'`: con la sesión vencida y sin señal, supabase-js puede quedarse
 *     reintentando hasta 30 s) o si falla (`'error'`);
 *   - con lo fresco (`fromSnapshot: false`) cuando la red contesta bien, aunque
 *     ya se haya pintado la copia: la segunda llamada la reemplaza.
 * `onFail(error)` solo si la red falla y no hay nada guardado.
 * Cada llamada a `onData` tiene que repintar todo de cero.
 */
export async function loadWithSnapshot({
  key,
  fetcher,
  onData,
  onFail,
  slowAfterMs = 6000,
  storage = defaultStorage(),
  now = Date.now,
  isOnline = () => globalThis.navigator?.onLine !== false,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const snapshot = readSnapshot(key, { storage });
  let shown = false;
  let settled = false;

  const showSnapshot = (reason) => {
    if (!snapshot || shown) return;
    shown = true;
    onData(snapshot.data, { fromSnapshot: true, savedAt: snapshot.savedAt, reason });
  };

  if (!isOnline()) showSnapshot('offline');
  const timer = snapshot && !shown ? setTimer(() => { if (!settled) showSnapshot('slow'); }, slowAfterMs) : null;

  let result;
  try {
    result = await fetcher();
  } catch (error) {
    result = { data: null, error };
  }
  settled = true;
  if (timer != null) clearTimer(timer);

  if (!result?.error && result?.data != null) {
    saveSnapshot(key, result.data, { storage, now: now() });
    onData(result.data, { fromSnapshot: false, savedAt: null, reason: null });
    return;
  }

  if (snapshot) {
    showSnapshot('error');
    return;
  }
  onFail(result?.error || new Error('Sin datos'));
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "hoy a las 14:30" o "el 18 de noviembre" (en hora del aparato). */
export function describeSavedAt(savedAt, now = Date.now()) {
  const saved = new Date(savedAt);
  const today = new Date(now);
  const sameDay = saved.getFullYear() === today.getFullYear()
    && saved.getMonth() === today.getMonth()
    && saved.getDate() === today.getDate();
  if (sameDay) {
    const hh = String(saved.getHours()).padStart(2, '0');
    const mm = String(saved.getMinutes()).padStart(2, '0');
    return `hoy a las ${hh}:${mm}`;
  }
  return `el ${saved.getDate()} de ${MESES[saved.getMonth()]}`;
}

/**
 * Cartel para cuando se muestra una copia guardada. `what` es lo que se guardó
 * ("los turnos", "los números"), ya en plural y con artículo.
 */
export function snapshotNotice({ savedAt, reason }, what, now = Date.now()) {
  const cuando = describeSavedAt(savedAt, now);
  if (reason === 'slow') {
    return `La conexión está lenta. Mientras llegan los datos nuevos, mostramos ${what} que guardamos ${cuando} en este dispositivo.`;
  }
  return `Sin conexión. Mostramos ${what} que guardamos ${cuando} en este dispositivo: pueden haber cambiado.`;
}
