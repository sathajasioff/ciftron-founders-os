// Creation studio logic: prompts, output validation, learning signals, goal metrics, research scoring.
import { HOUSE_RULES } from './brain.js';
import { cleanCopy } from './chat.js';

const RULES = `Rules: ${HOUSE_RULES.join(' ')} Plain, human, specific. Use placeholders like NAME, OFFER NAME, [PROOF NEEDED], [PRICE] instead of inventing anything.`;
const str = (v, max = 4000) => cleanCopy(String(v ?? '').trim()).slice(0, max);
const arr = (v, max = 20) => (Array.isArray(v) ? v.slice(0, max) : []);

// ---------- Exact creative sizes ----------
export const FORMATS = {
  'Instagram feed post': [1080, 1350], 'Instagram Story': [1080, 1920], 'Facebook feed post': [1080, 1080], 'Carousel slide': [1080, 1350],
  'Meta Ads graphic': [1080, 1080], 'YouTube thumbnail': [1280, 720], 'LinkedIn graphic': [1200, 627],
};
export function aspectFor(format) {
  const [w, h] = FORMATS[format] || [1080, 1080];
  const r = w / h;
  return r > 1.3 ? '16:9' : r < 0.7 ? '9:16' : '1:1';
}

// ---------- Email sequences ----------
export const SEQUENCE_TYPES = { welcome: ['Welcome', 5], nurture: ['Nurture', 6], cart: ['Abandoned cart', 3], upsell: ['Upsell', 3], reminder: ['Call reminders', 4], onboarding: ['Onboarding', 5], launch: ['Launch', 7] };
export const EMAIL_SYSTEM = `You write email sequences for one business owner, in their voice from Brand DNA.
Use plain placeholders exactly like NAME, OFFER NAME, CALL TIME, LINK. No merge-field syntax.
${RULES}
Return only JSON: {"name": "...", "emails": [{"day": "Immediately | Day 2 | 24 h before ...", "subject": "...", "preview": "...", "body": "..."}]}`;
export function emailPrompt({ type, offer, language, notes }) {
  const [label, n] = SEQUENCE_TYPES[type] || ['Nurture', 5];
  return `Write a ${label} sequence of ${n} emails${offer ? ` for the offer "${offer.name}"${offer.price != null ? ` (${offer.price} ${offer.currency} per ${offer.cadence})` : ''}. Services: ${(offer.services || []).join(', ')}` : ''}.
Language: ${language === 'fr-qc' ? 'Quebec French (vouvoiement for new leads)' : 'English'}.
${notes ? `Owner notes: ${notes}` : ''}`;
}
export function validateSequence(j) {
  const emails = arr(j?.emails, 12).map((e) => ({ day: str(e.day, 40) || '', subject: str(e.subject, 200), preview: str(e.preview, 200), body: str(e.body, 8000) })).filter((e) => e.subject && e.body);
  if (!emails.length) throw new Error('The model returned no emails');
  return { name: str(j.name, 120) || 'Email sequence', emails };
}
export const REWRITE_SYSTEM = `Rewrite one email for the owner. Keep the meaning and placeholders. ${RULES}
Return only JSON: {"subject": "...", "preview": "...", "body": "..."}`;

