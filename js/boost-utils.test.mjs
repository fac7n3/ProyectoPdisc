// node js/boost-utils.test.mjs
import assert from 'node:assert/strict';
import { describeBoostState, planAction, boostReturnMessage, formatBoostDate, PENDING_WINDOW_MS } from './boost-utils.js';

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
  for (const id of ['local', 'barrio', 'baradero']) assert.equal(planAction(id, s).disabled, false);
});
check('con Barrio vigente: Barrio renueva, los otros quedan deshabilitados', () => {
  const s = describeBoostState([{ plan_id: 'barrio', status: 'active', starts_at: iso(NOW - DAY), ends_at: iso(NOW + DAY), created_at: iso(NOW - DAY) }], NOW);
  assert.match(planAction('barrio', s).label, /Renovar/); assert.equal(planAction('barrio', s).disabled, false);
  assert.equal(planAction('local', s).disabled, true); assert.equal(planAction('baradero', s).disabled, true);
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

console.log(`\n${n} checks`);
