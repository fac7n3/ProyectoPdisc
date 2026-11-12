/** Cantidad de columnas que muestra hoy una grilla (0 si no es grilla, ej. carrusel en celular).
 *  Sirve para pedir productos de más y que la última fila quede completa. */
export function gridColumns(grid) {
  const cs = grid ? getComputedStyle(grid) : null;
  return cs && cs.display === 'grid' ? cs.gridTemplateColumns.split(' ').length : 0;
}
