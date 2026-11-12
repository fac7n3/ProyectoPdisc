// node js/boost-plans.test.mjs
// Lógica pura de "Impulsar": las secciones de la ventana de detalles de cada servicio
// y los textos de venta. La ventana en sí (DOM) se prueba a mano / con Playwright.
import assert from 'node:assert/strict';
import { serviceDetailSections, PLAN_COPY, SERVICE_COPY, FREE_PLAN_FEATURES } from './boost-plans.js';

let n = 0;
function check(name, fn) {
  try { fn(); n += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

const fp = (p) => `$${p.toLocaleString('es-AR')}`;
const SERVICES = [
  { id: 'banner_chico', name: 'Banner chico', kind: 'banner', contents: '1 fotografía, título y enlace', purpose: 'Publicidad sencilla', price: 6000, max_per_store: 2, slot_note: 'Arriba 5, abajo 3.', duration_days: 30, sort_order: 1 },
  { id: 'redes_sociales', name: 'Redes sociales', kind: 'social', contents: 'Imagen, texto y enlaces', purpose: 'Difusión externa', price: 8000, max_per_store: null, slot_note: null, duration_days: 30, sort_order: 4 },
  { id: 'servicio_nuevo', name: 'Servicio nuevo', kind: 'stats', contents: 'Algo', purpose: 'Para algo', price: 3000, max_per_store: 1, slot_note: null, duration_days: 15, sort_order: 99 },
];
const PLANS = [{ id: 'base', name: 'Plan Base', price: 14000 }, { id: 'pro', name: 'Plan Pro', price: 9000 }];
const ITEMS = [
  { plan_id: 'base', service_id: 'banner_chico', quantity: 1 }, { plan_id: 'base', service_id: 'redes_sociales', quantity: 1 },
  { plan_id: 'pro', service_id: 'banner_chico', quantity: 1 }, { plan_id: 'pro', service_id: 'redes_sociales', quantity: 1 },
];
const CATALOG = { plans: PLANS, items: ITEMS, services: SERVICES };

console.log('--- ventana de detalles de un servicio ---');
check('arma las cinco secciones, en orden', () => {
  const s = serviceDetailSections(SERVICES[0], CATALOG, fp);
  assert.deepEqual(s.map((x) => x.title), ['Qué contiene', 'Para qué sirve', 'Ejemplos de uso', 'Por qué conviene', 'Límites']);
  assert.equal(s[0].text, '1 fotografía, título y enlace');
  assert.ok(s[2].items.length >= 1);
  assert.equal(s[3].check, true);
});
check('los límites salen de los datos (tope, lugares, duración)', () => {
  const lim = serviceDetailSections(SERVICES[0], CATALOG, fp).find((x) => x.title === 'Límites').items;
  assert.match(lim[0], /Máximo 2 unidades/);
  assert.ok(lim.includes('Arriba 5, abajo 3.'));
  assert.match(lim.at(-1), /30 días/);
  const sinTope = serviceDetailSections(SERVICES[1], CATALOG, fp).find((x) => x.title === 'Límites').items;
  assert.match(sinTope[0], /Sin tope/);
});
check('"por qué conviene" incluye el costo por día y el ahorro del combo solo si existe', () => {
  const con = serviceDetailSections(SERVICES[0], CATALOG, fp).find((x) => x.title === 'Por qué conviene').items.join(' | ');
  assert.match(con, /Equivale a \$200 por día\./);
  assert.match(con, /Plan Pro te sale más barato \(ahorrás hasta \$/);
  // Si ningún combo con descuento lo incluye, no se promete ahorro.
  const sin = serviceDetailSections(SERVICES[0], { plans: [PLANS[0]], items: ITEMS, services: SERVICES }, fp).find((x) => x.title === 'Por qué conviene').items.join(' | ');
  assert.doesNotMatch(sin, /más barato/);
});
check('un servicio sin texto de venta cae a su "para qué sirve" y no inventa ejemplos', () => {
  const s = serviceDetailSections(SERVICES[2], CATALOG, fp);
  assert.deepEqual(s.map((x) => x.title), ['Qué contiene', 'Para qué sirve', 'Por qué conviene', 'Límites']);
  assert.equal(s[1].text, 'Para algo');
  assert.match(s.at(-1).items.at(-1), /15 días/);
});

console.log('--- textos de venta ---');
check('los nueve servicios del catálogo tienen texto, ejemplos y motivos', () => {
  const ids = ['banner_chico', 'banner_mediano', 'banner_grande', 'redes_sociales', 'productos_recomendados',
    'posicionamiento_vendedor', 'posicionamiento_pro', 'negocios_principales', 'estadisticas_pro'];
  for (const id of ids) {
    const c = SERVICE_COPY[id];
    assert.ok(c, `falta el texto de ${id}`);
    assert.ok(c.what.length > 40, `${id}: "para qué sirve" muy corto`);
    assert.ok(c.examples.length >= 3, `${id}: faltan ejemplos`);
    assert.ok(c.why.length >= 3, `${id}: faltan motivos`);
  }
});
check('Redes sociales explica que resubimos las historias y no promete un tope', () => {
  const c = SERVICE_COPY.redes_sociales;
  assert.match(c.what, /historia/i);
  assert.ok(c.why.some((w) => /No hay tope/.test(w)));
});
check('ningún combo está marcado como "recomendado" o destacado', () => {
  for (const [id, copy] of Object.entries(PLAN_COPY)) {
    assert.equal(copy.featured, undefined, `${id} no debe tener cartel de recomendado`);
    assert.ok(copy.tagline.length > 0);
  }
});
check('lo gratis para todos son las nueve cosas de la planilla', () => {
  assert.equal(FREE_PLAN_FEATURES.length, 9);
});

console.log(`\n${n} checks`);
