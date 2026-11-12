// node js/boost-utils.test.mjs
import assert from 'node:assert/strict';
import {
  describeBoostState, planAction, boostReturnMessage, formatBoostDate, PENDING_WINDOW_MS,
  planBreakdown, planSavings, holdingsMap, serviceAvailability, holdingLabel, serviceLimitLines,
  pricePerDay, plansIncluding, activeServicePurchases,
} from './boost-utils.js';

let n = 0;
function check(name, fn) {
  try { fn(); n += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}

const NOW = Date.parse('2026-10-14T15:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const DAY = 86400000;

console.log('--- estado del combo ---');
check('sin compras -> nada activo', () => {
  const s = describeBoostState([], NOW);
  assert.equal(s.active, null); assert.equal(s.pending, false); assert.equal(s.needsReview, false);
});
check('combo vigente -> activo, con días que faltan', () => {
  const s = describeBoostState([{ plan_id: 'barrio', status: 'active', starts_at: iso(NOW - 5 * DAY), ends_at: iso(NOW + 25 * DAY), created_at: iso(NOW - 5 * DAY) }], NOW);
  assert.equal(s.active.planId, 'barrio'); assert.equal(s.active.daysLeft, 25);
});
check('combo vencido (active con ends_at pasado) NO cuenta como activo', () => {
  const s = describeBoostState([{ plan_id: 'barrio', status: 'active', starts_at: iso(NOW - 40 * DAY), ends_at: iso(NOW - 10 * DAY), created_at: iso(NOW - 40 * DAY) }], NOW);
  assert.equal(s.active, null);
});
check('renovación que todavía no empezó no pisa al vigente', () => {
  const s = describeBoostState([
    { plan_id: 'barrio', status: 'active', starts_at: iso(NOW + 25 * DAY), ends_at: iso(NOW + 55 * DAY), created_at: iso(NOW) },
    { plan_id: 'barrio', status: 'active', starts_at: iso(NOW - 5 * DAY), ends_at: iso(NOW + 25 * DAY), created_at: iso(NOW - 5 * DAY) },
  ], NOW);
  assert.equal(s.active.daysLeft, 25);
});
check('quedan menos de 24 h -> se muestra 1 día, no 0', () => {
  const s = describeBoostState([{ plan_id: 'local', status: 'active', starts_at: iso(NOW - 29 * DAY), ends_at: iso(NOW + 3600000), created_at: iso(NOW - 29 * DAY) }], NOW);
  assert.equal(s.active.daysLeft, 1);
});
check('pendiente reciente -> esperando pago; vieja -> abandonada', () => {
  assert.equal(describeBoostState([{ plan_id: 'local', status: 'pending', created_at: iso(NOW - 60000) }], NOW).pending, true);
  assert.equal(describeBoostState([{ plan_id: 'local', status: 'pending', created_at: iso(NOW - PENDING_WINDOW_MS - 1) }], NOW).pending, false);
});
check('needs_review y cancelled', () => {
  assert.equal(describeBoostState([{ plan_id: 'local', status: 'needs_review', created_at: iso(NOW) }], NOW).needsReview, true);
  const c = describeBoostState([{ plan_id: 'local', status: 'cancelled', created_at: iso(NOW) }], NOW);
  assert.equal(c.pending || c.needsReview || c.active !== null, false);
});

console.log('--- botón de cada combo ---');
check('sin combo: todos eligibles', () => {
  const s = describeBoostState([], NOW);
  for (const id of ['base', 'intermedio', 'pro']) assert.equal(planAction(id, s).disabled, false);
});
check('con Intermedio vigente: Intermedio renueva, los otros quedan deshabilitados', () => {
  const s = describeBoostState([{ plan_id: 'intermedio', status: 'active', starts_at: iso(NOW - DAY), ends_at: iso(NOW + DAY), created_at: iso(NOW - DAY) }], NOW);
  assert.match(planAction('intermedio', s).label, /Renovar/); assert.equal(planAction('intermedio', s).disabled, false);
  assert.equal(planAction('base', s).disabled, true); assert.equal(planAction('pro', s).disabled, true);
});

console.log('--- vuelta de Mercado Pago ---');
check('mensajes', () => {
  assert.equal(boostReturnMessage('success').poll, true);
  assert.equal(boostReturnMessage('pending').poll, true);
  assert.equal(boostReturnMessage('failure').tone, 'error');
  assert.equal(boostReturnMessage('failure').poll, false);
  assert.equal(boostReturnMessage('otra-cosa'), null);
  assert.equal(boostReturnMessage(null), null);
});

console.log('--- fecha ---');
check('hora de Argentina, no UTC (01:00 UTC del 14 es todavía el 13)', () => {
  assert.equal(formatBoostDate(new Date('2026-10-14T01:00:00Z')), '13/10/2026');
  assert.equal(formatBoostDate(new Date('2026-10-14T15:00:00Z')), '14/10/2026');
});

console.log('--- servicios sueltos y planes con composición ---');
const SERVICES = [
  { id: 'banner_chico', name: 'Banner chico', price: 6000, max_per_store: 2, slot_note: 'Arriba 5, abajo 3.', duration_days: 30, sort_order: 1 },
  { id: 'banner_mediano', name: 'Banner mediano', price: 8000, max_per_store: 1, slot_note: null, duration_days: 30, sort_order: 2 },
  { id: 'productos_recomendados', name: 'Productos recomendados', price: 6000, max_per_store: 5, slot_note: null, duration_days: 30, sort_order: 5 },
  { id: 'redes_sociales', name: 'Redes sociales', price: 8000, max_per_store: null, slot_note: null, duration_days: 30, sort_order: 4 },
];
const PLANS = [{ id: 'base', name: 'Plan Base', price: 20000 }, { id: 'pro', name: 'Plan Pro', price: 15000 }];
const ITEMS = [
  { plan_id: 'base', service_id: 'banner_chico', quantity: 1 },
  { plan_id: 'base', service_id: 'productos_recomendados', quantity: 1 },
  { plan_id: 'base', service_id: 'redes_sociales', quantity: 1 },
  { plan_id: 'pro', service_id: 'banner_mediano', quantity: 1 },
  { plan_id: 'pro', service_id: 'productos_recomendados', quantity: 2 },
];
check('las compras de servicios sueltos no cuentan como plan', () => {
  const s = describeBoostState([{ plan_id: null, service_id: 'banner_chico', status: 'active', starts_at: iso(NOW - DAY), ends_at: iso(NOW + DAY), created_at: iso(NOW - DAY) }], NOW);
  assert.equal(s.active, null);
});
check('planBreakdown ordena por catálogo y trae cantidades', () => {
  const b = planBreakdown('pro', ITEMS, SERVICES);
  assert.deepEqual(b.map((x) => [x.id, x.quantity]), [['banner_mediano', 1], ['productos_recomendados', 2]]);
});
check('un servicio con pago pendiente o en revisión también avisa', () => {
  const pend = describeBoostState([{ plan_id: null, service_id: 'banner_chico', status: 'pending', created_at: iso(NOW - 60000) }], NOW);
  assert.equal(pend.pending, true);
  const rev = describeBoostState([{ plan_id: null, service_id: 'banner_chico', status: 'needs_review', created_at: iso(NOW) }], NOW);
  assert.equal(rev.needsReview, true);
});
check('planSavings: precio por separado y ahorro (nunca negativo)', () => {
  assert.deepEqual(planSavings(PLANS[0], ITEMS, SERVICES), { listPrice: 20000, savings: 0, percent: 0 });
  assert.deepEqual(planSavings(PLANS[1], ITEMS, SERVICES), { listPrice: 20000, savings: 5000, percent: 25 });
  assert.equal(planSavings({ id: 'x', price: 1 }, [], SERVICES).savings, 0);
});
check('serviceAvailability respeta el tope por comercio', () => {
  assert.deepEqual(serviceAvailability(SERVICES[0], 1), { held: 1, max: 2, remaining: 1, canBuy: true, maxQty: 1 });
  assert.equal(serviceAvailability(SERVICES[1], 1).canBuy, false);
  assert.equal(serviceAvailability(SERVICES[3], 7).canBuy, true);
  // Sin tope por comercio (Redes sociales): siempre se puede comprar, pero de a 1 y sin selector.
  assert.deepEqual(serviceAvailability(SERVICES[3], 0), { held: 0, max: null, remaining: null, canBuy: true, maxQty: 1 });
  assert.deepEqual(serviceAvailability(SERVICES[3], 25), { held: 25, max: null, remaining: null, canBuy: true, maxQty: 1 });
  assert.equal(serviceAvailability(SERVICES[2], 0).maxQty, 5);
});
check('holdingLabel', () => {
  assert.equal(holdingLabel(SERVICES[0], 0), 'Tenés 0 de 2 · podés sumar 2');
  assert.match(holdingLabel(SERVICES[1], 1), /máximo alcanzado/);
  assert.match(holdingLabel(SERVICES[3], 0), /Sin tope/);
});
check('holdingsMap', () => {
  assert.deepEqual(holdingsMap([{ service_id: 'a', held: 2 }, { service_id: 'b', held: 0 }]), { a: 2, b: 0 });
  assert.deepEqual(holdingsMap(null), {});
});
check('serviceLimitLines: tope, lugares y duración salen de los datos', () => {
  const l = serviceLimitLines(SERVICES[0]);
  assert.match(l[0], /Máximo 2 unidades/); assert.equal(l[1], 'Arriba 5, abajo 3.'); assert.match(l[2], /30 días/);
  assert.match(serviceLimitLines(SERVICES[1])[0], /Máximo 1 unidad vigente/);
  assert.match(serviceLimitLines(SERVICES[3])[0], /Sin tope/);
});
check('pricePerDay y plansIncluding', () => {
  assert.equal(pricePerDay(6000, 30), 200);
  const inc = plansIncluding('productos_recomendados', PLANS, ITEMS, SERVICES);
  assert.deepEqual(inc.map((x) => [x.id, x.quantity, x.savings]), [['base', 1, 0], ['pro', 2, 5000]]);
  assert.deepEqual(plansIncluding('banner_grande', PLANS, ITEMS, SERVICES), []);
});
check('activeServicePurchases: vigentes, con cantidad; vencidas y futuras no', () => {
  const rows = [
    { service_id: 'banner_chico', quantity: 2, status: 'active', starts_at: iso(NOW - DAY), ends_at: iso(NOW + DAY) },
    { service_id: 'banner_mediano', quantity: 1, status: 'active', starts_at: iso(NOW - 9 * DAY), ends_at: iso(NOW - DAY) },
    { service_id: 'redes_sociales', quantity: 1, status: 'active', starts_at: iso(NOW + DAY), ends_at: iso(NOW + 9 * DAY) },
    { service_id: 'redes_sociales', quantity: 1, status: 'pending', starts_at: null, ends_at: null },
    { plan_id: 'base', status: 'active', starts_at: iso(NOW - DAY), ends_at: iso(NOW + DAY) },
  ];
  const a = activeServicePurchases(rows, NOW);
  assert.equal(a.length, 1); assert.equal(a[0].serviceId, 'banner_chico'); assert.equal(a[0].quantity, 2);
});

console.log(`\n${n} checks`);
