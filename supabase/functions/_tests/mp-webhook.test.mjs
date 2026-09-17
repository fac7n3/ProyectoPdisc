import assert from 'node:assert/strict';
import { makeFakeSupabase } from './fake-supabase.mjs';
import { loadEdgeFunction } from './load-edge.mjs';

const FN = new URL('../mp-webhook/index.ts', import.meta.url).pathname;
const ENV = {
  MP_ACCESS_TOKEN: 'TOKEN_GLOBAL', MP_CLIENT_ID: 'cid', MP_CLIENT_SECRET: 'csec',
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'srk',
};

function run(name, fn) {
  try { fn(); } catch (e) { console.log(`❌ ${name}\n   ${e.message}`); process.exitCode = 1; return; }
  console.log(`✅ ${name}`);
}
const results = [];
async function scenario(name, { orders, stores = [], payment, query = '' }) {
  const tables = { orders: orders.map(o => ({ ...o })), stores: stores.map(s => ({ ...s })) };
  const sb = makeFakeSupabase(tables);
  const { handler, logs } = loadEdgeFunction(FN, {
    env: ENV,
    createClient: () => sb,
    fetchImpl: async (url) => {
      if (String(url).includes('/v1/payments/')) {
        return payment ? { ok: true, json: async () => payment } : { ok: false, json: async () => ({}) };
      }
      return { ok: false, json: async () => ({}) };
    },
  });
  const res = await handler(new Request(
    `https://x/functions/v1/mp-webhook?type=payment&data.id=99${query}`, { method: 'GET' },
  ));
  results.push({ name, status: res.status, orders: tables.orders, rpcs: sb.__rpcCalls, logs });
  return { status: res.status, orders: tables.orders, rpcs: sb.__rpcCalls, logs };
}

const STORE = { id: 's1', owner_id: 'owner1', mp_collector_id: null };
const pendingOrder = (id, total) => ({
  id, store_id: 's1', total_price: total, payment_method: 'mercadopago',
  payment_status: 'pending', status: 'pending', payment_id: null,
});
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

console.log('--- mp-webhook ---\n');

// 1. Pago correcto: monto exacto -> paid
{
  const r = await scenario('monto exacto', {
    orders: [pendingOrder(A, 5000)], stores: [STORE],
    payment: { id: 99, status: 'approved', transaction_amount: 5000, external_reference: A },
  });
  run('pago por el monto exacto -> paid', () => {
    assert.equal(r.orders[0].payment_status, 'paid');
    assert.equal(r.orders[0].status, 'paid');
    assert.equal(r.orders[0].payment_id, '99');
    assert.equal(r.rpcs.filter(c => c.args.p_type === 'order_paid').length, 1);
  });
}

// 2. EL BUG: se paga menos que el total -> NO debe quedar paid
{
  const r = await scenario('pago de menos', {
    orders: [pendingOrder(A, 50000)], stores: [STORE],
    payment: { id: 99, status: 'approved', transaction_amount: 100, external_reference: A },
  });
  run('pago de $100 sobre un pedido de $50.000 -> needs_review, NO paid', () => {
    assert.equal(r.orders[0].payment_status, 'needs_review');
    assert.notEqual(r.orders[0].status, 'paid');
    const n = r.rpcs.find(c => c.args.p_type === 'mp_payment_amount_mismatch');
    assert.ok(n, 'debe notificar al vendedor');
    assert.equal(n.args.p_payload.paid_amount, 100);
    assert.equal(n.args.p_payload.expected_amount, 50000);
  });
}

// 3. Carrito de dos órdenes: el pago cubre solo una
{
  const r = await scenario('cubre solo una', {
    orders: [pendingOrder(A, 3000), pendingOrder(B, 7000)], stores: [STORE],
    payment: { id: 99, status: 'approved', transaction_amount: 3000, external_reference: `${A},${B}` },
  });
  run('pago que cubre solo una de dos órdenes -> ninguna queda paid', () => {
    assert.ok(r.orders.every(o => o.payment_status === 'needs_review'), 'ambas a revisión');
  });
}

// 4. Pago de más -> se acepta (no es un riesgo para nosotros)
{
  const r = await scenario('pago de más', {
    orders: [pendingOrder(A, 5000)], stores: [STORE],
    payment: { id: 99, status: 'approved', transaction_amount: 5200, external_reference: A },
  });
  run('pago de más -> paid igual', () => assert.equal(r.orders[0].payment_status, 'paid'));
}

