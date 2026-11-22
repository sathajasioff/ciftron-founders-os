// Phase 11: new agents, Tella, custom read-only API connections, design rules.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { privateIp, validateConnection, buildRequest, safeGet, tellaList, tellaVideo, tellaText, net } from '../api/_lib/connect.js';
import { AGENT_SEEDS, CONTEXT_AGENTS, extractDrafts, extractHandoff } from '../api/_lib/chat.js';
import { graphicPrompt } from '../api/_lib/studio.js';
import { pagePrompt } from '../api/_lib/page.js';
import { installFakeSupabase, invoke, OWNER, MEMBER, MEMBER_TOKEN } from './fixtures/fake-rest.mjs';
import { encrypt } from '../api/_lib/crypto.js';

process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
const load = (f) => import(`../api/${f}.js`).then((m) => m.default);
const key = (provider, field, plain) => ({ owner_id: OWNER.id, provider, field, ...encrypt(plain), last4: plain.slice(-4), status: 'ok' });
const json = (b, status = 200, headers = {}) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...headers } });
const reply = (text) => json({ content: [{ type: 'text', text }] });
const PUBLIC = async () => [{ address: '93.184.216.34' }];
let fake;
const realResolve = net.resolve;
afterEach(() => { fake?.restore(); net.resolve = realResolve; });

test('agents: 17 with unique roles; Chief of Staff routes to every one; new draft types land in the library', () => {
  const slugs = AGENT_SEEDS.map((a) => a.slug);
  for (const s of ['ads-manager', 'video-producer', 'sales-coach', 'offer-strategist', 'outreach-writer', 'client-success', 'french-localizer', 'project-manager']) assert.ok(slugs.includes(s), s);
  assert.ok(CONTEXT_AGENTS.every((s) => slugs.includes(s)));
  assert.ok(AGENT_SEEDS.slice(9).every((a) => /never|only|draft/i.test(a.instructions)), 'new agents carry guardrails');
  const { drafts } = extractDrafts('<draft type="Outreach" title="Roofers opener" language="en" target="library">Hi [NAME]</draft><draft type="Weekly plan" title="Week" target="nowhere">Plan</draft>');
  assert.deepEqual(drafts.map((d) => [d.type, d.target]), [['Outreach', 'library'], ['Weekly plan', 'content']]);
  assert.equal(extractHandoff('Routing.\n<handoff to="sales-coach">Prep my call with Marc</handoff>').handoff.to, 'sales-coach');
});

test('private addresses are refused: loopback, private ranges, link-local, CGNAT, IPv6 local, mapped IPv4', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', 'not-an-ip'])
    assert.equal(privateIp(ip), true, ip);
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.equal(privateIp(ip), false, ip);
});

test('connection validation: https public addresses, safe auth names, clean paths', () => {
  const ok = validateConnection({ name: 'Calendly', base_url: 'https://api.calendly.com/v2/', auth: 'header', auth_name: 'X-API-Key', endpoints: [{ name: 'Events', path: '/scheduled_events?status=active' }, { name: '', path: '/x' }] });
  assert.deepEqual(ok, { name: 'Calendly', base_url: 'https://api.calendly.com/v2', auth: 'header', auth_name: 'X-API-Key', endpoints: [{ name: 'Events', path: '/scheduled_events?status=active' }] });
  const bad = [
    [{ name: 'x', base_url: 'http://api.x.com' }, /https/], [{ name: 'x', base_url: 'https://localhost/api' }, /private/], [{ name: 'x', base_url: 'https://127.0.0.1' }, /private/],
    [{ name: 'x', base_url: 'https://[::1]/' }, /private/], [{ name: 'x', base_url: 'https://intranet/' }, /private/], [{ name: 'x', base_url: 'https://u:p@api.x.com' }, /key field/],
    [{ name: 'x', base_url: 'https://api.x.com:8443' }, /port/], [{ name: '', base_url: 'https://api.x.com' }, /Name/], [{ name: 'x', base_url: 'https://api.x.com', auth: 'header', auth_name: 'Bad Header' }, /Header name/],
    [{ name: 'x', base_url: 'https://api.x.com', auth: 'header', auth_name: 'Cookie' }, /cannot/], [{ name: 'x', base_url: 'https://api.x.com', endpoints: [{ name: 'e', path: '//evil.com/x' }] }, /same site/],
    [{ name: 'x', base_url: 'https://api.x.com', endpoints: [{ name: 'e', path: '/../admin' }] }, /same site/], [{ name: 'x', base_url: 'https://api.x.com', endpoints: [{ name: 'e', path: '/@evil.com' }] }, /same site/],
  ];
  for (const [c, re] of bad) assert.throws(() => validateConnection(c), re, JSON.stringify(c));
});

