// Phase 7: security headers, error logging and redaction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { redact, redactDeep, errorRow, logError } from '../api/_lib/errors.js';
import { handler, HttpError } from '../api/_lib/http.js';
import { handleMessage } from '../api/_lib/mcp.js';

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const headers = Object.fromEntries(vercel.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]));
const csp = Object.fromEntries(headers['Content-Security-Policy'].split('; ').map((d) => { const [k, ...v] = d.split(' '); return [k, v]; }));

test('security headers are set on every path', () => {
  for (const k of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Cross-Origin-Opener-Policy', 'Permissions-Policy', 'X-Robots-Tag']) assert.ok(headers[k], k);
  assert.match(headers['Strict-Transport-Security'], /max-age=\d{8,}/);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.match(headers['Permissions-Policy'], /microphone=\(self\)/);
  assert.match(headers['Permissions-Policy'], /camera=\(\)/);
});

test('CSP: no inline or eval scripts, no framing, only the hosts the app uses', () => {
  assert.deepEqual(csp['script-src'], ["'self'", 'https://esm.sh', 'https://cdn.jsdelivr.net']);
  for (const d of Object.values(csp)) assert.ok(!d.includes("'unsafe-eval'"));
  assert.ok(!csp['script-src'].includes("'unsafe-inline'"));
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
  assert.deepEqual(csp['object-src'], ["'none'"]);
  assert.deepEqual(csp['base-uri'], ["'none'"]);
  assert.ok(csp['connect-src'].includes('https://*.supabase.co'));
  assert.ok('upgrade-insecure-requests' in csp);
  // Every script the app loads is allowed, and index.html has no inline script.
  const html = readFileSync('index.html', 'utf8');
  assert.ok(!/<script>(?!\s*<\/script>)/.test(html), 'inline script in index.html');
  const live = readFileSync('assets/js/live.js', 'utf8');
  assert.match(live, /https:\/\/esm\.sh\//);
});

test('crons and function limits are configured', () => {
  assert.deepEqual(vercel.crons, [{ path: '/api/cron', schedule: '30 10 * * *' }]);
  const fns = readFileSync('api/config.js', 'utf8') && Object.keys(vercel.functions);
  assert.ok(fns.includes('api/mcp.js') && fns.includes('api/cron.js'));
});

test('redact removes every kind of key this app handles', () => {
  const samples = ['Bearer abcdefghijklmnop1234', 'sk-ant-api03-AbCdEfGhIjKlMnOp', 'sk-proj-AbCdEfGhIjKlMnOpQr', 'sk-or-v1-abcdef0123456789abcd', 'pit-aec8aaaa-bbbb-cccc-dddd-12cf',
    'cfos_' + 'x'.repeat(43), 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk', 'EAAB' + 'z'.repeat(30), 'apify_api_' + 'q'.repeat(20), 'AIza' + 'k'.repeat(30)];
  for (const s of samples) assert.ok(!redact(`failed with ${s} today`).includes(s), s);
  assert.equal(redact('api_key=hunter2hunter2'), 'api_key=[redacted]');
  assert.equal(redact('plain message, nothing secret'), 'plain message, nothing secret');
  assert.deepEqual(redactDeep({ headers: { Authorization: 'x' }, nested: ['sk-ant-api03-AbCdEfGhIjKlMnOp'], n: 3 }), { headers: { Authorization: '[redacted]' }, nested: ['[redacted]'], n: 3 });
});

test('errorRow clips and redacts; logError never throws', async () => {
  const e = new Error('OpenAI said 401 for sk-proj-AbCdEfGhIjKlMnOpQr');
  const row = errorRow({ ownerId: 'o', route: '/api/brain', status: 500, error: e, detail: { body: 'x'.repeat(10000) } });
  assert.ok(!row.message.includes('sk-proj'));
  assert.ok(JSON.stringify(row.detail).length < 7000);
  assert.equal(row.source, 'server');
  await logError({ from: () => ({ insert: async () => { throw new Error('db down'); } }) }, { error: 'x' });
  await logError(null, { error: 'no admin' });
});

const fakeRes = () => ({ code: 0, body: null, headers: {}, headersSent: false, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; this.headersSent = true; return this; } });

test('server handler: 5xx errors are logged with secrets removed; 4xx are not', async () => {
  const inserted = [];
  process.env.SUPABASE_URL = 'https://abc.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  const http = await import('../api/_lib/http.js');
  // Swap the admin client the handler uses by stubbing the Supabase insert through a fetch mock.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { if (String(url).includes('/rest/v1/error_log')) inserted.push(JSON.parse(init.body)); return new Response('[]', { status: 201, headers: { 'content-type': 'application/json' } }); };
  try {
    const boom = http.handler(['POST'], async () => { throw new Error('crashed with key sk-ant-api03-AbCdEfGhIjKlMnOp'); });
    const res = fakeRes();
    await boom({ method: 'POST', url: '/api/studio?x=1', body: { action: 'goal' }, headers: {} }, res);
    assert.equal(res.code, 500);
    assert.ok(!res.body.error.includes('sk-ant'));
    assert.equal(inserted.length, 1);
    const row = [].concat(inserted[0])[0];
    assert.equal(row.route, '/api/studio');
    assert.equal(row.status, 500);
    assert.equal(row.detail.action, 'goal');
    assert.ok(!JSON.stringify(row).includes('sk-ant'));
    const bad = http.handler(['POST'], async () => { throw new HttpError(400, 'Type a message'); });
    const r2 = fakeRes();
    await bad({ method: 'POST', url: '/api/chat', body: {}, headers: {} }, r2);
    assert.equal(r2.code, 400);
    assert.equal(inserted.length, 1);
  } finally { globalThis.fetch = realFetch; }
});

test('MCP: unexpected tool failures are reported; expected refusals are not', async () => {
  const seen = [];
  const { ToolError } = await import('../api/_lib/mcp-tools.js');
  const tools = [
    { name: 'a', inputSchema: { type: 'object', properties: {} }, run: async () => { throw new ToolError('Version conflict'); } },
    { name: 'b', inputSchema: { type: 'object', properties: {} }, run: async () => { throw new Error('fetch failed: Bearer abcdefghijklmnop1234'); } },
  ];
  const call = (name) => handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: {} } }, { 'mcp-protocol-version': '2025-11-25' }, { tools, authorize: async () => {}, onError: async (e, n) => seen.push(n) });
  const ra = await call('a');
  const rb = await call('b');
  assert.deepEqual(seen, ['b']);
  assert.equal(ra.body.result.isError, true);
  assert.ok(!rb.body.result.content[0].text.includes('abcdefghijklmnop1234'));
});
