// Fake Supabase (auth + PostgREST) behind globalThis.fetch, so the real supabase-js client and
// the real /api handlers run end to end. Requests with the user's token see only their own rows
// (a stand-in for row level security); requests with the service key see everything.
// Calls to any other host go to the `external` handler, so provider APIs can be stubbed per test.
import { randomUUID } from 'node:crypto';

export const SB = 'https://fake.supabase.co';
export const OWNER = { id: '11111111-1111-1111-1111-111111111111', email: 'owner@ciftron.com' };
export const STRANGER = { id: '33333333-3333-3333-3333-333333333333', email: 'stranger@example.com' };
export const MEMBER = { id: '44444444-4444-4444-4444-444444444444', email: 'member@example.com' };
export const MEMBER_TOKEN = 'user-jwt-member';
export const USER_TOKEN = 'user-jwt-owner';
export const STRANGER_TOKEN = 'user-jwt-stranger';
const SERVICE = 'service-role-key';
const VERSIONED = ['offers', 'brain_facts', 'agents', 'approvals', 'content_items', 'funnels', 'email_sequences', 'brand_board', 'programs', 'goals'];
const BROWSER_DENIED = ['provider_keys'];
const IDENTITY = ['audit_log', 'hl_write_log', 'mcp_edit_log', 'error_log'];

