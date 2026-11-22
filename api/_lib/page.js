// Designed funnel pages and slide themes. AI writes the HTML; this file makes it safe to serve:
// no scripts, no event handlers, no frames or forms, only https links and images.
import { randomBytes } from 'node:crypto';
import { HOUSE_RULES } from './brain.js';

export const STYLES = ['brand', 'light', 'dark'];
const DEFAULT_FONTS = { heading: 'Space Grotesk', body: 'DM Sans' };
const hex = (c) => (/^#?[0-9a-f]{6}$/i.test(String(c || '').trim()) ? '#' + String(c).trim().replace('#', '').toUpperCase() : null);
const lum = (c) => { const n = parseInt(c.slice(1), 16); const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]; };
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const sat = (c) => { const n = parseInt(c.slice(1), 16); const v = [n >> 16, (n >> 8) & 255, n & 255]; return (Math.max(...v) - Math.min(...v)) / 255; };
const safeFont = (f) => String(f || '').replace(/[^A-Za-z0-9 -]/g, '').trim().slice(0, 40);

// Colors and fonts for a page or deck. "brand" reads the brand board; text colour always meets 4.5:1 contrast.
export function themeFrom(board, style = 'brand') {
  const fonts = { heading: safeFont(board?.fonts?.[0]?.heading) || DEFAULT_FONTS.heading, body: safeFont(board?.fonts?.[0]?.body) || DEFAULT_FONTS.body };
  if (style === 'light') return { bg: '#FFFFFF', surface: '#F4F4F1', text: '#111111', muted: '#55554F', accent: '#111111', accentText: '#FFFFFF', highlight: '#C8F36B', fonts };
  const colors = (board?.palettes?.[0]?.colors || []).map(hex).filter(Boolean);
  if (style === 'dark' || colors.length < 2) return { bg: '#111111', surface: '#1C1C1C', text: '#F5F5F3', muted: '#B5B5AF', accent: '#C8F36B', accentText: '#111111', highlight: '#C8F36B', fonts };
  const bg = [...colors].sort((a, b) => lum(a) - lum(b))[0];
  const dark = lum(bg) < 0.18;
  const text = dark ? '#F5F5F3' : '#111111';
  const accent = [...colors.filter((c) => c !== bg)].sort((a, b) => sat(b) - sat(a))[0] || (dark ? '#C8F36B' : '#111111');
  return {
    bg, surface: dark ? '#FFFFFF14' : '#00000008', text, muted: dark ? '#C9C9C3' : '#4A4A45', accent: contrast(accent, bg) >= 3 ? accent : text,
    accentText: contrast(accent, '#111111') >= 4.5 ? '#111111' : '#FFFFFF', highlight: accent, fonts,
  };
}

// The AI picks the design (layout per section, labels, where photos and proof go). The server renders the page
// from the approved copy word for word, so the copy can't drift and the HTML is safe by construction.
export const SECTION_LAYOUTS = ['text', 'cards', 'checklist', 'steps', 'highlight', 'split'];
export const PAGE_SYSTEM = `You are a senior conversion designer laying out a landing page from approved funnel copy. You do not rewrite the copy.
For each copy section choose a layout:
- text: heading and paragraphs. Good for story and problem sections.
- cards: each bullet becomes a card. Good for 3 to 6 parallel points (benefits, what you get).
- checklist: bullets with check marks. Good for "who this is for" or inclusions.
- steps: numbered bullets. Good for a process.
- highlight: a bold accent panel. Use for at most one key section (the offer or the promise).
- split: text beside a photo placeholder. Good for an about or founder section.
Only use cards, checklist or steps when the section has bullets. Vary layouts so the page has rhythm; do not use the same layout three times in a row.
Write a short kicker (1 to 3 words) above each section heading, and a short eyebrow above the hero headline.
For photos, describe what real photo belongs there (the owner supplies it). Never invent testimonials, numbers, logos, client names, dates or guarantees.
Button label: 2 to 5 words, taken from or close to the CTA given.
${HOUSE_RULES.map((r) => '- ' + r).join('\n')}
Return only JSON: {"hero": {"layout": "centered" or "split", "eyebrow": "...", "image_note": "..."}, "sections": [{"layout": "...", "kicker": "...", "image_note": "only for split"}], "proof_note": "what real proof to add here, e.g. client results screenshots", "button_label": "...", "closing_kicker": "..."}`;

