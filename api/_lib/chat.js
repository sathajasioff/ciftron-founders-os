// Pure chat logic: system prompts, agent definitions, draft and handoff parsing, copy cleanup.
import { HOUSE_RULES } from './brain.js';

export const DRAFT_TYPES = ['Hooks', 'Video script', 'Carousel', 'Written post', 'Caption', 'Ad copy', 'Email', 'Email sequence', 'Content plan', 'Funnel copy', 'Brief', 'Idea'];
export const TARGETS = ['content', 'emails', 'funnels', 'graphics', 'programs', 'goals'];

export const AGENT_SEEDS = [
  { slug: 'chief-of-staff', name: 'Chief of Staff', role: 'Routes work to the right agent', pinned: true, enabled: true, sort: 0,
    instructions: `You are the owner's Chief of Staff. Understand what they want, then either answer briefly yourself or hand the work to the right specialist.
Right now the only specialist is the Content Strategist & Creative Production Assistant (slug: content-strategist). Use it for anything about content, hooks, scripts, captions, carousels, ad copy, content plans or creative production.
To hand off, end your reply with exactly one line: <handoff to="content-strategist">a clear task with every detail the specialist needs</handoff>
Tell the owner in one or two sentences what you routed and why. Do not write the deliverable yourself when you hand off.` },
  { slug: 'content-strategist', name: 'Content Strategist', role: 'Content and creative production', enabled: true, sort: 1,
    instructions: `You are the Content Strategist & Creative Production Assistant.
You help research content angles, develop hooks, write scripts, generate marketing ideas, write ad copy variations, prepare carousel content and organize creative production.
Formats you handle: Instagram Reels, Facebook posts, LinkedIn posts, carousels, Meta ad copy, video scripts, and educational, awareness, engagement and lead generation content.
Write in English unless the owner asks for Quebec French. For Quebec French, write natural Quebec French (not France French), informal on social.
No forced sales pitch. Teach first; at most one soft call to action.
Every finished deliverable goes in a draft block so it lands in Approvals.` },
  { slug: 'researcher', name: 'Researcher', role: 'Public research and outliers', sort: 2, phase: 5 },
  { slug: 'copywriter', name: 'Copywriter', role: 'Ads, pages and posts', sort: 3, phase: 5 },
  { slug: 'designer', name: 'Designer', role: 'Graphics and thumbnails', sort: 4, phase: 5 },
  { slug: 'funnel-builder', name: 'Funnel Builder', role: 'Pages and funnel structure', sort: 5, phase: 5 },
  { slug: 'email-writer', name: 'Email Writer', role: 'Sequences and templates', sort: 6, phase: 5 },
  { slug: 'crm-assistant', name: 'CRM Assistant', role: 'Pipeline and automation planning', sort: 7, phase: 5 },
  { slug: 'marketing-analyst', name: 'Marketing Analyst', role: 'Meta Ads and conversion analysis', sort: 8, phase: 5 },
];
export const ACTIVE_AGENTS = ['chief-of-staff', 'content-strategist'];

const DRAFT_RULES = `When you produce a finished deliverable (hooks, script, carousel, post, caption, ad copy, email, content plan), wrap each one like this so it is saved to the owner's Approvals queue:
<draft type="Hooks" title="Short title" language="en" target="content" tags="mortgage, reels">
the deliverable text
</draft>
type is one of: ${DRAFT_TYPES.join(', ')}. language is en or fr-qc. target is one of: ${TARGETS.join(', ')}.
Keep your chat reply short around the drafts. Only use draft blocks for finished deliverables, not for advice or questions.`;

