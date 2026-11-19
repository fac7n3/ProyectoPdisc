// Lo esencial que tiene que andar sin conexión: farmacias de turno y números de
// emergencia ("Servicios").
//
// Dos partes (el porqué, en js/offline-data.js y public/sw.js):
//  - las consultas a Supabase de esas dos páginas viven acá, así las usan la
//    página y el "precalentado" por igual (una sola consulta, no dos que se
//    puedan desacomodar);
//  - `warmOfflineEssentials()` deja todo listo ANTES de que haga falta: le pide
//    al service worker que guarde las páginas y baja y guarda los datos, aunque
//    la persona nunca haya abierto esas pantallas. Se llama desde el inicio y
//    desde las dos páginas.

import { supabase } from './auth-utils.js';
import { localIsoDate } from './cart-utils.js';
import { readSnapshot, saveSnapshot } from './offline-data.js';

/** Claves de la copia guardada de cada lista (ver offline-data.js). */
export const SNAPSHOT_KEYS = {
  farmacias: 'farmacias-v1',
  servicios: 'servicios-v1',
};

// Una copia más nueva que esto no se vuelve a bajar al precalentar.
const WARM_EVERY_MS = 6 * 60 * 60 * 1000;
const WARM_FLAG = 'bl_offline_warm_at';

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Turnos de farmacia desde AYER (a la madrugada el turno vigente es el del día
 * anterior) hasta 8 días adelante. Devuelve `{ data, error }` de supabase-js.
 */
export function fetchPharmacyShifts() {
  const hoy = new Date();
  return supabase
    .from('pharmacy_shifts')
    .select('id, shift_date, opens_at, closes_at, updated_at, created_at, pharmacies ( id, name, address, phone, whatsapp, pharmacist, insurances, maps_url )')
    .gte('shift_date', localIsoDate(addDays(hoy, -1)))
    .lte('shift_date', localIsoDate(addDays(hoy, 8)))
    .order('shift_date', { ascending: true });
}

/** Números de emergencia/utilidad activos, en el orden que cargó el admin. */
export function fetchEmergencyContacts() {
  return supabase
    .from('emergency_contacts')
    .select('id, category, name, phone, notes, display_order')
    // La policy pública ya filtra por is_active, pero la del admin
    // (`emergency_contacts_all_admin`, cmd ALL) no: sin esto una cuenta admin
    // ve en la página pública los contactos dados de baja.
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true });
}

function readFlag() {
  try {
    return Number(localStorage.getItem(WARM_FLAG)) || 0;
  } catch {
    return 0;
  }
}

function writeFlag(ms) {
  try {
    localStorage.setItem(WARM_FLAG, String(ms));
  } catch {
    /* sin almacenamiento: se vuelve a intentar en la próxima página, no pasa nada */
  }
}

/** Baja y guarda una lista si no hay copia o ya es vieja. Nunca tira. */
async function refreshSnapshot(key, fetcher, now) {
  const current = readSnapshot(key);
  if (current && now - current.savedAt < WARM_EVERY_MS) return;
  try {
    const { data, error } = await fetcher();
    if (!error && data != null) saveSnapshot(key, data, { now });
  } catch {
    /* sin red: queda la copia que había */
  }
}

async function warmNow() {
  if (globalThis.navigator?.onLine === false) return;
  // "Ahorro de datos" prendido: esto no es lo que pidió la persona, no se baja solo.
  if (navigator.connection?.saveData) return;

  const now = Date.now();
  if (now - readFlag() < WARM_EVERY_MS) return;
  writeFlag(now);

  // Las páginas y sus archivos: los guarda el service worker (no existe en `vite dev`).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => registration.active?.postMessage({ type: 'bl-precache' }))
      .catch(() => {});
  }

  await Promise.all([
    refreshSnapshot(SNAPSHOT_KEYS.farmacias, fetchPharmacyShifts, now),
    refreshSnapshot(SNAPSHOT_KEYS.servicios, fetchEmergencyContacts, now),
  ]);
}

/**
 * Deja guardado lo esencial para cuando no haya señal. Se espera a que la página
 * termine de cargar y haya un respiro, para no competir con lo que la persona
 * vino a ver. Como mucho una vez cada 6 horas por aparato.
 */
export function warmOfflineEssentials() {
  const run = () => {
    const idle = globalThis.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
    idle(() => { warmNow().catch(() => {}); });
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
}