export function pagePrompt({ out, offer, funnelName, instruction, language, rules }) {
  return `Funnel: ${funnelName}${offer ? `\nOffer: ${offer.name}` : ''}
Language for kickers, labels and notes: ${language || 'English'}
${rules ? `Owner's standing design rules: ${String(rules).slice(0, 1500)}\n` : ''}${instruction ? `Owner's design notes for this page: ${instruction}\n` : ''}
# Approved copy
Headline: ${out.headline}
Subheadline: ${out.subheadline}
CTA: ${out.cta}
${out.sections.map((s, i) => `Section ${i}: ${s.heading}\n${s.body.slice(0, 600)}${s.bullets.length ? `\nBullets (${s.bullets.length}): ${s.bullets.join(' | ').slice(0, 600)}` : '\nNo bullets'}`).join('\n\n')}
FAQ items: ${out.faq?.length || 0}`;
}

const short = (v, n) => String(v ?? '').replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, n);
export function validateDesign(j, out) {
  const secs = Array.isArray(j?.sections) ? j.sections : [];
  return {
    hero: { layout: j?.hero?.layout === 'split' ? 'split' : 'centered', eyebrow: short(j?.hero?.eyebrow, 40), image_note: short(j?.hero?.image_note, 140) },
    sections: out.sections.map((s, i) => {
      let layout = SECTION_LAYOUTS.includes(secs[i]?.layout) ? secs[i].layout : 'text';
      if (['cards', 'checklist', 'steps'].includes(layout) && !s.bullets.length) layout = 'text';
      return { layout, kicker: short(secs[i]?.kicker, 30), image_note: short(secs[i]?.image_note, 140) };
    }),
    proof_note: short(j?.proof_note, 200) || 'Add real client results, screenshots or reviews here',
    button_label: short(j?.button_label, 40) || out.cta,
    closing_kicker: short(j?.closing_kicker, 30),
  };
}

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// Paragraphs, with any [PLACEHOLDER] shown as a visible tag the owner must fill.
const paras = (t) => String(t || '').split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean)
  .map((p) => `<p>${esc(p).replace(/\[([^\]]{1,80})\]/g, '<mark class="ph">[$1]</mark>')}</p>`).join('');
const inline = (t) => esc(t).replace(/\[([^\]]{1,80})\]/g, '<mark class="ph">[$1]</mark>');
const photo = (note, cls = '') => `<div class="photo ${cls}"><span>Photo: ${esc(note || 'add your own photo')}</span></div>`;

