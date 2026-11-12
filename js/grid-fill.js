/** Grilla de productos siempre simétrica: las tarjetas de la última fila que
 *  no la completan se estiran (grid-column: span) para ocupar todo el ancho.
 *  No se oculta ninguna. Se recalcula al cambiar el ancho o al sumar/quitar
 *  tarjetas. En celular (la grilla pasa a flex/carrusel) no hace nada. */
export function keepGridFull(grid) {
  if (!grid || grid.dataset.gridFill) return;
  grid.dataset.gridFill = '1';

  const apply = () => {
    const cs = getComputedStyle(grid);
    const cols = cs.display === 'grid' ? cs.gridTemplateColumns.split(' ').length : 0;
    const cards = [...grid.children];
    cards.forEach((c) => { c.style.gridColumn = ''; });
    if (cols < 2 || cards.length <= cols) return;
    const rest = cards.length % cols;
    if (!rest) return;
    const base = Math.floor(cols / rest);
    const extra = cols % rest;
    cards.slice(-rest).forEach((c, i) => {
      c.style.gridColumn = `span ${base + (i < extra ? 1 : 0)}`;
    });
  };

  new MutationObserver(apply).observe(grid, { childList: true });
  new ResizeObserver(apply).observe(grid);
  apply();
}
