// Recurring routines: an agent runs a saved prompt daily, weekly or monthly.
// Every run only creates drafts in Approvals. Nothing is published, posted or sent.
import { getSecret, embed, claude } from './providers.js';
import { systemPrompt, extractDrafts, cleanCopy, CONTEXT_AGENTS } from './chat.js';
import { businessContext } from './context.js';
import { signalsBlock } from './studio.js';
import { ownerDb } from './mcp-tools.js';

const CONTENT_AGENTS = ['content-strategist', 'copywriter', 'designer', 'researcher'];
export const CADENCES = ['daily', 'weekly', 'monthly'];

// Local calendar parts in the owner's time zone.
export function localParts(now, timeZone = 'America/Toronto') {
  let tz = timeZone;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch { tz = 'America/Toronto'; }
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' })
    .formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, day: +p.day, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

// Due when enabled, the cadence matches today, and it has not already run today (local date).
export function isDue(r, now = new Date(), timeZone) {
  if (!r.enabled) return false;
  const today = localParts(now, timeZone);
  if (r.last_run_at && localParts(new Date(r.last_run_at), timeZone).date === today.date) return false;
  if (r.cadence === 'daily') return true;
  if (r.cadence === 'weekly') return today.weekday === (r.weekday ?? 1);
  if (r.cadence === 'monthly') return today.day === (r.day_of_month ?? 1);
  return false;
}

export function routinePrompt(r, now = new Date(), timeZone) {
  const when = { daily: 'today', weekly: 'this week', monthly: 'this month' }[r.cadence];
  const lang = r.language === 'fr-qc' ? 'Write in Quebec French (fr-qc), natural and local, not France French.' : 'Write in English.';
  return `Scheduled ${r.cadence} routine${r.title ? ` "${r.title}"` : ''}, run on ${localParts(now, timeZone).date} for ${when}.\n\n${r.prompt}\n\n${lang}\n`
    + 'Put every finished piece in its own <draft> tag so it lands in Approvals. Use only real facts from Brand DNA, the Brain and the live numbers. '
    + 'If the numbers you need are missing, say so in a short Brief draft instead of guessing.';
}

// Runs one routine. db reads are owner-scoped; inserts set owner_id explicitly.
export async function runRoutine(admin, ownerId, r, { now = new Date(), timeZone, callClaude = claude } = {}) {
  const one = async (q) => { const { data, error } = await q; if (error) throw new Error(error.message); return data; };
  const db = ownerDb(admin, ownerId);
  const finish = (patch) => one(admin.from('agent_routines').update({ last_run_at: now.toISOString(), ...patch }).eq('id', r.id).eq('owner_id', ownerId));
  try {
    const agent = await one(db.from('agents').select('*').eq('id', r.agent_id).maybeSingle());
    if (!agent) throw new Error('The agent for this routine no longer exists');
    if (!agent.enabled) { await finish({ last_status: 'skipped', last_error: `${agent.name} is turned off`, last_draft_count: 0 }); return { status: 'skipped', drafts: 0 }; }
    const key = await getSecret(admin, ownerId, 'anthropic', 'api_key');
    const dna = await one(db.from('brand_dna').select('markdown').eq('is_active', true).maybeSingle());
    const warnings = dna ? [] : ['No Brand DNA compiled yet.'];
    let brainHits = [];
    try {
      const [v] = await embed(await getSecret(admin, ownerId, 'openai', 'api_key'), [r.prompt.slice(0, 4000)]);
      brainHits = await one(admin.rpc('match_chunks_for', { p_owner: ownerId, query_embedding: JSON.stringify(v), match_count: 6, min_similarity: 0.3 }));
    } catch (e) { warnings.push(`Brain search skipped: ${e.message}`); }
    const context = CONTEXT_AGENTS.includes(agent.slug) ? (await businessContext(db, admin, ownerId, { meta: agent.slug !== 'crm-assistant' })).text : '';
    const signals = CONTENT_AGENTS.includes(agent.slug) ? signalsBlock(await one(db.from('learning_signals').select('signal').eq('state', 'on'))) : '';

    const raw = await callClaude(key, { system: systemPrompt({ dna: dna?.markdown, agent, brainHits, warnings, context, signals }), prompt: routinePrompt(r, now, timeZone), maxTokens: 3500 });
    let { drafts, reply } = extractDrafts(raw);
    // A reply without draft tags is still kept, as one brief, so the run is never lost.
    if (!drafts.length && reply.trim()) drafts = [{ type: 'Brief', title: `${r.title || agent.name}: ${localParts(now, timeZone).date}`, language: r.language || 'en', target: 'content', tags: ['routine'], body: cleanCopy(reply.trim()) }];
    const label = `${agent.name} (${r.cadence} routine)`;
    if (drafts.length) {
      await one(admin.from('approvals').insert(drafts.map((d) => ({
        owner_id: ownerId, type: d.type, title: d.title, payload: { body: d.body, routine_id: r.id }, tags: [...new Set([...(d.tags || []), 'routine'])].slice(0, 8),
        language: d.language, source_agent: label, target_module: d.target, authored_by: 'ai',
      }))));
    }
    await finish({ last_status: 'ok', last_error: null, last_draft_count: drafts.length });
    await admin.from('audit_log').insert({ owner_id: ownerId, action: 'routine_run', entity: 'agent_routines', entity_id: r.id, detail: { drafts: drafts.length, cadence: r.cadence } });
    return { status: 'ok', drafts: drafts.length };
  } catch (e) {
    await finish({ last_status: 'error', last_error: String(e.message || e).slice(0, 500), last_draft_count: 0 }).catch(() => {});
    return { status: 'error', error: e.message };
  }
}
