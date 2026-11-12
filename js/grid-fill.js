/** Grilla de productos siempre simétrica: oculta las tarjetas sueltas de la
 *  última fila (las que no completan una fila entera). Se recalcula al
 *  cambiar el ancho o al sumar/quitar tarjetas ("Ver más", filtros).
 *  En celular (la grilla pasa a flex/carrusel) no oculta nada.
 *  Si hay menos tarjetas que columnas, se muestran todas. */
export function keepGridFull(grid) {
  if (!grid || grid.dataset.gridFill) return;
  grid.dataset.gridFill = '1';

  const apply = () => {
    const cs = getComputedStyle(grid);
    const cols = cs.display === 'grid' ? cs.gridTemplateColumns.split(' ').length : 0;
    const cards = [...grid.children];
    cards.forEach((c) => { c.hidden = false; });
    if (cols < 2 || cards.length <= cols) return;
    const rest = cards.length % cols;
    if (rest) cards.slice(-rest).forEach((c) => { c.hidden = true; });
  };

  new MutationObserver(apply).observe(grid, { childList: true });
  new ResizeObserver(apply).observe(grid);
  apply();
}
