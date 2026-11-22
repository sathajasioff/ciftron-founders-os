// Phase 9: Google sign-in state, Calendar and Meet parsing, Stripe revenue, call reviews.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { signState, verifyState, authUrl, redirectUri, calendarEvents, calendarText, meetRecent, meetTranscript, GOOGLE_SCOPES } from '../api/_lib/google.js';
import { stripeData, revenueSummary, revenueText } from '../api/_lib/revenue.js';
import { validateCall, callPrompt, callBrainText } from '../api/_lib/studio.js';

const KEY = randomBytes(32);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('google state: signed, owner-bound, expires, and rejects tampering', () => {
  const s = signState('owner-1', { key: KEY, now: 1000 });
  assert.equal(verifyState(s, { key: KEY, now: 2000 }), 'owner-1');
  assert.throws(() => verifyState(s, { key: KEY, now: 1000 + 11 * 60 * 1000 }), /expired/);
  assert.throws(() => verifyState(s, { key: randomBytes(32), now: 2000 }), /invalid/);
  const [body, sig] = s.split('.');
  const forged = Buffer.from(JSON.stringify({ o: 'attacker', e: 9e15, n: 'x' })).toString('base64url');
  assert.throws(() => verifyState(`${forged}.${sig}`, { key: KEY, now: 2000 }), /invalid/);
  assert.throws(() => verifyState('nonsense', { key: KEY }), /invalid/);
  assert.ok(body.length > 10);
});

test('google auth URL asks for offline, read-only Calendar and Meet access', () => {
  const u = new URL(authUrl({ clientId: 'cid.apps.googleusercontent.com', redirect: 'https://os.ciftron.com/api/google', state: 'st' }));
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('prompt'), 'consent');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://os.ciftron.com/api/google');
  assert.deepEqual(u.searchParams.get('scope').split(' '), GOOGLE_SCOPES);
  assert.ok(GOOGLE_SCOPES.every((s) => !/auth\/(calendar|drive|gmail)$/.test(s)), 'no full-access scopes');
  assert.equal(redirectUri({ headers: { 'x-forwarded-host': 'os.ciftron.com', 'x-forwarded-proto': 'https' } }, {}), 'https://os.ciftron.com/api/google');
  assert.equal(redirectUri({ headers: { host: 'evil.example' } }, { APP_URL: 'https://os.ciftron.com/' }), 'https://os.ciftron.com/api/google');
});

test('calendar: titles and times only, cancelled events dropped, clear API errors', async () => {
  const f = async () => json({ items: [
    { id: '1', summary: 'Discovery call', start: { dateTime: '2026-11-23T14:00:00Z' }, end: { dateTime: '2026-11-23T14:30:00Z' }, hangoutLink: 'https://meet.google.com/abc', attendees: [{ email: 'client@x.com' }], conferenceData: { conferenceId: 'abc-defg-hij' } },
    { id: '2', summary: 'Gone', status: 'cancelled', start: { date: '2026-11-24' } },
    { id: '3', start: { date: '2026-11-25' }, end: { date: '2026-11-26' } },
  ] });
  const ev = await calendarEvents('t', { fetchImpl: f });
  assert.equal(ev.length, 2);
  assert.deepEqual([ev[0].title, ev[0].meet, ev[0].meeting_code, ev[1].title, ev[1].all_day], ['Discovery call', true, 'abc-defg-hij', '(no title)', true]);
  assert.ok(!JSON.stringify(ev).includes('client@x.com'));
  assert.match(calendarText(ev, 'America/Toronto'), /Discovery call/);
  const off = async () => json({ error: { message: 'Google Calendar API has not been used in project 1 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/x then retry.' } }, 403);
  await assert.rejects(calendarEvents('t', { fetchImpl: off }), /turn on this API.*https:\/\/console/);
});

test('meet: transcripts with speaker names merged by turn, titles from the calendar', async () => {
  const routes = {
    '/v2/conferenceRecords': { conferenceRecords: [{ name: 'conferenceRecords/r1', startTime: '2026-11-20T15:00:00Z', endTime: '2026-11-20T15:40:00Z', space: 'spaces/s1' }, { name: 'conferenceRecords/r2', startTime: '2026-11-21T15:00:00Z', space: 'spaces/s2' }] },
    '/v2/conferenceRecords/r1/transcripts': { transcripts: [{ name: 'conferenceRecords/r1/transcripts/t1', state: 'FILE_GENERATED' }] },
    '/v2/conferenceRecords/r2/transcripts': { transcripts: [] },
    '/v2/spaces/s1': { meetingCode: 'abc-defg-hij' },
    '/calendar/v3/calendars/primary/events': { items: [{ id: 'e', summary: 'Broker discovery', start: { dateTime: '2026-11-20T15:00:00Z' }, conferenceData: { conferenceId: 'abc-defg-hij' } }] },
    '/v2/conferenceRecords/r1/participants': { participants: [{ name: 'conferenceRecords/r1/participants/p1', signedinUser: { displayName: 'Jasinthan' } }, { name: 'conferenceRecords/r1/participants/p2', anonymousUser: { displayName: 'Marc' } }] },
    '/v2/conferenceRecords/r1/transcripts/t1/entries': { transcriptEntries: [
      { participant: 'conferenceRecords/r1/participants/p2', text: 'How fast do you call leads?', startTime: '2026-11-20T15:01:00Z', endTime: '2026-11-20T15:01:05Z' },
      { participant: 'conferenceRecords/r1/participants/p1', text: 'Within five minutes.', startTime: '2026-11-20T15:01:06Z', endTime: '2026-11-20T15:01:09Z' },
      { participant: 'conferenceRecords/r1/participants/p1', text: 'Every time.', startTime: '2026-11-20T15:01:10Z', endTime: '2026-11-20T15:31:10Z' },
    ] },
  };
  const f = async (url) => { const u = new URL(url); return routes[u.pathname] ? json(routes[u.pathname]) : json({ error: { message: 'nope ' + u.pathname } }, 404); };
  const list = await meetRecent('t', { now: new Date('2026-11-22T00:00:00Z'), fetchImpl: f });
  assert.equal(list.length, 1, 'calls without a transcript are skipped');
  assert.equal(list[0].title, 'Broker discovery');
  const tr = await meetTranscript('t', { record: 'conferenceRecords/r1', transcript: 'conferenceRecords/r1/transcripts/t1' }, f);
  assert.equal(tr.text, 'Marc: How fast do you call leads?\nJasinthan: Within five minutes. Every time.');
  assert.deepEqual(tr.speakers, ['Marc', 'Jasinthan']);
  assert.equal(tr.duration_min, 30);
});

