// Renders program slides as HTML, 16:9, in the deck's theme. Used by the deck viewer and for Save as PDF.
// Sizes are in container units, so a slide looks the same at any width.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ph = (v) => esc(v).replace(/\[([^\]]{1,80})\]/g, '<mark>[$1]</mark>');
const safeColor = (c, d) => (/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(c || '') ? c : d);
const safeFont = (f, d) => (/^[A-Za-z0-9 -]{1,40}$/.test(f || '') ? f : d);

export function slideCss(theme) {
  const t = {
    bg: safeColor(theme?.bg, '#111111'), text: safeColor(theme?.text, '#F5F5F3'), muted: safeColor(theme?.muted, '#B5B5AF'),
    accent: safeColor(theme?.accent, '#C8F36B'), accentText: safeColor(theme?.accentText, '#111111'), highlight: safeColor(theme?.highlight, '#C8F36B'),
    h: safeFont(theme?.fonts?.heading, 'Space Grotesk'), b: safeFont(theme?.fonts?.body, 'DM Sans'),
  };
  return `.sl{container-type:inline-size;aspect-ratio:16/9;width:100%;position:relative;overflow:hidden;background:${t.bg};color:${t.text};font-family:'${t.b}',system-ui,sans-serif;border-radius:10px}
.sl .in{position:absolute;inset:7.3% 4.5%}.sl .bar{position:absolute;left:4.5%;top:7.3%;width:4.5%;height:1.1%;background:${t.highlight}}
.sl h1,.sl h2{font-family:'${t.h}',system-ui,sans-serif;font-weight:700;margin:0;line-height:1.1;letter-spacing:-.01em}
.sl h1{font-size:5.4cqw}.sl h2{font-size:3.3cqw;margin-top:2.5cqw}.sl .sub{font-size:2.2cqw;color:${t.muted};margin-top:1.6cqw}
.sl .mid{position:absolute;left:0;right:0;bottom:38%}.sl ul,.sl ol{margin:3cqw 0 0;padding-left:2.6cqw;font-size:2.1cqw;line-height:1.45}.sl li{margin-bottom:1cqw}
.sl ul li::marker{color:${t.accent}}.sl ol li::marker{color:${t.accent};font-weight:700}
.sl .cols{display:grid;grid-template-columns:1fr 1fr;gap:4cqw}.sl blockquote{margin:9cqw 3cqw 0;font-family:'${t.h}',system-ui,sans-serif;font-size:3.2cqw;line-height:1.3}
.sl .att{margin:2cqw 3cqw 0;font-size:1.8cqw;color:${t.muted}}.sl .pill{display:inline-block;margin-top:2.6cqw;background:${t.accent};color:${t.accentText};font-weight:700;font-size:2cqw;padding:1.2cqw 3cqw;border-radius:99cqw}
.sl mark{background:${t.highlight};color:#111;border-radius:.3cqw;padding:0 .4cqw}`;
}

export function slideHtml(s) {
  const list = (items, tag = 'ul') => (items?.length ? `<${tag}>${items.map((b) => `<li>${ph(b)}</li>`).join('')}</${tag}>` : '');
  let inner;
  if (s.layout === 'title' || s.layout === 'section') inner = `<div class="mid"><h1 style="${s.layout === 'section' ? 'font-size:4.4cqw' : ''}">${ph(s.title)}</h1>${s.subtitle ? `<div class="sub">${ph(s.subtitle)}</div>` : ''}</div>`;
  else if (s.layout === 'cta') inner = `<div class="mid"><h1 style="font-size:4.4cqw">${ph(s.title)}</h1><span class="pill">${esc(s.subtitle || 'Next step')}</span></div>`;
  else if (s.layout === 'quote') inner = `<blockquote>"${ph(s.quote || s.title)}"</blockquote>${s.attribution ? `<div class="att">${esc(s.attribution)}</div>` : ''}`;
  else if (s.layout === 'two_column') inner = `<h2>${ph(s.title)}</h2><div class="cols"><div>${list(s.left)}</div><div>${list(s.right)}</div></div>`;
  else inner = `<h2>${ph(s.title)}</h2>${list(s.bullets, s.layout === 'steps' ? 'ol' : 'ul')}`;
  return `<div class="sl"><div class="bar"></div><div class="in">${inner}</div></div>`;
}

// A printable document: one slide per landscape page. Opened in a hidden frame, then Print, Save as PDF.
export function deckPrintHtml(deck, theme) {
  const f = (x, d) => encodeURIComponent(safeFont(x, d)).replace(/%20/g, '+');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(deck.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${f(theme?.fonts?.heading, 'Space Grotesk')}:wght@700&family=${f(theme?.fonts?.body, 'DM Sans')}:wght@400;700&display=swap">
<style>@page{size:13.333in 7.5in;margin:0}html,body{margin:0;background:#fff}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:13.333in;height:7.5in;page-break-after:always;break-after:page;overflow:hidden}.pg .sl{border-radius:0;height:100%}${slideCss(theme)}</style></head>
<body>${deck.slides.map((s) => `<div class="pg">${slideHtml(s)}</div>`).join('')}</body></html>`;
}
