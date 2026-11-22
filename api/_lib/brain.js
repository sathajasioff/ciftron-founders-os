// Pure Brain logic: text extraction, chunking, AI prompts, parsing and Brand DNA compilation.
// Kept free of network and database calls so it can be unit tested.

export const CATEGORIES = ['identity', 'offers', 'audience', 'voice', 'beliefs', 'proof', 'goals', 'tools', 'never_say'];
export const CATEGORY_LABELS = { identity: 'Identity', offers: 'Offers', audience: 'Audience', voice: 'Voice', beliefs: 'Beliefs', proof: 'Proof', goals: 'Goals', tools: 'Tools', never_say: 'Never say' };

// Guardrails from the build brief. Always part of the style guide and Brand DNA.
export const HOUSE_RULES = [
  'No em dashes',
  'No hype',
  'No "it\'s not X, it\'s Y" lines',
  'No filler phrases',
  'Never invent proof, testimonials, results, prices, dates or guarantees. Use a placeholder and flag it.',
];

const MAX_TEXT = 2_000_000;

export async function extractText({ bytes, mime = '', name = '' }) {
  const lower = name.toLowerCase();
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    const { extractText: pdf, getDocumentProxy } = await import('unpdf');
    const doc = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await pdf(doc, { mergePages: true });
    return clean(text);
  }
  if (lower.endsWith('.docx') || mime.includes('officedocument.wordprocessingml')) {
    const mammoth = (await import('mammoth')).default;
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return clean(value);
  }
  const text = Buffer.from(bytes).toString('utf8');
  if (mime.includes('html') || lower.endsWith('.html') || lower.endsWith('.htm')) return htmlToText(text);
  return clean(text);
}

export function htmlToText(html) {
  return clean(String(html)
    .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
}

export function clean(t) {
  return String(t || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT);
}

// Paragraph-aware chunks of about `size` characters with a small overlap.
export function chunkText(text, size = 1200, overlap = 150) {
  const paras = clean(text).split(/\n\n+/).flatMap((p) => (p.length > size ? splitLong(p, size) : [p]));
  const chunks = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > size) {
      chunks.push(cur);
      cur = cur.slice(-overlap).replace(/^\S*\s/, '') + '\n\n' + p;
    } else cur = cur ? cur + '\n\n' + p : p;
  }
  if (cur.trim()) chunks.push(cur);
  return chunks.map((c) => c.trim()).filter(Boolean);
}

function splitLong(p, size) {
  const sentences = p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [p];
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && cur.length + s.length > size) { out.push(cur.trim()); cur = ''; }
    if (s.length > size) { for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size)); continue; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Pull the first JSON value out of a model reply, tolerating code fences and prose around it.
