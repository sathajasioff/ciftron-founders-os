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
// Score each post against the creator's own median. Views when the platform gives them;
// otherwise engagement (likes + 2 × comments + 3 × shares), so Facebook and LinkedIn rank too.
export const engagementOf = (p) => (p.likes || 0) + 2 * (p.comments || 0) + 3 * (p.shares || 0);
export function scorePosts(posts) {
  const withEng = posts.map((p) => ({ ...p, engagement: engagementOf(p) }));
  const metric = withEng.some((p) => p.views > 0) ? 'views' : 'engagement';
  const med = median(withEng.map((p) => p[metric] || 0));
  return {
    metric, median: Math.round(med),
    posts: withEng.map((p) => ({ ...p, outlier_score: med ? Math.round(((p[metric] || 0) / med) * 100) / 100 : null })),
  };
}
const num = (...vals) => { for (const v of vals) { const n = Number(v); if (v != null && v !== '' && Number.isFinite(n)) return Math.round(n); } return null; };
const firstLine = (t) => String(t || '').trim().split('\n')[0].slice(0, 200);
const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\//.test(u) ? u.slice(0, 1000) : null);

// Apify scraper items vary by actor version, so each mapper reads several known field names.
export function mapInstagram(it) {
  return {
    external_id: String(it.id || it.shortCode || it.url || ''), title: firstLine(it.caption),
    url: it.url || (it.shortCode ? `https://www.instagram.com/p/${it.shortCode}/` : null),
    format: it.type === 'Video' || it.productType === 'clips' ? 'Reel' : it.type === 'Sidecar' ? 'Carousel' : 'Post',
    views: num(it.videoPlayCount, it.videoViewCount, it.playCount, it.viewCount), likes: num(it.likesCount), comments: num(it.commentsCount), shares: null,
    thumbnail_url: httpsUrl(it.displayUrl || it.thumbnailUrl), posted_at: it.timestamp || null,
  };
}
export function mapYouTube(v) {
  const th = v.snippet?.thumbnails || {};
  return {
    external_id: v.id, title: v.snippet?.title || '', url: `https://www.youtube.com/watch?v=${v.id}`, format: 'Video',
    views: num(v.statistics?.viewCount) ?? 0, likes: num(v.statistics?.likeCount), comments: num(v.statistics?.commentCount), shares: null,
    thumbnail_url: httpsUrl((th.medium || th.high || th.default || {}).url), posted_at: v.snippet?.publishedAt || null,
  };
}
export function mapFacebook(it) {
  const media = Array.isArray(it.media) ? it.media[0] : null;
  return {
    external_id: String(it.postId || it.id || it.url || ''), title: firstLine(it.text || it.message),
    url: it.url || it.topLevelUrl || null, format: it.isVideo ? 'Video' : media ? 'Photo' : 'Post',
    views: num(it.viewsCount, it.videoViewCount, it.views), likes: num(it.likes, it.reactionsCount, it.topReactionsCount), comments: num(it.comments, it.commentsCount), shares: num(it.shares, it.sharesCount),
    thumbnail_url: httpsUrl(media?.thumbnail || media?.photo_image?.uri || it.thumbnail), posted_at: it.time || it.timestamp || null,
  };
}
export function mapLinkedIn(it) {
  const st = it.stats || it.engagement || {};
  const img = Array.isArray(it.images) ? it.images[0] : null;
  return {
    external_id: String(it.urn || it.postId || it.id || it.activityId || it.url || it.postUrl || ''), title: firstLine(it.text || it.content || it.commentary || it.headline),
    url: it.url || it.postUrl || it.linkedinUrl || null, format: it.isArticle ? 'Article' : (it.video || it.videos?.length) ? 'Video' : 'Post',
    views: num(it.views, it.impressions, st.views), likes: num(it.likes, it.num_likes, it.numLikes, it.reactionsCount, st.likes, st.total_reactions, it.stats_likes),
    comments: num(it.comments, it.num_comments, it.numComments, it.commentsCount, st.comments, it.stats_comments), shares: num(it.shares, it.reposts, it.num_shares, st.reposts, st.shares, it.stats_reposts),
    thumbnail_url: httpsUrl(typeof img === 'string' ? img : img?.url || it.media?.thumbnail), posted_at: it.postedAt || it.posted_at || it.date || it.time || it.publishedAt || null,
  };
}
const valid = (p) => p.external_id && p.external_id !== 'undefined';

// Which Apify actor and input each platform uses. LinkedIn has no official actor, so it can be swapped by env.
export function apifyPlan(platform, creator, env = process.env) {
  const handle = String(creator.handle || '').replace(/^@/, '');
  if (platform === 'Instagram') return { actor: 'apify~instagram-post-scraper', input: { username: [handle], resultsLimit: 24 }, map: mapInstagram };
  if (platform === 'Facebook') return { actor: 'apify~facebook-posts-scraper', input: { startUrls: [{ url: creator.profile_url || `https://www.facebook.com/${handle}` }], resultsLimit: 24 }, map: mapFacebook };
  if (platform === 'LinkedIn') {
    const url = creator.profile_url || `https://www.linkedin.com/in/${handle}`;
    return { actor: env.APIFY_LINKEDIN_ACTOR || 'data-slayer~linkedin-profile-posts-scraper', input: { profileUrls: [url], maxItems: 24 }, map: mapLinkedIn };
  }
  return null;
}

