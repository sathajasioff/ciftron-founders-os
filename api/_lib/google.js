// Google: OAuth for the owner's own Google Cloud client, Calendar (read-only) and Meet transcripts.
// The refresh token is stored encrypted like every other key; nothing here sends or edits anything in Google.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { masterKey } from './crypto.js';

export const GOOGLE_SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/meetings.space.readonly',
];
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const MEET = 'https://meet.googleapis.com/v2';
const CAL = 'https://www.googleapis.com/calendar/v3';

export class GoogleError extends Error { constructor(message, status = 502) { super(message); this.status = status; } }

// The address Google sends you back to. Must match the redirect URI saved in Google Cloud exactly.
export function redirectUri(req, env = process.env) {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, '') + '/api/google';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${proto}://${host}/api/google`;
}

// Sign-in state: owner id + expiry + nonce, signed with a key derived from ENCRYPTION_KEY.
const stateKey = (key = masterKey()) => createHmac('sha256', key).update('google-oauth-state').digest();
const b64 = (b) => Buffer.from(b).toString('base64url');
export function signState(ownerId, { now = Date.now(), key } = {}) {
  const body = b64(JSON.stringify({ o: ownerId, e: now + 10 * 60 * 1000, n: randomBytes(9).toString('base64url') }));
  return `${body}.${b64(createHmac('sha256', stateKey(key)).update(body).digest())}`;
}
export function verifyState(state, { now = Date.now(), key } = {}) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) throw new GoogleError('Sign-in link is invalid. Start again from Connections.', 400);
  const want = createHmac('sha256', stateKey(key)).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new GoogleError('Sign-in link is invalid. Start again from Connections.', 400);
  const p = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (!p.o || p.e < now) throw new GoogleError('Sign-in link expired. Start again from Connections.', 400);
  return p.o;
}

export function authUrl({ clientId, redirect, state }) {
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: GOOGLE_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
  return `${AUTH}?${q}`;
}

async function tokenCall(params, fetchImpl) {
  const r = await fetchImpl(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (j.error === 'invalid_grant') throw new GoogleError('Google sign-in expired or was revoked. Click Sign in with Google again in Connections.', 400);
    if (j.error === 'invalid_client') throw new GoogleError('Google rejected the client ID or secret. Check them in Connections.', 400);
    throw new GoogleError(`Google token error: ${j.error_description || j.error || r.status}`);
  }
  return j;
}
export const exchangeCode = ({ clientId, clientSecret, code, redirect }, fetchImpl = fetch) =>
  tokenCall({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: 'authorization_code' }, fetchImpl);
export const refreshAccess = async ({ clientId, clientSecret, refreshToken }, fetchImpl = fetch) =>
  (await tokenCall({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }, fetchImpl)).access_token;

async function gget(token, url, fetchImpl, what) {
  const r = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error?.message || r.status;
    if (r.status === 403 && /has not been used|is disabled/i.test(String(msg))) throw new GoogleError(`${what}: turn on this API in your Google Cloud project (${String(msg).match(/https:\/\/\S+/)?.[0] || 'APIs & Services > Library'}).`, 400);
    if (r.status === 403) throw new GoogleError(`${what}: permission denied. Sign in with Google again and allow every requested permission.`, 400);
    throw new GoogleError(`${what}: ${msg}`);
  }
  return j;
}

// Calendar: your own events only. Titles and times, never attendee emails.
export async function calendarEvents(token, { from = new Date(), days = 7, fetchImpl = fetch } = {}) {
  const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: new Date(from.getTime() + days * 864e5).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '50' });
  const j = await gget(token, `${CAL}/calendars/primary/events?${q}`, fetchImpl, 'Google Calendar');
  return (j.items || []).filter((e) => e.status !== 'cancelled').map((e) => ({
    id: e.id, title: e.summary || '(no title)', start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date,
    all_day: !e.start?.dateTime, meet: !!(e.hangoutLink || e.conferenceData?.conferenceId), meeting_code: e.conferenceData?.conferenceId || null,
  }));
}
export const calendarText = (events, tz) => (events.length
  ? 'Calendar, next 7 days: ' + events.slice(0, 12).map((e) => `${e.title} (${e.all_day ? new Date(e.start + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : new Date(e.start).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz })})`).join('; ') + '.'
  : 'Calendar: nothing in the next 7 days.');

// Meet: recent calls that have a transcript, newest first. Titles come from the matching calendar event when there is one.
export async function meetRecent(token, { days = 30, now = new Date(), fetchImpl = fetch } = {}) {
  const since = new Date(now.getTime() - days * 864e5).toISOString();
  const recs = await gget(token, `${MEET}/conferenceRecords?pageSize=50&filter=${encodeURIComponent(`start_time>="${since}"`)}`, fetchImpl, 'Google Meet');
  let titles = {};
  try {
    const ev = await calendarEvents(token, { from: new Date(now.getTime() - days * 864e5), days: days + 1, fetchImpl });
    titles = Object.fromEntries(ev.filter((e) => e.meeting_code).map((e) => [e.meeting_code, e.title]));
  } catch { /* titles are a nicety */ }
  const out = [];
  for (const rec of recs.conferenceRecords || []) {
    const tr = await gget(token, `${MEET}/${rec.name}/transcripts`, fetchImpl, 'Google Meet');
    const done = (tr.transcripts || []).filter((t) => t.state === 'FILE_GENERATED' || t.state === 'ENDED');
    if (!done.length) continue;
    let code = null;
    try { code = (await gget(token, `${MEET}/${rec.space}`, fetchImpl, 'Google Meet')).meetingCode || null; } catch { /* optional */ }
    for (const t of done) {
      out.push({ record: rec.name, transcript: t.name, start: rec.startTime, end: rec.endTime || null, title: (code && titles[code]) || `Meet call ${new Date(rec.startTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` });
    }
  }
  return out.sort((a, b) => String(b.start).localeCompare(String(a.start)));
}

// Full transcript with speaker names, as "Name: text" lines.
export async function meetTranscript(token, { record, transcript }, fetchImpl = fetch) {
  const names = {};
  let page = '';
  do {
    const p = await gget(token, `${MEET}/${record}/participants?pageSize=100${page ? `&pageToken=${page}` : ''}`, fetchImpl, 'Google Meet');
    for (const x of p.participants || []) names[x.name] = x.signedinUser?.displayName || x.anonymousUser?.displayName || x.phoneUser?.displayName || 'Guest';
    page = p.nextPageToken || '';
  } while (page);
  const lines = [];
  page = '';
  let first = null, last = null, n = 0;
  do {
    const e = await gget(token, `${MEET}/${transcript}/entries?pageSize=100${page ? `&pageToken=${page}` : ''}`, fetchImpl, 'Google Meet');
    for (const x of e.transcriptEntries || []) {
      const who = names[x.participant] || 'Speaker';
      const prev = lines[lines.length - 1];
      if (prev && prev.who === who) prev.text += ' ' + x.text; else lines.push({ who, text: x.text });
      first ??= x.startTime; last = x.endTime || last;
    }
    page = e.nextPageToken || '';
    if (++n > 60) break; // 6,000 entries is about four hours of talk
  } while (page);
  const text = lines.map((l) => `${l.who}: ${l.text}`).join('\n');
  if (!text.trim()) throw new GoogleError('This transcript is empty or not ready yet.', 400);
  return { text, speakers: [...new Set(lines.map((l) => l.who))], duration_min: first && last ? Math.max(1, Math.round((new Date(last) - new Date(first)) / 60000)) : null };
}
