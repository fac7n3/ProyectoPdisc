// Esqueletos de carga para los paneles (comercio, profesional, repartidor, Mi perfil, admin).
// La barra con brillo es .store-skeleton__bar y las medidas (.sk-*) están en home.css:
// modo oscuro y "reducir animaciones" ya resueltos.
// Cada render real vacía su contenedor (textContent = '' / replaceChildren / innerHTML),
// así que el esqueleto desaparece solo; si la carga falla y nadie lo reemplazó,
// clearStaleSkeletons lo cambia por un aviso para que no quede brillando siempre.
// Con { onlyIfEmpty: true } no se pinta si el contenedor ya tiene algo: sirve para
// loaders que también se llaman al refrescar (ahí no hay que parpadear).

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

const bar = (cls = '') => el('span', `store-skeleton__bar sk-bar ${cls}`.trim());

function lines(...widths) {
  const box = el('div', 'sk-lines');
  widths.forEach((w) => box.appendChild(bar(`sk-w${w}`)));
  return box;
}

// Cada pieza lleva .sk (para detectarla después) y aria-hidden: lo que lee un
// lector de pantalla es el "Cargando…" de reserve().
function piece(cls, ...children) {
  const box = el('div', `sk ${cls}`);
  box.setAttribute('aria-hidden', 'true');
  children.forEach((c) => box.appendChild(c));
  return box;
}

function reserve(container, label, nodes) {
  container.textContent = '';
  container.appendChild(el('p', 'sr-only sk', label));
  nodes.forEach((n) => container.appendChild(n));
}

// true si hay que pintar: el contenedor existe y (si se pidió) está vacío.
function wanted(container, onlyIfEmpty) {
  return Boolean(container) && !(onlyIfEmpty && container.children.length);
}

const times = (n, make) => Array.from({ length: n }, (_, i) => make(i));

/** Filas de lista (publicaciones, cupones, empleados, consultas): miniatura opcional, dos líneas y un botón. */
export function skeletonRows(container, { count = 4, label = 'Cargando…', thumb = true, onlyIfEmpty = false } = {}) {
  if (!wanted(container, onlyIfEmpty)) return;
  reserve(container, label, times(count, () => piece('sk-rowcard',
    ...(thumb ? [bar('sk-thumb')] : []), lines(80, 40), bar('sk-pill'))));
}

/** Tarjetas dentro de un contenedor que ya es una grilla (favoritos, fotos, pedidos del repartidor): foto y dos líneas. */
export function skeletonGrid(container, { count = 4, label = 'Cargando…', photo = true, onlyIfEmpty = false } = {}) {
  if (!wanted(container, onlyIfEmpty)) return;
  reserve(container, label, times(count, () => piece('sk-card', ...(photo ? [bar('sk-photo')] : []), lines(80, 40))));
}

/** Una tarjeta grande (gráficos, estadísticas): título, cifra y un bloque. */
export function skeletonBlock(container, { label = 'Cargando…', onlyIfEmpty = false, plain = false } = {}) {
  if (!wanted(container, onlyIfEmpty)) return;
  // plain: sin borde propio, para cuando el contenedor ya es una tarjeta.
  reserve(container, label, [piece(plain ? 'sk-col' : 'sk-card', bar('sk-w40'), bar('sk-value'), bar('sk-graph'))]);
}

/** Fila de tarjetas de números (Resumen del profesional). */
export function skeletonStats(container, { count = 4, label = 'Cargando…' } = {}) {
  if (!container) return;
  reserve(container, label, times(count, () => {
    const top = el('div', 'sk-row');
    top.append(bar('sk-icon'), bar('sk-w40'));
    return piece('sk-card rs-stat', top, bar('sk-value'), bar('sk-w60'));
  }));
}

/** Reseñas: resumen (puntaje + estrellas) y tarjetas con nombre y texto. */
export function skeletonReviews(summary, list, count = 3) {
  if (summary) {
    summary.textContent = '';
    summary.appendChild(piece('sk-quiet sk-reviews-summary', bar('sk-score'), bar('sk-stars'), bar('sk-w40')));
  }
  if (!list) return;
  reserve(list, 'Cargando reseñas…', times(count, () => piece('sk-card', lines(40, 100, 80))));
}

/** Resumen del comercio: las 3 estadísticas, "Impulsá", los 2 pendientes, ayuda/novedades y los gráficos. */
export function skeletonResumen(dash, grid2, metrics) {
  if (dash) {
    const stat = (area) => {
      const top = el('div', 'sk-row');
      top.append(bar('sk-icon'), bar('sk-w40'));
      const card = piece('sk-card rs-stat', top, bar('sk-value'), bar('sk-w60'));
      card.style.gridArea = area;
      return card;
    };
    const pend = (area) => {
      const card = piece('sk-card', bar('sk-w40'), el('div', 'sk-gap'), lines(100, 100, 100));
      card.style.gridArea = area;
      return card;
    };
    const promo = piece('sk-card', bar('sk-icon'), bar('sk-w60'), bar('sk-w100'), bar('sk-w80'));
    promo.style.gridArea = 'promo';
    reserve(dash, 'Cargando tu resumen…', [stat('s1'), stat('s2'), stat('s3'), promo, pend('p1'), pend('p2')]);
  }
  skeletonResumenCards(grid2);
  if (metrics) {
    metrics.textContent = '';
    metrics.append(piece('sk-quiet sk-card', bar('sk-w40'), bar('sk-value'), bar('sk-graph')));
  }
}

/** Las dos tarjetas de abajo del Resumen ("lo que te falta hacer", ayuda y novedades). */
export function skeletonResumenCards(grid2) {
  if (!grid2) return;
  grid2.textContent = '';
  grid2.append(
    piece('sk-quiet sk-card', bar('sk-w40'), el('div', 'sk-gap'), lines(100, 100, 100)),
    piece('sk-quiet sk-card', bar('sk-w40'), el('div', 'sk-gap'), lines(100, 80)),
  );
}

/** Filas de tabla (admin) como HTML, para los tbody que se llenan con innerHTML. */
export function skeletonTableHtml(cols, label = 'Cargando…', rows = 4) {
  const widths = ['sk-w80', 'sk-w60', 'sk-w40', 'sk-w60'];
  const cell = (c, first) => `<td>${first && c === 0 ? `<span class="sr-only">${label}</span>` : ''}`
    + `<span class="store-skeleton__bar sk-bar ${widths[c % widths.length]}" aria-hidden="true"></span></td>`;
  return times(rows, (r) => `<tr class="sk">${times(cols, (c) => cell(c, r === 0)).join('')}</tr>`).join('');
}

/**
 * Cambia por un aviso lo que siga siendo esqueleto en esos contenedores cuando la carga ya
 * terminó (consulta fallida). Se pasan los contenedores a mano, no se barre la página: otros
 * esqueletos pueden estar todavía esperando su dato.
 */
export function clearStaleSkeletons(...hosts) {
  hosts.forEach((host) => {
    if (!host || !host.querySelector(':scope > .sk')) return;
    const quiet = host.querySelector(':scope > .sk:not(.sk-quiet):not(.sr-only)') === null;
    host.textContent = '';
    if (quiet) return;
    host.appendChild(el('p', 'sk-error', 'No se pudo cargar esta sección. Revisá tu conexión y recargá la página.'));
  });
}