// Runs an Apify actor, waits up to ~55 s, and returns the mapped items and the run's cost in USD.
export async function apifyRun(token, { actor, input, map }, fetchImpl = fetch) {
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const r = await fetchImpl(`https://api.apify.com/v2/acts/${actor}/runs?waitForFinish=55`, { method: 'POST', headers: h, body: JSON.stringify(input), signal: AbortSignal.timeout(58000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`Apify returned ${r.status}: ${String(j.error?.message || '').slice(0, 150)}`), { status: 502 });
  const run = j.data || {};
  const cost = run.usageTotalUsd ?? null;
  if (run.status !== 'SUCCEEDED') {
    const err = new Error(run.status === 'RUNNING' || run.status === 'READY' ? 'Apify is still running this scrape. Press Fetch again in a minute.' : `Apify run ${String(run.status || 'failed').toLowerCase()}`);
    throw Object.assign(err, { status: 502, run: { id: run.id, status: run.status || 'FAILED', cost } });
  }
  const d = await fetchImpl(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?clean=true&limit=50`, { headers: h });
  const items = d.ok ? await d.json() : [];
  return { runId: run.id, status: run.status, cost, posts: (Array.isArray(items) ? items : []).map(map).filter(valid) };
}

// ---------- Content funnel ----------
export const FUNNEL_STAGES = { tofu: 'Top of funnel: reach and interest', mofu: 'Middle of funnel: educate and build trust', bofu: 'Bottom of funnel: ask for the call or sale' };
export const CONTENT_FUNNEL_SYSTEM = `You reverse-engineer a content funnel for one business owner: content that moves strangers toward one offer or lead magnet.
Top of funnel (tofu): broad problems and curiosity for the owner's audience. Middle (mofu): how it works, mistakes, frameworks, behind the scenes that build trust. Bottom (bofu): objections, who it is for, the offer itself and a clear call to action.
Every idea must lead logically to the target. Use only facts from Brand DNA; put [PROOF NEEDED] where a result or testimonial would go.
${RULES}
Return only JSON: {"tofu": [{"title": "...", "format": "Short video | Carousel | Written post | Long video | Email", "hook": "...", "angle": "...", "cta": "..."}], "mofu": [...], "bofu": [...]}`;
export function contentFunnelPrompt({ target, counts, language, notes }) {
  return `Target: ${target}
Ideas per stage: top ${counts.tofu}, middle ${counts.mofu}, bottom ${counts.bofu}.
Language: ${language === 'fr-qc' ? 'Quebec French' : 'English'}.${notes ? `\nOwner notes: ${notes}` : ''}`;
}
const IDEA_FORMATS = ['Short video', 'Carousel', 'Written post', 'Long video', 'Email'];
export function validateContentFunnel(j, counts) {
  const out = {};
  for (const st of Object.keys(FUNNEL_STAGES)) {
    out[st] = arr(j?.[st], counts[st] || 5).map((x) => ({
      title: str(x?.title, 140), format: IDEA_FORMATS.includes(x?.format) ? x.format : 'Short video',
      hook: str(x?.hook, 300), angle: str(x?.angle, 600), cta: str(x?.cta, 200),
    })).filter((x) => x.title);
  }
  if (!Object.values(out).some((l) => l.length)) throw new Error('The AI returned no ideas. Try again.');
  return out;
}
export const ideaBody = (x, stage) => `${FUNNEL_STAGES[stage]}\n\nHook: ${x.hook}\n\nAngle: ${x.angle}\n\nCall to action: ${x.cta}`;

// ---------- Voice playbook ----------
export const PLAYBOOK_SYSTEM = `You build a voice playbook for one business owner: the questions their audience and clients ask, answered the way the owner answers them.
Use only the owner's own material below. Every answer must be supported by a short quote copied exactly from that material.
Write answers in the owner's voice: first person, plain, specific, 2 to 5 sentences. Never invent results, prices, dates or guarantees.
${RULES}
Return only JSON: {"pairs": [{"question": "...", "answer": "...", "quote": "exact words from the material"}]}`;
export function playbookPrompt({ material, existing, count = 8, language }) {
  return `Propose ${count} new question and answer pairs${language === 'fr-qc' ? ' in Quebec French' : ''}.
Do not repeat these questions:\n${existing.map((q) => '- ' + q).join('\n') || '(none yet)'}

# Owner's material
${material}`;
}
const norm = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function validatePlaybook(j, material, existing = []) {
  const src = norm(material), seen = new Set(existing.map(norm));
  return arr(j?.pairs, 15).map((p) => ({ question: str(p?.question, 300), answer: str(p?.answer, 1500), quote: String(p?.quote || '').trim().slice(0, 400) }))
    .filter((p) => p.question && p.answer && p.quote.length >= 12 && src.includes(norm(p.quote)) && !seen.has(norm(p.question)) && seen.add(norm(p.question)));
}
export const playbookBlock = (pairs) => (pairs.length
  ? `# How the owner answers common questions (match this voice and these positions)\n${pairs.slice(0, 12).map((p) => `Q: ${p.question}\nA: ${p.answer}`).join('\n\n')}`
  : '');

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
