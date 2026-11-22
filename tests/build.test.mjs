// Phase 10: designed funnel pages (sanitizer, theme, render, preview links) and program slides (validation, PowerPoint).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { sanitizePage, themeFrom, contrast, validateDesign, renderPage, newToken, PAGE_HEADERS } from '../api/_lib/page.js';
import { validateSlides, joinDeck, slidesPrompt, buildPptx } from '../api/_lib/slides.js';
import { slideHtml, deckPrintHtml } from '../assets/js/slides-render.js';
import { installFakeSupabase, invoke, OWNER, MEMBER_TOKEN, STRANGER_TOKEN } from './fixtures/fake-rest.mjs';
import { encrypt } from '../api/_lib/crypto.js';

process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('base64');
const load = (f) => import(`../api/${f}.js`).then((m) => m.default);
const key = (provider, field, plain) => ({ owner_id: OWNER.id, provider, field, ...encrypt(plain), last4: plain.slice(-4), status: 'ok' });
const reply = (text) => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status: 200, headers: { 'content-type': 'application/json' } });
let fake;
afterEach(() => fake?.restore());

const OUT = {
  headline: 'Fix your follow-up', subheadline: 'For [AUDIENCE] <script>x</script>', cta: 'Book a call',
  sections: [{ heading: 'The problem', body: 'Leads go cold.', bullets: [] }, { heading: 'What you get', body: '', bullets: ['A pipeline', 'Emails'] }],
  faq: [{ q: 'How long?', a: '30 days.' }], qualification_questions: [], image_prompts: [], emails: [], hl_setup_notes: [],
};

test('sanitizer: scripts, handlers, frames, forms, bad links and CSS tricks are removed', () => {
  const dirty = `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=https://evil.x"><base href="https://evil.x/">
<link rel="stylesheet" href="https://evil.x/a.css"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">
<style>@import url(https://evil.x/b.css); .a{background:url(javascript:alert(1));width:expression(alert(1))} .b{background:url(https://img.x/ok.png)}</style>
<script>alert(1)</script><SCRIPT src=x></SCRIPT></head><body onload="alert(1)">
<a href="javascript:alert(1)">x</a><a href="{{ORDER_URL}}" onclick="steal()">Buy</a><img src="data:image/png;base64,AAAA"><img src="http://plain.x/a.png">
<iframe src="https://x"></iframe><form action="https://x"><input name=p><button>go</button></form><svg><a xlink:href="javascript:1">s</a></svg><div srcdoc="<script>1</script>">d</div>
<!-- <script>hidden</script> --></body></html>`;
  const h = sanitizePage(dirty, { orderUrl: 'https://link.ciftron.com/order?a=1' });
  for (const bad of ['<script', 'onload', 'onclick', 'javascript:', 'expression(', 'evil.x', '<iframe', '<form', '<input', '<button', '<base', 'http-equiv', 'xlink:href', 'srcdoc', 'http://plain'])
    assert.ok(!h.toLowerCase().includes(bad.toLowerCase()), `removed ${bad}`);
  assert.match(h, /fonts\.googleapis\.com/);
  assert.match(h, /href="https:\/\/link\.ciftron\.com\/order\?a=1"/);
  assert.match(h, /src="data:image\/png;base64,AAAA"/);
  assert.match(h, /url\(https:\/\/img\.x\/ok\.png\)/);
  assert.equal(sanitizePage('<html><body><a href="{{ORDER_URL}}">b</a></body></html>', { orderUrl: 'javascript:alert(1)' }).includes('href="#"'), true, 'a bad order URL becomes #');
  assert.throws(() => sanitizePage('just text'), /incomplete/);
  assert.throws(() => sanitizePage(`<html><body>${'x'.repeat(300001)}</body></html>`), /too large/);
});

test('theme: brand palette with readable contrast; presets for light and dark; fonts cleaned', () => {
  const board = { palettes: [{ colors: ['#0E1A2B', '#C8F36B', '#FFFFFF'] }], fonts: [{ heading: 'Inter";}</style><script>', body: 'Lora' }] };
  const t = themeFrom(board, 'brand');
  assert.equal(t.bg, '#0E1A2B');
  assert.equal(t.accent, '#C8F36B');
  assert.ok(contrast(t.text, t.bg) >= 4.5);
  assert.ok(contrast(t.accentText, t.accent) >= 4.5);
  assert.equal(t.fonts.heading, 'Interstylescript');
  assert.equal(themeFrom(board, 'light').bg, '#FFFFFF');
  assert.equal(themeFrom(null, 'brand').bg, '#111111', 'no palette falls back to dark');
  const pale = themeFrom({ palettes: [{ colors: ['#FFFFFF', '#FFFFEE'] }] });
  assert.ok(contrast(pale.accent, pale.bg) >= 3, 'a pale accent is replaced by the text colour');
});

