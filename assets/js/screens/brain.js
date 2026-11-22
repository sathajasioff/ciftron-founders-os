import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, tabsHtml, $ } from '../ui.js';
import { facts, factCategories, factLabels, sources, styleGuide, offers } from '../data.js';

let tab = 'facts';
let cat = 'all';
let status = 'all';

export function render(el, ctx = {}) {
  if (ctx.live) return import('./brain-live.js').then((m) => m.render(el));
  const draw = () => {
    const proposed = facts.filter((f) => f.status === 'proposed').length;
    el.innerHTML = `
      ${head(t('brain.title'), t('brain.sub'), `<button class="btn btn-primary" id="up">${icon('upload')} ${t('brain.upload')}</button>`)}
      ${tabsHtml([['facts', `${t('brain.facts')} (${proposed} to review)`], ['sources', t('brain.sources')], ['style', t('brain.style')], ['dna', t('brain.dna')]], tab)}
      <div id="bpane"></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; draw(); });
    $('#up', el).onclick = upload;
    const pane = $('#bpane', el);
    ({ facts: factsPane, sources: sourcesPane, style: stylePane, dna: dnaPane })[tab](pane);
  };

  function factsPane(pane) {
    const list = facts.filter((f) => (cat === 'all' || f.cat === cat) && (status === 'all' || f.status === status));
    pane.innerHTML = `<div class="row wrap between" style="margin-bottom:12px"><div class="row wrap">${['all', ...factCategories].map((c) => `<button class="chip ${c === cat ? 'accent' : 'outline'}" data-cat="${c}" style="border:0;cursor:pointer">${c === 'all' ? t('c.all') : factLabels[c]}</button>`).join('')}</div>
      <div class="seg">${['all', 'proposed', 'approved', 'rejected'].map((s) => `<button class="${s === status ? 'active' : ''}" data-st="${s}">${s}</button>`).join('')}</div></div>
      <div class="notice neutral small" style="margin-bottom:12px">${icon('info')}<span>AI proposes facts from your sources. Only approved facts enter Brand DNA. Rejected facts are never used. Unsourced guesses are proposed, never auto-approved.</span></div>
      <div class="list">${list.map((f) => `<div class="fact ${f.status}">
        <button class="star ${f.starred ? 'on' : ''}" data-star="${f.id}" aria-label="${t('c.star')}">${icon('star')}</button>
        <div class="grow"><div class="fact-text">${esc(f.text)}</div><div class="xs muted" style="margin-top:3px"><span class="chip">${factLabels[f.cat]}</span> from ${esc(f.source)}</div></div>
        <span class="chip ${f.status === 'approved' ? 'ok' : f.status === 'rejected' ? 'danger' : 'warn'}">${f.status}</span>
        <div class="row" style="gap:4px">${f.status !== 'approved' ? `<button class="btn btn-sm" data-fa="approved" data-id="${f.id}">${t('c.approve')}</button>` : ''}
        <button class="btn btn-sm btn-ghost" data-fe="${f.id}">${t('c.edit')}</button>
        ${f.status !== 'rejected' ? `<button class="btn btn-sm btn-ghost" data-fa="rejected" data-id="${f.id}">${t('c.reject')}</button>` : ''}</div></div>`).join('') || '<div class="empty">No facts match.</div>'}</div>`;
    pane.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { cat = b.dataset.cat; draw(); });
    pane.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { status = b.dataset.st; draw(); });
    pane.querySelectorAll('[data-star]').forEach((b) => b.onclick = () => { const f = facts.find((x) => x.id === b.dataset.star); f.starred = !f.starred; draw(); });
    pane.querySelectorAll('[data-fa]').forEach((b) => b.onclick = () => { facts.find((x) => x.id === b.dataset.id).status = b.dataset.fa; toast(b.dataset.fa === 'approved' ? 'Approved. Brand DNA will recompile.' : 'Rejected. Never used.'); draw(); });
    pane.querySelectorAll('[data-fe]').forEach((b) => b.onclick = () => { const f = facts.find((x) => x.id === b.dataset.fe);
      modal({ title: 'Edit fact', body: `<textarea class="textarea" id="ft">${esc(f.text)}</textarea>`, foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
        onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = () => { f.text = ov.querySelector('#ft').value; close(); draw(); }; } }); });
  }

  function sourcesPane(pane) {
    pane.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Source</th><th>Type</th><th>Size</th><th>Chunks</th><th>Facts proposed</th><th>Added</th></tr></thead><tbody>
      ${sources.map((s) => `<tr><td style="font-weight:600">${esc(s.name)}</td><td><span class="chip">${s.type}</span></td><td class="muted small">${s.size || '·'}</td><td class="small">${s.chunks}</td><td class="small">${s.facts}</td><td class="muted small">${s.added}</td></tr>`).join('')}
      </tbody></table></div><p class="xs muted" style="margin-top:8px">Text is extracted, chunked and embedded with pgvector for search. Vault items never appear here.</p>`;
  }

  function stylePane(pane) {
    pane.innerHTML = `<div class="grid g2"><div class="card stack"><div class="eyebrow">Summary</div><p>${esc(styleGuide.summary)}</p>
      <div class="eyebrow">Rules</div><ul class="small" style="padding-left:18px;margin:0">${styleGuide.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>
      <div class="card stack"><div class="eyebrow">Avoid</div><ul class="small" style="padding-left:18px;margin:0">${styleGuide.avoid.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      <div class="eyebrow">Sounds like you</div>${styleGuide.examples.map((e) => `<div class="preview-box small">${esc(e)}</div>`).join('')}
      <div class="xs muted">Built from 2 writing samples · v3 · regenerates when you add samples</div></div></div>`;
  }

  function dnaPane(pane) {
    const ok = facts.filter((f) => f.status === 'approved');
    pane.innerHTML = `<div class="dna"><div class="row between wrap"><div><div class="eyebrow">Brand DNA · v4 · active</div><h2 style="margin-top:6px">Ciftron</h2></div><span class="xs" style="color:#A2A2A2">${ok.length} approved facts · style guide v3 · ${offers.length} offers</span></div>
      ${['identity', 'offers', 'audience', 'voice', 'goals', 'tools', 'never_say'].map((c) => { const fs = ok.filter((f) => f.cat === c); return fs.length ? `<div class="dna-sec"><div class="eyebrow" style="color:#A2A2A2">${factLabels[c]}</div><ul style="margin:6px 0;padding-left:18px">${fs.map((f) => `<li>${esc(f.text)}</li>`).join('')}</ul></div>` : ''; }).join('')}
      <div class="dna-sec"><div class="eyebrow" style="color:#A2A2A2">Proof</div><p style="margin:6px 0;color:#A2A2A2">No approved proof yet. AI uses placeholders and flags them.</p></div></div>
      <p class="xs muted" style="margin-top:8px">Every AI feature reads this first. Approved facts beat retrieved text.</p>`;
  }

  function upload() {
    modal({ title: t('brain.upload'), body: `<div class="photo-slot" style="aspect-ratio:3/1;font-size:14px;flex-direction:column">${icon('upload')}<span>Drop docs, PDFs, transcripts or writing samples</span></div>
      <div class="field" style="margin-top:12px"><label>Or paste a link</label><input class="input" placeholder="https://"></div>
      <label class="row small" style="margin-top:10px"><input type="checkbox"> This is a writing sample (used for the style guide)</label>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>Add to Brain</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = () => { close(); toast('Uploads are processed in Phase 2'); }; } });
  }
  draw();
}
