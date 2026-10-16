// Vinculación de Mercado Pago (A113-274): mp-oauth-start arma el `state` de un
// solo uso y mp-oauth-callback lo exige antes de canjear el code.
// Correr con `node supabase/functions/_tests/mp-oauth.test.mjs`.
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { makeFakeSupabase } from './fake-supabase.mjs';
import { loadEdgeFunction } from './load-edge.mjs';

const START = fileURLToPath(new URL('../mp-oauth-start/index.ts', import.meta.url));
const CALLBACK = fileURLToPath(new URL('../mp-oauth-callback/index.ts', import.meta.url));
const ENV = {
  SITE_URL: 'https://sitio', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'srk', MP_CLIENT_ID: 'cid', MP_CLIENT_SECRET: 'csec',
};
const S1 = '11111111-1111-1111-1111-111111111111';
const S2 = '22222222-2222-2222-2222-222222222222';

function run(name, fn) {
  try { fn(); console.log(`✅ ${name}`); }
  catch (e) { console.log(`❌ ${name}\n   ${e.message}`); process.exitCode = 1; }
}

function makeDb(extra = {}) {
  const tables = {
    stores: [
      { id: S1, name: 'Mía', owner_id: 'u1', mp_collector_id: null },
      { id: S2, name: 'Otra', owner_id: 'u2', mp_collector_id: '999' },
    ],
    mp_oauth_states: [], store_mp_credentials: [], ...extra,
  };
  const sb = makeFakeSupabase(tables);
  sb.auth = { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) };
  return { tables, sb };
}

