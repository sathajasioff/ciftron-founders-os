import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGoal, goalValue, computeSignals, validateFunnel, validateSequence, mapInstagram, mapYouTube, scorePosts, median, aspectFor, graphicPrompt, validateProgram, programText, validateBrief, signalsBlock, FORMATS } from '../api/_lib/studio.js';
import { systemPrompt, JARVIS_SYSTEM } from '../api/_lib/chat.js';

const stages = ['New Lead', 'Qualified Lead', 'Appointment Booked'];

test('goals: metric keys are validated against real stages, missing numbers stay null', () => {
  assert.equal(validateGoal({ metric_key: 'hl_stage:appointment booked', target_value: 15 }, stages).metric_key, 'hl_stage:Appointment Booked');
  assert.equal(validateGoal({ metric_key: 'hl_stage:Made Up' }, stages).metric_key, 'manual');
  assert.equal(validateGoal({ metric_key: 'revenue_magic' }, stages).metric_key, 'manual');
  const g = validateGoal({ target: 'x — y', target_value: 'lots', due_date: 'next week', checklist: ['a', '', 'b'] }, stages);
  assert.equal(g.target_value, null); assert.equal(g.due_date, null); assert.deepEqual(g.checklist, ['a', 'b']); assert.ok(!g.target.includes('—'));
});

test('goals: live values per metric', () => {
  const board = { stages: stages.map((n, i) => ({ id: 's' + i, name: n })), opportunities: [
    { pipelineStageId: 's0', createdAt: '2026-11-10', status: 'open' }, { pipelineStageId: 's2', createdAt: '2026-11-12', status: 'open' },
    { pipelineStageId: 's1', createdAt: '2026-10-01', status: 'won', lastStageChangeAt: '2026-11-15' }] };
  const g = (k) => ({ metric_key: k, start_date: '2026-11-01' });
  assert.equal(goalValue(g('hl_new_leads'), { board }), 2);
  assert.equal(goalValue(g('hl_stage:Qualified Lead'), { board }), 1);
  assert.equal(goalValue(g('hl_won'), { board }), 1);
  assert.equal(goalValue(g('meta_cpl'), { meta: { cpl: 14.2 } }), 14.2);
  assert.equal(goalValue(g('hl_new_leads'), {}), null, 'no HighLevel means no value, not zero');
  assert.equal(goalValue(g('manual'), { board }), null);
  assert.equal(goalValue(g('content_published'), { content: [{ stage: 'Uploaded', updated_at: '2026-11-20' }, { stage: 'Idea', updated_at: '2026-11-20' }] }), 1);
});

test('learning signals come only from real decisions', () => {
  const mk = (type, status, extra = {}) => ({ type, status, tags: [], language: 'en', authored_by: 'ai', trashed_at: null, ...extra });
  const items = [...Array(4)].map(() => mk('Hooks', 'approved', { tags: ['mortgage'] })).concat([mk('Hooks', 'passed')], [...Array(3)].map(() => mk('Idea', 'passed')), [mk('Caption', 'pending')]);
  const s = computeSignals(items);
  assert.ok(s.some((x) => x.key === 'type_up:Hooks' && /4 of 5/.test(x.signal)));
  assert.ok(s.some((x) => x.key === 'type_down:Idea'));
  assert.ok(s.some((x) => x.key === 'tag_up:mortgage'));
  assert.ok(!s.some((x) => x.key.includes('Caption')), 'pending items are not decisions');
  assert.deepEqual(computeSignals([]), []);
  assert.match(signalsBlock([{ signal: 'A' }]), /- A/); assert.equal(signalsBlock([]), '');
});

test('funnel and sequence output is validated and cleaned', () => {
  assert.throws(() => validateFunnel({ headline: '', sections: [] }), /incomplete/);
  const f = validateFunnel({ headline: 'Stop losing leads — fast', subheadline: 's', sections: [{ heading: 'H', body: 'B', bullets: ['x', ''] }], emails: [{ subject: 'S', body: 'B' }, { subject: '', body: 'x' }], faq: [{ q: 'Q', a: '' }] });
  assert.ok(!f.headline.includes('—')); assert.equal(f.emails.length, 1); assert.equal(f.faq.length, 0); assert.deepEqual(f.sections[0].bullets, ['x']); assert.equal(f.cta, 'Book a call');
  assert.throws(() => validateSequence({ emails: [] }), /no emails/);
  assert.equal(validateSequence({ emails: [{ subject: 'Hi', body: 'NAME' }] }).name, 'Email sequence');
});

test('research: Instagram and YouTube mapping and outlier scores', () => {
  assert.deepEqual(mapInstagram({ id: '1', caption: 'Line one\nmore', videoPlayCount: 900, type: 'Video', timestamp: 't', url: 'u' }), { external_id: '1', title: 'Line one', url: 'u', format: 'Reel', views: 900, posted_at: 't' });
  assert.equal(mapInstagram({ shortCode: 'abc', likesCount: 50, type: 'Sidecar' }).url, 'https://www.instagram.com/p/abc/');
  assert.equal(mapYouTube({ id: 'v', snippet: { title: 'T' }, statistics: { viewCount: '12' } }).views, 12);
  assert.equal(median([1, 3, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.equal(median([]), 0);
  const s = scorePosts([{ views: 100 }, { views: 200 }, { views: 1000 }]);
  assert.equal(s.median, 200); assert.deepEqual(s.posts.map((p) => p.outlier_score), [0.5, 1, 5]);
});

test('graphics: aspect ratios and brand-aware prompts that never copy references', () => {
  assert.equal(aspectFor('YouTube thumbnail'), '16:9'); assert.equal(aspectFor('Instagram Story'), '9:16'); assert.equal(aspectFor('Instagram feed post'), '1:1');
  assert.deepEqual(FORMATS['LinkedIn graphic'], [1200, 627]);
  const p = graphicPrompt({ format: 'Meta Ads graphic', headline: 'Your bank said no?', board: { palettes: [{ colors: ['#000', '#fff'] }], fonts: [{ heading: 'Space Grotesk', body: 'DM Sans' }] }, hasReference: true });
  assert.ok(p.includes('1080x1080') && p.includes('#000, #fff') && p.includes('Space Grotesk') && p.includes('"Your bank said no?"') && /Do not copy its text, logos, people or faces/.test(p));
});

test('programs and vault briefs', () => {
  assert.throws(() => validateProgram({ name: 'x', modules: [] }), /incomplete/);
  const p = validateProgram({ name: 'Bootcamp', description: 'd', modules: [{ title: 'M1', lessons: [{ title: 'L1', summary: 's' }, { title: '' }] }] });
  assert.equal(p.modules[0].lessons.length, 1); assert.match(programText(p), /Module 1: M1\n- L1: s/);
  assert.equal(validateBrief({}).title, 'Brief');
});

test('Jarvis prompt is short-spoken, read-only and skips draft blocks', () => {
  const s = systemPrompt({ dna: 'DNA', mode: 'jarvis', context: 'HighLevel pipeline: 3 open' });
  assert.ok(s.includes(JARVIS_SYSTEM) && s.includes('HighLevel pipeline: 3 open') && !s.includes('<draft'));
  assert.match(JARVIS_SYSTEM, /cannot change anything/); assert.match(JARVIS_SYSTEM, /Never read out contact details or conversations/);
});
