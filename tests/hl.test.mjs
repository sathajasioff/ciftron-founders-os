import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { hlFetch, buildWrite, checkMove, boardStats, pickPipeline, sortStages, slimOpportunity, slimContact, HL_SCOPES } from '../api/_lib/hl.js';
import { leadsFrom, summarizeInsights } from '../api/_lib/meta.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const stages = [{ id: 's0', name: 'New Lead', position: 0 }, { id: 's1', name: 'Qualified Lead', position: 1 }, { id: 's2', name: 'Appointment Booked', position: 2 }];

test('hlFetch sends Bearer + Version v3 and falls back to 2021-07-28 on a version error', async () => {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push([String(url), init.headers.Version, init.headers.Authorization]);
    if (init.headers.Version === 'v3') return new Response(JSON.stringify({ message: 'Invalid version header' }), { status: 400 });
    return new Response(JSON.stringify({ pipelines: [] }), { status: 200 });
  };
  const r = await hlFetch('pit-x', '/opportunities/pipelines', { query: { locationId: 'L1' } });
  assert.deepEqual(r, { pipelines: [] });
  assert.equal(seen[0][0], 'https://services.leadconnectorhq.com/opportunities/pipelines?locationId=L1');
  assert.deepEqual(seen.map((s) => s[1]), ['v3', '2021-07-28']);
  assert.equal(seen[0][2], 'Bearer pit-x');
});

test('hlFetch names the missing scope on a 401 scope error', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ statusCode: 401, message: 'The token is not authorized for this scope.' }), { status: 401 });
  await assert.rejects(hlFetch('t', '/products/', { scope: 'products.readonly' }), (e) => e.status === 403 && /products\.readonly/.test(e.message));
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'Invalid JWT' }), { status: 401 });
  await assert.rejects(hlFetch('t', '/x'), (e) => /rejected the token/.test(e.message));
});

test('moves are forward-only unless allowed, and include the automation warning', () => {
  const w = buildWrite('move', { opportunityId: 'o1', pipelineId: 'p1', fromStageId: 's0', toStageId: 's2', name: 'Marc' }, { stages });
  assert.deepEqual(w.body, { pipelineId: 'p1', pipelineStageId: 's2' });
  assert.equal(w.method, 'PUT'); assert.equal(w.path, '/opportunities/o1'); assert.equal(w.scope, 'opportunities.write');
  assert.match(w.summary, /New Lead → Appointment Booked/); assert.match(w.warning, /automations/);
  assert.throws(() => buildWrite('move', { opportunityId: 'o1', pipelineId: 'p1', fromStageId: 's2', toStageId: 's0' }, { stages }), /forward-only/);
  assert.match(buildWrite('move', { opportunityId: 'o1', pipelineId: 'p1', fromStageId: 's2', toStageId: 's0', allowBackward: true }, { stages }).warning, /Backward/);
  assert.throws(() => checkMove(stages, 's1', 's1'), /already/);
  assert.throws(() => checkMove(stages, 's1', 'zz'), /not in this pipeline/);
});

test('custom values must start with OS_', () => {
  assert.throws(() => buildWrite('custom_value', { name: 'company_name', value: 'x' }, { locationId: 'L1' }), /OS_/);
  assert.throws(() => buildWrite('custom_value', { name: 'OS_bad name', value: 'x' }, { locationId: 'L1' }), /OS_/);
  const w = buildWrite('custom_value', { name: 'OS_offer_1_price', value: '497' }, { locationId: 'L1' });
  assert.equal(w.method, 'POST'); assert.equal(w.path, '/locations/L1/customValues');
  assert.equal(buildWrite('custom_value', { id: 'cv9', name: 'OS_a', value: 'b' }, { locationId: 'L1' }).path, '/locations/L1/customValues/cv9');
});

