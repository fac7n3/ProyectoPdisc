// node js/interests-utils.test.mjs
import assert from 'node:assert/strict';
import { normalizeViews, addView, weightCategories, allocateSlots, interleaveByInterest, MAX_VIEWED } from './interests-utils.js';

let n = 0;
function check(name, fn) {
  try { fn(); n += 1; console.log(`  ok  ${name}`); }
  catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
}
const NOW = Date.parse('2026-10-19T12:00:00Z');
const DAY = 86400000;

console.log('--- lista de vistos ---');
check('basura guardada -> lista vacía', () => {
  assert.deepEqual(normalizeViews(null), []);
  assert.deepEqual(normalizeViews('x'), []);
  assert.deepEqual(normalizeViews([null, { id: 3 }, { id: 'a' }, { id: 'b', at: 'x' }]), []);
});
check('sin repetidos y más reciente primero', () => {
  const v = normalizeViews([{ id: 'a', at: 1 }, { id: 'b', at: 5 }, { id: 'a', at: 3 }]);
  assert.deepEqual(v.map((x) => x.id), ['b', 'a']);
});
check('volver a mirar un producto lo sube, no lo duplica', () => {
  let v = addView([], 'a', 1);
  v = addView(v, 'b', 2);
  v = addView(v, 'a', 3);
  assert.deepEqual(v, [{ id: 'a', at: 3 }, { id: 'b', at: 2 }]);
});
check('tope de productos recordados', () => {
  let v = [];
  for (let i = 0; i < MAX_VIEWED + 10; i++) v = addView(v, `p${i}`, i);
  assert.equal(v.length, MAX_VIEWED);
  assert.equal(v[0].id, `p${MAX_VIEWED + 9}`);
});

console.log('--- peso por categoría ---');
const cat = { p1: 'pan', p2: 'pan', p3: 'pan', r1: 'ropa', v1: 'verdu' };
check('más vistas -> más peso', () => {
  const views = ['p1', 'p2', 'p3', 'r1'].map((id) => ({ id, at: NOW }));
  const w = weightCategories(views, cat, NOW);
  assert.equal(w[0].categoryId, 'pan');
  assert.equal(w[0].weight, 3);
  assert.equal(w[1].categoryId, 'ropa');
});
check('lo reciente pesa más que lo viejo', () => {
  const views = [{ id: 'r1', at: NOW }, { id: 'p1', at: NOW - 60 * DAY }, { id: 'p2', at: NOW - 60 * DAY }];
  const w = weightCategories(views, cat, NOW);
  assert.equal(w[0].categoryId, 'ropa');
});
check('a los 14 días pesa la mitad', () => {
  const w = weightCategories([{ id: 'p1', at: NOW - 14 * DAY }], cat, NOW);
  assert.ok(Math.abs(w[0].weight - 0.5) < 1e-9);
});
check('vistas sin categoría conocida se ignoran', () => {
  assert.deepEqual(weightCategories([{ id: 'zzz', at: NOW }], cat, NOW), []);
});
check('tope de 5 categorías', () => {
  const many = {}; const views = [];
  for (let i = 0; i < 8; i++) { many[`p${i}`] = `c${i}`; views.push({ id: `p${i}`, at: NOW - i }); }
  assert.equal(weightCategories(views, many, NOW).length, 5);
});

console.log('--- reparto de lugares ---');
check('proporcional y suma el total', () => {
  const s = allocateSlots([{ categoryId: 'pan', weight: 3 }, { categoryId: 'ropa', weight: 1 }], 12);
  assert.equal(s.pan + s.ropa, 12);
  assert.equal(s.pan, 9); assert.equal(s.ropa, 3);
});
check('una sola categoría se lleva todo', () => {
  assert.deepEqual(allocateSlots([{ categoryId: 'pan', weight: 1 }], 12), { pan: 12 });
});
check('cada categoría tiene al menos un lugar', () => {
  const s = allocateSlots([{ categoryId: 'a', weight: 100 }, { categoryId: 'b', weight: 0.01 }], 12);
  assert.ok(s.b >= 1);
  assert.equal(s.a + s.b, 12);
});
check('sin categorías o sin lugares -> vacío', () => {
  assert.deepEqual(allocateSlots([], 12), {});
  assert.deepEqual(allocateSlots([{ categoryId: 'a', weight: 1 }], 0), {});
});

console.log('--- intercalado ---');
const mk = (c, k) => Array.from({ length: k }, (_, i) => ({ id: `${c}${i}`, c }));
check('intercala categorías, no las junta', () => {
  const w = [{ categoryId: 'pan', weight: 2 }, { categoryId: 'ropa', weight: 2 }];
  const out = interleaveByInterest({ pan: mk('pan', 10), ropa: mk('ropa', 10) }, w, 6);
  assert.deepEqual(out.map((x) => x.c), ['pan', 'ropa', 'pan', 'ropa', 'pan', 'ropa']);
});
check('si una categoría tiene pocos, los lugares los toman las otras', () => {
  const w = [{ categoryId: 'pan', weight: 1 }, { categoryId: 'ropa', weight: 1 }];
  const out = interleaveByInterest({ pan: mk('pan', 1), ropa: mk('ropa', 10) }, w, 6);
  assert.equal(out.length, 6);
  assert.equal(out.filter((x) => x.c === 'pan').length, 1);
});
check('no repite productos', () => {
  const w = [{ categoryId: 'a', weight: 1 }, { categoryId: 'b', weight: 1 }];
  const dup = [{ id: 'x' }, { id: 'y' }];
  const out = interleaveByInterest({ a: dup, b: dup }, w, 4);
  assert.equal(new Set(out.map((x) => x.id)).size, out.length);
});
check('respeta el cupo de la más vista', () => {
  const w = [{ categoryId: 'pan', weight: 3 }, { categoryId: 'ropa', weight: 1 }];
  const out = interleaveByInterest({ pan: mk('pan', 20), ropa: mk('ropa', 20) }, w, 12);
  assert.equal(out.filter((x) => x.c === 'pan').length, 9);
  assert.equal(out.filter((x) => x.c === 'ropa').length, 3);
});
console.log(`${n} ok`);
