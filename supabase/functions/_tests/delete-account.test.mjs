// Baja de cuenta: que borre en el orden correcto y no deje datos personales
// atrás. Correr con `node supabase/functions/_tests/delete-account.test.mjs`.
import assert from 'node:assert/strict';
import { makeFakeSupabase } from './fake-supabase.mjs';
import { loadEdgeFunction } from './load-edge.mjs';

const FN = new URL('../delete-account/index.ts', import.meta.url).pathname;
const ENV = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'srk',
};
const UID = 'user-1';

function run(name, fn) {
  try { fn(); console.log(`✅ ${name}`); }
  catch (e) { console.log(`❌ ${name}\n   ${e.message}`); process.exitCode = 1; }
}

/**
 * @param buckets  { bucket: ["archivo.png", ...] }
 * @param deleteUserFails  para probar qué pasa si la baja en sí falla
 */
async function call({ stores = [], orders = [], buckets = {}, deleteUserFails = false }) {
  const tables = { stores: stores.map(s => ({ ...s })), orders: orders.map(o => ({ ...o })) };
  const sb = makeFakeSupabase(tables);
  const removed = [];
  const order = [];

  sb.auth = {
    getUser: async () => ({ data: { user: { id: UID } }, error: null }),
    admin: {
      deleteUser: async () => {
        order.push('deleteUser');
        return deleteUserFails ? { error: { message: 'boom' } } : { error: null };
      },
    },
  };
  sb.storage = {
    from: (bucket) => ({
      list: async (prefix) => ({ data: (buckets[bucket] ?? []).map(name => ({ name })), error: null }),
      remove: async (paths) => {
        order.push(`remove:${bucket}`);
        removed.push(...paths);
        buckets[bucket] = [];
        return { error: null };
      },
    }),
  };
  // El count de la guarda de pedidos: el fake no implementa `head`, lo emula.
  const origFrom = sb.from;
  sb.from = (t) => {
    const q = origFrom(t);
    const origSelect = q.select;
    q.select = (cols, opts) => {
      if (opts?.head) {
        const filtered = tables.orders.filter(o => o.client_id === UID && ['paid','shipped','ready_for_pickup'].includes(o.status));
        return { eq: () => ({ in: () => Promise.resolve({ count: filtered.length, error: null }) }) };
      }
      return origSelect(cols);
    };
    return q;
  };

  const { handler } = loadEdgeFunction(FN, { env: ENV, createClient: () => sb, fetchImpl: async () => ({ ok: false }) });
  const res = await handler(new Request('https://x/', { method: 'POST' }));
  return { status: res.status, body: JSON.parse(await res.text()), removed, order };
}

console.log('--- delete-account ---\n');

// 1. Los adjuntos de soporte también se borran (capturas con datos personales)
{
  const r = await call({ buckets: { avatars: ['foto.png'], 'support-attachments': ['captura.png', 'dni.pdf'] } });
  run('borra avatars Y support-attachments', () => {
    assert.equal(r.status, 200);
    assert.ok(r.removed.includes(`${UID}/foto.png`), 'el avatar');
    assert.ok(r.removed.includes(`${UID}/captura.png`), 'la captura del reclamo');
    assert.ok(r.removed.includes(`${UID}/dni.pdf`), 'el pdf del reclamo');
  });
}

// 2. payment-proofs NO se toca: sus paths son por pedido y el pedido sobrevive
{
  const r = await call({ buckets: { avatars: [], 'payment-proofs': ['comprobante.jpg'] } });
  run('no toca payment-proofs (es del pedido, no de la persona)', () =>
    assert.ok(!r.removed.some(p => p.includes('comprobante')), 'el comprobante queda'));
}

// 3. La cuenta se borra ANTES que los archivos
{
  const r = await call({ buckets: { avatars: ['foto.png'] } });
  run('borra la cuenta antes que los archivos', () => {
    assert.equal(r.order[0], 'deleteUser', `orden real: ${r.order.join(' -> ')}`);
  });
}

// 4. Si la baja falla, no se perdió ningún archivo por el camino
{
  const r = await call({ buckets: { avatars: ['foto.png'] }, deleteUserFails: true });
  run('si la baja falla, la foto de perfil sigue estando', () => {
    assert.equal(r.status, 500);
    assert.equal(r.removed.length, 0, 'no se borró nada');
  });
}

// 5. Guardas
{
  const r = await call({ stores: [{ id: 's1', owner_id: UID, name: 'Gogo' }] });
  run('con comercio -> 409 y no borra nada', () => {
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'tiene_tienda');
    assert.equal(r.order.length, 0);
  });
}
{
  const r = await call({ orders: [{ id: 'o1', client_id: UID, status: 'paid' }] });
  run('con un pedido en curso -> 409 y no borra nada', () => {
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'pedidos_abiertos');
    assert.equal(r.order.length, 0);
  });
}
