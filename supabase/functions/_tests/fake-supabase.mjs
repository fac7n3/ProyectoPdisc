/** Supabase en memoria: lo justo para correr la lógica de mp-webhook. */
/**
 * `rpcHandlers` (opcional): { nombreDelRpc: (args) => ({ data, error }) } para los
 * tests que necesitan que un rpc devuelva algo; sin handler devuelve { data: null }.
 */
export function makeFakeSupabase(tables, rpcHandlers = {}) {
  const rpcCalls = [];

  function builder(table) {
    const rows = (tables[table] ??= []);
    let mode = null, patch = null, filters = [], limit = null, selectAfterWrite = false;

    const match = (r) => filters.every((f) =>
      f.op === 'eq'  ? r[f.col] === f.val
    : f.op === 'neq' ? r[f.col] !== f.val
    : f.op === 'in'  ? f.val.includes(r[f.col])
    : f.op === 'lt'  ? r[f.col] < f.val
    : true);

    function run() {
      if (mode === 'insert') {
        rows.push({ ...patch });
        return { data: null, error: null };
      }
      if (mode === 'upsert') {
        // la clave es la primera columna del objeto (store_id, en lo que se usa hoy)
        const key = Object.keys(patch)[0];
        const at = rows.findIndex((r) => r[key] === patch[key]);
        if (at >= 0) Object.assign(rows[at], patch); else rows.push({ ...patch });
        return { data: null, error: null };
      }
      if (mode === 'delete') {
        for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1);
        return { data: null, error: null };
      }
      let hit = rows.filter(match);
      if (mode === 'update') {
        hit.forEach((r) => Object.assign(r, patch));
      }
      if (limit != null) hit = hit.slice(0, limit);
      if (mode === 'update' && !selectAfterWrite) return { data: null, error: null };
      return { data: hit.map((r) => ({ ...r })), error: null };
    }

    const q = {
      select(_cols) { if (mode === 'update') selectAfterWrite = true; return q; },
      update(p) { mode = 'update'; patch = p; return q; },
      insert(p) { mode = 'insert'; patch = p; return q; },
      upsert(p) { mode = 'upsert'; patch = p; return q; },
      delete() { mode = 'delete'; return q; },
      lt(col, val) { filters.push({ op: 'lt', col, val }); return q; },
      eq(col, val) { filters.push({ op: 'eq', col, val }); return q; },
      neq(col, val) { filters.push({ op: 'neq', col, val }); return q; },
      in(col, val) { filters.push({ op: 'in', col, val }); return q; },
      limit(n) { limit = n; return q; },
      maybeSingle() {
        const { data } = run();
        if (data.length > 1) return Promise.resolve({ data: null, error: { message: 'multiple rows' } });
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
      single() {
        const { data } = run();
        return Promise.resolve(data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: 'not single' } });
      },
      then(res) { return Promise.resolve(run()).then(res); },
    };
    return q;
  }

  return {
    from: builder,
    rpc(name, args) {
      rpcCalls.push({ name, args });
      const handler = rpcHandlers[name];
      const p = Promise.resolve(handler ? handler(args) : { data: null, error: null });
      return { then: (ok, err) => p.then(ok, err) };
    },
    storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) },
    __rpcCalls: rpcCalls,
  };
}