export function parseJson(reply) {
  const s = String(reply).replace(/```(?:json)?/g, '');
  const start = s.search(/[[{]/);
  if (start < 0) throw new Error('No JSON in model reply');
  const open = s[start], close = open === '[' ? ']' : '}';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return JSON.parse(s.slice(start, i + 1));
  }
  throw new Error('Unterminated JSON in model reply');
}

export const normalize = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export const FACTS_SYSTEM = `You extract short facts about one business owner's business from their own documents.
Rules:
- Only propose a fact that the source text states or directly shows. Never guess, infer numbers, or fill gaps.
- Every fact must include "quote": the exact words from the source that support it (under 30 words).
- Proof (results, testimonials, client wins) only when the source states it with specifics. Otherwise skip it.
- Keep each fact to one plain sentence, under 25 words. No em dashes. No hype.
- Categories: identity, offers, audience, voice, beliefs, proof, goals, tools, never_say.
- "never_say" is for words, claims or styles the owner says to avoid.
- Skip anything already in the "Known facts" list.
- Write facts in English, even if the source is in French, but keep quotes in the source language.
Return only JSON: [{"category": "...", "text": "...", "quote": "..."}]. Return [] if nothing qualifies. At most 25 facts.`;

export function factsPrompt({ sourceName, text, known }) {
  const body = text.length > 60000 ? text.slice(0, 60000) + '\n[...truncated]' : text;
  return `Known facts (do not repeat):\n${known.map((k) => '- ' + k).join('\n') || '- none yet'}\n\nSource: ${sourceName}\n<source>\n${body}\n</source>`;
}

export function validateFacts(raw, { known = [], sourceText = '' } = {}) {
  const seen = new Set(known.map(normalize));
  const src = normalize(sourceText);
  const out = [];
  for (const f of Array.isArray(raw) ? raw : []) {
    if (!f || !CATEGORIES.includes(f.category)) continue;
    const text = String(f.text || '').replace(/—|–/g, ',').trim();
    if (!text || text.length > 300) continue;
    const quote = String(f.quote || '').trim();
    // The supporting quote has to actually appear in the source. Unsupported facts are dropped.
    if (!quote || (src && !src.includes(normalize(quote).slice(0, 80)))) continue;
    const key = normalize(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ category: f.category, text, source_quote: quote.slice(0, 500) });
  }
  return out.slice(0, 25);
}

export const STYLE_SYSTEM = `You write a voice and style guide from a business owner's own writing samples.
Describe how they actually write. Do not invent a brand voice they do not use.
Return only JSON:
{"summary": "2 sentences", "rules": ["..."], "avoid": ["..."], "vocabulary": ["words or phrases they use"],
 "sentence_style": "one line", "french_notes": "how they write Quebec French, or empty if no French samples",
 "examples": ["3 to 5 short lines copied exactly from the samples"]}
No em dashes in your output.`;

export function stylePrompt(samples) {
  let budget = 40000;
  const parts = [];
  for (const s of samples) {
    const t = s.content.slice(0, Math.max(0, budget));
    budget -= t.length;
    if (t) parts.push(`<sample name="${s.name}">\n${t}\n</sample>`);
  }
  return parts.join('\n\n');
}

export function finalizeStyle(g) {
  const arr = (x) => (Array.isArray(x) ? x.map(String).filter(Boolean).slice(0, 15) : []);
  const avoid = arr(g.avoid);
  for (const r of HOUSE_RULES) if (!avoid.some((a) => normalize(a) === normalize(r))) avoid.push(r);
  return {
    summary: String(g.summary || ''), rules: arr(g.rules), avoid, vocabulary: arr(g.vocabulary),
    sentence_style: String(g.sentence_style || ''), french_notes: String(g.french_notes || ''), examples: arr(g.examples).slice(0, 5),
  };
}

// Brand DNA: approved facts (starred first), the latest style guide and selected offers.
export function compileDna({ facts, style, offers, versionNo }) {
  const approved = facts.filter((f) => f.status === 'approved');
  const byCat = {};
  for (const c of CATEGORIES) {
    const fs = approved.filter((f) => f.category === c).sort((a, b) => Number(b.starred) - Number(a.starred));
    if (fs.length) byCat[c] = fs.map((f) => ({ id: f.id, text: f.text, starred: !!f.starred }));
  }
  const offerList = offers.filter((o) => o.in_dna).map((o) => ({
    id: o.id, name: o.name, price: o.price == null ? null : Number(o.price), currency: o.currency, cadence: o.cadence, status: o.status, services: o.services || [],
  }));
  const content = { version: versionNo, compiled_at: new Date().toISOString(), facts: byCat, offers: offerList, style: style || null, house_rules: HOUSE_RULES };

  const L = [];
  L.push(`# Brand DNA v${versionNo}`, '', 'Approved facts beat retrieved text. Use only what is below as fact.', '');
  for (const [c, fs] of Object.entries(byCat)) {
    if (c === 'never_say') continue;
    L.push(`## ${CATEGORY_LABELS[c]}`, ...fs.map((f) => `- ${f.starred ? '(key) ' : ''}${f.text}`), '');
  }
  if (!byCat.proof) L.push('## Proof', '- No approved proof. Use [PROOF NEEDED] placeholders. Never invent results.', '');
  if (offerList.length) {
    L.push('## Offers');
    for (const o of offerList) {
      const price = o.price == null ? 'price not set' : `${o.price} ${o.currency}${o.cadence === 'one_time' ? '' : ' per ' + o.cadence}`;
      L.push(`- ${o.name} (${price}, ${o.status})${o.services.length ? ': ' + o.services.join(', ') : ''}`);
    }
    L.push('');
  }
  if (style) {
    L.push('## Voice and style', style.summary, ...(style.sentence_style ? [`Sentences: ${style.sentence_style}`] : []), ...style.rules.map((r) => `- ${r}`));
    if (style.french_notes) L.push(`Quebec French: ${style.french_notes}`);
    if (style.examples.length) L.push('Sounds like:', ...style.examples.map((e) => `> ${e}`));
    L.push('');
  }
  L.push('## Never', ...[...(byCat.never_say || []).map((f) => f.text), ...(style ? style.avoid : HOUSE_RULES)].filter((v, i, a) => a.indexOf(v) === i).map((r) => `- ${r}`));
  return { content, markdown: L.join('\n').trim() + '\n' };
}

// Seed data from the build brief (about_me). Offers are stated by the owner, so they start approved
// as offers. The about_me text becomes a Brain source; its facts still go through review.
export const SEED_OFFERS = [
  { name: 'Lead Generation & Paid Advertising Management', price: 497, cadence: 'month', sort: 1,
    services: ['Meta Ads campaign management', 'Lead generation strategy', 'Campaign optimization', 'Audience targeting', 'Ad creative strategy', 'Conversion tracking', 'Performance reporting', 'Lead qualification optimization'] },
  { name: 'GoHighLevel CRM, Funnel & Automation Implementation', price: 97, cadence: 'month', sort: 2,
    services: ['Landing page development', 'Lead generation funnels', 'CRM pipeline configuration', 'Email automation', 'SMS automation', 'Instagram and Facebook DM automation', 'Appointment booking workflows', 'Lead qualification systems', 'Lead nurturing sequences', 'Marketing automation integrations'] },
  { name: 'AI Automation & Custom SaaS Solutions', price: 697, cadence: 'month', sort: 3,
    services: ['AI-powered business automation', 'Custom SaaS applications', 'AI agent development', 'Workflow automation', 'AI-assisted content production', 'Business process automation', 'CRM integrations'] },
];

export const ABOUT_ME = `Name: Jasinthan Ukaananthan
Business: Ciftron. I run a digital marketing, growth, and AI automation business helping service-based businesses, real estate professionals, mortgage businesses, and entrepreneurs generate qualified leads, automate follow-ups, book appointments, and improve customer acquisition through paid advertising, conversion-focused funnels, CRM systems, and AI-powered workflows.

Audience: business owners and entrepreneurs; real estate professionals and investors; mortgage brokers; private lenders; service-based businesses; B2B companies; businesses seeking AI automation and digital transformation.

Primary markets: Canada, including Quebec, with opportunities to serve international clients.

Offers:
1. Lead Generation & Paid Advertising Management, 497 USD per month, live. Meta Ads campaign management, lead generation strategy, campaign optimization, audience targeting, ad creative strategy, conversion tracking, performance reporting, lead qualification optimization.
2. GoHighLevel CRM, Funnel & Automation Implementation, 97 USD per month, live. Landing pages, lead generation funnels, CRM pipeline configuration, email, SMS and Instagram/Facebook DM automation, appointment booking workflows, lead qualification systems, lead nurturing sequences, marketing automation integrations.
3. AI Automation & Custom SaaS Solutions, 697 USD per month, live. AI-powered business automation, custom SaaS applications, AI agent development, workflow automation, AI-assisted content production, business process automation, CRM integrations.

Main channels: Instagram, Facebook, LinkedIn, Meta Ads, landing pages, email marketing, GoHighLevel CRM.

Brand style: modern, premium, minimal, futuristic, clean, professional and conversion-focused.

Copy style: plain, human, specific. No em dashes. No hype. No "it's not X, it's Y" lines. No filler phrases. Never invent proof, testimonials, results, prices, dates or guarantees.

Content: supports English and Quebec French.`;
