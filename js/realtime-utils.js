/**
 * realtime-utils.js — Tiempo real para todo el sitio (Supabase Realtime).
 * Baradero Local
 *
 * Hasta el 2026-10-02 el sitio no usaba Realtime: las notificaciones se
 * pedían cada 30 segundos y todo lo demás (pedidos del comercio, "Mis
 * compras", reclamos, consultas, el panel de admin, el carrito en otro
 * dispositivo) recién aparecía al recargar. Ahora cada vista se suscribe acá
 * a los cambios de las tablas que muestra y se vuelve a dibujar sola, en todos
 * los dispositivos donde la cuenta esté abierta.
 *
 * Qué tablas se pueden escuchar: las de la publicación `supabase_realtime`
 * (migración 117). Realtime respeta la RLS: a cada suscriptor le llega solo lo
 * que igual podría leer con un select. El filtro (`filter`) es para no recibir
 * de más, no una medida de seguridad.
 *
 * Tres redes de seguridad, porque un websocket se corta sin avisar (el celular
 * que se bloquea, el wifi que cambia):
 *   1. Al reconectarse el canal, se llama a `onResync`: lo que pasó mientras
 *      estaba cortado no llegó, así que la vista vuelve a pedir sus datos.
 *   2. Al volver a la pestaña después de un rato en segundo plano, lo mismo
 *      (los navegadores de celular congelan la página y el socket con ella).
 *   3. Si el canal no logra conectarse (un proxy que bloquea websockets),
 *      cada POLL_FALLBACK_MS se llama a `onResync` igual: la página queda como
 *      estaba antes de esto, con polling, en vez de dejar de actualizarse.
 */
import { supabase } from './auth-utils.js';

/** Tiempo mínimo en segundo plano para pedir todo de nuevo al volver. */
const RESYNC_AFTER_HIDDEN_MS = 15 * 1000;
/** Cada cuánto se refresca una vista si su canal no está conectado. */
const POLL_FALLBACK_MS = 30 * 1000;
/** Si el canal tardó más que esto en conectarse, pudo perderse algo en el medio. */
const SLOW_JOIN_MS = 3 * 1000;

const subscriptions = new Set();
let channelSeq = 0;
let hiddenSince = null;
let globalsReady = false;

function resyncAll() {
  subscriptions.forEach((sub) => sub.resync());
}

function setupGlobals() {
  if (globalsReady || typeof document === 'undefined') return;
  globalsReady = true;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenSince = Date.now();
      return;
    }
    const away = hiddenSince ? Date.now() - hiddenSince : 0;
    hiddenSince = null;
    if (away >= RESYNC_AFTER_HIDDEN_MS) resyncAll();
  });
  window.addEventListener('online', resyncAll);

  // Fallback: solo las que no están conectadas, y solo con la pestaña a la
  // vista (una pestaña oculta se pone al día con el visibilitychange de arriba).
  setInterval(() => {
    if (document.hidden) return;
    subscriptions.forEach((sub) => { if (!sub.connected) sub.resync(); });
  }, POLL_FALLBACK_MS);

  // Al cerrar sesión no queda nada escuchando con la sesión vieja.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') [...subscriptions].forEach((sub) => sub.unsubscribe());
  });
}

/**
 * Escucha cambios de una o más tablas.
 *
 * @param {string} name  Nombre corto de la vista (aparece en la consola).
 * @param {Array<{ table: string, event?: 'INSERT'|'UPDATE'|'DELETE'|'*', filter?: string }>} sources
 *   `filter` con la sintaxis de Realtime, ej. `user_id=eq.<uuid>` o
 *   `store_id=in.(a,b)`. Los DELETE no se pueden filtrar (limitación de
 *   Supabase): llegan todos, con `old` = solo la clave primaria.
 * @param {(change: { table: string, eventType: string, new: object, old: object }) => void} onChange
 * @param {{ onResync?: () => void }} [opts]  Qué hacer cuando pudo haberse
 *   perdido algún cambio (reconexión, vuelta a la pestaña, sin conexión).
 *   Casi siempre es la misma función que recarga la vista.
 * @returns {() => void} Para dejar de escuchar.
 */