test('requests stay on the connection address and put the key where it belongs', () => {
  const c = { base_url: 'https://api.x.com/v1', auth: 'query', auth_name: 'api_key' };
  assert.equal(buildRequest(c, '/items?limit=5', 'K123').url, 'https://api.x.com/v1/items?limit=5&api_key=K123');
  assert.equal(buildRequest({ ...c, auth: 'bearer' }, '/items', 'K123').headers.Authorization, 'Bearer K123');
  assert.equal(buildRequest({ ...c, auth: 'header', auth_name: 'X-Key' }, '/items', 'K123').headers['X-Key'], 'K123');
  assert.ok(!('Authorization' in buildRequest({ ...c, auth: 'none' }, '/items', 'K123').headers));
  assert.throws(() => buildRequest(c, 'items'), /must start/);
  assert.throws(() => buildRequest(c, '/%2e%2e/admin'), /leaves|same site/);
});

test('safeGet: GET only, no redirects, no private DNS, key hidden in the response, size capped', async () => {
  const c = { base_url: 'https://api.x.com', auth: 'bearer' };
  let seen;
  const r = await safeGet(c, '/me', 'SECRETKEY99', { resolve: PUBLIC, fetchImpl: async (u, init) => { seen = init; return json({ user: 'jas', echo: 'token SECRETKEY99' }); } });
  assert.equal(seen.method, 'GET');
  assert.equal(seen.redirect, 'manual');
  assert.ok(r.ok && r.text.includes('"user": "jas"') && !r.text.includes('SECRETKEY99') && r.text.includes('[KEY HIDDEN]'));
  await assert.rejects(safeGet(c, '/me', 'k', { resolve: async () => [{ address: '10.0.0.5' }], fetchImpl: async () => json({}) }), /private network/);
  await assert.rejects(safeGet(c, '/me', 'k', { resolve: async () => [{ address: '93.184.216.34' }, { address: '127.0.0.1' }], fetchImpl: async () => json({}) }), /private network/);
  await assert.rejects(safeGet(c, '/me', 'k', { resolve: PUBLIC, fetchImpl: async () => new Response('', { status: 302, headers: { location: 'http://169.254.169.254/' } }) }), /redirected/);
  const big = await safeGet(c, '/big', 'k', { resolve: PUBLIC, fetchImpl: async () => new Response('x'.repeat(500000), { headers: { 'content-type': 'text/plain' } }) });
  assert.ok(big.text.length <= 60000 && big.truncated);
  const err = await safeGet(c, '/nope', 'k', { resolve: PUBLIC, fetchImpl: async () => json({ error: 'not found' }, 404) });
  assert.deepEqual([err.ok, err.status], [false, 404]);
});

test('tella: list and video mapping, transcript text with chapters, clear key errors', async () => {
  const f = async (url) => {
    if (url.includes('/videos?')) return json({ videos: [{ id: 'vid_1', name: 'Lead speed', description: 'd', views: 12, createdAt: '2026-11-01T10:00:00Z', links: { viewPage: 'https://www.tella.tv/video/vid_1/view' } }], pagination: { hasMore: true, nextCursor: 'c2' } });
    return json({ video: { id: 'vid_1', name: 'Lead speed', description: '', createdAt: '2026-11-01T10:00:00Z', durationSeconds: 95, chapters: [{ title: 'Intro', timestampSeconds: 0 }, { title: 'The fix', timestampSeconds: 65 }], transcript: { status: 'ready', text: 'Call your leads in five minutes.', sentences: [] }, links: { viewPage: 'https://www.tella.tv/video/vid_1/view' } } });
  };
  const l = await tellaList('k', { fetchImpl: f });
  assert.deepEqual([l.videos[0].id, l.videos[0].url, l.next], ['vid_1', 'https://www.tella.tv/video/vid_1/view', 'c2']);
  const v = await tellaVideo('k', 'vid_1', { fetchImpl: f });
  assert.match(tellaText(v), /Chapters:\n- 0:00 Intro\n- 1:05 The fix[\s\S]*Call your leads in five minutes\./);
  await assert.rejects(tellaVideo('k', '../etc', { fetchImpl: f }), /Invalid/);
  await assert.rejects(tellaList('k', { fetchImpl: async () => json({ message: 'no' }, 401) }), /rejected the API key/);
});

