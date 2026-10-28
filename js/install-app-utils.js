/**
 * install-app-utils.js — Qué muestra la tarjeta "¿Instalar la app?" de
 * Mi perfil → Ajustes (la arma install-app.js).
 *
 * Sin DOM ni navegador, para poder correr `node js/install-app-utils.test.mjs`.
 */

/**
 * Sistema del celular según el navegador. iPadOS se presenta como una Mac
 * ("MacIntel"), así que se lo reconoce por la pantalla táctil.
 * @param {{ userAgent?: string, platform?: string, maxTouchPoints?: number }} nav
 * @returns {'ios'|'android'|null} null = computadora u otro dispositivo.
 */
export function detectMobilePlatform({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  if (platform === 'MacIntel' && maxTouchPoints > 1) return 'ios';
  return null;
}

/**
 * Estado de la tarjeta:
 * - hidden: computadora, o el sitio ya está abierto como app instalada.
 * - installed: la app ya está en este celular, pero se entró desde el navegador.
 * - prompt: el navegador ofrece instalarla con un botón (Chrome en Android).
 * - ios-steps / android-steps: hay que hacerlo desde el menú del navegador.
 * @param {{ platform: 'ios'|'android'|null, standalone: boolean, installed: boolean, canPrompt: boolean }} s
 */
export function installCardState({ platform, standalone, installed, canPrompt }) {
  if (!platform || standalone) return 'hidden';
  if (installed) return 'installed';
  if (canPrompt) return 'prompt';
  return platform === 'ios' ? 'ios-steps' : 'android-steps';
}