test('stripe: net of refunds, paid only, pages through, MRR normalised to a month', async () => {
  const pages = {
    charges1: { has_more: true, data: [{ id: 'ch_1', status: 'succeeded', paid: true, amount: 49700, amount_refunded: 0, currency: 'usd', created: 1763600000, description: 'Lead Gen', billing_details: { email: 'secret@client.com' } },
      { id: 'ch_2', status: 'failed', paid: false, amount: 9700, currency: 'usd', created: 1763600000 }] },
    charges2: { has_more: false, data: [{ id: 'ch_3', status: 'succeeded', paid: true, amount: 69700, amount_refunded: 19700, currency: 'cad', created: 1763600000 }] },
    subs: { has_more: false, data: [{ items: { data: [{ quantity: 1, price: { unit_amount: 49700, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } } }, { quantity: 2, price: { unit_amount: 120000, currency: 'usd', recurring: { interval: 'year', interval_count: 1 } } }] } }] },
  };
  const seen = [];
  const f = async (url, init) => {
    seen.push(String(url)); assert.equal(init.headers.Authorization, 'Bearer rk_live_x');
    const u = new URL(url);
    if (u.pathname.endsWith('/charges')) return json(u.searchParams.get('starting_after') ? pages.charges2 : pages.charges1);
    return json(pages.subs);
  };
  const d = await stripeData('rk_live_x', { since: new Date('2026-06-01'), fetchImpl: f });
  assert.deepEqual(d.charges.map((c) => [c.amount, c.currency]), [[497, 'USD'], [500, 'CAD']]);
  assert.ok(!JSON.stringify(d).includes('secret@client.com'));
  assert.deepEqual(d.mrr, { USD: 697 });
  assert.ok(seen.some((u) => u.includes('starting_after=ch_2')));
  await assert.rejects(stripeData('bad', { since: new Date(), fetchImpl: async () => json({ error: { message: 'Invalid API Key' } }, 401) }), /rejected the key/);
});

test('revenue summary: months by currency, this vs last month, MRR with each retainer counted once', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  const s = revenueSummary({
    now,
    charges: [{ date: '2026-11-03', amount: 497, currency: 'USD' }, { date: '2026-10-03', amount: 497, currency: 'USD' }],
    entries: [
      { id: 'a', occurred_on: '2026-11-01', amount: '1500', currency: 'CAD', client: 'Batisseur', recurring: true },
      { id: 'b', occurred_on: '2026-10-01', amount: '1500', currency: 'CAD', client: 'Batisseur', recurring: true },
      { id: 'c', occurred_on: '2026-11-10', amount: '300', currency: 'USD', client: 'One-off', recurring: false },
    ],
    stripeMrr: { USD: 497 },
  });
  assert.deepEqual(s.currencies, ['USD', 'CAD']);
  assert.equal(s.months.length, 6);
  assert.equal(s.months[5].month, '2026-11');
  assert.deepEqual(s.months[5].USD, { stripe: 497, manual: 300, total: 797 });
  assert.deepEqual([s.this_month.USD, s.last_month.USD, s.this_month.CAD], [797, 497, 1500]);
  assert.deepEqual(s.mrr, { USD: 497, CAD: 1500 }, 'Batisseur counted once');
  assert.match(revenueText(s), /USD 797 this month/);
  assert.equal(revenueText(revenueSummary({ now })), 'Revenue: nothing recorded yet.');
});

test('call review: cleaned and capped; the prompt and Brain text carry the transcript', () => {
  const r = validateCall({ summary: 'Good call — clear next step.', outcome: 'Booked', questions_asked: ['Price?'], objections: [{ objection: 'Too expensive', how_handled: 'h', better_response: 'b' }, { objection: '' }], faq_candidates: [{ question: 'Q', answer: 'A' }, { question: 'x' }] });
  assert.equal(r.summary, 'Good call, clear next step.');
  assert.equal(r.objections.length, 1);
  assert.equal(r.faq_candidates.length, 1);
  assert.throws(() => validateCall({}), /no review/);
  const c = { title: 'Discovery', kind: 'sales', occurred_at: '2026-11-20T15:00:00Z', duration_min: 30, speakers: ['Marc', 'Jasinthan'], transcript: 'Marc: hi', analysis: { summary: 'S' } };
  assert.match(callPrompt(c), /Speakers: Marc, Jasinthan[\s\S]*Marc: hi/);
  assert.match(callBrainText(c), /Summary: S[\s\S]*Marc: hi/);
});