test('design rules reach graphics and the funnel page design prompt', () => {
  assert.match(graphicPrompt({ format: 'Instagram post', board: { design_rules: 'No gradients.\nLogo bottom right.' } }), /design rules \(follow them\): No gradients\. Logo bottom right\./);
  const out = { headline: 'H', subheadline: 'S', cta: 'Go', sections: [{ heading: 'A', body: 'b', bullets: [] }], faq: [] };
  assert.match(pagePrompt({ out, funnelName: 'F', rules: 'Lots of white space' }), /standing design rules: Lots of white space/);
});

const seedConn = (extra = {}) => ({
  provider_keys: [key('anthropic', 'api_key', 'sk-ant-k')],
  custom_connections: [], workspace_members: [{ id: 'wm1', owner_id: OWNER.id, member_id: MEMBER.id, email: MEMBER.email, role: 'member' }], ...extra,
});

test('custom connections: owner saves (key encrypted), tests, members can read data but not change connections', async () => {
  net.resolve = PUBLIC;
  let lastUrl;
  fake = installFakeSupabase({ seed: seedConn(), external: async (url, init) => { lastUrl = String(url); return url.hostname === 'api.calendly.com' ? json({ collection: [{ name: 'Discovery', key: init.headers?.Authorization }] }) : json({}); } });
  const keys = await load('keys'), studio = await load('studio');
  const conn = { name: 'Calendly', base_url: 'https://api.calendly.com', auth: 'bearer', endpoints: [{ name: 'Events', path: '/scheduled_events' }] };
  const s = await invoke(keys, { body: { action: 'custom_save', connection: conn, key: 'cal_SECRET_123456' } });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  const pk = fake.tables.provider_keys.find((k) => k.provider === `custom:${s.body.id}`);
  assert.ok(pk && !JSON.stringify(pk).includes('cal_SECRET'), 'stored encrypted');
  const listed = await invoke(keys, { method: 'GET' });
  assert.deepEqual(listed.body.custom, [{ id: s.body.id, last4: '3456' }]);
  assert.ok(!JSON.stringify(listed.body).includes('cal_SECRET'));
  const t = await invoke(keys, { body: { action: 'custom_test', id: s.body.id } });
  assert.equal(t.body.ok, true, JSON.stringify(t.body));
  assert.equal(fake.tables.custom_connections[0].last_status, 'ok');
  // A member reads data through the server; the key never comes back, even if the API echoes it.
  const f = await invoke(studio, { token: MEMBER_TOKEN, body: { action: 'custom_fetch', id: s.body.id, path: '/scheduled_events?count=5' } });
  assert.equal(f.status, 200, JSON.stringify(f.body));
  assert.equal(lastUrl, 'https://api.calendly.com/scheduled_events?count=5');
  assert.match(f.body.text, /Discovery/);
  assert.ok(!f.body.text.includes('cal_SECRET') && f.body.text.includes('[KEY HIDDEN]'));
  assert.equal((await invoke(studio, { body: { action: 'custom_fetch', id: s.body.id, path: '//evil.com/x' } })).status, 400);
  for (const b of [{ action: 'custom_save', connection: conn, key: 'x' }, { action: 'custom_test', id: s.body.id }, { action: 'custom_delete', id: s.body.id }])
    assert.equal((await invoke(keys, { token: MEMBER_TOKEN, body: b })).status, 403, b.action);
  // Bad addresses are refused before anything is saved.
  assert.equal((await invoke(keys, { body: { action: 'custom_save', connection: { ...conn, name: 'Local', base_url: 'https://169.254.169.254' } } })).status, 400);
  // Private DNS at request time is refused too.
  net.resolve = async () => [{ address: '192.168.0.10' }];
  const p = await invoke(studio, { body: { action: 'custom_fetch', id: s.body.id } });
  assert.equal(p.status, 400);
  assert.match(p.body.error, /private network/);
  const d = await invoke(keys, { body: { action: 'custom_delete', id: s.body.id } });
  assert.equal(d.status, 200);
  assert.equal(fake.tables.custom_connections.length, 0);
  assert.ok(!fake.tables.provider_keys.some((k) => k.provider.startsWith('custom:')), 'key removed with it');
});

