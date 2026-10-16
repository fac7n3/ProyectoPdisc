// Armado de la preferencia de pago: que lo que llega en el body no pueda
// romper la función ni confundir al usuario con un error equivocado.
// Correr con `node supabase/functions/_tests/mp-create-preference.test.mjs`.
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { makeFakeSupabase } from './fake-supabase.mjs';
import { loadEdgeFunction } from './load-edge.mjs';

const FN = fileURLToPath(new URL('../mp-create-preference/index.ts', import.meta.url));
const ENV = {
  MP_ACCESS_TOKEN: 'TOKEN_GLOBAL', SITE_URL: 'https://sitio',
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'srk', MP_CLIENT_ID: 'cid', MP_CLIENT_SECRET: 'csec',
};
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

function run(name, fn) {
  try { fn(); console.log(`✅ ${name}`); }
  catch (e) { console.log(`❌ ${name}\n   ${e.message}`); process.exitCode = 1; }
}

async function call(body, { orders = [], stores = [], creds = [] } = {}) {
  const tables = {
    orders: orders.map(o => ({ ...o })), stores: stores.map(s => ({ ...s })),
    store_mp_credentials: creds.map(c => ({ ...c })),
  };
  const sb = makeFakeSupabase(tables);
  sb.auth = { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c', user_metadata: {} } } }) };
  let prefBody = null, prefAuth = null;
  const { handler } = loadEdgeFunction(FN, {
    env: ENV, createClient: () => sb,
    fetchImpl: async (url, init) => {
      prefBody = JSON.parse(init.body);
      prefAuth = init.headers.Authorization;
      return { ok: true, json: async () => ({ init_point: 'https://mp/ok', sandbox_init_point: 'https://mp/sb' }) };
    },
  });
  const res = await handler(new Request('https://x/', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, body: JSON.parse(await res.text()), prefBody, prefAuth };
}

const order = (id, total) => ({
  id, store_id: 's1', total_price: total, payment_method: 'mercadopago', payment_status: 'pending',
});
const STORE = { id: 's1', mp_collector_id: null };

console.log('--- mp-create-preference ---\n');

// 1. Un order_ids que no son uuids: 400 claro, no un 500 "Error interno"
{
  const r = await call({ order_ids: [123, { id: 'x' }, 'no-soy-un-uuid'] });
  run('order_ids sin uuids -> 400 explicando qué pasó', () => {
    assert.equal(r.status, 400);
    assert.match(r.body.error, /identificador válido/);
  });
}

// 2. Duplicados: no debe responder "no te pertenece"
{
  const r = await call({ order_ids: [A, A] }, { orders: [order(A, 5000)], stores: [STORE] });
  run('order_ids duplicados -> se deduplica y crea la preferencia', () => {
    assert.equal(r.status, 200, `respondió ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.prefBody.external_reference, A);
    assert.equal(r.prefBody.items.length, 1);
  });
}

// 3. El precio sale de la base, no del body
{
  const r = await call(
    { order_ids: [A], total_price: 1 },
    { orders: [order(A, 8400)], stores: [STORE] },
  );
  run('el monto sale de la orden, no del body', () => {
    assert.equal(r.prefBody.items[0].unit_price, 8400);
  });
}

// 4. Una orden que no está pendiente no se puede volver a cobrar
{
  const r = await call({ order_ids: [A] }, {
    orders: [{ ...order(A, 5000), payment_status: 'paid' }], stores: [STORE],
  });
  run('orden ya pagada -> 400', () => assert.equal(r.status, 400));
}

// 5. Una orden que no existe (o es de otro) -> 403
{
  const r = await call({ order_ids: [A, B] }, { orders: [order(A, 5000)], stores: [STORE] });
  run('una orden ajena o inexistente -> 403', () => assert.equal(r.status, 403));
}

// 6. Body vacío
{
  const r = await call({ order_ids: [] });
  run('order_ids vacío -> 400', () => assert.equal(r.status, 400));
}

// 7. Tope de órdenes por preferencia
{
  const many = Array.from({ length: 60 }, (_, i) =>
    `${String(i).padStart(8, '0')}-1111-1111-1111-111111111111`);
  const r = await call({ order_ids: many });
  run('demasiadas órdenes -> 400', () => {
    assert.equal(r.status, 400);
    assert.match(r.body.error, /Demasiados/);
  });
}

// 8. Comercio con la cuenta vinculada: se cobra con SU token y con la comisión,
//    sin ningún flag de piloto aparte (vinculada = habilitada)
{
  const far = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const r = await call({ order_ids: [A] }, {
    orders: [order(A, 10000)], stores: [{ id: 's1', mp_collector_id: '777' }],
    creds: [{ store_id: 's1', access_token: 'TOKEN_VENDEDOR', refresh_token: 'rt', expires_at: far }],
  });
  run('tienda con MP vinculado -> preferencia con el token del vendedor y marketplace_fee', () => {
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.prefAuth, 'Bearer TOKEN_VENDEDOR');
    assert.equal(r.prefBody.marketplace_fee, 0);
  });
}

// 9. Una tienda vinculada no comparte preferencia con otras (distinto access_token)
{
  const r = await call({ order_ids: [A, B] }, {
    orders: [order(A, 5000), { ...order(B, 3000), store_id: 's2' }],
    stores: [{ id: 's1', mp_collector_id: '777' }, { id: 's2', mp_collector_id: null }],
  });
  run('vinculada + otra tienda en el mismo pago -> 400 claro', () => {
    assert.equal(r.status, 400);
    assert.match(r.body.error, /por separado/);
  });
}
