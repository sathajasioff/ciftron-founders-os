// Tella (recorded videos and transcripts) and custom read-only API connections.
// Custom connections only ever make GET requests to the https address the owner saved, never to private networks,
// and the saved key is redacted from anything returned.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

// ---------- Tella ----------
const TELLA = 'https://api.tella.com/v1';
async function tellaGet(key, path, fetchImpl = fetch) {
  const r = await fetchImpl(TELLA + path, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(r.status === 401 || r.status === 403 ? 'Tella rejected the API key. Check it in Connections.' : r.status === 429 ? 'Tella is rate limiting. Try again in a minute.' : `Tella: ${j.message || r.status}`);
    e.status = r.status === 401 || r.status === 403 ? 400 : 502;
    throw e;
  }
  return j;
}

export async function tellaList(key, { cursor, limit = 30, fetchImpl } = {}) {
  const qs = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, limit))) });
  if (cursor) qs.set('cursor', String(cursor).slice(0, 500));
  const j = await tellaGet(key, `/videos?${qs}`, fetchImpl);
  return {
    videos: (j.videos || []).map((v) => ({ id: String(v.id), name: String(v.name || 'Untitled').slice(0, 255), description: String(v.description || '').slice(0, 500), views: v.views ?? null, created_at: v.createdAt || null, url: v.links?.viewPage || null })),
    next: j.pagination?.hasMore ? j.pagination.nextCursor || null : null,
  };
}

export async function tellaVideo(key, id, { fetchImpl } = {}) {
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(String(id || ''))) { const e = new Error('Invalid Tella video'); e.status = 400; throw e; }
  const { video: v } = await tellaGet(key, `/videos/${id}`, fetchImpl);
  const tr = v?.transcript || {};
  return {
    id: v.id, name: v.name || 'Untitled', description: v.description || '', url: v.links?.viewPage || `https://www.tella.tv/video/${id}/view`,
    duration: v.durationSeconds ?? null, created_at: v.createdAt || null,
    chapters: (v.chapters || []).map((c) => ({ title: c.title, at: c.timestampSeconds })),
    transcript_status: tr.status || 'missing', transcript: tr.text || (tr.sentences || []).map((s) => s.text).join(' ') || '',
  };
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export function tellaText(v) {
  return [`Tella video: ${v.name}`, v.created_at ? `Recorded: ${v.created_at.slice(0, 10)}` : '', v.description ? `Description: ${v.description}` : '',
    v.chapters.length ? `Chapters:\n${v.chapters.map((c) => `- ${mmss(c.at || 0)} ${c.title}`).join('\n')}` : '', `Transcript:\n${v.transcript}`].filter(Boolean).join('\n\n');
}

// ---------- Custom connections ----------
export const AUTH_STYLES = ['bearer', 'header', 'query', 'none'];
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,59}$/;
const PARAM_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

function badHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h === 'metadata.google.internal' || (!h.includes('.') && !isIP(h));
}

// True for loopback, private, link-local, CGNAT, multicast and other non-public addresses.
export function privateIp(ip) {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x.startsWith('::ffff:')) return privateIp(x.slice(7));
    return x === '::' || x === '::1' || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith('ff') || x.startsWith('64:ff9b') || x.startsWith('2001:db8');
  }
  return true;
}

