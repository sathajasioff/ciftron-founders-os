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
  assert.deepEqual(mapInstagram({ id: '1', caption: 'Line one\nmore', videoPlayCount: 900, type: 'Video', timestamp: 't', url: 'u' }), { external_id: '1', title: 'Line one', url: 'u', format: 'Reel', views: 900, likes: null, comments: null, shares: null, thumbnail_url: null, posted_at: 't' });
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

// Phase 8
import { scorePosts as score8, mapFacebook, mapLinkedIn, mapInstagram as mapIg8, mapYouTube as mapYt8, apifyPlan, apifyRun, validateContentFunnel, validatePlaybook, playbookBlock, ideaBody } from '../api/_lib/studio.js';

test('feed: Facebook and LinkedIn items map with engagement; Instagram and YouTube keep likes, comments, thumbnails', () => {
  const fb = mapFacebook({ postId: '9', text: 'Line one\nmore', url: 'https://facebook.com/p/9', likes: 40, comments: 5, shares: 2, time: '2026-11-01T10:00:00Z', media: [{ thumbnail: 'https://scontent.example/x.jpg' }] });
  assert.deepEqual([fb.external_id, fb.title, fb.likes, fb.comments, fb.shares, fb.thumbnail_url, fb.format], ['9', 'Line one', 40, 5, 2, 'https://scontent.example/x.jpg', 'Photo']);
  const li = mapLinkedIn({ urn: 'urn:li:activity:1', text: 'Post', url: 'https://linkedin.com/feed/update/1', stats: { total_reactions: 120, comments: 9, reposts: 3 }, postedAt: '2026-11-02' });
  assert.deepEqual([li.likes, li.comments, li.shares], [120, 9, 3]);
  assert.equal(mapLinkedIn({ id: 'x', num_likes: 7, num_comments: 1 }).likes, 7);
  const ig = mapIg8({ id: '1', caption: 'Hi', videoPlayCount: 900, likesCount: 50, commentsCount: 4, displayUrl: 'https://cdn.example/a.jpg', type: 'Video' });
  assert.deepEqual([ig.views, ig.likes, ig.comments, ig.thumbnail_url], [900, 50, 4, 'https://cdn.example/a.jpg']);
  assert.equal(mapIg8({ id: '2', displayUrl: 'http://insecure/x.jpg' }).thumbnail_url, null, 'only https thumbnails');
  const yt = mapYt8({ id: 'v', snippet: { title: 'T', thumbnails: { medium: { url: 'https://i.ytimg.com/v.jpg' } } }, statistics: { viewCount: '10', likeCount: '2', commentCount: '1' } });
  assert.deepEqual([yt.views, yt.likes, yt.comments, yt.thumbnail_url], [10, 2, 1, 'https://i.ytimg.com/v.jpg']);
});

test('feed: scoring uses views when present, engagement otherwise', () => {
  const v = score8([{ views: 100 }, { views: 300 }, { views: 1000 }]);
  assert.equal(v.metric, 'views');
  assert.equal(v.posts[2].outlier_score, 3.33);
  const e = score8([{ likes: 10, comments: 0 }, { likes: 10, comments: 5 }, { likes: 100, comments: 20, shares: 10 }]);
  assert.equal(e.metric, 'engagement');
  assert.equal(e.posts[2].engagement, 170);
  assert.equal(e.median, 20);
  assert.equal(e.posts[2].outlier_score, 8.5);
});

test('apify: the right actor and input per platform; LinkedIn actor can be swapped', () => {
  assert.equal(apifyPlan('Facebook', { handle: '@ciftron' }).input.startUrls[0].url, 'https://www.facebook.com/ciftron');
  assert.equal(apifyPlan('LinkedIn', { handle: '@x', profile_url: 'https://www.linkedin.com/in/jasinthan' }).input.profileUrls[0], 'https://www.linkedin.com/in/jasinthan');
  assert.equal(apifyPlan('LinkedIn', { handle: 'x' }, { APIFY_LINKEDIN_ACTOR: 'me~li' }).actor, 'me~li');
  assert.equal(apifyPlan('YouTube', { handle: 'x' }), null);
});

test('apify: a finished run returns posts and its cost; an unfinished run reports its cost too', async () => {
  const calls = [];
  const ok = async (url) => { calls.push(String(url)); return String(url).includes('/runs')
    ? new Response(JSON.stringify({ data: { id: 'r1', status: 'SUCCEEDED', usageTotalUsd: 0.0123, defaultDatasetId: 'd1' } }), { status: 201 })
    : new Response(JSON.stringify([{ postId: '1', likes: 3 }, { postId: '2', likes: 9 }, { nothing: true }]), { status: 200 }); };
  const r = await apifyRun('tok', { actor: 'apify~facebook-posts-scraper', input: {}, map: mapFacebook }, ok);
  assert.deepEqual([r.cost, r.posts.length, r.runId], [0.0123, 2, 'r1']);
  assert.match(calls[0], /waitForFinish=55/);
  assert.match(calls[1], /datasets\/d1\/items/);
  const slow = async () => new Response(JSON.stringify({ data: { id: 'r2', status: 'RUNNING', usageTotalUsd: 0.004 } }), { status: 201 });
  await assert.rejects(apifyRun('tok', { actor: 'a', input: {}, map: mapFacebook }, slow), (e) => /still running/.test(e.message) && e.run.cost === 0.004);
});

test('content funnel: ideas per stage are cleaned, capped and formatted', () => {
  const out = validateContentFunnel({ tofu: [{ title: 'Why leads go cold — fast', format: 'Reel', hook: 'h', angle: 'a', cta: 'c' }, { title: 'x' }, { title: 'y' }], mofu: [{ title: '' }], bofu: [{ title: 'Book the audit', format: 'Carousel' }] }, { tofu: 2, mofu: 3, bofu: 1 });
  assert.equal(out.tofu.length, 2);
  assert.equal(out.tofu[0].title, 'Why leads go cold, fast');
  assert.equal(out.tofu[0].format, 'Short video', 'unknown formats fall back');
  assert.equal(out.mofu.length, 0);
  assert.equal(out.bofu[0].format, 'Carousel');
  assert.match(ideaBody(out.bofu[0], 'bofu'), /Bottom of funnel/);
  assert.throws(() => validateContentFunnel({}, { tofu: 1, mofu: 1, bofu: 1 }), /no ideas/);
});

test('playbook: only pairs backed by a real quote from the material, no repeats', () => {
  const material = 'Most brokers lose leads because they call back the next day. I call within five minutes, every time.';
  const pairs = validatePlaybook({ pairs: [
    { question: 'How fast should I call a lead?', answer: 'Within five minutes.', quote: 'I call within five minutes, every time.' },
    { question: 'Do you guarantee results?', answer: 'Yes, 10x.', quote: 'We guarantee 10x results for every client.' },
    { question: 'How fast should I call a lead?', answer: 'dup', quote: 'I call within five minutes' },
    { question: 'Old one', answer: 'a', quote: 'Most brokers lose leads because' },
  ] }, material, ['Old one']);
  assert.deepEqual(pairs.map((p) => p.question), ['How fast should I call a lead?']);
  assert.match(playbookBlock([{ question: 'Q1', answer: 'A1' }]), /Q: Q1\nA: A1/);
  assert.equal(playbookBlock([]), '');
});
