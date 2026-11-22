// Request handling shared by every server function: JSON in/out, owner-only auth.
import { createClient } from '@supabase/supabase-js';
import { logError, redact } from './errors.js';

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

const env = (k) => {
  const v = process.env[k];
  if (!v) throw new HttpError(500, `Server is missing the ${k} environment variable`);
  return v;
};

// Accepts https://ref.supabase.co with or without a trailing slash, /rest/v1 or other path.
export function supabaseUrl(raw = process.env.SUPABASE_URL) {
  if (!raw) throw new HttpError(500, 'Server is missing the SUPABASE_URL environment variable');
  const s = raw.trim();
  const ref = s.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (ref) return `https://${ref[1]}.supabase.co`;
  try { return new URL(s).origin; } catch { throw new HttpError(500, 'SUPABASE_URL is not a valid URL'); }
}

export const adminClient = () => createClient(supabaseUrl(), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

// A Supabase client that acts as the signed-in user, so row level security applies.
export const userClient = (token) => createClient(supabaseUrl(), env('SUPABASE_ANON_KEY'), {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${token}` } },
});

export async function requireOwner(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw new HttpError(401, 'Sign in first');
  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Session expired. Sign in again.');
  const owner = env('OWNER_EMAIL').trim().toLowerCase();
  if ((data.user.email || '').toLowerCase() !== owner) throw new HttpError(403, 'This OS has a single owner');
  req.ownerId = data.user.id;
  return { user: data.user, db: userClient(token), admin };
}

export function handler(methods, fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!methods.includes(req.method)) throw new HttpError(405, 'Method not allowed');
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const out = await fn(req, body, res);
      if (!res.headersSent) res.status(200).json(out ?? { ok: true });
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) {
        let admin = null;
        try { admin = adminClient(); } catch { /* env missing: console only */ }
        const action = typeof req.body === 'object' && req.body ? req.body.action : undefined;
        await logError(admin, { ownerId: req.ownerId || null, source: 'server', route: String(req.url || '').split('?')[0], status, error: e, detail: { method: req.method, action } });
      }
      res.status(status).json({ error: redact(e.message || 'Server error'), ...(e.extra || {}) });
    }
  };
}

export async function audit(db, userId, action, entity, entityId, detail = {}) {
  await db.from('audit_log').insert({ owner_id: userId, action, entity, entity_id: entityId ? String(entityId) : null, detail });
}