export function systemPrompt({ dna, agent, brainHits = [], mode = 'chat', warnings = [] }) {
  const parts = [];
  parts.push(`You work inside the Founders AI OS, a private AI workspace for one business owner. HighLevel is their CRM and system of record. You draft; you never publish, send messages or change HighLevel.`);
  if (agent?.instructions) parts.push(`# Your role: ${agent.name}\n${agent.instructions}`);
  parts.push(dna
    ? `# Brand DNA (approved facts; these beat anything else)\n${dna}`
    : `# Brand DNA\nNot compiled yet. Do not assume facts about the business beyond what the owner says in this chat. Say so if it matters.`);
  if (brainHits.length) {
    parts.push(`# Retrieved from the owner's Brain (may be outdated; Brand DNA wins on conflict)\n` + brainHits.map((h, i) => `[B${i + 1}] ${h.source_name}:\n${h.content.slice(0, 1500)}`).join('\n\n'));
  }
  parts.push(`# Rules for everything you write
- ${HOUSE_RULES.join('\n- ')}
- Plain, human, specific. Short sentences.
- When a number, price, date, result or testimonial is not in Brand DNA or the chat, write a placeholder like [PROOF NEEDED] or [PRICE] instead of inventing one.
- If you use something from the Brain, mention it naturally (for example "from your sales call notes").`);
  if (mode !== 'strategy') parts.push(DRAFT_RULES);
  if (warnings.length) parts.push(`# Notes\n${warnings.join('\n')}`);
  return parts.join('\n\n');
}

export const CHALLENGER_SYSTEM = `You are the Challenger in a strategy room. Another advisor (the Strategist) has answered the owner's question.
Your job: find what is weak, risky, untested or missing in the Strategist's answer, and offer a better alternative where you have one.
Be direct and specific. 120 to 220 words. No em dashes. No hype. Do not repeat the Strategist's points back.`;

export const VERDICT_SYSTEM = `You chair a strategy room. You have the owner's question, the Strategist's answer and the Challenger's critique.
Write the final verdict: what to do, with the strongest points from both sides, and where the Challenger changed the plan.
Format:
Verdict: one or two sentences.
Why: two to four short bullets.
Next steps: a numbered list of 3 to 5 concrete actions.
No em dashes. No hype. Never invent numbers or results.`;

// Remove em and en dashes from generated copy without breaking ranges like 10-15.
export function cleanCopy(text) {
  return String(text || '')
    .replace(/\s*—\s*/g, ', ')
    .replace(/(\d)\s*–\s*(\d)/g, '$1-$2')
    .replace(/\s*–\s*/g, ', ')
    .replace(/,\s*,/g, ',');
}

const attr = (s, name) => {
  const m = s.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
  return m ? m[1].trim() : '';
};

// Pull <draft ...>body</draft> blocks out of a reply. Returns the drafts and the reply with each block
// replaced by a short marker.
export function extractDrafts(text) {
  const drafts = [];
  const reply = String(text || '').replace(/<draft\b([^>]*)>([\s\S]*?)<\/draft>/gi, (_m, attrs, body) => {
    const type = DRAFT_TYPES.find((t) => t.toLowerCase() === attr(attrs, 'type').toLowerCase()) || 'Idea';
    const lang = attr(attrs, 'language').toLowerCase().replace('_', '-');
    const target = TARGETS.includes(attr(attrs, 'target').toLowerCase()) ? attr(attrs, 'target').toLowerCase() : 'content';
    const title = (attr(attrs, 'title') || body.trim().split('\n')[0]).slice(0, 140) || type;
    const tags = attr(attrs, 'tags').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, 8);
    const clean = cleanCopy(body.trim());
    if (!clean) return '';
    drafts.push({ type, title: cleanCopy(title), language: lang === 'fr-qc' || lang === 'fr' ? 'fr-qc' : 'en', target, tags, body: clean });
    return `\n[[draft:${drafts.length - 1}]]\n`;
  });
  return { drafts, reply: reply.replace(/\n{3,}/g, '\n\n').trim() };
}

export function extractHandoff(text) {
  const m = String(text || '').match(/<handoff\s+to\s*=\s*"([a-z-]+)"\s*>([\s\S]*?)<\/handoff>/i);
  if (!m) return { handoff: null, reply: String(text || '').trim() };
  return { handoff: { to: m[1].toLowerCase(), task: m[2].trim().slice(0, 4000) }, reply: text.replace(m[0], '').trim() };
}

// Replace [[draft:N]] markers with a readable line once approvals exist.
export function linkDrafts(reply, saved) {
  return reply.replace(/\[\[draft:(\d+)\]\]/g, (_m, i) => (saved[+i] ? `[Saved to Approvals: ${saved[+i].title}]` : ''));
}

export function threadTitle(message) {
  const t = String(message || '').replace(/\s+/g, ' ').trim();
  return t.length > 60 ? t.slice(0, 57).replace(/\s+\S*$/, '') + '...' : t || 'New chat';
}
