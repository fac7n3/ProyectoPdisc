// Pago de un combo de "Impulsá tus ventas": que el precio no se pueda tocar
// desde afuera y que cada error de la base llegue con su mensaje y su status.
// Correr con `node supabase/functions/_tests/mp-create-boost-preference.test.mjs`.
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { makeFakeSupabase } from './fake-supabase.mjs';
import { loadEdgeFunction } from './load-edge.mjs';

const FN = fileURLToPath(new URL('../mp-create-boost-preference/index.ts', import.meta.url));
const ENV = {
  MP_ACCESS_TOKEN: 'TOKEN_GLOBAL', SITE_URL: 'https://sitio',
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon',
};
const STORE = '11111111-1111-1111-1111-111111111111';
const PURCHASE = '33333333-3333-3333-3333-333333333333';

function run(name, fn) {
  try { fn(); console.log(`✅ ${name}`); }
  catch (e) { console.log(`❌ ${name}\n   ${e.message}`); process.exitCode = 1; }
}

async function call(body, { user = { id: 'u1', email: 'a@b.c', user_metadata: { full_name: 'Ana Pérez' } }, rpc, mpOk = true } = {}) {
  const sb = makeFakeSupabase({}, {
    create_boost_purchase: rpc ?? (() => ({ data: [{ purchase_id: PURCHASE, price: 19900, plan_name: 'Combo Barrio' }], error: null })),
  });
  sb.auth = { getUser: async () => ({ data: { user } }) };
  let pref = null;
  let usedKey = null;
  const { handler, logs } = loadEdgeFunction(FN, {
    env: ENV,
    createClient: (_url, key) => { usedKey = key; return sb; },
    fetchImpl: async (url, init) => {
      pref = { url, headers: init.headers, body: JSON.parse(init.body) };
      return mpOk
        ? { ok: true, json: async () => ({ init_point: 'https://mp/ok', sandbox_init_point: 'https://mp/sb' }) }
        : { ok: false, json: async () => ({ message: 'x' }) };
    },
  });
  const res = await handler(new Request('https://x/', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));
  return { status: res.status, body: JSON.parse(await res.text()), pref, rpcs: sb.__rpcCalls, usedKey, logs };
}

console.log('--- mp-create-boost-preference ---\n');

{
  const r = await call({ store_id: STORE, plan_id: 'barrio' });
  run('compra válida -> devuelve el link de pago', () => {
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.init_point, 'https://mp/ok');
  });
  run('el monto sale de la base (create_boost_purchase), no del body', () => {
    assert.equal(r.pref.body.items[0].unit_price, 19900);
    assert.equal(r.pref.body.items[0].title, 'Combo Barrio - Baradero Local');
    assert.equal(JSON.stringify(r.rpcs[0].args), JSON.stringify({ p_store_id: STORE, p_plan_id: 'barrio' }));
  });
  run('se cobra con el token de la plataforma y la referencia identifica la compra', () => {
    assert.equal(r.pref.headers.Authorization, 'Bearer TOKEN_GLOBAL');
    assert.equal(r.pref.body.external_reference, `boost:${PURCHASE}`);
    assert.match(r.pref.body.back_urls.success, /vender\.html\?boost=success#impulsar$/);
    assert.equal(r.pref.body.notification_url, 'https://x.supabase.co/functions/v1/mp-webhook');
  });
  run('corre con la clave anónima + JWT del usuario (nunca service role)', () => {
    assert.equal(r.usedKey, 'anon');
  });
}
{
  // Un body con "price" no cambia nada: la función ni lo lee.
  const r = await call({ store_id: STORE, plan_id: 'barrio', price: 1, unit_price: 1 });
  run('un price en el body se ignora', () => assert.equal(r.pref.body.items[0].unit_price, 19900));
}
{
  const r = await call({ store_id: 'no-uuid', plan_id: 'barrio' });
  run('store_id inválido -> 400, no llega a la base', () => {
    assert.equal(r.status, 400); assert.equal(r.rpcs.length, 0);
  });
}
{
  const r = await call({ store_id: STORE, plan_id: "'; drop table x;--" });
  run('plan_id raro -> 400', () => { assert.equal(r.status, 400); assert.equal(r.rpcs.length, 0); });
}
{
  const r = await call('esto no es json');
  run('body que no es JSON -> 400 (no 500)', () => assert.equal(r.status, 400));
}
{
  const r = await call({ store_id: STORE, plan_id: 'barrio' }, { user: null });
  run('sin sesión -> 401', () => assert.equal(r.status, 401));
}
for (const [code, status] of [['42501', 403], ['P0002', 404], ['23505', 409], ['28000', 401]]) {
  const r = await call({ store_id: STORE, plan_id: 'barrio' }, {
    rpc: () => ({ data: null, error: { code, message: `mensaje ${code}` } }),
  });
  run(`error ${code} de la base -> ${status} con su mensaje`, () => {
    assert.equal(r.status, status);
    assert.equal(r.body.error, `mensaje ${code}`);
    assert.equal(r.pref, null, 'no debe pedirle nada a Mercado Pago');
  });
}
{
  const r = await call({ store_id: STORE, plan_id: 'barrio' }, {
    rpc: () => ({ data: null, error: { code: 'XX000', message: 'detalle interno de postgres' } }),
  });
  run('error inesperado de la base -> 500 genérico, sin filtrar el detalle', () => {
    assert.equal(r.status, 500);
    assert.doesNotMatch(r.body.error, /postgres/);
  });
}
{
  const r = await call({ store_id: STORE, plan_id: 'barrio' }, { mpOk: false });
  run('Mercado Pago rechaza la preferencia -> 502', () => assert.equal(r.status, 502));
}
