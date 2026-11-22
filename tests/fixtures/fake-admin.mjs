// In-memory stand-in for the Supabase admin client, enough for the MCP tools and routines.
import { randomUUID } from 'node:crypto';

export function fakeAdmin(seed = {}) {
  const tables = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const calls = [];
  let seq = 1;
  const rows = (t) => (tables[t] ||= []);

  function builder(table) {
    const st = { op: 'select', filters: [], single: null, limit: null, order: null, returning: false };
    const api = {
      select(cols, opts) { if (st.op === 'select') { st.cols = cols; st.head = opts?.head; st.count = opts?.count; } else st.returning = true; return api; },
      insert(v) { st.op = 'insert'; st.values = Array.isArray(v) ? v : [v]; return api; },
      update(v) { st.op = 'update'; st.values = v; return api; },
      delete() { st.op = 'delete'; return api; },
      eq(k, v) { st.filters.push((r) => r[k] === v); return api; },
      neq(k, v) { st.filters.push((r) => r[k] !== v); return api; },
      is(k, v) { st.filters.push((r) => (r[k] ?? null) === v); return api; },
      in(k, v) { st.filters.push((r) => v.includes(r[k])); return api; },
      gte(k, v) { st.filters.push((r) => r[k] >= v); return api; },
      lte(k, v) { st.filters.push((r) => r[k] <= v); return api; },
      lt(k, v) { st.filters.push((r) => r[k] < v); return api; },
      or() { return api; },
      order(k, o = {}) { st.order = [k, o.ascending !== false]; return api; },
      limit(n) { st.limit = n; return api; },
      maybeSingle() { st.single = 'maybe'; return api; },
      single() { st.single = 'one'; return api; },
      then(res, rej) { return Promise.resolve().then(run).then(res, rej); },
    };
    const run = () => {
      calls.push({ table, op: st.op });
      const match = (r) => st.filters.every((f) => f(r));
      let out;
      if (st.op === 'insert') {
        out = st.values.map((v) => {
          const r = { id: v.id ?? (table === 'mcp_edit_log' ? seq++ : randomUUID()), created_at: new Date().toISOString(), ...defaults(table), ...v };
          rows(table).push(r); return r;
        });
      } else if (st.op === 'update') {
        out = rows(table).filter(match);
        out.forEach((r) => Object.assign(r, st.values));
      } else if (st.op === 'delete') {
        out = rows(table).filter(match);
        tables[table] = rows(table).filter((r) => !match(r));
      } else {
        out = rows(table).filter(match);
        if (st.order) { const [k, asc] = st.order; out = [...out].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (asc ? 1 : -1)); }
        if (st.limit) out = out.slice(0, st.limit);
        if (st.head) return { data: null, count: out.length, error: null };
      }
      out = out.map((r) => ({ ...r }));
      if (st.single === 'one') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'Expected one row' } };
      if (st.single === 'maybe') return { data: out[0] ?? null, error: null };
      return { data: out, error: null };
    };
    return api;
  }

  return {
    tables, calls,
    from: (t) => builder(t),
    rpc: async (name, args) => { calls.push({ rpc: name, args }); return { data: (tables.__rpc?.[name] || []).filter((r) => r.owner_id === args.p_owner), error: null }; },
  };
}

function defaults(table) {
  if (table === 'approvals') return { version: 1, status: 'pending', trashed_at: null };
  if (['content_items', 'brain_facts', 'goals', 'agents', 'offers'].includes(table)) return { version: 1 };
  return {};
}
