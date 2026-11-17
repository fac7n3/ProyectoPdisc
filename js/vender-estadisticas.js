/**
 * vender-estadisticas.js — estadísticas del comercio en el panel del vendedor (migración 168)
 * Baradero Local
 *
 * Dos pantallas con los mismos datos (`get_store_metrics`):
 *  - Resumen (en "Resumen" del panel): 4 números de los últimos 30 días. Gratis.
 *  - Sección "Estadísticas": los mismos 4 números y, con "Estadísticas Pro" vigente
 *    (comprada, regalada o dentro del Plan Pro): evolución día por día, comparación con los
 *    30 días anteriores, toques por red y las 5 publicaciones más vistas. Sin Pro se ve una
 *    vista de ejemplo con el botón para activarlo en Impulsar.
 * Quién ve el detalle lo decide la base (si no hay Pro, el detalle ni viaja): acá solo se dibuja.
 *
 * Todo con la API del DOM (nada de innerHTML con datos). La lógica pura está en
 * `store-metrics-utils.js` (probada en Node).
 */

import { supabase } from './auth-utils.js';
import { skeletonBlock } from './panel-skeleton.js';
import { SOCIAL_NETWORKS } from './store-contact-utils.js';
import {
  METRIC_CARDS, PRO_FEATURES, normalizeStoreMetrics, hasAnyActivity, changeVsPrevious,
  barHeights, shortDay, longDay, periodText, startedCountingRecently, formatCount, TRACKING_STARTED,
} from './store-metrics-utils.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const icon = (cls) => {
  const i = el('i', cls);
  i.setAttribute('aria-hidden', 'true');
  return i;
};

/** Pide las estadísticas del comercio (ya saneadas). Falla si no hay acceso. */
export async function fetchStoreMetrics(storeId) {
  const { data, error } = await supabase.rpc('get_store_metrics', { p_store_id: storeId });
  if (error) throw error;
  const metrics = normalizeStoreMetrics(data);
  if (!metrics) throw new Error('Respuesta inesperada de get_store_metrics');
  return metrics;
}

// El Resumen se vuelve a dibujar cada vez que llega un pedido: sin esto cada una sería una consulta.
let summaryCache = { storeId: null, at: 0, metrics: null };
const SUMMARY_TTL_MS = 60_000;

function showError(host, retry) {
  const box = el('div', 'st-error');
  box.appendChild(icon('fa-solid fa-circle-info'));
  box.appendChild(el('span', null, 'No pudimos cargar tus estadísticas.'));
  const btn = el('button', 'st-link', 'Probar de nuevo');
  btn.type = 'button';
  btn.addEventListener('click', retry);
  box.appendChild(btn);
  host.replaceChildren(box);
}

// ---------------------------------------------------------------- 4 números
function tile(card, metrics, { withDelta }) {
  const t = el('div', 'st-tile');
  const top = el('div', 'st-tile__top');
  top.appendChild(icon(card.icon));
  top.appendChild(el('span', 'st-tile__label', card.label));
  t.appendChild(top);
  t.appendChild(el('div', 'st-tile__value', formatCount(metrics.totals[card.key])));
  if (withDelta && metrics.previous) {
    const change = changeVsPrevious(metrics.totals[card.key], metrics.previous[card.key]);
    if (change) {
      const d = el('div', `st-delta st-delta--${change.direction}`);
      d.appendChild(icon(change.direction === 'up' ? 'fa-solid fa-arrow-up' : change.direction === 'down' ? 'fa-solid fa-arrow-down' : 'fa-solid fa-minus'));
      d.appendChild(el('span', null, change.text));
      t.appendChild(d);
    }
  }
  t.appendChild(el('div', 'st-tile__hint', card.hint));
  return t;
}

function tilesGrid(metrics, opts) {
  const grid = el('div', 'st-tiles');
  METRIC_CARDS.forEach((card) => grid.appendChild(tile(card, metrics, opts)));
  return grid;
}

// ---------------------------------------------------------------- Resumen
function renderSummary(host, metrics, { goTo }) {
  host.replaceChildren();
  const head = el('div', 'st-head');
  const titles = el('div');
  const h = el('h3', 'st-title');
  h.appendChild(icon('fa-solid fa-chart-line'));
  h.append(' Tu comercio en números');
  titles.appendChild(h);
  titles.appendChild(el('p', 'st-sub', `${periodText(metrics.from, metrics.to)}.`));
  head.appendChild(titles);
  const open = el('button', 'st-link st-link--strong', 'Ver estadísticas');
  open.type = 'button';
  open.addEventListener('click', () => goTo('estadisticas'));
  head.appendChild(open);
  host.appendChild(head);

  host.appendChild(tilesGrid(metrics, { withDelta: false }));

  if (!hasAnyActivity(metrics.totals)) {
    host.appendChild(el('p', 'st-note', 'Todavía no hay movimiento. Cuando alguien entre a tu comercio o toque tus botones, lo vas a ver acá.'));
  } else if (metrics.locked) {
    const more = el('p', 'st-note');
    more.append('El detalle día por día, la comparación y tus publicaciones más vistas son de ');
    const strong = el('strong', null, 'Estadísticas Pro');
    more.appendChild(strong);
    more.append('. ');
    const go = el('button', 'st-link', 'Ver cómo activarlo');
    go.type = 'button';
    go.addEventListener('click', () => goTo('impulsar'));
    more.appendChild(go);
    host.appendChild(more);
  }
}