test('tella: list shows what is in the Brain; import once as a voice sample; repurpose into drafts', async () => {
  const video = { id: 'vid_1', name: 'Lead speed', description: '', createdAt: '2026-11-01T10:00:00Z', durationSeconds: 95, chapters: [], transcript: { status: 'ready', text: 'Call your leads within five minutes or they go cold. That is the whole game.', sentences: [] }, links: { viewPage: 'https://www.tella.tv/video/vid_1/view' } };
  fake = installFakeSupabase({
    seed: seedConn({ provider_keys: [key('anthropic', 'api_key', 'sk-ant-k'), key('tella', 'api_key', 'tella_pk_abc')], brain_sources: [], approvals: [], learning_signals: [], brand_dna: [] }),
    external: async (url, init) => {
      if (url.hostname === 'api.tella.com') { assert.equal(init.headers.Authorization, 'Bearer tella_pk_abc'); return url.pathname === '/v1/videos' ? json({ videos: [{ ...video, createdAt: video.createdAt }], pagination: { hasMore: false, nextCursor: null } }) : json({ video }); }
      return reply('<draft type="Written post" title="Five minutes" language="en" target="content">Call your leads within five minutes.</draft><draft type="Hooks" title="Hooks" target="content">They go cold.</draft>');
    },
  });
  const studio = await load('studio');
  const l = await invoke(studio, { body: { action: 'tella_list' } });
  assert.equal(l.status, 200, JSON.stringify(l.body));
  assert.deepEqual([l.body.videos[0].name, l.body.videos[0].in_brain], ['Lead speed', false]);
  const i = await invoke(studio, { body: { action: 'tella_import', video_id: 'vid_1' } });
  assert.equal(i.status, 200, JSON.stringify(i.body));
  const src = fake.tables.brain_sources[0];
  assert.deepEqual([src.name, src.url, src.is_writing_sample], ['Tella: Lead speed', 'https://www.tella.tv/video/vid_1/view', true]);
  assert.match(src.content, /Transcript:\nCall your leads/);
  assert.equal((await invoke(studio, { body: { action: 'tella_import', video_id: 'vid_1' } })).body.existing, true);
  assert.equal((await invoke(studio, { body: { action: 'tella_list' } })).body.videos[0].in_brain, true);
  const r = await invoke(studio, { token: MEMBER_TOKEN, body: { action: 'tella_repurpose', video_id: 'vid_1', formats: ['Written post', 'Hooks'] } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.drafts, 2);
  assert.ok(fake.tables.approvals.every((a) => a.owner_id === OWNER.id && a.tags.includes('tella') && a.payload.tella_video.id === 'vid_1'));
  const prompt = JSON.parse(fake.log.filter((x) => x.external?.includes('anthropic')).at(-1).body).messages[0].content;
  assert.match(prompt, /That is the whole game/);
  assert.equal((await invoke(studio, { body: { action: 'tella_repurpose', video_id: 'vid_1', formats: [] } })).status, 400);
});

test('tella: no key gives a clear message; a video still processing is not imported', async () => {
  fake = installFakeSupabase({ seed: seedConn({ brain_sources: [] }), external: async () => json({}) });
  const studio = await load('studio');
  const r = await invoke(studio, { body: { action: 'tella_list' } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Tella key in Connections/);
  fake.restore();
  fake = installFakeSupabase({ seed: seedConn({ provider_keys: [key('tella', 'api_key', 'tella_pk_abc')], brain_sources: [] }), external: async () => json({ video: { id: 'vid_2', name: 'New', transcript: { status: 'processing', text: null, sentences: null }, chapters: [], links: {} } }) });
  const p = await invoke(await load('studio'), { body: { action: 'tella_import', video_id: 'vid_2' } });
  assert.equal(p.status, 400);
  assert.match(p.body.error, /still making the transcript/);
  assert.equal(fake.tables.brain_sources.length, 0);
});