test('page render: copy kept word for word and escaped, layouts validated, safe after sanitizing', () => {
  const d = validateDesign({ hero: { layout: 'split', eyebrow: 'For coaches — now' }, sections: [{ layout: 'cards' }, { layout: 'bogus' }], button_label: 'Book it' }, OUT);
  assert.deepEqual(d.sections.map((s) => s.layout), ['text', 'text'], 'cards needs bullets; unknown layouts become text');
  assert.equal(d.hero.eyebrow, 'For coaches, now', 'no em dashes');
  const d2 = validateDesign({ sections: [{ layout: 'highlight' }, { layout: 'cards' }] }, OUT);
  assert.equal(d2.sections[1].layout, 'cards');
  assert.equal(d2.button_label, 'Book a call');
  const h = sanitizePage(renderPage({ out: OUT, design: d2, theme: themeFrom(null, 'dark'), title: 'T', language: 'English' }), { orderUrl: 'https://x.com/o' });
  assert.ok(!h.includes('<script>x'), 'copy is escaped');
  assert.match(h, /&lt;script&gt;x/);
  assert.match(h, /<mark class="ph">\[AUDIENCE\]<\/mark>/);
  assert.match(h, /<div class="card">A pipeline<\/div>/);
  assert.match(h, /<meta name="viewport"/);
  assert.equal((h.match(/href="https:\/\/x\.com\/o"/g) || []).length, 3, 'hero, highlight and final buttons');
  assert.match(h, /<details><summary>How long\?/);
});

test('slides: validated and capped; deck joins modules with one title and one CTA; prompt has lessons', () => {
  assert.throws(() => validateSlides({ slides: [{ layout: 'bullets', title: 'Only one' }] }), /too few/);
  const part = validateSlides({ slides: [{ layout: 'weird', title: 'A — b', bullets: ['x', 'y', 'z', 'w', 'v', 'u', 't'] }, { layout: 'cta', title: 'Next', subtitle: 'Book a call' }] }, { min: 1 });
  assert.equal(part.slides[0].layout, 'bullets');
  assert.equal(part.slides[0].bullets.length, 6);
  assert.ok(!part.slides[0].title.includes('—'));
  const p2 = validateSlides({ slides: [{ layout: 'section', title: 'M2' }, { layout: 'cta', title: 'Other', subtitle: 'Go' }] }, { min: 1 });
  const deck = joinDeck({ name: 'Lead Speed', description: 'Respond in 5 minutes' }, [part, p2]);
  assert.equal(deck.slides[0].layout, 'title');
  assert.equal(deck.slides.filter((s) => s.layout === 'cta').length, 1);
  assert.equal(deck.slides.at(-1).title, 'Other');
  const pr = slidesPrompt({ program: { name: 'P' }, module: { title: 'M', lessons: [{ title: 'L1', body: 'Call within five minutes' }] }, index: 1, total: 3, withCta: false });
  assert.match(pr, /module 2 of 3/);
  assert.match(pr, /Call within five minutes/);
  assert.match(pr, /No cta slide/);
});

test('pptx: a real PowerPoint with every slide and speaker notes; CTA label on the button', async () => {
  const deck = validateSlides({ title: 'Lead Speed', slides: [
    { layout: 'title', title: 'Lead Speed', subtitle: 'A course' }, { layout: 'bullets', title: 'Why speed', bullets: ['One', 'Two'], notes: 'Say this.' },
    { layout: 'two_column', title: 'Before and after', left: ['Slow'], right: ['Fast'] }, { layout: 'quote', quote: 'Call fast', attribution: 'Me' },
    { layout: 'steps', title: 'Steps', bullets: ['A', 'B'] }, { layout: 'cta', title: 'Ready?', subtitle: 'Book a strategy call' }] });
  const buf = Buffer.from(await buildPptx(deck, themeFrom(null, 'dark')), 'base64');
  assert.equal(buf.subarray(0, 2).toString(), 'PK', 'zip file');
  const names = [];
  const files = {};
  for (let i = 0; i < buf.length - 30; i++) {
    if (buf.readUInt32LE(i) !== 0x04034b50) continue;
    const method = buf.readUInt16LE(i + 8), size = buf.readUInt32LE(i + 18), nlen = buf.readUInt16LE(i + 26), xlen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 30, i + 30 + nlen).toString();
    const data = buf.subarray(i + 30 + nlen + xlen, i + 30 + nlen + xlen + size);
    names.push(name);
    if (/slides\/slide\d+\.xml$|notesSlide\d+\.xml$/.test(name)) files[name] = method === 8 ? inflateRawSync(data).toString() : data.toString();
  }
  assert.equal(names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 6);
  assert.ok(Object.entries(files).some(([n, x]) => /notesSlide/.test(n) && x.includes('Say this.')));
  assert.ok(files['ppt/slides/slide6.xml'].includes('Book a strategy call'));
});

