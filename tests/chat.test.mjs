import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDrafts, extractHandoff, linkDrafts, cleanCopy, systemPrompt, threadTitle, AGENT_SEEDS, ACTIVE_AGENTS } from '../api/_lib/chat.js';

test('extractDrafts pulls typed drafts and leaves markers', () => {
  const raw = `Here are your hooks.
<draft type="hooks" title="5 Reel hooks — mortgage" language="fr-qc" target="content" tags="Mortgage, Reels">
1. Your leads are not cold — your follow-up is slow.
2. Reply in 10–15 minutes.
</draft>
And a caption:
<draft type="Caption" target="nowhere">Short caption</draft>`;
  const { drafts, reply } = extractDrafts(raw);
  assert.equal(drafts.length, 2);
  assert.deepEqual({ ...drafts[0], body: undefined }, { type: 'Hooks', title: '5 Reel hooks, mortgage', language: 'fr-qc', target: 'content', tags: ['mortgage', 'reels'], body: undefined });
  assert.ok(drafts[0].body.includes('not cold, your follow-up') && drafts[0].body.includes('10-15'));
  assert.equal(drafts[1].target, 'content');
  assert.equal(drafts[1].language, 'en');
  assert.ok(reply.includes('[[draft:0]]') && !reply.includes('<draft'));
  assert.equal(linkDrafts(reply, [{ title: 'A' }, { title: 'B' }]).match(/Saved to Approvals/g).length, 2);
});

test('extractHandoff finds a handoff and strips it', () => {
  const { handoff, reply } = extractHandoff('Routing this to the Content Strategist.\n<handoff to="content-strategist">Write 5 hooks for mortgage brokers</handoff>');
  assert.deepEqual(handoff, { to: 'content-strategist', task: 'Write 5 hooks for mortgage brokers' });
  assert.equal(reply, 'Routing this to the Content Strategist.');
  assert.equal(extractHandoff('no handoff').handoff, null);
});

test('cleanCopy removes em and en dashes but keeps number ranges', () => {
  assert.equal(cleanCopy('Fast — and simple'), 'Fast, and simple');
  assert.equal(cleanCopy('Pages 10–15'), 'Pages 10-15');
  assert.ok(!/[–—]/.test(cleanCopy('a – b — c')));
});

test('systemPrompt includes Brand DNA, Brain hits, house rules and agent role', () => {
  const s = systemPrompt({ dna: '# Brand DNA v2\n- Runs Ciftron', agent: AGENT_SEEDS[1], brainHits: [{ source_name: 'Call notes', content: 'brokers wait 2 hours' }] });
  assert.ok(s.includes('Runs Ciftron') && s.includes('[B1] Call notes') && s.includes('No em dashes') && s.includes('Content Strategist') && s.includes('<draft'));
  const none = systemPrompt({ dna: null, mode: 'strategy' });
  assert.ok(none.includes('Not compiled yet') && !none.includes('<draft'));
});

test('agent seeds: Chief of Staff pinned, only two active in Phase 3', () => {
  assert.deepEqual(ACTIVE_AGENTS, ['chief-of-staff', 'content-strategist']);
  assert.ok(AGENT_SEEDS[0].pinned && AGENT_SEEDS[0].enabled);
  assert.ok(AGENT_SEEDS.filter((a) => a.enabled).every((a) => ACTIVE_AGENTS.includes(a.slug)));
  assert.equal(threadTitle('  hello   world '), 'hello world');
  assert.ok(threadTitle('x'.repeat(10) + ' ' + 'y'.repeat(80)).endsWith('...'));
});