// ---------- Funnels ----------
export const FUNNEL_TYPES = ['Lead generation funnel', 'Appointment booking funnel', 'Lead magnet funnel', 'Webinar funnel', 'Sales funnel'];
export const FUNNEL_SYSTEM = `You build conversion-focused funnels for one business owner from their brief and Brand DNA.
Never invent testimonials, results, client names, numbers or guarantees. Leave proof as the placeholder [PROOF: add a real result].
${RULES}
Return only JSON:
{"headline": "...", "subheadline": "...", "sections": [{"heading": "...", "body": "...", "bullets": ["..."]}], "cta": "button text",
 "faq": [{"q": "...", "a": "..."}], "qualification_questions": ["..."],
 "image_prompts": ["hero image prompt", "section image prompt", "ad thumbnail prompt"],
 "emails": [{"subject": "...", "preview": "...", "body": "..."}],
 "hl_setup_notes": ["step 1", "step 2"]}
Exactly 6 buyer emails. 3 to 6 sections. HighLevel setup notes are numbered steps for building it in HighLevel funnels, forms, calendars and workflows.`;
export function funnelPrompt({ brief, offer, previous, instruction }) {
  const b = Object.entries(brief || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
  if (previous && instruction) return `Current funnel JSON:\n${JSON.stringify(previous)}\n\nRevise it with this instruction and return the full JSON: ${instruction}`;
  return `Brief:\n${b}\n\nOffer: ${offer ? `${offer.name}${offer.price != null ? `, ${offer.price} ${offer.currency} per ${offer.cadence}` : ''}. Services: ${(offer.services || []).join(', ')}` : 'not set'}`;
}
export function validateFunnel(j) {
  const sections = arr(j?.sections, 8).map((s) => ({ heading: str(s.heading, 200), body: str(s.body, 3000), bullets: arr(s.bullets, 10).map((b) => str(b, 300)).filter(Boolean) })).filter((s) => s.heading || s.body);
  const emails = arr(j?.emails, 6).map((e) => ({ subject: str(e.subject, 200), preview: str(e.preview, 200), body: str(e.body, 6000) })).filter((e) => e.subject && e.body);
  if (!str(j?.headline) || !sections.length) throw new Error('The model returned an incomplete funnel');
  return {
    headline: str(j.headline, 200), subheadline: str(j.subheadline, 400), sections, cta: str(j.cta, 60) || 'Book a call',
    faq: arr(j.faq, 8).map((f) => ({ q: str(f.q, 200), a: str(f.a, 1000) })).filter((f) => f.q && f.a),
    qualification_questions: arr(j.qualification_questions, 8).map((q) => str(q, 200)).filter(Boolean),
    image_prompts: arr(j.image_prompts, 3).map((p) => str(p, 600)).filter(Boolean),
    emails, hl_setup_notes: arr(j.hl_setup_notes, 15).map((n) => str(n, 400)).filter(Boolean),
  };
}

// ---------- Goals ----------
export const METRICS = {
  hl_new_leads: 'New opportunities created in HighLevel since the goal started',
  'hl_stage:': 'Opportunities currently at or past a named pipeline stage, created since the goal started (write hl_stage:<exact stage name>)',
  hl_won: 'Opportunities marked won since the goal started',
  meta_leads: 'Meta Ads leads in the last 30 days',
  meta_cpl: 'Meta Ads cost per lead over the last 7 days (lower is better)',
  content_published: 'Content cards marked uploaded since the goal started',
  manual: 'Tracked by hand',
};
export const GOAL_SYSTEM = `Turn the owner's plain-language goal into one measurable target and a short checklist.
Pick metric_key from this list (use manual if none fits):
${Object.entries(METRICS).map(([k, v]) => `- ${k}: ${v}`).join('\n')}
Never invent the owner's current numbers. If a number or date is missing from the goal, leave it null.
Return only JSON: {"target": "one sentence", "metric_key": "...", "target_value": number or null, "unit": "leads | appointments | USD | pieces | ...", "lower_is_better": false, "due_date": "YYYY-MM-DD or null", "checklist": ["3 to 6 concrete actions"]}`;
export function goalPrompt(raw, stages = [], today = new Date().toISOString().slice(0, 10)) {
  return `Today is ${today}. Pipeline stages: ${stages.join(', ') || 'unknown'}.\nGoal: ${raw}`;
}
export function validateGoal(j, stages = []) {
  let key = String(j?.metric_key || 'manual');
  if (key.startsWith('hl_stage:')) {
    const name = key.slice(9).trim();
    const hit = stages.find((s) => s.toLowerCase() === name.toLowerCase());
    key = hit ? `hl_stage:${hit}` : 'manual';
  } else if (!(key in METRICS)) key = 'manual';
  const tv = Number(j?.target_value);
  const due = /^\d{4}-\d{2}-\d{2}$/.test(j?.due_date || '') ? j.due_date : null;
  return {
    target: str(j?.target, 300), metric_key: key, target_value: Number.isFinite(tv) && tv > 0 ? tv : null, unit: str(j?.unit, 30) || null,
    due_date: due, checklist: arr(j?.checklist, 8).map((c) => str(c, 200)).filter(Boolean),
  };
}
// Current value for a goal from live data. Returns null when the source is unavailable.
export function goalValue(goal, { board, meta, content }) {
  const since = new Date(goal.start_date || goal.created_at || 0).getTime();
  const key = goal.metric_key || 'manual';
  const after = (d) => d && new Date(d).getTime() >= since;
  if (key === 'manual') return null;
  if (key.startsWith('hl_') && !board) return null;
  if (key.startsWith('meta_') && !meta) return null;
  if (key === 'hl_new_leads') return board.opportunities.filter((o) => after(o.createdAt)).length;
  if (key === 'hl_won') return board.opportunities.filter((o) => o.status === 'won' && after(o.lastStageChangeAt || o.createdAt)).length;
  if (key.startsWith('hl_stage:')) {
    const idx = board.stages.findIndex((s) => s.name.toLowerCase() === key.slice(9).toLowerCase());
    if (idx < 0) return null;
    const pos = Object.fromEntries(board.stages.map((s, i) => [s.id, i]));
    return board.opportunities.filter((o) => (pos[o.pipelineStageId] ?? -1) >= idx && after(o.createdAt)).length;
  }
  if (key === 'meta_leads') return meta.leads30 ?? meta.leads;
  if (key === 'meta_cpl') return meta.cpl;
  if (key === 'content_published') return (content || []).filter((c) => (c.stage === 'Uploaded' || c.tasks?.upload) && after(c.updated_at)).length;
  return null;
}

// ---------- Programs ----------
export const PROGRAM_SYSTEM = `Propose a course or coaching program for the owner, using Brand DNA for audience and offers.
${RULES}
Return only JSON: {"name": "...", "description": "two sentences", "modules": [{"title": "...", "lessons": [{"title": "...", "summary": "one or two sentences"}]}]}
3 to 6 modules, 2 to 5 lessons each.`;
export function validateProgram(j) {
  const modules = arr(j?.modules, 8).map((m) => ({ title: str(m.title, 150), lessons: arr(m.lessons, 8).map((l) => ({ title: str(l.title, 150), summary: str(l.summary, 600) })).filter((l) => l.title) })).filter((m) => m.title);
  if (!str(j?.name) || !modules.length) throw new Error('The model returned an incomplete program');
  return { name: str(j.name, 150), description: str(j.description, 600), modules };
}
export const programText = (p) => `${p.name}\n${p.description}\n\n` + p.modules.map((m, i) => `Module ${i + 1}: ${m.title}\n` + m.lessons.map((l) => `- ${l.title}${l.summary ? ': ' + l.summary : ''}`).join('\n')).join('\n\n');

// ---------- Vault ----------
export const VAULT_SYSTEM = `Turn an example the owner admires into a reusable brief for their own work.
Describe structure, pacing and techniques. Never copy the original's wording, claims, names or faces. This is inspiration, not a fact about the owner.
${RULES}
Return only JSON: {"title": "...", "why_it_works": ["..."], "structure": ["step by step outline"], "reusable_brief": "a brief the owner can hand to a writer or designer", "do_not_copy": ["what must stay original"]}`;
export function validateBrief(j) {
  return { title: str(j?.title, 150) || 'Brief', why_it_works: arr(j?.why_it_works, 8).map((x) => str(x, 300)), structure: arr(j?.structure, 12).map((x) => str(x, 300)), reusable_brief: str(j?.reusable_brief, 3000), do_not_copy: arr(j?.do_not_copy, 8).map((x) => str(x, 300)) };
}
export const briefText = (b) => `${b.title}\n\nWhy it works:\n${b.why_it_works.map((x) => '- ' + x).join('\n')}\n\nStructure:\n${b.structure.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nBrief:\n${b.reusable_brief}\n\nKeep original:\n${b.do_not_copy.map((x) => '- ' + x).join('\n')}`;

// ---------- Graphics ----------
export function graphicPrompt({ format, headline, notes, board, brandStyle, hasReference }) {
  const [w, h] = FORMATS[format] || [1080, 1080];
  const pal = (board?.palettes?.[0]?.colors || ['#111111', '#F5F5F3', '#C8F36B']).join(', ');
  const fonts = (board?.fonts?.[0] ? `${board.fonts[0].heading} headings and ${board.fonts[0].body} body` : 'a clean geometric sans serif');
  return [
    `A ${format} marketing graphic, final size ${w}x${h} pixels.`,
    `Brand style: ${brandStyle || 'modern, premium, minimal, futuristic, clean'}. Colors: ${pal}. Typography: ${fonts}. Generous spacing, no clutter, no excessive gradients.`,
    headline ? `Large, legible headline text exactly: "${headline}".` : 'No text on the image.',
    notes ? `Details: ${notes}.` : '',
    hasReference ? 'Use the reference image for layout and composition only. Do not copy its text, logos, people or faces.' : '',
    'No fake logos, no fake testimonials, no watermarks.',
  ].filter(Boolean).join(' ');
}

// ---------- Research ----------
export const median = (nums) => {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
export function scorePosts(posts) {
  const med = median(posts.map((p) => p.views));
  return { median: Math.round(med), posts: posts.map((p) => ({ ...p, outlier_score: med ? Math.round((p.views / med) * 100) / 100 : null })) };
}
// Apify Instagram scraper items vary by actor version, so read several known field names.
export function mapInstagram(it) {
  const views = Number(it.videoPlayCount ?? it.videoViewCount ?? it.playCount ?? it.viewCount ?? it.likesCount ?? 0);
  return { external_id: String(it.id || it.shortCode || it.url || ''), title: String(it.caption || '').split('\n')[0].slice(0, 200), url: it.url || (it.shortCode ? `https://www.instagram.com/p/${it.shortCode}/` : null),
    format: it.type === 'Video' || it.productType === 'clips' ? 'Reel' : it.type === 'Sidecar' ? 'Carousel' : 'Post', views, posted_at: it.timestamp || null };
}
export function mapYouTube(v) {
  return { external_id: v.id, title: v.snippet?.title || '', url: `https://www.youtube.com/watch?v=${v.id}`, format: 'Video', views: Number(v.statistics?.viewCount || 0), posted_at: v.snippet?.publishedAt || null };
}

// ---------- Learning signals ----------
// Plain statistics from the owner's own approvals, passes and edits. No guessing.
export function computeSignals(items) {
  const done = items.filter((a) => !a.trashed_at && a.status !== 'pending');
  const out = [];
  const byType = {};
  for (const a of done) (byType[a.type] ||= []).push(a);
  for (const [type, list] of Object.entries(byType)) {
    if (list.length < 3) continue;
    const ok = list.filter((a) => a.status === 'approved').length;
    const rate = ok / list.length;
    if (rate >= 0.75) out.push({ key: `type_up:${type}`, signal: `You approve most ${type} drafts (${ok} of ${list.length}). Keep making them.`, evidence: `${list.length} decisions`, weight: list.length >= 8 ? 'high' : 'medium' });
    if (rate <= 0.34) out.push({ key: `type_down:${type}`, signal: `You pass on most ${type} drafts (${list.length - ok} of ${list.length}). Make fewer, or change the angle.`, evidence: `${list.length} decisions`, weight: list.length >= 8 ? 'high' : 'medium' });
  }
  const tags = {};
  for (const a of done) for (const t of a.tags || []) { tags[t] ||= { ok: 0, n: 0 }; tags[t].n++; if (a.status === 'approved') tags[t].ok++; }
  for (const [t, v] of Object.entries(tags)) if (v.n >= 3 && v.ok / v.n >= 0.8) out.push({ key: `tag_up:${t}`, signal: `Topics tagged #${t} get approved (${v.ok} of ${v.n}).`, evidence: `${v.n} drafts`, weight: 'medium' });
  const edited = done.filter((a) => a.authored_by === 'me' && a.status === 'approved').length;
  const approved = done.filter((a) => a.status === 'approved').length;
  if (approved >= 4 && edited / approved >= 0.5) out.push({ key: 'edits_high', signal: `You edit ${edited} of ${approved} approved drafts before using them. Drafts should be tighter and closer to your voice.`, evidence: `${approved} approvals`, weight: 'high' });
  const fr = done.filter((a) => a.language === 'fr-qc');
  if (fr.length >= 3) { const ok = fr.filter((a) => a.status === 'approved').length; out.push({ key: 'lang_fr', signal: `Quebec French drafts: ${ok} of ${fr.length} approved.`, evidence: `${fr.length} drafts`, weight: 'low' }); }
  return out;
}
export const signalsBlock = (signals) => (signals.length ? `# What the owner's past decisions show (use as guidance)\n${signals.map((s) => '- ' + s.signal).join('\n')}` : '');
