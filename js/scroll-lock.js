/**
 * scroll-lock.js — traba el scroll de la página mientras hay un cuadro central abierto.
 *
 * Se traba SOLO el <html>, nunca el <body>: a11y.css le pone `overflow-x: clip` al body
 * justamente para que no sea un contenedor de scroll, y un `overflow: hidden` ahí lo
 * convierte en uno: el navbar y el menú lateral (`position: sticky`) pierden su
 * referencia y desaparecen de la pantalla. El ancho de la barra no hace falta
 * reponerlo: home.css reserva siempre ese espacio (`scrollbar-gutter: stable`).
 *
 * Cuenta los pedidos: con dos cuadros abiertos a la vez (ej. una confirmación sobre un
 * detalle) la página se destraba recién cuando se cierra el último.
 */
let locks = 0;
let previous = '';

/** @returns {() => void} función que suelta esta traba (se puede llamar más de una vez). */
export function lockScroll() {
  const html = document.documentElement;
  if (locks++ === 0) {
    previous = html.style.overflow;
    html.style.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) html.style.overflow = previous;
  };
}