/**
 * Dibuja el resumen gratis dentro de `host` (la tarjeta del Resumen del panel).
 * @param {HTMLElement} host
 * @param {string} storeId
 * @param {{ goTo: (section: string) => void }} opts
 */
export async function loadStatsSummary(host, storeId, { goTo }) {
  if (!host || !storeId) return;
  const cached = summaryCache.storeId === storeId && Date.now() - summaryCache.at < SUMMARY_TTL_MS ? summaryCache.metrics : null;
  if (cached) { renderSummary(host, cached, { goTo }); return; }
  skeletonBlock(host, { label: 'Cargando tus estadísticas…', onlyIfEmpty: true, plain: true });
  try {
    const metrics = await fetchStoreMetrics(storeId);
    summaryCache = { storeId, at: Date.now(), metrics };
    renderSummary(host, metrics, { goTo });
  } catch (err) {
    console.error('Error cargando el resumen de estadísticas:', err);
    showError(host, () => loadStatsSummary(host, storeId, { goTo }));
  }
}

// ---------------------------------------------------------------- Sección completa
function chartCard(metrics) {
  const card = el('section', 'st-card');
  card.appendChild(el('h3', 'st-card__title', 'Día por día'));
  card.appendChild(el('p', 'st-sub', 'Elegí qué querés ver. Cada barra es un día.'));

  const tabs = el('div', 'st-tabs');
  tabs.setAttribute('role', 'tablist');
  const chartHost = el('div');
  let current = METRIC_CARDS[0].key;

  const draw = () => {
    const card0 = METRIC_CARDS.find((c) => c.key === current);
    const bars = barHeights(metrics.daily, current);
    const total = bars.reduce((s, b) => s + b.value, 0);
    chartHost.replaceChildren();

    const chart = el('div', 'st-bars');
    chart.setAttribute('role', 'img');
    chart.setAttribute('aria-label', `${card0.label}: ${formatCount(total)} en total en los últimos 30 días`);
    bars.forEach((b) => {
      const col = el('div', 'st-bar');
      col.title = `${longDay(b.day)}: ${formatCount(b.value)}`;
      const fill = el('div', 'st-bar__fill');
      fill.style.height = `${b.pct}%`;
      col.appendChild(fill);
      chart.appendChild(col);
    });
    chartHost.appendChild(chart);

    const axis = el('div', 'st-axis');
    const first = bars[0]?.day;
    const mid = bars[Math.floor(bars.length / 2)]?.day;
    const last = bars[bars.length - 1]?.day;
    [first, mid, last].forEach((d) => axis.appendChild(el('span', null, shortDay(d))));
    chartHost.appendChild(axis);
    chartHost.appendChild(el('p', 'st-total', `${formatCount(total)} en los últimos 30 días`));
  };

  METRIC_CARDS.forEach((c) => {
    const b = el('button', 'st-tab', c.label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(c.key === current));
    b.addEventListener('click', () => {
      current = c.key;
      tabs.querySelectorAll('.st-tab').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      draw();
    });
    tabs.appendChild(b);
  });
  card.appendChild(tabs);
  card.appendChild(chartHost);
  draw();
  return card;
}

function networksCard(metrics) {
  const card = el('section', 'st-card');
  card.appendChild(el('h3', 'st-card__title', 'Toques por red'));
  if (!metrics.socialByNetwork.length) {
    card.appendChild(el('p', 'st-note', 'Todavía nadie tocó los botones de tus redes. Cargalas en "Perfil de mi comercio" para que aparezcan en tu página.'));
    return card;
  }
  card.appendChild(el('p', 'st-sub', 'Cuántas veces tocaron el botón de cada red en tu página. No medimos lo que pasa dentro de la red.'));
  const max = Math.max(1, ...metrics.socialByNetwork.map((r) => r.count));
  const list = el('ul', 'st-nets');
  metrics.socialByNetwork.forEach((r) => {
    const li = el('li', 'st-net');
    const meta = SOCIAL_NETWORKS.find((n) => n.key === r.network);
    const label = el('span', 'st-net__label');
    if (meta) label.appendChild(icon(meta.icon));
    label.append(` ${r.label}`);
    li.appendChild(label);
    const track = el('div', 'st-net__track');
    const fill = el('div', 'st-net__fill');
    fill.style.width = `${Math.max(4, Math.round((r.count / max) * 100))}%`;
    track.appendChild(fill);
    li.appendChild(track);
    li.appendChild(el('span', 'st-net__count', formatCount(r.count)));
    list.appendChild(li);
  });
  card.appendChild(list);
  return card;
}

