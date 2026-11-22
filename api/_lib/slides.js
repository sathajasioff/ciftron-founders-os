// Program slides: AI writes the outline from modules and lessons; this file validates it and builds the .pptx.
// Text only (no images), so the deck stays small and every word is editable in PowerPoint or Google Slides.
import { HOUSE_RULES } from './brain.js';
import { cleanCopy } from './chat.js';

export const LAYOUTS = ['title', 'section', 'bullets', 'two_column', 'quote', 'steps', 'cta'];
const str = (v, n) => cleanCopy(String(v ?? '').trim()).slice(0, n);
const strs = (v, max, n) => (Array.isArray(v) ? v.map((x) => str(x, n)).filter(Boolean).slice(0, max) : []);

export const SLIDES_SYSTEM = `You write teaching slides for one business owner's course or coaching program, in their voice from Brand DNA.
You write one module at a time. Each lesson gets a section slide and then 2 to 4 content slides. Add a title or call-to-action slide only when asked.
Slides are for speaking from: short titles (max 8 words), at most 5 bullets of at most 12 words each. Put the full explanation in speaker notes (2 to 5 sentences).
Layouts: title (title, subtitle), section (title, subtitle), bullets (title, bullets), two_column (title, left, right: each a list), quote (quote, attribution: only the owner's own words, never invented quotes from others), steps (title, bullets as numbered steps), cta (title, subtitle: the button label, 2 to 5 words).
Use only the lesson notes and Brand DNA. Never invent results, numbers, case studies, testimonials or dates; write [EXAMPLE NEEDED] where a real example belongs.
${HOUSE_RULES.map((r) => '- ' + r).join('\n')}
Return only JSON: {"title": "...", "slides": [{"layout": "...", "title": "...", "subtitle": "...", "bullets": ["..."], "left": ["..."], "right": ["..."], "quote": "...", "attribution": "...", "notes": "..."}]}`;

export function slidesPrompt({ program, module, index = 0, total = 1, language, perLesson = 3, withCta = false }) {
  return `Program: ${program.name}${program.description ? `\nAbout: ${program.description}` : ''}
Language: ${language === 'fr-qc' ? 'Quebec French' : 'English'}. About ${perLesson} content slides per lesson.
This is module ${index + 1} of ${total}. Start with a section slide for the module itself, then its lessons. No title slide.${withCta ? ' End with one cta slide inviting the viewer to the next step.' : ' No cta slide.'}

## Module ${index + 1}: ${module.title}
${module.lessons.map((l, j) => `### Lesson ${index + 1}.${j + 1}: ${l.title}\n${String(l.body || '(no notes yet)').slice(0, 3000)}`).join('\n')}`;
}

// Title slide first, then every module's slides in order (one CTA at most, at the end).
export function joinDeck(program, parts) {
  const body = parts.flatMap((p) => p.slides).filter((s) => s.layout !== 'title');
  const ctas = body.filter((s) => s.layout === 'cta');
  const slides = [{ layout: 'title', title: str(program.name, 120), subtitle: str(program.description, 220), bullets: [], left: [], right: [], quote: '', attribution: '', notes: '' },
    ...body.filter((s) => s.layout !== 'cta'), ...ctas.slice(-1)];
  return { title: str(program.name, 140), slides: slides.slice(0, 80) };
}

export function validateSlides(j, opts = {}) {
  const slides = (Array.isArray(j?.slides) ? j.slides : []).slice(0, 80).map((s) => ({
    layout: LAYOUTS.includes(s?.layout) ? s.layout : 'bullets', title: str(s?.title, 120), subtitle: str(s?.subtitle, 220),
    bullets: strs(s?.bullets, 6, 160), left: strs(s?.left, 6, 160), right: strs(s?.right, 6, 160),
    quote: str(s?.quote, 400), attribution: str(s?.attribution, 80), notes: str(s?.notes, 1500),
  })).filter((s) => s.title || s.quote || s.bullets.length);
  if (slides.length < (opts.min ?? 2)) throw new Error('The AI returned too few slides. Try again.');
  return { title: str(j?.title, 140) || slides[0].title, slides };
}

// .pptx, 16:9. Colors and fonts from the deck theme (see themeFrom in page.js).
export async function buildPptx(deck, theme) {
  const { default: PptxGenJS } = await import('pptxgenjs'); // loaded only when someone downloads
  const p = new PptxGenJS();
  p.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
  p.title = deck.title;
  const c = (h) => String(h).replace('#', '').slice(0, 6);
  const H = theme.fonts.heading, B = theme.fonts.body;
  const base = { color: c(theme.text), fontFace: B, valign: 'top', margin: 0 };
  const bullets = (items, opts) => items.map((t) => ({ text: t, options: { bullet: opts?.numbered ? { type: 'number' } : { code: '25A0' }, paraSpaceAfter: 10 } }));
  for (const s of deck.slides) {
    const sl = p.addSlide();
    sl.background = { color: c(theme.bg) };
    sl.addShape(p.ShapeType.rect, { x: 0.6, y: 0.55, w: 0.6, h: 0.08, fill: { color: c(theme.highlight) }, line: { color: c(theme.highlight) } });
    if (s.layout === 'title' || s.layout === 'section' || s.layout === 'cta') {
      sl.addText(s.title, { ...base, x: 0.6, y: s.layout === 'title' ? 2.3 : 2.6, w: 12, h: 1.6, fontFace: H, fontSize: s.layout === 'title' ? 48 : 40, bold: true, valign: 'bottom' });
      if (s.layout === 'cta') {
        // The subtitle is the button label.
        const label = s.subtitle || 'Next step';
        sl.addText(label, { shape: p.ShapeType.roundRect, x: 0.6, y: 4.5, w: Math.min(11, 1.2 + label.length * 0.16), h: 0.8, fill: { color: c(theme.accent) }, line: { color: c(theme.accent) }, rectRadius: 0.4,
          color: c(theme.accentText), fontFace: B, fontSize: 20, bold: true, align: 'center', valign: 'middle', margin: 0 });
      } else if (s.subtitle) sl.addText(s.subtitle, { ...base, x: 0.6, y: 4.1, w: 11, h: 1.2, fontSize: 22, color: c(theme.muted) });
    } else if (s.layout === 'quote') {
      sl.addText(`"${s.quote || s.title}"`, { ...base, x: 0.9, y: 1.6, w: 11.4, h: 3.4, fontFace: H, fontSize: 34, valign: 'middle' });
      if (s.attribution) sl.addText(s.attribution, { ...base, x: 0.9, y: 5.2, w: 11, h: 0.6, fontSize: 18, color: c(theme.muted) });
    } else if (s.layout === 'two_column') {
      sl.addText(s.title, { ...base, x: 0.6, y: 0.9, w: 12, h: 1, fontFace: H, fontSize: 32, bold: true });
      sl.addText(bullets(s.left), { ...base, x: 0.6, y: 2.2, w: 5.8, h: 4.6, fontSize: 20 });
      sl.addText(bullets(s.right), { ...base, x: 6.9, y: 2.2, w: 5.8, h: 4.6, fontSize: 20 });
    } else {
      sl.addText(s.title, { ...base, x: 0.6, y: 0.9, w: 12, h: 1, fontFace: H, fontSize: 32, bold: true });
      if (s.bullets.length) sl.addText(bullets(s.bullets, { numbered: s.layout === 'steps' }), { ...base, x: 0.6, y: 2.2, w: 12, h: 4.6, fontSize: 22 });
    }
    if (s.notes) sl.addNotes(s.notes);
  }
  return p.write({ outputType: 'base64' });
}
