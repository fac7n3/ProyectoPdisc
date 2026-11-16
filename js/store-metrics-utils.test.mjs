// node js/store-metrics-utils.test.mjs
// Lógica pura de las estadísticas del comercio (migración 168): parámetros del RPC,
// saneado de la respuesta, cambio contra el período anterior y alturas de las barras.
import assert from 'node:assert/strict';
import {
  storeMetricParams, normalizeStoreMetrics, hasAnyActivity, changeVsPrevious, barHeights,
  shortDay, longDay, periodText, startedCountingRecently, formatCount, METRIC_CARDS,
  STORE_EVENT_TYPES, TRACKING_STARTED, PRO_FEATURES,
} from './store-metrics-utils.js';
import { SOCIAL_NETWORKS } from './store-contact-utils.js';

let n = 0;
function check(name, fn) {
  try { fn(); n += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

const STORE = '11111111-1111-1111-1111-111111111111';

check('parámetros del RPC: visita y contacto no llevan detalle', () => {
  assert.deepEqual(storeMetricParams(STORE, 'profile_view'), { p_store_id: STORE, p_event_type: 'profile_view', p_detail: '' });
  assert.deepEqual(storeMetricParams(STORE, 'contact_click', 'instagram'), { p_store_id: STORE, p_event_type: 'contact_click', p_detail: '' });
});

check('parámetros del RPC: el toque en una red lleva cuál', () => {
  assert.deepEqual(storeMetricParams(STORE, 'social_click', 'instagram'), { p_store_id: STORE, p_event_type: 'social_click', p_detail: 'instagram' });
});

check('toda red que puede cargar un comercio se puede registrar (no se pierde ninguna)', () => {
  SOCIAL_NETWORKS.forEach(({ key }) => assert.ok(storeMetricParams(STORE, 'social_click', key), key));
  assert.equal(SOCIAL_NETWORKS.length, 6);
});

check('parámetros inválidos dan null (no se llama a la base)', () => {
  assert.equal(storeMetricParams('no-es-uuid', 'profile_view'), null);
  assert.equal(storeMetricParams(null, 'profile_view'), null);
  assert.equal(storeMetricParams(undefined, 'profile_view'), null);
  assert.equal(storeMetricParams(STORE, 'bogus'), null);
  assert.equal(storeMetricParams(STORE, 'social_click'), null, 'social_click sin red');
  assert.equal(storeMetricParams(STORE, 'social_click', 'myspace'), null);
  assert.equal(storeMetricParams(`${STORE}; drop table x`, 'profile_view'), null);
});

check('los tipos de evento coinciden con los de la base', () => {
  assert.deepEqual(STORE_EVENT_TYPES, ['profile_view', 'contact_click', 'social_click']);
});

const RAW_PRO = {
  from: '2026-10-18', to: '2026-11-16', days: 30, pro: true, locked: false,
  totals: { profile_views: 14, contact_clicks: 4, social_clicks: 13, product_views: 9 },
  previous: { profile_views: 7, contact_clicks: 0, social_clicks: 1, product_views: 2 },
  daily: [
    { day: '2026-11-15', profile_views: 3, contact_clicks: 0, social_clicks: 1, product_views: 0 },
    { day: '2026-11-16', profile_views: 11, contact_clicks: 4, social_clicks: 12, product_views: 9 },
  ],
  social_by_network: [{ network: 'instagram', count: 9 }, { network: 'facebook', count: 3 }, { network: 'tiktok', count: 1 }],
  top_products: [{ id: 'p1', title: 'Pan', views: 8 }, { id: 'p2', title: 'Facturas', views: 1 }],
};

check('respuesta con Pro: se leen todos los datos', () => {
  const m = normalizeStoreMetrics(RAW_PRO);
  assert.equal(m.locked, false);
  assert.equal(m.pro, true);
  assert.equal(m.totals.profile_views, 14);
  assert.equal(m.previous.social_clicks, 1);
  assert.equal(m.daily.length, 2);
  assert.equal(m.daily[1].social_clicks, 12);
  assert.deepEqual(m.socialByNetwork.map((r) => [r.network, r.label, r.count]), [['instagram', 'Instagram', 9], ['facebook', 'Facebook', 3], ['tiktok', 'TikTok', 1]]);
  assert.deepEqual(m.topProducts.map((p) => [p.title, p.views]), [['Pan', 8], ['Facturas', 1]]);
});

check('respuesta sin Pro: aunque viniera detalle, no se usa (la base no lo manda, y acá tampoco se muestra)', () => {
  const m = normalizeStoreMetrics({ ...RAW_PRO, locked: true });
  assert.equal(m.locked, true);
  assert.equal(m.previous, null);
  assert.deepEqual(m.daily, []);
  assert.deepEqual(m.socialByNetwork, []);
  assert.deepEqual(m.topProducts, []);
  assert.equal(m.totals.profile_views, 14, 'los totales sí se ven');
});

check('si falta "locked" se asume bloqueado (nunca se muestra detalle por error)', () => {
  const { locked, ...sin } = RAW_PRO;
  assert.equal(normalizeStoreMetrics(sin).locked, true);
});

check('respuestas raras no rompen: todo a cero y listas vacías', () => {
  assert.equal(normalizeStoreMetrics(null), null);
  assert.equal(normalizeStoreMetrics('x'), null);
  assert.equal(normalizeStoreMetrics([]), null);
  const m = normalizeStoreMetrics({ locked: false, totals: { profile_views: 'abc', contact_clicks: -5, social_clicks: null, product_views: 2.6 }, daily: 'no', social_by_network: {}, top_products: 7 });
  assert.deepEqual(m.totals, { profile_views: 0, product_views: 3, contact_clicks: 0, social_clicks: 0 });
  assert.deepEqual(m.daily, []);
  assert.deepEqual(m.socialByNetwork, []);
  assert.deepEqual(m.topProducts, []);
});

check('se descartan renglones inválidos (día mal escrito, red vacía, publicación sin id)', () => {
  const m = normalizeStoreMetrics({
    locked: false, totals: {},
    daily: [{ day: 'ayer', profile_views: 5 }, { day: '2026-11-16', profile_views: 1 }],
    social_by_network: [{ network: '', count: 4 }, { network: 'x', count: 0 }, { network: 'x', count: 2 }],
    top_products: [{ id: '', title: 'a', views: 3 }, { id: 'p', title: 'b', views: 0 }, { id: 'p', title: 'c', views: 1 }],
  });
  assert.equal(m.daily.length, 1);
  assert.deepEqual(m.socialByNetwork.map((r) => [r.network, r.label, r.count]), [['x', 'X (Twitter)', 2]]);
  assert.deepEqual(m.topProducts.map((p) => p.title), ['c']);
});

check('un título de publicación vacío se muestra como "Publicación"', () => {
  assert.equal(normalizeStoreMetrics({ locked: false, top_products: [{ id: 'p', views: 2 }] }).topProducts[0].title, 'Publicación');
});

check('hasAnyActivity', () => {
  assert.equal(hasAnyActivity({ profile_views: 0, contact_clicks: 0 }), false);
  assert.equal(hasAnyActivity({ profile_views: 0, social_clicks: 1 }), true);
  assert.equal(hasAnyActivity(null), false);
});

check('cambio contra el período anterior', () => {
  assert.equal(changeVsPrevious(0, 0), null);
  assert.deepEqual(changeVsPrevious(5, 0), { direction: 'new', pct: null, text: 'Nuevo: antes no había movimiento' });
  assert.equal(changeVsPrevious(14, 7).pct, 100);
  assert.equal(changeVsPrevious(14, 7).direction, 'up');
  assert.equal(changeVsPrevious(14, 7).text, '100% más que los 30 días anteriores');
  assert.equal(changeVsPrevious(3, 4).pct, -25);
  assert.equal(changeVsPrevious(3, 4).text, '25% menos que los 30 días anteriores');
  assert.equal(changeVsPrevious(4, 4).direction, 'same');
  assert.equal(changeVsPrevious(0, 4).pct, -100);
});

check('barras: el día más alto ocupa el 100%, un día con algo nunca queda en cero', () => {
  const daily = [{ day: '2026-11-14', social_clicks: 0 }, { day: '2026-11-15', social_clicks: 1 }, { day: '2026-11-16', social_clicks: 100 }];
  const bars = barHeights(daily, 'social_clicks');
  assert.deepEqual(bars.map((b) => b.pct), [0, 4, 100]);
  assert.deepEqual(bars.map((b) => b.value), [0, 1, 100]);
});

check('barras: todo en cero no divide por cero', () => {
  assert.deepEqual(barHeights([{ day: '2026-11-16', profile_views: 0 }], 'profile_views').map((b) => b.pct), [0]);
  assert.deepEqual(barHeights([], 'profile_views'), []);
  assert.deepEqual(barHeights(null, 'profile_views'), []);
});

check('fechas: sin corrimientos de zona horaria', () => {
  assert.equal(shortDay('2026-11-05'), '5/11');
  assert.equal(longDay('2026-11-05'), '5 de noviembre');
  assert.equal(longDay('2026-12-31'), '31 de diciembre');
  assert.equal(periodText('2026-10-18', '2026-11-16'), 'Del 18 de octubre al 16 de noviembre');
  assert.equal(periodText('', ''), 'Últimos 30 días');
  assert.equal(shortDay('x'), '');
});

check('aviso de "empezamos a contar" solo mientras la ventana arranca antes', () => {
  assert.equal(TRACKING_STARTED, '2026-11-16');
  assert.equal(startedCountingRecently('2026-10-18'), true);
  assert.equal(startedCountingRecently('2026-11-16'), false);
  assert.equal(startedCountingRecently('2026-12-20'), false);
  assert.equal(startedCountingRecently(''), false);
});

check('números con punto de miles', () => {
  assert.equal(formatCount(1234), '1.234');
  assert.equal(formatCount(0), '0');
  assert.equal(formatCount('x'), '0');
});

check('los 4 números del resumen y qué suma Pro', () => {
  assert.deepEqual(METRIC_CARDS.map((c) => c.key), ['profile_views', 'product_views', 'contact_clicks', 'social_clicks']);
  METRIC_CARDS.forEach((c) => assert.ok(c.label && c.icon && c.hint, c.key));
  assert.ok(PRO_FEATURES.length >= 3);
});

console.log(`\n${n} checks ok`);