export function subscribeToChanges(name, sources, onChange, { onResync } = {}) {
  setupGlobals();

  // Nombre único: supabase.channel() devuelve el canal existente si el tema
  // se repite, y a un canal ya suscripto no se le pueden sumar escuchas.
  const channel = supabase.channel(`bl-${name}-${++channelSeq}-${Date.now().toString(36)}`);

  sources.forEach(({ table, event = '*', filter }) => {
    const spec = { event, schema: 'public', table };
    if (filter) spec.filter = filter;
    channel.on('postgres_changes', spec, (payload) => {
      try {
        onChange({
          table: payload.table,
          eventType: payload.eventType,
          new: payload.new || {},
          old: payload.old || {},
        });
      } catch (err) {
        console.error(`[tiempo real: ${name}]`, err);
      }
    });
  });

  const startedAt = Date.now();
  let joinedOnce = false;
  let missedSomething = false;

  const sub = {
    connected: false,
    resync() {
      if (!onResync) return;
      try { onResync(); } catch (err) { console.error(`[tiempo real: ${name}]`, err); }
    },
    unsubscribe() {
      if (!subscriptions.has(sub)) return;
      subscriptions.delete(sub);
      sub.connected = false;
      supabase.removeChannel(channel);
    },
  };
  subscriptions.add(sub);

  channel.subscribe((status, err) => {
    if (!subscriptions.has(sub)) return;
    if (status === 'SUBSCRIBED') {
      sub.connected = true;
      const slowFirstJoin = !joinedOnce && Date.now() - startedAt > SLOW_JOIN_MS;
      if (missedSomething || slowFirstJoin) sub.resync();
      joinedOnce = true;
      missedSomething = false;
      return;
    }
    // CHANNEL_ERROR / TIMED_OUT / CLOSED: Realtime reintenta solo. Mientras
    // tanto, lo que cambie no llega: al volver hay que ponerse al día.
    sub.connected = false;
    missedSomething = true;
    if (status !== 'CLOSED') console.warn(`[tiempo real: ${name}] ${status}`, err?.message || '');
  });

  return sub.unsubscribe;
}

/**
 * ¿La persona está escribiendo o eligiendo algo adentro de `root`? Sirve para
 * no redibujar una lista encima de una reseña a medio escribir o un
 * comprobante elegido y todavía sin subir.
 */
export function isEditingWithin(root) {
  if (!root || typeof document === 'undefined') return false;
  const active = document.activeElement;
  if (active && active !== document.body && root.contains(active)
    && active.matches('input:not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]')) {
    return true;
  }
  return Array.from(root.querySelectorAll('input, textarea')).some((el) => {
    if (el.type === 'file') return Boolean(el.files && el.files.length);
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked !== el.defaultChecked;
    if (['button', 'submit', 'reset', 'hidden', 'search'].includes(el.type)) return false;
    return el.value !== el.defaultValue;
  });
}

/**
 * Arma una función "refrescá" que junta varios avisos seguidos en una sola
 * recarga (un pedido nuevo dispara a la vez el INSERT del pedido, el de su
 * notificación y el UPDATE del stock), nunca corre dos recargas pisándose, y
 * espera mientras `isBusy()` dé true.
 *
 * @param {() => (void|Promise<void>)} refresh
 * @param {{ delay?: number, isBusy?: () => boolean }} [opts]
 * @returns {() => void}
 */
export function createRefresher(refresh, { delay = 350, isBusy = null } = {}) {
  let timer = null;
  let running = false;
  let again = false;

  async function run() {
    timer = null;
    if (isBusy && isBusy()) {
      timer = setTimeout(run, 2000);
      return;
    }
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      await refresh();
    } catch (err) {
      console.error('Error al actualizar en tiempo real:', err);
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule();
      }
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, delay);
  }

  return schedule;
}
