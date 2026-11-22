// Error logging for server functions. Secrets are stripped before anything is stored,
// and logging never throws: a failed log must not turn into a second error.

// Patterns for keys and tokens this app handles, plus generic bearer tokens and JWTs.
const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bsk-(?:ant-|proj-|or-v1-)?[A-Za-z0-9_-]{12,}/g,
  /\bpit-[A-Za-z0-9-]{12,}/g,
  /\bcfos_[A-Za-z0-9_-]{20,}/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
  /\bEAA[A-Za-z0-9]{20,}/g,
  /\bapify_api_[A-Za-z0-9]{10,}/g,
  /\bAIza[A-Za-z0-9_-]{20,}/g,
  /\b(?:xi-api-key|api[_-]?key|token|secret|password)(["'\s:=]+)[^\s"',}]{8,}/gi,
];

export function redact(value) {
  let s = typeof value === 'string' ? value : value == null ? '' : (() => { try { return JSON.stringify(value); } catch { return String(value); } })();
  for (const p of SECRET_PATTERNS) s = s.replace(p, (m, sep) => (sep !== undefined && typeof sep === 'string' && /api|token|secret|password/i.test(m) ? m.slice(0, m.indexOf(sep) + sep.length) + '[redacted]' : '[redacted]'));
  return s;
}

// Redacts every string inside an object, and every value under a secret-looking key.
export function redactDeep(v, depth = 0) {
  if (depth > 5) return '[nested]';
  if (typeof v === 'string') return redact(v);
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => redactDeep(x, depth + 1));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).slice(0, 50).map(([k, x]) => [k, /key|token|secret|password|authorization|cookie/i.test(k) ? '[redacted]' : redactDeep(x, depth + 1)]));
  }
  return v;
}

const clip = (s, n) => (s.length > n ? s.slice(0, n) + '...' : s);

export function errorRow({ ownerId = null, source = 'server', route = null, status = null, error, detail = {} }) {
  const message = clip(redact(error?.message ?? error ?? 'Unknown error'), 1000) || 'Unknown error';
  const stack = error?.stack ? clip(redact(String(error.stack).split('\n').slice(1, 12).join('\n')), 3000) : undefined;
  let safeDetail = redactDeep({ ...detail, ...(stack ? { stack } : {}) });
  const json = JSON.stringify(safeDetail);
  if (json.length > 6000) safeDetail = { truncated: clip(json, 6000) };
  return { owner_id: ownerId, source, route: route ? clip(String(route), 200) : null, status, message, detail: safeDetail };
}

export async function logError(admin, info) {
  try {
    const row = errorRow(info);
    console.error(`[${row.source}] ${row.route || ''} ${row.message}`);
    if (!admin) return;
    await admin.from('error_log').insert(row);
  } catch (e) {
    console.error('Could not write error_log:', e?.message);
  }
}