export function renderPage({ out, design, theme, title, language }) {
  const t = theme, d = design;
  const btn = (extra = '') => `<a class="btn ${extra}" href="{{ORDER_URL}}">${esc(d.button_label)}</a>`;
  const fontUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(t.fonts.heading)}:wght@500;700&family=${encodeURIComponent(t.fonts.body)}:wght@400;600&display=swap`.replace(/%20/g, '+');
  const section = (s, i) => {
    const l = d.sections[i] || { layout: 'text' };
    const head = `${l.kicker ? `<div class="kicker">${esc(l.kicker)}</div>` : ''}<h2>${inline(s.heading)}</h2>`;
    const list = (cls, tag = 'ul') => `<${tag} class="${cls}">${s.bullets.map((b) => `<li>${inline(b)}</li>`).join('')}</${tag}>`;
    let inner;
    if (l.layout === 'cards') inner = `${head}${paras(s.body)}<div class="cards">${s.bullets.map((b) => `<div class="card">${inline(b)}</div>`).join('')}</div>`;
    else if (l.layout === 'checklist') inner = `${head}${paras(s.body)}${list('check')}`;
    else if (l.layout === 'steps') inner = `${head}${paras(s.body)}${list('steps', 'ol')}`;
    else if (l.layout === 'split') inner = `<div class="split"><div>${head}${paras(s.body)}${s.bullets.length ? list('check') : ''}</div>${photo(l.image_note)}</div>`;
    else inner = `${head}${paras(s.body)}${s.bullets.length ? list('check') : ''}`;
    return `<section class="sec ${l.layout === 'highlight' ? 'hl' : ''} ${i % 2 ? 'alt' : ''}"><div class="wrap ${l.layout === 'text' || l.layout === 'highlight' ? 'narrow' : ''}">${inner}${l.layout === 'highlight' ? btn('dark') : ''}</div></section>`;
  };
  const hero = d.hero.layout === 'split'
    ? `<div class="wrap split hero-split"><div>${d.hero.eyebrow ? `<div class="kicker">${esc(d.hero.eyebrow)}</div>` : ''}<h1>${inline(out.headline)}</h1><p class="sub">${inline(out.subheadline)}</p>${btn()}</div>${photo(d.hero.image_note, 'tall')}</div>`
    : `<div class="wrap narrow center">${d.hero.eyebrow ? `<div class="kicker">${esc(d.hero.eyebrow)}</div>` : ''}<h1>${inline(out.headline)}</h1><p class="sub">${inline(out.subheadline)}</p>${btn()}</div>`;
  const alt = (k) => ((out.sections.length + k) % 2 ? 'alt' : '');
  const faq = out.faq?.length ? `<section class="sec ${alt(1)}"><div class="wrap narrow"><div class="kicker">FAQ</div><h2>${language === 'Quebec French' ? 'Questions fréquentes' : 'Questions'}</h2>${out.faq.map((f) => `<details><summary>${inline(f.q)}</summary>${paras(f.a)}</details>`).join('')}</div></section>` : '';
  const css = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:${t.bg};color:${t.text};font:400 18px/1.6 '${t.fonts.body}',system-ui,sans-serif}
h1,h2,summary{font-family:'${t.fonts.heading}',system-ui,sans-serif;line-height:1.12;letter-spacing:-.02em;margin:0 0 .5em}
h1{font-size:clamp(36px,6vw,64px);font-weight:700}h2{font-size:clamp(28px,4vw,42px);font-weight:700}p{margin:0 0 1em}
.wrap{max-width:1100px;margin:0 auto;padding:0 24px}.narrow{max-width:760px}.center{text-align:center}
.hero{padding:clamp(64px,10vw,120px) 0}.sub{font-size:clamp(19px,2.2vw,23px);color:${t.muted};margin-bottom:1.6em}
.kicker{display:inline-block;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.12em;color:${t.accent};margin-bottom:14px}
.btn{display:inline-block;background:${t.accent};color:${t.accentText};font-weight:600;text-decoration:none;padding:16px 30px;border-radius:999px;font-size:18px;margin-top:8px}
.btn.dark{background:${t.text};color:${t.bg}}
.sec{padding:clamp(56px,8vw,96px) 0}.sec.alt{background:${t.surface}}
.sec.hl{background:${t.accent};color:${t.accentText}}.sec.hl .kicker{color:${t.accentText};opacity:.8}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:24px}
.card{background:${t.surface};border:1px solid ${t.text}1A;border-radius:16px;padding:22px;font-weight:600}.alt .card{background:${t.bg}}
ul.check,ol.steps{list-style:none;padding:0;margin:20px 0 0}ul.check li,ol.steps li{position:relative;padding:0 0 14px 40px}
ul.check li:before{content:"";position:absolute;left:4px;top:6px;width:9px;height:16px;border:solid ${t.accent};border-width:0 3px 3px 0;transform:rotate(45deg)}
.hl ul.check li:before{border-color:${t.accentText}}
ol.steps{counter-reset:s}ol.steps li{counter-increment:s;padding-left:52px;min-height:40px}ol.steps li:before{content:counter(s);position:absolute;left:0;top:-2px;width:36px;height:36px;border-radius:50%;background:${t.accent};color:${t.accentText};display:grid;place-items:center;font-weight:700;font-size:16px}
.split{display:grid;grid-template-columns:1.1fr .9fr;gap:48px;align-items:center}
.photo{border:2px dashed ${t.text}40;border-radius:20px;min-height:280px;display:grid;place-items:center;padding:24px;text-align:center;color:${t.muted};font-size:15px}.photo.tall{min-height:420px}
mark.ph{background:${t.highlight};color:#111;padding:0 6px;border-radius:4px;font-weight:600}
.proof{border:2px dashed ${t.accent};border-radius:20px;padding:40px 24px;text-align:center;color:${t.muted}}
details{border-bottom:1px solid ${t.text}26;padding:18px 0}summary{cursor:pointer;font-size:20px;margin:0}details p{margin:12px 0 0;color:${t.muted}}
.final{text-align:center}footer{padding:32px 0;text-align:center;color:${t.muted};font-size:14px}
@media(max-width:800px){.split{grid-template-columns:1fr;gap:28px}.photo.tall{min-height:280px}body{font-size:17px}}`;
  return `<!doctype html><html lang="${language === 'Quebec French' ? 'fr-CA' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="${esc(fontUrl)}"><style>${css}</style></head><body>
<header class="hero">${hero}</header>
${out.sections.map(section).join('\n')}
<section class="sec ${alt(0)}"><div class="wrap narrow"><div class="proof"><div class="kicker">Proof</div><p>${esc(d.proof_note)}</p></div></div></section>
${faq}
<section class="sec final ${alt(out.faq?.length ? 0 : 1)}"><div class="wrap narrow">${d.closing_kicker ? `<div class="kicker">${esc(d.closing_kicker)}</div>` : ''}<h2>${inline(out.headline)}</h2>${btn()}</div></section>
<footer>&copy; ${new Date().getFullYear()}</footer></body></html>`;
}

