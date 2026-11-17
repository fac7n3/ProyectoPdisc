// Esqueletos de carga para las secciones de los paneles (hoy: panel del comercio).
// La barra con brillo es .store-skeleton__bar (home.css: modo oscuro y "reducir
// animaciones" ya resueltos); las medidas (.sk-*) están en pages/vender.html.
// Cada render real vacía su contenedor (textContent = '' / replaceChildren), así
// que el esqueleto desaparece solo; si la carga falla y nadie lo reemplazó,
// clearStaleSkeletons lo cambia por un aviso para que no quede brillando siempre.

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

/** Filas de lista (publicaciones, cupones, empleados): miniatura, dos líneas y un botón. */
export function skeletonRows(container, { count = 4, label = 'Cargando…', thumb = true } = {}) {
  if (!container) return;
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push(piece('pub-row sk-row', ...(thumb ? [bar('sk-thumb')] : []), lines(80, 40), bar('sk-pill')));
  }
  reserve(container, label, rows);
}

/** Reseñas: resumen (puntaje + estrellas) y tarjetas con nombre y texto. */
export function skeletonReviews(summary, list, count = 3) {
  if (summary) {
    summary.textContent = '';
    summary.appendChild(piece('sk-quiet sk-reviews-summary', bar('sk-score'), bar('sk-stars'), bar('sk-w40')));
  }
  if (!list) return;
  const cards = [];
  for (let i = 0; i < count; i += 1) {
    cards.push(piece('rs-card sk-card', lines(40, 100, 80)));
  }
  reserve(list, 'Cargando reseñas…', cards);
}

/** Resumen: las 3 estadísticas, "Impulsá", los 2 pendientes, ayuda/novedades y los gráficos. */
export function skeletonResumen(dash, grid2, metrics) {
  if (dash) {
    const stat = (area) => {
      const card = piece('rs-card rs-stat', el('div', 'sk-row'), bar('sk-value'), bar('sk-w60'));
      card.firstChild.append(bar('sk-icon'), bar('sk-w40'));
      card.style.gridArea = area;
      return card;
    };
    const pend = (area) => {
      const card = piece('rs-card', bar('sk-w40'), el('div', 'sk-gap'), lines(100, 100, 100));
      card.style.gridArea = area;
      return card;
    };
    const promo = piece('rs-card sk-promo', bar('sk-icon'), bar('sk-w60'), bar('sk-w100'), bar('sk-w80'));
    promo.style.gridArea = 'promo';
    reserve(dash, 'Cargando tu resumen…', [stat('s1'), stat('s2'), stat('s3'), promo, pend('p1'), pend('p2')]);
  }
  if (grid2) {
    grid2.textContent = '';
    grid2.append(
      piece('sk-quiet rs-card', bar('sk-w40'), el('div', 'sk-gap'), lines(100, 100, 100)),
      piece('sk-quiet rs-card', bar('sk-w40'), el('div', 'sk-gap'), lines(100, 80)),
    );
  }
  if (metrics) {
    metrics.textContent = '';
    metrics.append(piece('sk-quiet rs-card sk-chart', bar('sk-w40'), bar('sk-value'), bar('sk-graph')));
  }
}

/** Cambia por un aviso lo que siga siendo esqueleto después de la carga (consulta fallida). */
export function clearStaleSkeletons(root = document) {
  const hosts = new Set([...root.querySelectorAll('.sk')].map((n) => n.parentElement));
  hosts.forEach((host) => {
    if (!host) return;
    const quiet = host.querySelector('.sk:not(.sk-quiet):not(.sr-only)') === null && host.querySelector('.sk-quiet');
    host.textContent = '';
    if (quiet) return;
    const msg = el('p', 'rs-empty', 'No se pudo cargar esta sección. Revisá tu conexión y recargá la página.');
    msg.style.gridColumn = '1 / -1';
    host.appendChild(msg);
  });
}