// 5. Devolución después de pagado
{
  const paid = { ...pendingOrder(A, 5000), payment_status: 'paid', status: 'paid', payment_id: '99' };
  const r = await scenario('devolución', {
    orders: [paid], stores: [STORE],
    payment: { id: 99, status: 'refunded', transaction_amount: 5000, external_reference: A },
  });
  run('devolución de un pago ya confirmado -> needs_review + aviso', () => {
    assert.equal(r.orders[0].payment_status, 'needs_review');
    const n = r.rpcs.find(c => c.args.p_type === 'mp_payment_refunded');
    assert.ok(n, 'debe notificar la devolución');
    assert.equal(n.args.p_payload.mp_status, 'refunded');
  });
}

// 6. Contracargo
{
  const paid = { ...pendingOrder(A, 5000), payment_status: 'paid', status: 'paid', payment_id: '99' };
  const r = await scenario('contracargo', {
    orders: [paid], stores: [STORE],
    payment: { id: 99, status: 'charged_back', transaction_amount: 5000, external_reference: A },
  });
  run('contracargo -> needs_review', () => assert.equal(r.orders[0].payment_status, 'needs_review'));
}

// 7. Una devolución de OTRO pago no toca esta orden
{
  const paid = { ...pendingOrder(A, 5000), payment_status: 'paid', status: 'paid', payment_id: '77' };
  const r = await scenario('devolución ajena', {
    orders: [paid], stores: [STORE],
    payment: { id: 99, status: 'refunded', transaction_amount: 5000, external_reference: A },
  });
  run('devolución de otro payment_id -> no toca la orden', () =>
    assert.equal(r.orders[0].payment_status, 'paid'));
}

// 8. external_reference basura -> 200, no 500 (MP reintenta un 500 durante días)
{
  const r = await scenario('external_reference basura', {
    orders: [pendingOrder(A, 5000)], stores: [STORE],
    payment: { id: 99, status: 'approved', transaction_amount: 5000, external_reference: 'DROP TABLE;--' },
  });
  run('external_reference sin uuids -> 200 y nada cambia', () => {
    assert.equal(r.status, 200);
    assert.equal(r.orders[0].payment_status, 'pending');
  });
}

// 9. Webhook repetido (MP reintenta) -> idempotente
{
  const tables = { orders: [pendingOrder(A, 5000)], stores: [STORE] };
  const sb = makeFakeSupabase(tables);
  const mk = () => loadEdgeFunction(FN, {
    env: ENV, createClient: () => sb,
    fetchImpl: async () => ({ ok: true, json: async () => ({ id: 99, status: 'approved', transaction_amount: 5000, external_reference: A }) }),
  });
  const req = () => new Request('https://x/?type=payment&data.id=99');
  await mk().handler(req());
  await mk().handler(req());
  run('el mismo webhook dos veces -> una sola notificación', () =>
    assert.equal(sb.__rpcCalls.filter(c => c.args.p_type === 'order_paid').length, 1));
}

// 10. Rechazado
{
  const r = await scenario('rechazado', {
    orders: [pendingOrder(A, 5000)], stores: [STORE],
    payment: { id: 99, status: 'rejected', transaction_amount: 5000, external_reference: A },
  });
  run('pago rechazado -> rejected', () => assert.equal(r.orders[0].payment_status, 'rejected'));
}

// 11. Dos tiendas con el mismo mp_collector_id -> no confirma en silencio, lo loguea
{
  const r = await scenario('collector duplicado', {
    orders: [pendingOrder(A, 5000)],
    stores: [{ id: 's1', owner_id: 'o1', mp_collector_id: 'MP7' }, { id: 's2', owner_id: 'o2', mp_collector_id: 'MP7' }],
    payment: { id: 99, status: 'approved', transaction_amount: 5000, external_reference: A },
    query: '&user_id=MP7',
  });
  run('mp_collector_id en dos tiendas -> no marca paid y deja rastro', () => {
    assert.equal(r.orders[0].payment_status, 'pending');
    assert.ok(r.logs.error.some(l => l.includes('más de una tienda')), 'debe loguear el motivo');
  });
}
