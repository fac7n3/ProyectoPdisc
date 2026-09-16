/** Supabase en memoria: lo justo para correr la lógica de mp-webhook. */
export function makeFakeSupabase(tables) {
  const rpcCalls = [];

  function builder(table) {
    let rows = tables[table] ?? [];
    let mode = null, patch = null, filters = [], limit = null, selectAfterWrite = false;

    const match = (r) => filters.every((f) =>
      f.op === 'eq'  ? r[f.col] === f.val
    : f.op === 'neq' ? r[f.col] !== f.val
    : f.op === 'in'  ? f.val.includes(r[f.col])
    : true);

    function run() {
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
      const p = Promise.resolve({ data: null, error: null });
      return { then: (ok, err) => p.then(ok, err) };
    },
    storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) },
    __rpcCalls: rpcCalls,
  };
}