// Clean and check a connection the owner is saving.
export function validateConnection(c) {
  const name = String(c?.name || '').trim();
  if (!NAME_RE.test(name)) throw new Error('Name: letters, numbers, spaces, dots, dashes; up to 60 characters');
  let u;
  try { u = new URL(String(c?.base_url || '').trim()); } catch { throw new Error('Address must be a full https:// URL'); }
  if (u.protocol !== 'https:') throw new Error('Address must start with https://');
  if (u.username || u.password) throw new Error('Put the key in the key field, not in the address');
  if (badHost(u.hostname) || (isIP(u.hostname.replace(/^\[|\]$/g, '')) && privateIp(u.hostname.replace(/^\[|\]$/g, '')))) throw new Error('That address is on a private network. Only public APIs are allowed.');
  if (u.port && u.port !== '443') throw new Error('Only the standard https port is allowed');
  const auth = AUTH_STYLES.includes(c?.auth) ? c.auth : 'bearer';
  const auth_name = auth === 'header' || auth === 'query' ? String(c?.auth_name || '').trim() : null;
  if ((auth === 'header' || auth === 'query') && !PARAM_RE.test(auth_name || '')) throw new Error(auth === 'header' ? 'Header name, for example X-API-Key' : 'Query parameter name, for example api_key');
  if (auth === 'header' && /^(host|cookie|content-length|connection|transfer-encoding)$/i.test(auth_name)) throw new Error('That header cannot be used');
  const endpoints = (Array.isArray(c?.endpoints) ? c.endpoints : []).slice(0, 20).map((e) => ({ name: String(e?.name || '').trim().slice(0, 60), path: String(e?.path || '').trim().slice(0, 300) }))
    .filter((e) => e.name && e.path);
  for (const e of endpoints) cleanPath(e.path);
  return { name, base_url: u.origin + u.pathname.replace(/\/+$/, ''), auth, auth_name, endpoints };
}

function cleanPath(p) {
  const s = String(p || '').trim();
  if (!s.startsWith('/') || s.startsWith('//') || /\\|\.\.|@|#|[\s<>]/.test(s) || /^\/[a-z]+:/i.test(s)) throw new Error(`Path "${s.slice(0, 60)}" must start with / and stay on the same site`);
  return s;
}

// Build the request for a saved connection. The final URL must stay on the connection's origin and path.
export function buildRequest(conn, path, key) {
  const base = new URL(conn.base_url);
  const u = new URL(base.origin + base.pathname.replace(/\/+$/, '') + cleanPath(path));
  if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname.replace(/\/+$/, ''))) throw new Error('That path leaves the connection address');
  const headers = { Accept: 'application/json, text/plain;q=0.8, */*;q=0.5', 'User-Agent': 'FoundersOS/1.0' };
  if (key && conn.auth === 'bearer') headers.Authorization = `Bearer ${key}`;
  if (key && conn.auth === 'header') headers[conn.auth_name] = key;
  if (key && conn.auth === 'query') u.searchParams.set(conn.auth_name, key);
  return { url: u.toString(), headers };
}

const MAX_BYTES = 400000;
// DNS lookup, replaceable in tests.
export const net = { resolve: (h) => lookup(h, { all: true }) };
// GET only, no redirects, public addresses only, 10 seconds, capped size. Returns text with the key removed.
export async function safeGet(conn, path, key, { fetchImpl = fetch, resolve = net.resolve } = {}) {
  const { url, headers } = buildRequest(conn, path, key);
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (badHost(host)) throw new Error('That address is on a private network');
  const addrs = isIP(host) ? [{ address: host }] : await resolve(host).catch(() => { throw new Error(`Could not find ${host}`); });
  if (!addrs.length || addrs.some((a) => privateIp(a.address))) throw new Error('That address points to a private network. Only public APIs are allowed.');
  let r;
  try { r = await fetchImpl(url, { method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(10000) }); } catch (e) { throw new Error('Could not reach the API: ' + (e.name === 'TimeoutError' ? 'timed out after 10 seconds' : e.message)); }
  if (r.status >= 300 && r.status < 400) throw new Error(`The API redirected (${r.status}). Use the final address instead.`);
  let text = '';
  if (r.body?.getReader) {
    const reader = r.body.getReader(); const dec = new TextDecoder(); let n = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; text += dec.decode(value, { stream: true }); if (n > MAX_BYTES) { reader.cancel().catch(() => {}); text += '\n[cut: response too large]'; break; } }
  } else text = (await r.text()).slice(0, MAX_BYTES);
  if (key && key.length >= 6) text = text.split(key).join('[KEY HIDDEN]');
  const type = r.headers.get('content-type') || '';
  if (/json/.test(type)) { try { text = JSON.stringify(JSON.parse(text), null, 1); } catch { /* keep as is */ } }
  return { ok: r.ok, status: r.status, type: type.split(';')[0], text: text.slice(0, 60000), truncated: text.length > 60000 };
}