test('slide HTML: escaped, placeholders marked, print document has one page per slide', () => {
  const h = slideHtml({ layout: 'bullets', title: '<img src=x onerror=1>', bullets: ['[EXAMPLE NEEDED]'], left: [], right: [] });
  assert.ok(!h.includes('<img'));
  assert.match(h, /<mark>\[EXAMPLE NEEDED\]<\/mark>/);
  const doc = deckPrintHtml({ title: 'D', slides: [{ layout: 'title', title: 'A' }, { layout: 'cta', title: 'B', subtitle: 'Go' }] }, { bg: 'red;}</style><script>', fonts: { heading: 'x" onload="1' } });
  assert.equal((doc.match(/class="pg"/g) || []).length, 2);
  assert.ok(!doc.includes('<script>') && !doc.includes('onload'));
  assert.match(doc, /@page\{size:13\.333in 7\.5in/);
});

const seedFunnel = () => ({
  provider_keys: [key('anthropic', 'api_key', 'sk-ant-k')],
  funnels: [{ id: 'f1', owner_id: OWNER.id, name: 'Review call', funnel_type: 'Appointment booking funnel', order_form_url: 'https://link.ciftron.com/order', current_version: 1, version: 2 }],
  funnel_versions: [{ id: 'fv1', owner_id: OWNER.id, funnel_id: 'f1', version_no: 1, output: OUT }],
  brand_board: [{ owner_id: OWNER.id, palettes: [{ colors: ['#0E1A2B', '#C8F36B'] }], fonts: [] }],
  approvals: [], funnel_pages: [],
});

test('page build: AI picks the design, server renders, draft saved with a preview link and an approval', async () => {
  fake = installFakeSupabase({ seed: seedFunnel(), external: async () => reply(JSON.stringify({ hero: { layout: 'centered', eyebrow: 'Brokers' }, sections: [{ layout: 'text' }, { layout: 'checklist' }], button_label: 'Book my call', proof_note: 'Add results' })) });
  const studio = await load('studio');
  const r = await invoke(studio, { body: { action: 'page_build', funnel_id: 'f1', style: 'brand' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const pg = fake.tables.funnel_pages[0];
  assert.equal(pg.version_no, 1);
  assert.match(r.body.preview_path, /^\/p\/[A-Za-z0-9_-]{24}$/);
  assert.match(pg.html, /ul class="check"/);
  assert.match(pg.html, /background:#0E1A2B/);
  assert.match(pg.html, /href="https:\/\/link\.ciftron\.com\/order"/);
  const ap = fake.tables.approvals[0];
  assert.deepEqual([ap.type, ap.status ?? 'pending', ap.payload.page_id, ap.target_module], ['Funnel page', 'pending', pg.id, 'funnels']);
  assert.equal(pg.approval_id, ap.id);
  const prompt = JSON.parse(fake.log.find((l) => l.external?.includes('anthropic')).body);
  assert.ok(prompt.max_tokens <= 2000, 'design call is small so it fits the time limit');
  const r2 = await invoke(studio, { body: { action: 'page_build', funnel_id: 'f1' } });
  assert.equal(r2.body.version_no, 2);
  assert.equal((await invoke(studio, { token: STRANGER_TOKEN, body: { action: 'page_build', funnel_id: 'f1' } })).status, 403);
});

test('page build: refuses when there is no copy yet', async () => {
  const seed = seedFunnel(); seed.funnel_versions = [];
  fake = installFakeSupabase({ seed, external: async () => reply('{}') });
  const r = await invoke(await load('studio'), { body: { action: 'page_build', funnel_id: 'f1' } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /copy first/);
});

test('preview link: shared pages served sandboxed and noindex; unshared, unknown or malformed tokens are 404', async () => {
  const token = newToken();
  const seed = seedFunnel();
  seed.funnel_pages = [{ id: 'pg1', owner_id: OWNER.id, funnel_id: 'f1', version_no: 1, style: 'brand', html: '<!doctype html><html><body>Hi</body></html>', public_token: token, shared: true, status: 'draft' },
    { id: 'pg2', owner_id: OWNER.id, funnel_id: 'f1', version_no: 2, style: 'brand', html: '<html><body>Secret</body></html>', public_token: 'off_' + token, shared: false, status: 'draft' }];
  fake = installFakeSupabase({ seed });
  const config = await load('config');
  const r = await invoke(config, { method: 'GET', token: null, query: { page: token } });
  assert.equal(r.status, 200);
  assert.match(r.body, /Hi/);
  assert.match(r.headers['content-security-policy'], /^sandbox /);
  assert.match(r.headers['content-security-policy'], /default-src 'none'/);
  assert.ok(!/allow-scripts|allow-same-origin/.test(r.headers['content-security-policy']));
  assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow');
  for (const page of ['off_' + token, newToken(), 'short', "x' or 1=1--padpadpad", ['a', 'b']]) {
    const n = await invoke(config, { method: 'GET', token: null, query: { page } });
    assert.equal(n.status, 404, String(page));
    assert.ok(!String(n.body).includes('Secret'));
  }
  assert.equal((await invoke(config, { method: 'POST', token: null, query: { page: token } })).status, 405);
  assert.deepEqual(Object.keys(PAGE_HEADERS).sort(), ['Cache-Control', 'Content-Security-Policy', 'Content-Type', 'Referrer-Policy', 'X-Robots-Tag']);
});

const seedProgram = () => ({
  provider_keys: [key('anthropic', 'api_key', 'sk-ant-k')],
  programs: [{ id: 'p1', owner_id: OWNER.id, name: 'Lead Speed', description: 'Respond in five minutes', stage: 'draft', version: 1 }],
  program_modules: [{ id: 'm1', owner_id: OWNER.id, program_id: 'p1', title: 'Why speed', sort: 0 }, { id: 'm2', owner_id: OWNER.id, program_id: 'p1', title: 'The system', sort: 1 }],
  program_lessons: [{ id: 'l1', owner_id: OWNER.id, module_id: 'm1', title: 'Cold leads', body: 'Leads go cold in an hour', sort: 0 }, { id: 'l2', owner_id: OWNER.id, module_id: 'm2', title: 'Auto text', body: 'Send a text in one minute', sort: 0 }],
  brand_board: [], approvals: [], program_decks: [],
});

test('slides build: one AI call per module, joined into one deck, saved as a draft with an approval; PowerPoint download', async () => {
  let calls = 0;
  fake = installFakeSupabase({ seed: seedProgram(), external: async (url, init) => {
    calls++;
    const prompt = JSON.parse(init.body).messages[0].content;
    const last = /End with one cta slide/.test(prompt);
    return reply(JSON.stringify({ slides: [{ layout: 'section', title: /Why speed/.test(prompt) ? 'Why speed' : 'The system' }, { layout: 'bullets', title: 'Point', bullets: ['a'], notes: 'n' }, ...(last ? [{ layout: 'cta', title: 'Next', subtitle: 'Book a call' }] : [])] }));
  } });
  const studio = await load('studio');
  const r = await invoke(studio, { body: { action: 'slides_build', program_id: 'p1', style: 'dark' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(calls, 2);
  const d = fake.tables.program_decks[0];
  assert.deepEqual(d.slides.map((s) => s.layout), ['title', 'section', 'bullets', 'section', 'bullets', 'cta']);
  assert.deepEqual([d.slides[1].title, d.slides[3].title], ['Why speed', 'The system'], 'modules stay in order');
  assert.equal(d.status ?? 'draft', 'draft');
  assert.equal(fake.tables.approvals[0].payload.deck_id, d.id);
  assert.equal(d.approval_id, fake.tables.approvals[0].id);
  const one = await invoke(studio, { body: { action: 'slides_build', program_id: 'p1', module_id: 'm2' } });
  assert.equal(one.status, 200);
  assert.equal(calls, 3);
  const x = await invoke(studio, { body: { action: 'slides_pptx', deck_id: d.id } });
  assert.equal(x.status, 200, JSON.stringify(x.body));
  assert.equal(Buffer.from(x.body.b64, 'base64').subarray(0, 2).toString(), 'PK');
  assert.equal(x.body.filename, 'Lead-Speed.pptx');
  const m = await invoke(studio, { token: MEMBER_TOKEN, body: { action: 'slides_pptx', deck_id: d.id } });
  assert.notEqual(m.status, 200, 'not a workspace member in this fixture');
});

test('slides build: refuses a program with no lessons', async () => {
  const seed = seedProgram(); seed.program_lessons = [];
  fake = installFakeSupabase({ seed, external: async () => reply('{}') });
  const r = await invoke(await load('studio'), { body: { action: 'slides_build', program_id: 'p1' } });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /lesson/);
});
