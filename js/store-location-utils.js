// Ubicación del comercio (stores.lat/lng, migración 147). La carga el dueño
// en "Perfil de mi comercio" moviendo un pin en el mapa; con eso el buscador
// le dice al vecino qué comercio le queda más cerca. Sin DOM ni Supabase para
// poder correr `node js/store-location-utils.test.mjs`.
import { distanceMeters } from './price-compare-utils.js';

/** Plaza principal de Baradero: centro del mapa cuando todavía no hay pin. */
export const BARADERO_CENTER = { lat: -33.8106, lng: -59.5047 };

/** Más allá de esto se avisa (el partido entero, con Santa Coloma y Portela, entra). */
export const MAX_KM_FROM_BARADERO = 30;

export function isValidPoint(p) {
  return Boolean(p)
    && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180;
}

/** 6 decimales = ~10 cm: de sobra para una puerta, y no guarda ruido de GPS. */
export function roundPoint(p) {
  return { lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 };
}

// Ubicación que compartió la persona (mapa del inicio o "Usar mi ubicación"
// del buscador). Solo en esta pestaña: sessionStorage, nunca a la base.
const USER_LOCATION_KEY = 'bl_nearby_location';

/** {lat, lng} guardado en la pestaña, o null. */
export function loadUserLocation() {
  try {
    const loc = JSON.parse(sessionStorage.getItem(USER_LOCATION_KEY));
    return isValidPoint(loc) ? loc : null;
  } catch (_) {
    return null;
  }
}

export function saveUserLocation(lat, lng) {
  try {
    sessionStorage.setItem(USER_LOCATION_KEY, JSON.stringify({ lat, lng }));
  } catch (_) { /* sin sessionStorage: vale solo para esta vista */ }
}

/** Parámetros p_lat/p_lng de search_products (migración 159): con ubicación, rankea por cercanía. */
export function locationParams() {
  const loc = loadUserLocation();
  return loc ? { p_lat: loc.lat, p_lng: loc.lng } : {};
}

export function isNearBaradero(p, maxKm = MAX_KM_FROM_BARADERO) {
  return isValidPoint(p) && distanceMeters(BARADERO_CENTER, p) <= maxKm * 1000;
}

/**
 * Saca las coordenadas de un link largo de Google Maps, si las trae. Prioriza
 * el lugar marcado (`!3d..!4d..`) sobre el centro de la vista (`@lat,lng`),
 * que puede estar corrido. Los links cortos (maps.app.goo.gl) no traen
 * coordenadas y no se pueden abrir desde el navegador (CORS): devuelve null.
 */
export function parseCoordsFromMapsUrl(url) {
  const s = String(url || '');
  if (!s) return null;
  let decoded = s;
  try { decoded = decodeURIComponent(s); } catch (_) { /* queda el original */ }
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`[?&](?:q|query|ll|destination|daddr|center)=${num}\\s*,\\s*${num}`),
    new RegExp(`@${num},${num}`),
  ];
  for (const re of patterns) {
    const m = decoded.match(re);
    if (m) {
      const p = { lat: Number(m[1]), lng: Number(m[2]) };
      if (isValidPoint(p)) return roundPoint(p);
    }
  }
  return null;
}
