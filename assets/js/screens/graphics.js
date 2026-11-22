import { t } from '../i18n.js';
import { head, icon, esc, toast, tabsHtml, $ } from '../ui.js';
import { graphics, graphicSizes } from '../data.js';

let tab = 'generate';
const palettes = [['Core', ['#111111', '#F5F5F3', '#C8F36B', '#A2A2A2']], ['Light', ['#FFFFFF', '#F5F5F3', '#111111', '#C8F36B']]];
const fonts = [['Space Grotesk', 'DM Sans', 'Primary pair (verified from engine.ciftron.com)'], ['Manrope', 'Inter', 'Alternate pair from brief']];

export function render(el) {
  const draw = () => {
    el.innerHTML = `
      ${head(t('graphics.title'), t('graphics.sub'), `<button class="btn" id="dl">${icon('download')} ${t('c.download')}</button>`)}
      ${tabsHtml([['generate', t('graphics.generate')], ['board', t('graphics.board')]], tab)}
      <div id="gpane"></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; draw(); });
    $('#dl', el).onclick = () => toast('Downloads a zip of all current versions (Phase 5)');
    const pane = $('#gpane', el);
    if (tab === 'generate') {
      pane.innerHTML = `<div class="split"><div><div class="grid g3">${graphics.map((g) => `<div class="card tight flat"><div class="art ${g.style}" style="aspect-ratio:${g.ratio};max-height:300px;margin:0 auto">
        <span class="k">${esc(g.k)}</span><span class="h">${esc(g.h)}</span><span class="xs" style="font-family:var(--font-body);opacity:.7">ciftron</span></div>
        <div class="row between" style="margin-top:8px"><div class="xs"><b>${esc(g.fmt)}</b><div class="muted">${g.size} · v${g.v}</div></div>
        <div class="row" style="gap:2px"><button class="btn btn-ghost btn-icon btn-sm" title="${t('c.edit')}" data-edit="${g.id}">${icon('edit')}</button><button class="btn btn-ghost btn-icon btn-sm" title="${t('c.regenerate')}" data-regen="${g.id}">${icon('refresh')}</button></div></div></div>`).join('')}</div></div>
        <div class="card stack"><h3>New creative</h3>
          <div class="field"><label>Format</label><select class="select" id="gfmt">${Object.keys(graphicSizes).map((f) => `<option>${f}</option>`).join('')}</select><div class="hint" id="gsize">Exact size: ${graphicSizes['Instagram feed post']}</div></div>
          <div class="field"><label>Headline on image</label><input class="input" placeholder="Short line, 6 words or fewer"></div>
          <div class="field"><label>Reference image (layout only)</label><div class="photo-slot" style="aspect-ratio:3/1">${icon('upload')}</div><div class="hint">Guides layout only. Another creator's words or face are never copied.</div></div>
          <div class="field"><label>Model</label><select class="select"><option>OpenRouter (not connected)</option></select></div>
          <button class="btn btn-primary" id="ggo">${icon('sparkle')} ${t('graphics.generate')}</button></div></div>`;
      $('#gfmt', pane).onchange = (e) => { $('#gsize', pane).textContent = 'Exact size: ' + graphicSizes[e.target.value]; };
      $('#ggo', pane).onclick = () => toast('Connect OpenRouter in Settings to generate images');
      pane.querySelectorAll('[data-regen]').forEach((b) => b.onclick = () => { const g = graphics.find((x) => x.id === b.dataset.regen); g.v++; toast(`Saved as v${g.v}. Older versions are kept.`); draw(); });
      pane.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => toast('Editor opens here in Phase 5'));
    } else {
      pane.innerHTML = `<div class="grid g2">
        <div class="card"><h3 style="margin-bottom:12px">Palettes</h3>${palettes.map(([n, cs]) => `<div style="margin-bottom:14px"><div class="small" style="font-weight:600;margin-bottom:6px">${n}</div><div class="row">${cs.map((c) => `<div><div class="swatch" style="background:${c}"></div><div class="xs muted mono">${c}</div></div>`).join('')}</div></div>`).join('')}</div>
        <div class="card"><h3 style="margin-bottom:12px">Font pairs</h3>${fonts.map(([h, b, n]) => `<div style="margin-bottom:14px"><div style="font-family:'${h}';font-size:22px;font-weight:600">${h}</div><div style="font-family:'${b}'" class="small">${b}: the quick follow-up books the call.</div><div class="xs muted">${n}</div></div>`).join('')}
          <button class="btn btn-sm">${icon('upload')} Upload font</button></div>
        <div class="card"><h3 style="margin-bottom:12px">Logo</h3><div class="row"><div class="brand-mark" style="width:64px;height:64px;border-radius:16px"><span style="width:22px;height:22px"></span></div><div class="small muted">Placeholder mark. Upload your real logo (SVG or PNG).</div></div><button class="btn btn-sm" style="margin-top:12px">${icon('upload')} Upload logo</button></div>
        <div class="card"><div class="card-head"><h3>Photos</h3><span class="xs muted">0 of 20</span></div><div class="grid" style="grid-template-columns:repeat(5,1fr);gap:8px">${Array.from({ length: 10 }, () => '<div class="photo-slot">+</div>').join('')}</div></div>
      </div>`;
    }
  };
  draw();
}
