// Un solo menú del navbar abierto a la vez (categorías, campanita, cuenta y el
// menú de paneles del inicio).
//
// Cada botón corta la propagación de su clic (`stopPropagation`) para que el
// "clic afuera" de su propio menú no lo cierre al instante. Efecto colateral:
// el "clic afuera" de los OTROS menús tampoco se enteraba, y en celular (donde
// los menús son cajones del mismo lugar) quedaban dos abiertos, uno tapando al
// otro. Por eso cada menú avisa acá cuando se abre y los demás se cierran.

const EVENT = 'bl:navmenu-open';

/**
 * Avisar que `owner` (el contenedor del menú) se acaba de abrir.
 * @param {EventTarget} owner
 * @param {EventTarget} [bus=document]
 */
export function announceNavMenuOpen(owner, bus = document) {
  bus.dispatchEvent(new CustomEvent(EVENT, { detail: { owner } }));
}

/**
 * Cerrar este menú cuando se abre cualquier otro.
 * @param {EventTarget} owner el contenedor de este menú
 * @param {() => void} closeIfOpen cierra el menú (tiene que ser inocua si ya está cerrado)
 * @param {EventTarget} [bus=document]
 * @returns {() => void} para dejar de escuchar
 */
export function closeOnOtherNavMenuOpen(owner, closeIfOpen, bus = document) {
  const handler = (e) => { if (e.detail?.owner !== owner) closeIfOpen(); };
  bus.addEventListener(EVENT, handler);
  return () => bus.removeEventListener(EVENT, handler);
}
