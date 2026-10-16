// Carrito en cadena con Mercado Pago: qué falta pagar y cuándo se ofrece MP.
// Correr con `node js/mp-chain-utils.test.mjs`.
import assert from 'node:assert/strict';
import { pendingChainOrders, allStoresAcceptMp } from './mp-chain-utils.js';

function run(name, fn) {
  try { fn(); console.log(`✅ ${name}`); }
  catch (e) { console.log(`❌ ${name}\n   ${e.message}`); process.exitCode = 1; }
}

const T1 = '2026-10-01 22:41:20.967597+00';
const T2 = '2026-09-30 23:26:19.184548+00';
const o = (id, store, created_at, over = {}) => ({
  id, created_at, stores: { name: store },
  payment_method: 'mercadopago', payment_status: 'pending', status: 'pending', ...over,
});

console.log('--- mp-chain-utils ---\n');

run('devuelve los otros pedidos pendientes de la misma compra, por comercio', () => {
  const orders = [o('c', 'Zapatería', T1), o('a', 'Almacén', T1), o('b', 'Librería', T1)];
  assert.deepEqual(pendingChainOrders(orders, ['b']).map((x) => x.id), ['a', 'c']);
});

run('no mezcla un pendiente viejo de otra compra', () => {
  const orders = [o('a', 'Almacén', T1), o('b', 'Librería', T1), o('viejo', 'Kiosco', T2)];
  assert.deepEqual(pendingChainOrders(orders, ['a']).map((x) => x.id), ['b']);
});

run('no ofrece lo que ya está pagado, cancelado o por otro método', () => {
  const orders = [
    o('a', 'Almacén', T1),
    o('pago', 'Librería', T1, { payment_status: 'paid', status: 'paid' }),
    o('canc', 'Kiosco', T1, { status: 'cancelled' }),
    o('transf', 'Ferretería', T1, { payment_method: 'transferencia' }),
  ];
  assert.deepEqual(pendingChainOrders(orders, ['a']), []);
});

run('si se pagaron varios a la vez, no los vuelve a ofrecer', () => {
  const orders = [o('a', 'A', T1), o('b', 'B', T1), o('c', 'C', T1)];
  assert.deepEqual(pendingChainOrders(orders, ['a', 'b']).map((x) => x.id), ['c']);
});

run('sin pedidos pagados conocidos -> nada que continuar', () => {
  assert.deepEqual(pendingChainOrders([o('a', 'A', T1)], ['inventado']), []);
});

run('MP se ofrece solo si TODOS los comercios lo habilitaron', () => {
  const linked = new Map([['s1', true], ['s2', true], ['s3', false]]);
  assert.equal(allStoresAcceptMp(['s1'], linked), true);
  assert.equal(allStoresAcceptMp(['s1', 's2'], linked), true);
  assert.equal(allStoresAcceptMp(['s1', 's3'], linked), false);
  assert.equal(allStoresAcceptMp(['s9'], linked), false, 'un comercio desconocido no cuenta como habilitado');
  assert.equal(allStoresAcceptMp([], linked), false);
});