// ---------- Sanitizer ----------
const DROP_BLOCKS = ['script', 'iframe', 'object', 'embed', 'applet', 'frameset', 'frame', 'noscript', 'template', 'math'];
const DROP_TAGS = ['base', 'form', 'input', 'button', 'select', 'textarea', 'option', 'portal'];
export function sanitizePage(raw, { orderUrl } = {}) {
  let h = String(raw || '').replace(/^\s*```(?:html)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = h.search(/<!doctype html|<html/i);
  if (start > 0) h = h.slice(start);
  h = h.replace(/<!--[\s\S]*?-->/g, '');
  for (const t of DROP_BLOCKS) h = h.replace(new RegExp(`<${t}\\b[\\s\\S]*?<\\/${t}\\s*>`, 'gi'), '').replace(new RegExp(`<${t}\\b[^>]*>`, 'gi'), '');
  for (const t of DROP_TAGS) h = h.replace(new RegExp(`<\\/?${t}\\b[^>]*>`, 'gi'), '');
  // Only charset and viewport meta tags (no refresh redirects).
  h = h.replace(/<meta\b[^>]*>/gi, (m) => (/^<meta\s+charset="?utf-8"?\s*\/?>$/i.test(m) || /^<meta\s+name="viewport"\s+content="[\w=.,\s-]+"\s*\/?>$/i.test(m) ? m : ''));
  // Only Google Fonts stylesheets may be linked.
  h = h.replace(/<link\b[^>]*>/gi, (m) => (/href\s*=\s*["']https:\/\/fonts\.(googleapis|gstatic)\.com\//i.test(m) && !/\bon\w+\s*=/i.test(m) ? m : ''));
  // Event handlers, srcdoc, formaction, and any attribute that can run code.
  h = h.replace(/\s(on[a-z]+|srcdoc|formaction|xlink:href|ping)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  // href/src: https, mailto, tel, anchors, or the order-URL placeholder only.
  h = h.replace(/\s(href|src|action|poster|background)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (m, attr, _q, a, b, c) => {
    const v = (a ?? b ?? c ?? '').trim();
    const ok = /^(https:\/\/|mailto:|tel:|#|\{\{ORDER_URL\}\})/i.test(v) || (attr.toLowerCase() === 'src' && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v));
    return ok ? ` ${attr}="${v.replace(/"/g, '&quot;')}"` : '';
  });
  // CSS: no expression(), behaviors, imports of other sites, or javascript URLs.
  h = h.replace(/expression\s*\(|behavior\s*:|-moz-binding|javascript:|vbscript:/gi, '');
  h = h.replace(/@import\s+(url\()?["']?(?!https:\/\/fonts\.googleapis\.com)[^;]+;/gi, '');
  h = h.replace(/url\(\s*["']?(?!https:|data:image\/)[^)]*\)/gi, 'none');
  const url = /^https:\/\//i.test(orderUrl || '') ? orderUrl.replace(/"/g, '%22') : '#';
  h = h.replace(/\{\{ORDER_URL\}\}/g, url);
  if (!/<html[\s>]/i.test(h) || !/<body[\s>]/i.test(h)) throw new Error('The design came back incomplete. Try Build page again.');
  if (h.length > 300000) throw new Error('The page is too large. Ask for a simpler design.');
  return h;
}

export const newToken = () => randomBytes(18).toString('base64url');

// Headers for serving a preview: a sandbox with no scripts at all, even if something slipped through.
export const PAGE_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': "sandbox allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation; default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
  'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer',
};