test('social posts are always drafts; contacts are validated; emails become HTML templates', () => {
  const s = buildWrite('social_draft', { text: 'Your follow-up is slow.', accountIds: ['acc1'], status: 'published' }, { locationId: 'L1' });
  assert.equal(s.body.status, 'draft'); assert.equal(s.path, '/social-media-posting/L1/posts'); assert.equal(s.scope, 'socialplanner/post.write');
  assert.throws(() => buildWrite('contact', { companyName: 'Only company' }, { locationId: 'L1' }), /name, email or phone/);
  assert.throws(() => buildWrite('contact', { firstName: 'A', email: 'nope' }, { locationId: 'L1' }), /email/);
  const c = buildWrite('contact', { firstName: 'Marc', email: 'MARC@Example.com', lastName: '' }, { locationId: 'L1' });
  assert.deepEqual(c.body, { locationId: 'L1', firstName: 'Marc', email: 'marc@example.com', source: 'Founders AI OS' });
  const e = buildWrite('email_template', { name: 'Reminder', subject: 'Tomorrow', body: 'Hi NAME,\n\nSee you <soon>.' }, { locationId: 'L1' });
  assert.equal(e.path, '/emails/locations/L1/templates'); assert.equal(e.body.editorType, 'html'); assert.equal(e.scope, 'emails/templates.write');
  assert.ok(e.body.editorContent.includes('&lt;soon&gt;') && e.body.editorContent.includes('<p>Hi NAME,</p>'));
  assert.throws(() => buildWrite('send_sms', {}, {}), /Unknown write/);
});

test('board helpers: pipeline choice, stage order, stats, no conversations', () => {
  const ps = [{ id: 'a', name: 'Sales' }, { id: 'b', name: 'Agency Pipeline', stages: [{ id: 'x', name: 'B', position: 1 }, { id: 'y', name: 'A', position: 0 }] }];
  assert.equal(pickPipeline(ps).id, 'b'); assert.equal(pickPipeline(ps, 'a').id, 'a');
  assert.deepEqual(sortStages(ps[1]).map((s) => s.id), ['y', 'x']);
  const now = Date.parse('2026-11-22T00:00:00Z');
  const opps = [
    { pipelineStageId: 's0', status: 'open', createdAt: '2026-11-20T00:00:00Z', monetaryValue: 497 },
    { pipelineStageId: 's1', status: 'open', createdAt: '2026-10-01T00:00:00Z', monetaryValue: 97 },
    { pipelineStageId: 's2', status: 'won', createdAt: '2026-11-21T00:00:00Z' },
  ];
  assert.deepEqual(boardStats(stages, opps, now), { total: 3, newLeads7d: 2, qualified: 1, appointments: 1, active: 2, won: 1, lost: 0, openValue: 594 });
  const o = slimOpportunity({ id: '1', name: 'X', notes: ['secret'], tasks: [1], contact: { id: 'c', name: 'Y', tags: ['a'] } });
  assert.ok(!('notes' in o) && !('tasks' in o) && o.contact.name === 'Y');
  assert.ok(!('conversations' in slimContact({ id: 'c', conversations: [1], firstName: 'A' })));
  assert.ok(HL_SCOPES.read.every(([s]) => /readonly/.test(s)) && HL_SCOPES.write.every(([s]) => /write/.test(s)));
});

test('Meta: leads use the largest lead action type, CPL and previous week', () => {
  assert.equal(leadsFrom([{ action_type: 'lead', value: '12' }, { action_type: 'onsite_conversion.lead_grouped', value: '14' }, { action_type: 'link_click', value: '300' }]), 14);
  assert.equal(leadsFrom([]), 0);
  const s = summarizeInsights(
    { data: [{ spend: '198.80', impressions: '12000', clicks: '310', actions: [{ action_type: 'lead', value: '14' }] }] },
    { data: [{ campaign_id: '1', campaign_name: 'Small', spend: '20', actions: [] }, { campaign_id: '2', campaign_name: 'Big', spend: '178.8', actions: [{ action_type: 'lead', value: '14' }] }] },
    { data: [{ spend: '160', actions: [{ action_type: 'lead', value: '10' }] }] });
  assert.equal(s.cpl, 14.2); assert.equal(s.leads, 14); assert.deepEqual(s.previous, { spend: 160, leads: 10, cpl: 16 });
  assert.deepEqual(s.campaigns.map((c) => [c.name, c.cpl]), [['Big', 12.77], ['Small', null]]);
});