async function start(body, { env = {}, db = makeDb() } = {}) {
  const { handler } = loadEdgeFunction(START, { env: { ...ENV, ...env }, createClient: () => db.sb });
  const res = await handler(new Request('https://x/', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, body: JSON.parse(await res.text()), tables: db.tables };
}

async function callback(body, { db = makeDb(), tokenRes } = {}) {
  const calls = [];
  const { handler } = loadEdgeFunction(CALLBACK, {
    env: ENV, createClient: () => db.sb,
    fetchImpl: async (url, init) => {
      calls.push(JSON.parse(init.body));
      return tokenRes ?? { ok: true, json: async () => ({ access_token: 'AT', refresh_token: 'RT', user_id: 12345, expires_in: 100 }) };
    },
  });
  const res = await handler(new Request('https://x/', { method: 'POST', body: JSON.stringify(body) }));
  return { status: res.status, body: JSON.parse(await res.text()), tables: db.tables, calls };
}

const future = () => new Date(Date.now() + 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

console.log('--- mp-oauth-start ---\n');

{
  const r = await start({ store_id: S1 });
  const url = new URL(r.body.url);
  run('dueño -> URL de MP con client_id, redirect_uri y un state guardado', () => {
    assert.equal(r.status, 200);
    assert.equal(url.origin + url.pathname, 'https://auth.mercadopago.com/authorization');
    assert.equal(url.searchParams.get('client_id'), 'cid');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://sitio/pages/vender.html');
    const state = url.searchParams.get('state');
    assert.ok(state && state.length >= 40, 'state corto o ausente');
    assert.notEqual(state, S1, 'el state no puede ser el id de la tienda');
    const row = r.tables.mp_oauth_states.find((s) => s.state === state);
    assert.equal(row.store_id, S1);
    assert.equal(row.user_id, 'u1');
    assert.ok(new Date(row.expires_at).getTime() > Date.now());
    assert.equal(url.searchParams.get('code_challenge'), null);
    assert.equal(row.code_verifier, null);
  });
}

{
  const r = await start({ store_id: S1 }, { env: { MP_OAUTH_PKCE: 'true' } });
  const url = new URL(r.body.url);
  run('con MP_OAUTH_PKCE manda code_challenge S256 y guarda el verifier', () => {
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(url.searchParams.get('code_challenge'));
    const row = r.tables.mp_oauth_states[0];
    assert.ok(row.code_verifier.length >= 43);
    assert.notEqual(url.searchParams.get('code_challenge'), row.code_verifier);
  });
}

{
  const r = await start({ store_id: S2 });
  run('tienda ajena -> 403 y no guarda ningún state', () => {
    assert.equal(r.status, 403);
    assert.equal(r.tables.mp_oauth_states.length, 0);
  });
}

{
  const r = await start({ store_id: 'no-uuid' });
  run('store_id inválido -> 400', () => assert.equal(r.status, 400));
}

{
  const db = makeDb({ mp_oauth_states: [{ state: 'viejo', store_id: S1, user_id: 'u1', expires_at: past() }] });
  const r = await start({ store_id: S1 }, { db });
  run('borra de paso los intentos vencidos', () => {
    assert.equal(r.tables.mp_oauth_states.some((s) => s.state === 'viejo'), false);
    assert.equal(r.tables.mp_oauth_states.length, 1);
  });
}

console.log('\n--- mp-oauth-callback ---\n');

const stateRow = (over = {}) => ({
  state: 'ST', store_id: S1, user_id: 'u1', code_verifier: null, expires_at: future(), ...over,
});

{
  const db = makeDb({ mp_oauth_states: [stateRow()] });
  const r = await callback({ code: 'C', state: 'ST' }, { db });
  run('state válido -> canjea, vincula la tienda del state y consume el state', () => {
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.mp_collector_id, '12345');
    assert.equal(r.tables.stores.find((s) => s.id === S1).mp_collector_id, '12345');
    assert.equal(r.tables.store_mp_credentials[0].store_id, S1);
    assert.equal(r.tables.mp_oauth_states.length, 0);
    assert.equal(r.calls[0].redirect_uri, 'https://sitio/pages/vender.html');
    assert.equal(r.calls[0].code_verifier, undefined);
  });
}

{
  const db = makeDb({ mp_oauth_states: [stateRow({ code_verifier: 'VERIF' })] });
  const r = await callback({ code: 'C', state: 'ST' }, { db });
  run('con PKCE manda el code_verifier guardado', () => assert.equal(r.calls[0].code_verifier, 'VERIF'));
}

{
  const r = await callback({ code: 'C', state: 'inventado' });
  run('state desconocido -> 400 y NO se llama a Mercado Pago', () => {
    assert.equal(r.status, 400);
    assert.equal(r.calls.length, 0);
  });
}

{
  const r = await callback({ code: 'C' });
  run('sin state -> 400', () => assert.equal(r.status, 400));
}

{
  // El ataque: el atacante arma un state propio (u2) y le hace llegar el link a la víctima (u1).
  const db = makeDb({ mp_oauth_states: [stateRow({ user_id: 'u2', store_id: S2 })] });
  const r = await callback({ code: 'CODE_DEL_ATACANTE', state: 'ST' }, { db });
  run('state de OTRO usuario -> 400, no vincula nada y el state queda consumido', () => {
    assert.equal(r.status, 400);
    assert.equal(r.calls.length, 0);
    assert.equal(r.tables.stores.find((s) => s.id === S1).mp_collector_id, null);
    assert.equal(r.tables.mp_oauth_states.length, 0);
  });
}

{
  const db = makeDb({ mp_oauth_states: [stateRow({ expires_at: past() })] });
  const r = await callback({ code: 'C', state: 'ST' }, { db });
  run('state vencido -> 400', () => {
    assert.equal(r.status, 400);
    assert.equal(r.calls.length, 0);
  });
}

{
  const db = makeDb({ mp_oauth_states: [stateRow()] });
  await callback({ code: 'C', state: 'ST' }, { db });
  const again = await callback({ code: 'C', state: 'ST' }, { db });
  run('un state no se puede usar dos veces', () => assert.equal(again.status, 400));
}

{
  const db = makeDb({ mp_oauth_states: [stateRow({ store_id: S2 })] });
  const r = await callback({ code: 'C', state: 'ST', store_id: S1 }, { db });
  run('el store_id sale del state, el del body se ignora (y se revalida el dueño)', () => {
    assert.equal(r.status, 403);
    assert.equal(r.tables.stores.find((s) => s.id === S1).mp_collector_id, null);
  });
}

{
  const db = makeDb({ mp_oauth_states: [stateRow()] });
  const r = await callback({ code: 'C', state: 'ST' }, {
    db, tokenRes: { ok: false, json: async () => ({ error: 'invalid_grant', message: 'x' }) },
  });
  run('si Mercado Pago rechaza el code -> 502 con el motivo, sin vincular', () => {
    assert.equal(r.status, 502);
    assert.equal(r.body.detail, 'invalid_grant');
    assert.equal(r.tables.stores.find((s) => s.id === S1).mp_collector_id, null);
  });
}

{
  const db = makeDb({ mp_oauth_states: [stateRow({ store_id: S1 })] });
  db.tables.stores.find((s) => s.id === S2).mp_collector_id = '12345';
  const r = await callback({ code: 'C', state: 'ST' }, { db });
  run('una cuenta de MP ya vinculada a otra tienda -> 409', () => assert.equal(r.status, 409));
}