export function installFakeSupabase({ seed = {}, external } = {}) {
  process.env.SUPABASE_URL = SB;
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
  process.env.OWNER_EMAIL = OWNER.email;
  const tables = structuredClone(seed);
  const log = [];
  let seq = 1000;
  const realFetch = globalThis.fetch;

  const rows = (t) => (tables[t] ||= []);
  const json = (body, status = 200, headers = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

  function parseFilters(params) {
    const fs = [];
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
      if (k === 'or') continue;
      const m = v.match(/^(eq|neq|is|in|gte|lte|lt|gt|ilike)\.(.*)$/s);
      if (!m) continue;
      const [, op, raw] = m;
      fs.push((r) => {
        const x = r[k];
        const s = x === null || x === undefined ? null : typeof x === 'object' ? JSON.stringify(x) : String(x);
        if (op === 'eq') return s === raw;
        if (op === 'neq') return s !== raw;
        if (op === 'is') return raw === 'null' ? x == null : String(x) === raw;
        if (op === 'in') return raw.replace(/^\(|\)$/g, '').split(',').map((y) => y.replace(/^"|"$/g, '')).includes(s);
        if (op === 'gte') return s >= raw;
        if (op === 'lte') return s <= raw;
        if (op === 'lt') return s < raw;
        if (op === 'gt') return s > raw;
        return true;
      });
    }
    return (r) => fs.every((f) => f(r));
  }

  function project(r, select) {
    if (!select || select === '*' || select.includes('*')) return { ...r };
    const cols = select.split(',').map((c) => c.trim()).filter((c) => c && !c.includes('('));
    return Object.fromEntries(cols.map((c) => [c, r[c] ?? null]));
  }

  async function rest(url, init, who) {
    const path = url.pathname.replace('/rest/v1/', '');
    const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const prefer = headers.get('prefer') || '';
    const single = (headers.get('accept') || '').includes('vnd.pgrst.object');
    const body = init.body ? JSON.parse(init.body) : undefined;
    log.push({ method, path, who: who.role, search: url.search, body });

    if (path.startsWith('rpc/')) {
      const fn = tables.__rpc?.[path.slice(4)];
      return json(fn ? fn(body, who) : []);
    }
    const t = path;
    if (who.role === 'user' && !who.owner && method !== 'GET' && ['connections', 'profiles'].includes(t)) return json({ message: 'new row violates row-level security policy', code: '42501' }, 403);
    if (who.role === 'user' && BROWSER_DENIED.includes(t)) return json({ message: `permission denied for table ${t}`, code: '42501' }, 403);
    const scoped = (r) => who.role === 'service' || !('owner_id' in r) || r.owner_id === who.id;
    const match = parseFilters(url.searchParams);
    const select = url.searchParams.get('select');
    const finish = (out, status = 200) => {
      out = out.map((r) => project(r, select));
      if (single) return out.length === 1 ? json(out[0], status) : json({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, 406);
      return json(prefer.includes('return=minimal') && method !== 'GET' ? undefined : out, status);
    };

    if (method === 'GET' || method === 'HEAD') {
      let out = rows(t).filter((r) => scoped(r) && match(r));
      const order = url.searchParams.get('order');
      if (order) {
        const [col, dir] = order.split(',')[0].split('.');
        out = [...out].sort((a, b) => ((a[col] ?? '') > (b[col] ?? '') ? 1 : (a[col] ?? '') < (b[col] ?? '') ? -1 : 0) * (dir === 'desc' ? -1 : 1));
      }
      const total = out.length;
      const limit = url.searchParams.get('limit');
      if (limit) out = out.slice(0, +limit);
      if (method === 'HEAD' || prefer.includes('count=exact')) {
        return new Response(method === 'HEAD' ? null : JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json', 'content-range': `0-${Math.max(0, out.length - 1)}/${total}` } });
      }
      return finish(out);
    }

    if (method === 'POST') {
      const items = [].concat(body);
      const conflict = url.searchParams.get('on_conflict')?.split(',');
      const out = [];
      for (const item of items) {
        const r = { ...item };
        if (who.role === 'user') { r.owner_id ??= who.id; if (r.owner_id !== who.id) return json({ message: 'new row violates row-level security policy', code: '42501' }, 403); }
        if (conflict) {
          const existing = rows(t).find((x) => conflict.every((c) => x[c] === r[c]));
          if (existing) {
            if (prefer.includes('ignore-duplicates')) continue;
            Object.assign(existing, r); out.push(existing); continue;
          }
        }
        const row = { id: IDENTITY.includes(t) ? seq++ : randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(VERSIONED.includes(t) ? { version: 1 } : {}), ...(t === 'approvals' ? { status: 'pending', trashed_at: null, tags: [] } : {}), ...r };
        rows(t).push(row); out.push(row);
      }
      return finish(out, 201);
    }

    if (method === 'PATCH') {
      const hit = rows(t).filter((r) => scoped(r) && match(r));
      for (const r of hit) {
        if (VERSIONED.includes(t) && 'version' in body && body.version !== r.version + 1) return json({ message: `version_conflict: row ${r.id}`, code: '40001' }, 409);
        Object.assign(r, body);
      }
      return finish(hit);
    }

    if (method === 'DELETE') {
      const hit = rows(t).filter((r) => scoped(r) && match(r));
      tables[t] = rows(t).filter((r) => !hit.includes(r));
      return finish(hit);
    }
    return json({ message: 'unsupported' }, 400);
  }

  globalThis.fetch = async (input, init = {}) => {
    const req = input instanceof Request ? input : null;
    const url = new URL(req ? req.url : String(input));
    if (req) init = { method: req.method, headers: req.headers, body: req.body ? await req.text() : undefined, ...init };
    if (url.origin !== SB) {
      log.push({ external: url.href, method: init.method || 'GET', body: init.body });
      if (external) return external(url, init);
      return new Response('{"error":"no external stub"}', { status: 500 });
    }
    const auth = new Headers(init.headers).get('authorization') || '';
    const bearer = auth.replace(/^Bearer /, '');
    if (url.pathname.startsWith('/auth/v1/admin/users')) {
      if (bearer !== SERVICE) return json({ message: 'forbidden' }, 403);
      const users = (tables.__users ||= []);
      const method = (init.method || 'GET').toUpperCase();
      log.push({ auth: `${method} ${url.pathname}` });
      if (method === 'POST') {
        const { email } = JSON.parse(init.body);
        if (users.some((u) => u.email === email) || [OWNER.email, STRANGER.email].includes(email)) return json({ code: 422, msg: 'A user with this email address has already been registered', error_code: 'email_exists' }, 422);
        const u = { id: randomUUID(), email, aud: 'authenticated' };
        users.push(u);
        return json(u);
      }
      if (method === 'DELETE') { const id = url.pathname.split('/').pop(); tables.__users = users.filter((u) => u.id !== id); return json({}); }
      return json({ users: [...users, { ...STRANGER }], aud: 'authenticated' });
    }
    if (url.pathname === '/auth/v1/user') {
      if (bearer === USER_TOKEN) return json({ ...OWNER, aud: 'authenticated', role: 'authenticated' });
      if (bearer === MEMBER_TOKEN) return json({ ...MEMBER, aud: 'authenticated', role: 'authenticated' });
      if (bearer === STRANGER_TOKEN) return json({ ...STRANGER, aud: 'authenticated', role: 'authenticated' });
      return json({ message: 'invalid JWT' }, 401);
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      // A member works in the owner's workspace (workspace_owner() in the real database).
      const memberOf = (tables.workspace_members || []).find((m) => m.member_id === MEMBER.id)?.owner_id;
      const who = bearer === SERVICE ? { role: 'service' } : bearer === USER_TOKEN ? { role: 'user', id: OWNER.id, owner: true }
        : bearer === MEMBER_TOKEN ? { role: 'user', id: memberOf || MEMBER.id, owner: false } : { role: 'anon' };
      if (who.role === 'anon') return json([], 200);
      return rest(url, init, who);
    }
    return json({ message: 'not found' }, 404);
  };

  return { tables, log, restore: () => { globalThis.fetch = realFetch; } };
}

// Calls a Vercel-style handler and returns { status, body, headers }.
export async function invoke(fn, { method = 'POST', body, token = USER_TOKEN, headers = {}, url = '/api/x', query } = {}) {
  const res = {
    statusCode: 200, body: undefined, headers: {}, headersSent: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; this.headersSent = true; return this; },
    send(b) { try { this.body = typeof b === 'string' ? JSON.parse(b) : b; } catch { this.body = b; } this.headersSent = true; return this; },
    end() { this.headersSent = true; return this; },
  };
  await fn({ method, url, body, ...(query ? { query } : {}), headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } }, res);
  return { status: res.statusCode, body: res.body, headers: res.headers };
}
