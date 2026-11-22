import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt, masterKey, last4 } from '../api/_lib/crypto.js';
import { chunkText, htmlToText, parseJson, validateFacts, finalizeStyle, compileDna, extractText, HOUSE_RULES } from '../api/_lib/brain.js';

const key = randomBytes(32);

test('encrypt and decrypt round-trip, with a fresh IV each time', () => {
  const a = encrypt('sk-ant-secret-123', key);
  const b = encrypt('sk-ant-secret-123', key);
  assert.notEqual(a.ciphertext, b.ciphertext);
  assert.equal(decrypt(a, key), 'sk-ant-secret-123');
  assert.ok(!a.ciphertext.includes('secret'));
});

test('tampered ciphertext or wrong key fails', () => {
  const e = encrypt('pit-123', key);
  const bad = { ...e, ciphertext: Buffer.from('x' + Buffer.from(e.ciphertext, 'base64').toString('latin1').slice(1), 'latin1').toString('base64') };
  assert.throws(() => decrypt(bad, key));
  assert.throws(() => decrypt(e, randomBytes(32)));
});

test('master key must be 32 bytes', () => {
  assert.throws(() => masterKey(''), /not set/);
  assert.throws(() => masterKey(Buffer.from('short').toString('base64')), /32 bytes/);
  assert.equal(masterKey(key.toString('base64')).length, 32);
  assert.equal(last4('sk-1234567890abcd'), 'abcd');
  assert.equal(last4('short'), '');
});

test('chunkText keeps chunks near the target size and covers all text', () => {
  const para = 'Leads wait too long for a reply. '.repeat(30);
  const text = Array.from({ length: 10 }, (_, i) => `Section ${i}. ${para}`).join('\n\n');
  const chunks = chunkText(text, 1200, 150);
  assert.ok(chunks.length >= 8);
  assert.ok(chunks.every((c) => c.length <= 1400), 'chunk too long');
  for (let i = 0; i < 10; i++) assert.ok(chunks.some((c) => c.includes(`Section ${i}.`)));
  assert.deepEqual(chunkText(''), []);
});

test('htmlToText drops scripts and keeps readable text', () => {
  const t = htmlToText('<html><script>alert(1)</script><h1>Growth Engine</h1><p>Book a call&nbsp;today</p><nav>menu</nav></html>');
  assert.ok(t.includes('Growth Engine'));
  assert.ok(t.includes('Book a call today'));
  assert.ok(!t.includes('alert') && !t.includes('menu'));
});

test('extractText reads plain text and html files', async () => {
  assert.equal(await extractText({ bytes: Buffer.from('Hello  world\r\n\n\n\nBye'), name: 'a.txt' }), 'Hello world\n\nBye');
  assert.equal(await extractText({ bytes: Buffer.from('<p>Hi</p>'), name: 'a.html', mime: 'text/html' }), 'Hi');
});

test('parseJson finds JSON inside fences and prose', () => {
  assert.deepEqual(parseJson('Here you go:\n```json\n[{"a":"x ] y"}]\n```\nDone'), [{ a: 'x ] y' }]);
  assert.deepEqual(parseJson('{"summary":"ok","rules":[]}'), { summary: 'ok', rules: [] });
  assert.throws(() => parseJson('no json here'));
});

test('validateFacts drops unsupported, duplicate and malformed facts', () => {
  const source = 'I help mortgage brokers book more calls. Offer: Lead Generation at 497 USD per month. Never promise guaranteed leads.';
  const out = validateFacts([
    { category: 'audience', text: 'Serves mortgage brokers', quote: 'I help mortgage brokers book more calls' },
    { category: 'proof', text: 'Doubled client bookings', quote: 'clients doubled their bookings' }, // not in source
    { category: 'offers', text: 'Lead Generation is 497 USD per month', quote: 'Lead Generation at 497 USD per month' },
    { category: 'audience', text: 'Serves mortgage brokers.', quote: 'I help mortgage brokers' }, // duplicate
    { category: 'made_up', text: 'x', quote: 'I help' },
    { category: 'never_say', text: 'Never promise guaranteed leads — ever', quote: 'Never promise guaranteed leads' },
    { category: 'identity', text: 'Already known', quote: 'I help mortgage brokers' },
  ], { known: ['Already known'], sourceText: source });
  assert.deepEqual(out.map((f) => f.category), ['audience', 'offers', 'never_say']);
  assert.ok(!out[2].text.includes('—'), 'em dash should be removed');
});

test('finalizeStyle always includes the house rules', () => {
  const g = finalizeStyle({ summary: 'Direct.', rules: ['Short sentences'], avoid: ['No em dashes'], examples: ['a', 'b', 'c', 'd', 'e', 'f'] });
  for (const r of HOUSE_RULES) assert.ok(g.avoid.some((a) => a.toLowerCase().replace(/\W/g, '') === r.toLowerCase().replace(/\W/g, '')) , r);
  assert.equal(g.examples.length, 5);
});

test('compileDna uses only approved facts, starred first, and flags missing proof', () => {
  const facts = [
    { id: '1', category: 'identity', text: 'Runs Ciftron', status: 'approved', starred: false },
    { id: '2', category: 'identity', text: 'Based in Canada', status: 'approved', starred: true },
    { id: '3', category: 'proof', text: 'Fake result', status: 'rejected', starred: true },
    { id: '4', category: 'audience', text: 'Maybe dentists', status: 'proposed', starred: false },
  ];
  const offers = [{ id: 'o', name: 'Lead Gen', price: '497.00', currency: 'USD', cadence: 'month', status: 'live', services: ['Meta Ads'], in_dna: true },
    { id: 'p', name: 'Hidden', price: 1, currency: 'USD', cadence: 'month', status: 'live', services: [], in_dna: false }];
  const { content, markdown } = compileDna({ facts, style: null, offers, versionNo: 3 });
  assert.deepEqual(content.facts.identity.map((f) => f.text), ['Based in Canada', 'Runs Ciftron']);
  assert.ok(!markdown.includes('Fake result') && !markdown.includes('Maybe dentists') && !markdown.includes('Hidden'));
  assert.ok(markdown.includes('Lead Gen (497 USD per month, live): Meta Ads'));
  assert.ok(markdown.includes('[PROOF NEEDED]'));
  assert.ok(markdown.includes('No em dashes'));
  assert.ok(!markdown.includes('—'));
});

test('supabaseUrl cleans common paste mistakes', async () => {
  const { supabaseUrl } = await import('../api/_lib/http.js');
  for (const raw of ['https://abc123.supabase.co', 'https://abc123.supabase.co/', ' https://abc123.supabase.co/rest/v1/ ', 'https://supabase.com/dashboard/project/abc123/settings/api']) {
    assert.equal(supabaseUrl(raw), 'https://abc123.supabase.co', raw);
  }
});
