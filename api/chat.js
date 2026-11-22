// AI Chat and AI Team. Every message loads Brand DNA and searches the Brain.
// Finished deliverables are saved to Approvals; nothing is published or sent.
import { handler, requireOwner, HttpError } from './_lib/http.js';
import { getSecret, embed, claude, gpt, openrouter, OPENAI_MODEL, ANTHROPIC_MODEL } from './_lib/providers.js';
import { extractText } from './_lib/brain.js';
import {
  systemPrompt, CHALLENGER_SYSTEM, VERDICT_SYSTEM, cleanCopy, extractDrafts, extractHandoff, linkDrafts, threadTitle, ACTIVE_AGENTS, CONTEXT_AGENTS,
} from './_lib/chat.js';
import { businessContext } from './_lib/context.js';
import { signalsBlock, playbookBlock } from './_lib/studio.js';

const CONTENT_AGENTS = ['content-strategist', 'copywriter', 'designer', 'researcher'];

export const config = { maxDuration: 60 };

const one = async (q) => { const { data, error } = await q; if (error) throw new HttpError(400, error.message); return data; };
const MAX_ATTACH = 8;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export default handler(['POST'], async (req, body) => {
  const { user, db, admin } = await requireOwner(req);
  const message = String(body.message || '').trim().slice(0, 40000); // room for attached connection data
  const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, MAX_ATTACH + 1) : [];
  if (!message && !attachments.length) throw new HttpError(400, 'Type a message');
  if (attachments.length > MAX_ATTACH) throw new HttpError(400, `Up to ${MAX_ATTACH} files per message`);
  if (attachments.some((a) => !String(a.path || '').startsWith(`${user.id}/chat/`))) throw new HttpError(400, 'Invalid attachment');

  // Model picker: 'claude' (default), 'gpt', or 'or:<openrouter model id>'. Strategy Room always uses its own pair.
  const pick = String(body.model || 'claude');
  if (!/^(claude|gpt|or:[A-Za-z0-9._:/~-]{3,120})$/.test(pick)) throw new HttpError(400, 'Unknown model');
  const anthropicKey = pick === 'claude' || body.mode === 'jarvis' || body.strategy_room ? await getSecret(admin, user.id, 'anthropic', 'api_key') : null;
  const warnings = [];
  const playbook = playbookBlock(await db.from('voice_playbook').select('question, answer').eq('status', 'approved').order('updated_at', { ascending: false }).limit(12).then((r) => r.data || [], () => []));

  // Jarvis: short spoken answers from live context. Nothing is stored as a transcript.
  if (body.mode === 'jarvis') {
    const [ctx, dnaRow] = await Promise.all([businessContext(db, admin, user.id), one(db.from('brand_dna').select('markdown').eq('is_active', true).maybeSingle())]);
    const history = (Array.isArray(body.history) ? body.history.slice(-8) : []).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) })).filter((m) => m.content);
    while (history.length && history[0].role !== 'user') history.shift();
    const reply = await claude(anthropicKey, { system: systemPrompt({ dna: dnaRow?.markdown, mode: 'jarvis', context: ctx.text, playbook }), messages: [...history, { role: 'user', content: message }], maxTokens: 400 });
    return { reply: cleanCopy(reply).replace(/[*#`_]/g, '').trim() };
  }

  // Agent and thread
  let agent = null;
  if (body.agent_slug) {
    if (!ACTIVE_AGENTS.includes(body.agent_slug)) throw new HttpError(400, 'That agent arrives in a later phase');
    agent = await one(db.from('agents').select('*').eq('slug', body.agent_slug).single());
    if (!agent.enabled) throw new HttpError(400, `${agent.name} is turned off. Enable it in AI Team.`);
  }
  let thread;
  if (body.thread_id) thread = await one(db.from('threads').select('*').eq('id', body.thread_id).single());
  else thread = await one(db.from('threads').insert({ owner_id: user.id, agent_id: agent?.id || null, title: threadTitle(message), strategy_room: !!body.strategy_room }).select().single());

  // Context: Brand DNA and Brain search
  const dnaRow = await one(db.from('brand_dna').select('version_no, markdown').eq('is_active', true).maybeSingle());
  let brainHits = [];
  if (message) {
    try {
      const [v] = await embed(await getSecret(admin, user.id, 'openai', 'api_key'), [message.slice(0, 4000)]);
      brainHits = await one(db.rpc('match_chunks', { query_embedding: JSON.stringify(v), match_count: 6, min_similarity: 0.3 }));
    } catch (e) {
      warnings.push(`Brain search skipped: ${e.message}`);
    }
  }
  if (!dnaRow) warnings.push('No Brand DNA compiled yet, so answers use only this chat.');
  const liveCtx = agent && CONTEXT_AGENTS.includes(agent.slug) ? (await businessContext(db, admin, user.id, { meta: agent.slug !== 'crm-assistant' })).text : '';
  const sig = agent && CONTENT_AGENTS.includes(agent.slug) ? signalsBlock(await one(db.from('learning_signals').select('signal').eq('state', 'on'))) : '';

  // Attachments become content blocks for Claude.
  const blocks = [];
  const savedAttachments = [];
  for (const a of attachments) {
    const { data: blob, error } = await db.storage.from('brain').download(a.path);
    if (error) throw new HttpError(400, `Could not read ${a.name}`);
    const bytes = await blob.arrayBuffer();
    const mime = a.mime || blob.type || '';
    savedAttachments.push({ path: a.path, name: a.name, mime, size: bytes.byteLength });
    if (IMAGE_TYPES.includes(mime)) {
      if (bytes.byteLength > 5 * 1024 * 1024) throw new HttpError(400, `${a.name} is over 5 MB`);
      blocks.push({ type: 'image', source: { type: 'base64', media_type: mime, data: Buffer.from(bytes).toString('base64') } });
    } else {
      const text = await extractText({ bytes, mime, name: a.name });
      blocks.push({ type: 'text', text: `<attachment name="${a.name}">\n${text.slice(0, 20000)}\n</attachment>` });
    }
  }

  await one(db.from('messages').insert({ owner_id: user.id, thread_id: thread.id, role: 'user', content: message, attachments: savedAttachments }));

  // History (last 20 turns), with this message's attachments added to the final user turn.
  const history = (await one(db.from('messages').select('role, content').eq('thread_id', thread.id).in('role', ['user', 'assistant', 'verdict']).order('created_at', { ascending: false }).limit(20))).reverse();
  const messages = history.map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content || '(attachment)' }));
  if (blocks.length) messages[messages.length - 1] = { role: 'user', content: [...blocks, { type: 'text', text: message || 'See the attached files.' }] };
  while (messages.length && messages[0].role !== 'user') messages.shift();

  const sources = [
    ...(dnaRow ? [{ kind: 'dna', label: `Brand DNA v${dnaRow.version_no}` }] : []),
    ...brainHits.map((h) => ({ kind: 'brain', label: h.source_name, snippet: h.content.slice(0, 160), similarity: Math.round(h.similarity * 100) })),
  ];
  const out = [];
  const savedDrafts = [];

  const saveDrafts = async (drafts, agentName) => {
    if (!drafts.length) return [];
    const rows = await one(db.from('approvals').insert(drafts.map((d) => ({
      owner_id: user.id, type: d.type, title: d.title, payload: { body: d.body, thread_id: thread.id }, tags: d.tags, language: d.language,
      source_agent: agentName, target_module: d.target, authored_by: 'ai',
    }))).select('id, title, type'));
    savedDrafts.push(...rows);
    return rows;
  };
  const say = async (role, content, extra = {}) => {
    const row = await one(db.from('messages').insert({ owner_id: user.id, thread_id: thread.id, role, content, sources: extra.sources || [], model: extra.model || null }).select().single());
    out.push(row);
    return row;
  };

  if (body.strategy_room && !agent) {
    // Strategist (Claude) -> Challenger (GPT, Claude fallback) -> Verdict (Claude)
    const sys = systemPrompt({ dna: dnaRow?.markdown, brainHits, mode: 'strategy', warnings });
    const strategist = cleanCopy(await claude(anthropicKey, { system: sys + '\n\nYou are the Strategist. Give a clear, specific recommendation in under 250 words.', messages, maxTokens: 900 }));
    await say('strategist', strategist, { model: ANTHROPIC_MODEL, sources });
    const roomPrompt = `Owner's question:\n${message}\n\nStrategist's answer:\n${strategist}\n\nBrand DNA:\n${dnaRow?.markdown || '(none yet)'}`;
    let challenger, challengerModel = OPENAI_MODEL;
    try {
      challenger = await gpt(await getSecret(admin, user.id, 'openai', 'api_key'), { system: CHALLENGER_SYSTEM, prompt: roomPrompt, maxTokens: 700 });
    } catch (e) {
      warnings.push(`Challenger used Claude because OpenAI failed: ${e.message}`);
      challengerModel = ANTHROPIC_MODEL;
      challenger = await claude(anthropicKey, { system: CHALLENGER_SYSTEM, prompt: roomPrompt, maxTokens: 700 });
    }
    challenger = cleanCopy(challenger);
    await say('challenger', challenger, { model: challengerModel });
    const verdict = cleanCopy(await claude(anthropicKey, { system: VERDICT_SYSTEM, prompt: `${roomPrompt}\n\nChallenger's critique:\n${challenger}`, maxTokens: 700 }));
    await say('verdict', verdict, { model: ANTHROPIC_MODEL });
  } else {
    const sysText = systemPrompt({ dna: dnaRow?.markdown, agent, brainHits, warnings, context: liveCtx, signals: sig, playbook });
    let raw, usedModel = ANTHROPIC_MODEL;
    if (pick === 'claude') raw = await claude(anthropicKey, { system: sysText, messages, maxTokens: 3000 });
    else {
      // Other models get text only; images stay with Claude.
      if (blocks.some((b) => b.type === 'image')) warnings.push('Images were only read by Claude. Switch to Claude to discuss images.');
      const textMsgs = messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n') }));
      if (pick === 'gpt') { raw = await gpt(await getSecret(admin, user.id, 'openai', 'api_key'), { system: sysText, messages: textMsgs, maxTokens: 3000 }); usedModel = OPENAI_MODEL; }
      else { usedModel = pick.slice(3); raw = await openrouter(await getSecret(admin, user.id, 'openrouter', 'api_key'), { model: usedModel, system: sysText, messages: textMsgs, maxTokens: 3000 }); }
    }
    let { handoff, reply } = agent?.slug === 'chief-of-staff' ? extractHandoff(raw) : { handoff: null, reply: raw };
    const { drafts, reply: r2 } = extractDrafts(reply);
    const saved = await saveDrafts(drafts, agent?.name || 'AI Chat');
    await say('assistant', cleanCopy(linkDrafts(r2, saved)), { model: usedModel, sources });

    // Chief of Staff hands work to the Content Strategist, in that agent's own thread.
    if (handoff && ACTIVE_AGENTS.includes(handoff.to) && handoff.to !== 'chief-of-staff') {
      const spec = await one(db.from('agents').select('*').eq('slug', handoff.to).single());
      if (!spec.enabled) {
        await say('system', `${spec.name} is turned off, so this was not handed off.`);
      } else {
        let specThread = await one(db.from('threads').select('*').eq('agent_id', spec.id).order('updated_at', { ascending: false }).limit(1).maybeSingle());
        if (!specThread) specThread = await one(db.from('threads').insert({ owner_id: user.id, agent_id: spec.id, title: threadTitle(handoff.task) }).select().single());
        await one(db.from('messages').insert({ owner_id: user.id, thread_id: specThread.id, role: 'user', content: `From Chief of Staff: ${handoff.task}` }));
        const specRaw = await claude(anthropicKey || await getSecret(admin, user.id, 'anthropic', 'api_key'), { system: systemPrompt({ dna: dnaRow?.markdown, agent: spec, brainHits, warnings, playbook }), prompt: handoff.task, maxTokens: 3000 });
        const sd = extractDrafts(specRaw);
        const specSaved = await saveDrafts(sd.drafts, spec.name);
        await one(db.from('messages').insert({ owner_id: user.id, thread_id: specThread.id, role: 'assistant', content: cleanCopy(linkDrafts(sd.reply, specSaved)), sources, model: ANTHROPIC_MODEL }));
        await one(db.from('threads').update({ title: specThread.title }).eq('id', specThread.id));
        await say('system', `${spec.name} finished: ${specSaved.length ? `${specSaved.length} draft${specSaved.length > 1 ? 's' : ''} saved to Approvals.` : 'see its thread in AI Team.'}`);
      }
    }
  }

  await one(db.from('threads').update({ title: thread.title }).eq('id', thread.id));
  return { thread_id: thread.id, messages: out, drafts: savedDrafts, warnings };
});
