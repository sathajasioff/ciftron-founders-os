// Read-only business context for Jarvis, analyst agents and Goals. Each source fails soft.
import { getSecret } from './providers.js';
import { loadBoard, boardStats } from './hl.js';
import { metaSummary } from './meta.js';

export async function hlBoard(db, admin, userId) {
  const token = await getSecret(admin, userId, 'highlevel', 'private_integration_token');
  const { data: conn } = await db.from('connections').select('config').eq('provider', 'highlevel').maybeSingle();
  if (!conn?.config?.location_id) throw new Error('HighLevel Location ID missing');
  const b = await loadBoard(token, conn.config.location_id);
  return { ...b, stats: boardStats(b.stages, b.opportunities) };
}

export async function metaNow(db, admin, userId, range = 'last_7d') {
  const token = await getSecret(admin, userId, 'meta_ads', 'access_token');
  const { data: conn } = await db.from('connections').select('config').eq('provider', 'meta_ads').maybeSingle();
  let acct = String(conn?.config?.ad_account_id || '').trim();
  if (!acct) throw new Error('Meta ad account missing');
  if (!acct.startsWith('act_')) acct = 'act_' + acct.replace(/\D/g, '');
  return metaSummary(token, acct, range);
}

// A compact text block an AI can read. Never includes contact details or conversations.
export async function businessContext(db, admin, userId, { meta = true, hl = true } = {}) {
  const lines = [];
  const settle = (p) => p.then((v) => ({ v }), (e) => ({ e: e.message }));
  const [board, m, approvals, content, goals] = await Promise.all([
    hl ? settle(hlBoard(db, admin, userId)) : { e: 'skipped' },
    meta ? settle(metaNow(db, admin, userId)) : { e: 'skipped' },
    settle(db.from('approvals').select('title, type, source_agent').eq('status', 'pending').is('trashed_at', null).order('created_at', { ascending: false }).limit(10).then((r) => r.data || [])),
    settle(db.from('content_items').select('title, format, stage, publish_date').order('publish_date').limit(15).then((r) => r.data || [])),
    settle(db.from('goals').select('raw, target, current_value, target_value, unit, due_date').limit(10).then((r) => r.data || [])),
  ]);
  if (board.v) {
    const s = board.v.stats;
    const byStage = board.v.stages.map((st) => `${st.name}: ${board.v.opportunities.filter((o) => o.pipelineStageId === st.id).length}`).join(', ');
    lines.push(`HighLevel pipeline "${board.v.pipeline?.name}": ${s.total} opportunities, ${s.newLeads7d} new in 7 days, ${s.active} open, ${s.won} won, ${s.lost} lost, open value $${s.openValue}. By stage: ${byStage}.`);
  } else lines.push(`HighLevel: not available (${board.e}).`);
  if (m.v) {
    const v = m.v;
    lines.push(`Meta Ads last 7 days: spend $${v.spend}, ${v.leads} leads, cost per lead ${v.cpl != null ? '$' + v.cpl : 'n/a'}${v.previous ? ` (previous week: $${v.previous.spend}, ${v.previous.leads} leads, CPL ${v.previous.cpl != null ? '$' + v.previous.cpl : 'n/a'})` : ''}. Top campaigns: ${v.campaigns.slice(0, 5).map((c) => `${c.name} $${c.spend} ${c.leads} leads`).join('; ') || 'none'}.`);
  } else lines.push(`Meta Ads: not available (${m.e}).`);
  if (approvals.v) lines.push(`Waiting in Approvals (${approvals.v.length}): ${approvals.v.map((a) => `${a.title} [${a.type}]`).join('; ') || 'nothing'}.`);
  if (content.v) lines.push(`Content board: ${content.v.map((c) => `${c.title} (${c.format}, ${c.stage}${c.publish_date ? ', ' + c.publish_date : ''})`).join('; ') || 'empty'}.`);
  if (goals.v) lines.push(`Goals: ${goals.v.map((g) => `${g.raw}: ${g.current_value}/${g.target_value ?? '?'} ${g.unit || ''}${g.due_date ? ' by ' + g.due_date : ''}`).join('; ') || 'none yet'}.`);
  return { text: lines.join('\n'), board: board.v || null, meta: m.v || null };
}