function topProductsCard(metrics) {
  const card = el('section', 'st-card');
  card.appendChild(el('h3', 'st-card__title', 'Tus publicaciones más vistas'));
  if (!metrics.topProducts.length) {
    card.appendChild(el('p', 'st-note', 'Todavía no hay vistas de tus publicaciones en estos 30 días.'));
    return card;
  }
  const list = el('ol', 'st-top');
  metrics.topProducts.forEach((p) => {
    const li = el('li', 'st-top__item');
    const a = el('a', 'st-top__title', p.title);
    a.href = `./producto.html?id=${encodeURIComponent(p.id)}`;
    li.appendChild(a);
    li.appendChild(el('span', 'st-top__views', `${formatCount(p.views)} vista${p.views === 1 ? '' : 's'}`));
    list.appendChild(li);
  });
  card.appendChild(list);
  return card;
}

/** Lo que ve quien no tiene Estadísticas Pro: qué suma y una vista de ejemplo (sin números reales). */
function lockedCard({ goTo }) {
  const card = el('section', 'st-card st-pro');
  const head = el('div', 'st-pro__head');
  head.appendChild(el('span', 'st-badge', 'PRO'));
  head.appendChild(el('h3', 'st-card__title', 'Estadísticas Pro'));
  card.appendChild(head);
  card.appendChild(el('p', 'st-sub', 'Mirá el detalle de cómo te encuentran y dejá de adivinar qué publicidad te trae gente.'));

  const body = el('div', 'st-pro__body');
  const list = el('ul', 'st-pro__list');
  PRO_FEATURES.forEach((t) => {
    const li = el('li');
    li.appendChild(icon('fa-solid fa-check'));
    li.append(` ${t}`);
    list.appendChild(li);
  });
  body.appendChild(list);

  // Vista de ejemplo: barras grises de relleno, sin ningún número (no se simula un resultado).
  const preview = el('div', 'st-preview');
  preview.setAttribute('aria-hidden', 'true');
  [35, 55, 40, 70, 50, 85, 60, 45, 75, 55, 90, 65].forEach((h) => {
    const b = el('div', 'st-preview__bar');
    b.style.height = `${h}%`;
    preview.appendChild(b);
  });
  preview.appendChild(el('span', 'st-preview__tag', 'Vista de ejemplo'));
  body.appendChild(preview);
  card.appendChild(body);

  const cta = el('button', 'st-cta', 'Activar Estadísticas Pro');
  cta.type = 'button';
  cta.addEventListener('click', () => goTo('impulsar'));
  card.appendChild(cta);
  card.appendChild(el('p', 'st-note', 'Viene incluida en el Plan Pro. Los números ya se están juntando: cuando la actives vas a ver el historial.'));
  return card;
}

function renderSection(host, metrics, { goTo }) {
  host.replaceChildren();

  const header = el('div', 'pd-header');
  const title = el('div', 'pd-header__title');
  title.appendChild(icon('fa-solid fa-chart-line'));
  title.append(' Estadísticas');
  header.appendChild(title);
  header.appendChild(el('p', 'pd-header__sub', `Cómo te encuentran los vecinos. ${periodText(metrics.from, metrics.to)}.`));
  host.appendChild(header);

  host.appendChild(tilesGrid(metrics, { withDelta: !metrics.locked }));

  if (!hasAnyActivity(metrics.totals)) {
    host.appendChild(el('p', 'st-note st-note--box', 'Todavía no hay movimiento en estos 30 días. Cuando alguien entre a tu comercio, abra tus publicaciones o toque tus botones, lo vas a ver acá.'));
  }

  if (metrics.locked) {
    host.appendChild(lockedCard({ goTo }));
  } else {
    host.appendChild(chartCard(metrics));
    const two = el('div', 'st-two');
    two.appendChild(networksCard(metrics));
    two.appendChild(topProductsCard(metrics));
    host.appendChild(two);
  }

  const notes = el('div', 'st-foot');
  notes.appendChild(el('p', null, 'Qué se cuenta: las visitas, publicaciones vistas y toques que hacen los clientes en Baradero Local. No se cuentan las tuyas ni las de tus empleados. Lo que pasa dentro de Instagram, Facebook u otras redes no lo podemos medir.'));
  if (startedCountingRecently(metrics.from)) {
    notes.appendChild(el('p', null, `Empezamos a contar el ${longDay(TRACKING_STARTED)} de 2026: lo anterior a esa fecha figura en cero.`));
  }
  host.appendChild(notes);
}

/**
 * Dibuja la sección "Estadísticas" completa dentro de `host`.
 * @param {HTMLElement} host
 * @param {string} storeId
 * @param {{ goTo: (section: string) => void }} opts
 */
export async function loadStatsSection(host, storeId, { goTo }) {
  if (!host || !storeId) return;
  skeletonBlock(host, { label: 'Cargando tus estadísticas…', onlyIfEmpty: true });
  try {
    const metrics = await fetchStoreMetrics(storeId);
    summaryCache = { storeId, at: Date.now(), metrics };
    renderSection(host, metrics, { goTo });
  } catch (err) {
    console.error('Error cargando las estadísticas:', err);
    showError(host, () => loadStatsSection(host, storeId, { goTo }));
  }
}
