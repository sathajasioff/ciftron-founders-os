// Brain backed by Supabase: sources, facts review, style guide, Brand DNA and search.
import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, tabsHtml, $ } from '../ui.js';
import { live, api, q, versionedUpdate } from '../live.js';

const CATS = ['identity', 'offers', 'audience', 'voice', 'beliefs', 'proof', 'goals', 'tools', 'never_say'];
const LABEL = { identity: 'Identity', offers: 'Offers', audience: 'Audience', voice: 'Voice', beliefs: 'Beliefs', proof: 'Proof', goals: 'Goals', tools: 'Tools', never_say: 'Never say' };
const ACCEPT = '.pdf,.docx,.txt,.md,.markdown,.html,.htm,.csv,.vtt,.srt';
const ui = { tab: 'facts', cat: 'all', status: 'proposed' };
const ago = (d) => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };

function fail(e) {
  if (e.needs) toast(`${e.message}`, { ms: 6000 });
  else toast(e.message || 'Something went wrong', { ms: 6000 });
  console.error(e);
}

export async function render(el) {
  let S = {};
  const load = async () => {
    const [facts, sources, styles, dna, offers] = await Promise.all([
      q(live.sb.from('brain_facts').select('*, brain_sources(name)').order('created_at', { ascending: false })),
      q(live.sb.from('brain_sources').select('id, kind, name, mime, storage_path, url, is_writing_sample, status, error, text_length, chunk_count, facts_proposed_at, created_at').order('created_at', { ascending: false })),
      q(live.sb.from('style_guides').select('*').order('version_no', { ascending: false })),
      q(live.sb.from('brand_dna').select('id, version_no, markdown, content, is_active, created_at').order('version_no', { ascending: false })),
      q(live.sb.from('offers').select('*').order('sort')),
    ]);
    S = { facts, sources, styles, dna, offers, active: dna.find((d) => d.is_active) };
  };

  const stale = () => {
    if (!S.active) return S.facts.some((f) => f.status === 'approved');
    const at = new Date(S.active.created_at);
    return S.facts.some((f) => f.status === 'approved' && new Date(f.updated_at) > at) || S.offers.some((o) => new Date(o.updated_at) > at)
      || (S.styles[0] && new Date(S.styles[0].created_at) > at)
      || S.facts.filter((f) => f.status === 'approved').length !== Object.values(S.active.content.facts || {}).flat().length;
  };

  const draw = () => {
    const proposed = S.facts.filter((f) => f.status === 'proposed').length;
    el.innerHTML = `
      ${head(t('brain.title'), t('brain.sub'), `<button class="btn btn-primary" id="up">${icon('upload')} ${t('brain.upload')}</button>`)}
      ${stale() ? `<div class="notice warn" style="margin-bottom:14px">${icon('alert')}<span class="grow">Brand DNA is out of date with your approved facts, offers or style guide.</span><button class="btn btn-sm" id="compile-top">Compile now</button></div>` : ''}
      ${tabsHtml([['facts', `${t('brain.facts')}${proposed ? ` (${proposed} to review)` : ''}`], ['sources', `${t('brain.sources')} (${S.sources.length})`], ['style', t('brain.style')], ['dna', t('brain.dna')], ['search', t('c.search')]], ui.tab)}
      <div id="bpane"></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { ui.tab = b.dataset.tab; draw(); });
    $('#up', el).onclick = upload;
    const ct = $('#compile-top', el); if (ct) ct.onclick = compile;
    ({ facts: factsPane, sources: sourcesPane, style: stylePane, dna: dnaPane, search: searchPane })[ui.tab]($('#bpane', el));
  };
  const refresh = async () => { await load(); draw(); };

  // ---------- Facts ----------
  function factsPane(pane) {
    const list = S.facts.filter((f) => (ui.cat === 'all' || f.category === ui.cat) && (ui.status === 'all' || f.status === ui.status));
    const count = (st) => S.facts.filter((f) => (ui.cat === 'all' || f.category === ui.cat) && (st === 'all' || f.status === st)).length;
    pane.innerHTML = `<div class="row wrap between" style="margin-bottom:12px"><div class="row wrap">${['all', ...CATS].map((c) => `<button class="chip ${c === ui.cat ? 'accent' : 'outline'}" data-cat="${c}" style="border:0;cursor:pointer">${c === 'all' ? t('c.all') : LABEL[c]}</button>`).join('')}</div>
      <div class="seg">${['proposed', 'approved', 'rejected', 'all'].map((s) => `<button class="${s === ui.status ? 'active' : ''}" data-st="${s}">${s} (${count(s)})</button>`).join('')}</div></div>
      <div class="row wrap" style="margin-bottom:12px"><button class="btn btn-sm" id="addf">${icon('plus')} Add a fact</button>
      ${ui.status === 'proposed' && list.length ? `<span class="xs muted">Each fact shows the exact quote it came from. Approve only what is true.</span>` : ''}</div>
      <div class="list">${list.map((f) => `<div class="fact ${f.status}">
        <button class="star ${f.starred ? 'on' : ''}" data-star="${f.id}" aria-label="${t('c.star')}" title="Starred facts come first in Brand DNA">${icon('star')}</button>
        <div class="grow"><div class="fact-text">${esc(f.text)}</div>
          ${f.source_quote ? `<div class="xs muted" style="margin-top:4px;border-left:2px solid var(--border-strong);padding-left:8px">"${esc(f.source_quote)}"</div>` : ''}
          <div class="xs muted" style="margin-top:4px"><span class="chip">${LABEL[f.category]}</span> ${f.brain_sources ? 'from ' + esc(f.brain_sources.name) : f.authored_by === 'me' ? 'added by you' : ''}${f.authored_by === 'me' && f.source_id ? ' · edited by you' : ''}</div></div>
        <span class="chip ${f.status === 'approved' ? 'ok' : f.status === 'rejected' ? 'danger' : 'warn'}">${f.status}</span>
        <div class="row" style="gap:4px">${f.status !== 'approved' ? `<button class="btn btn-sm" data-set="approved" data-id="${f.id}">${t('c.approve')}</button>` : ''}
          <button class="btn btn-sm btn-ghost" data-edit="${f.id}">${t('c.edit')}</button>
          ${f.status !== 'rejected' ? `<button class="btn btn-sm btn-ghost" data-set="rejected" data-id="${f.id}">${t('c.reject')}</button>` : ''}</div></div>`).join('')
        || `<div class="empty">${S.facts.length ? 'No facts match this filter.' : 'No facts yet. Upload a source, process it, then press Propose facts.'}</div>`}</div>`;
    pane.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { ui.cat = b.dataset.cat; draw(); });
    pane.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { ui.status = b.dataset.st; draw(); });
    pane.querySelectorAll('[data-star]').forEach((b) => b.onclick = () => saveFact(b.dataset.star, (f) => ({ starred: !f.starred })));
    pane.querySelectorAll('[data-set]').forEach((b) => b.onclick = () => saveFact(b.dataset.id, () => ({ status: b.dataset.set }), b.dataset.set === 'rejected' ? 'Rejected. It will never be used.' : 'Approved'));
    pane.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editFact(S.facts.find((x) => x.id === b.dataset.edit)));
    $('#addf', pane).onclick = () => editFact(null);
  }

  async function saveFact(id, patchFn, msg) {
    const f = S.facts.find((x) => x.id === id);
    try {
      const r = await versionedUpdate('brain_facts', f, patchFn(f));
      if (r.conflict) { toast('This fact changed in another tab. Reloaded the latest.'); return refresh(); }
      Object.assign(f, r.row);
      if (msg) toast(msg);
      draw();
    } catch (e) { fail(e); }
  }

  function editFact(f) {
    modal({ title: f ? 'Edit fact' : 'Add a fact', sub: f ? 'Your wording is kept. AI will not overwrite it.' : 'Facts you add are approved right away.',
      body: `<div class="stack"><div class="field"><label>Category</label><select class="select" id="fc">${CATS.map((c) => `<option value="${c}" ${f?.category === c ? 'selected' : ''}>${LABEL[c]}</option>`).join('')}</select></div>
        <div class="field"><label>Fact</label><textarea class="textarea" id="ft" maxlength="300">${esc(f?.text || '')}</textarea><div class="hint">One plain sentence.</div></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        const text = ov.querySelector('#ft').value.trim(), category = ov.querySelector('#fc').value;
        if (!text) return;
        try {
          if (f) {
            const r = await versionedUpdate('brain_facts', f, { text, category, authored_by: 'me' });
            if (r.conflict) { close(); toast('This fact changed somewhere else. Reloaded the latest, your edit was not saved.'); return refresh(); }
          } else {
            await q(live.sb.from('brain_facts').insert({ owner_id: live.user.id, text, category, status: 'approved', authored_by: 'me' }));
          }
          close(); await refresh();
        } catch (e) { fail(e); }
      }; } });
  }

  // ---------- Sources ----------
  function sourcesPane(pane) {
    pane.innerHTML = `<div class="notice neutral small" style="margin-bottom:12px">${icon('info')}<span>Process extracts the text, splits it into chunks and embeds them for search (OpenAI key). Propose facts asks Claude for facts with quotes (Anthropic key). Mark your own writing as a writing sample to build the style guide.</span></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Source</th><th>Status</th><th>Chunks</th><th>Writing sample</th><th></th></tr></thead><tbody>
      ${S.sources.map((s) => `<tr><td><div style="font-weight:600">${esc(s.name)}</div><div class="xs muted">${s.kind === 'link' ? esc(s.url) : s.kind === 'text' ? 'Pasted text' : esc(s.mime || 'file')} · ${ago(s.created_at)}${s.text_length ? ` · ${s.text_length.toLocaleString()} chars` : ''}</div>
          ${s.error ? `<div class="xs down" style="margin-top:3px">${esc(s.error)}</div>` : ''}</td>
        <td><span class="chip ${s.status === 'ready' ? 'ok' : s.status === 'error' ? 'danger' : s.status === 'processing' ? 'info' : 'warn'}">${s.status}</span></td>
        <td class="small">${s.chunk_count || '·'}</td>
        <td><label class="toggle"><input type="checkbox" data-ws="${s.id}" ${s.is_writing_sample ? 'checked' : ''}><span></span></label></td>
        <td><div class="row" style="gap:4px;justify-content:flex-end">
          ${s.status !== 'ready' ? `<button class="btn btn-sm btn-primary" data-ingest="${s.id}">Process</button>` : `<button class="btn btn-sm" data-propose="${s.id}">${icon('sparkle')} ${s.facts_proposed_at ? 'Propose again' : 'Propose facts'}</button><button class="btn btn-sm btn-ghost" data-ingest="${s.id}" title="Re-process">${icon('refresh')}</button>`}
          <button class="btn btn-sm btn-ghost" data-del="${s.id}" title="Delete source">${icon('trash')}</button></div></td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">No sources yet.</td></tr>'}</tbody></table></div>`;
    pane.querySelectorAll('[data-ws]').forEach((c) => c.onchange = async () => { try { await q(live.sb.from('brain_sources').update({ is_writing_sample: c.checked }).eq('id', c.dataset.ws)); S.sources.find((s) => s.id === c.dataset.ws).is_writing_sample = c.checked; } catch (e) { fail(e); } });
    pane.querySelectorAll('[data-ingest]').forEach((b) => b.onclick = () => run(b, () => ingest(b.dataset.ingest)));
    pane.querySelectorAll('[data-propose]').forEach((b) => b.onclick = () => run(b, () => propose(b.dataset.propose)));
    pane.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => removeSource(S.sources.find((s) => s.id === b.dataset.del)));
  }

  async function run(btn, fn) {
    btn.disabled = true; const old = btn.innerHTML; btn.textContent = 'Working...';
    try { await fn(); } catch (e) { fail(e); } finally { btn.disabled = false; btn.innerHTML = old; await refresh(); }
  }
  async function ingest(id) { const r = await api('brain', { body: { action: 'ingest', source_id: id } }); toast(`Processed: ${r.chunks} chunks`); }
  async function propose(id) {
    const r = await api('brain', { body: { action: 'propose', source_id: id } });
    toast(r.proposed ? `${r.proposed} facts proposed. Review them in Facts.` : 'No new facts found in this source.');
    if (r.proposed) { ui.tab = 'facts'; ui.status = 'proposed'; ui.cat = 'all'; }
  }

  function removeSource(s) {
    modal({ title: 'Delete source', sub: esc(s.name), body: `<p class="small">This removes the source and its search chunks. Facts already approved from it stay, without the source link.</p>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-danger solid" data-ok>Delete</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        try {
          if (s.storage_path) await live.sb.storage.from('brain').remove([s.storage_path]);
          await q(live.sb.from('brain_sources').delete().eq('id', s.id));
          close(); toast('Source deleted'); refresh();
        } catch (e) { fail(e); }
      }; } });
  }

  function upload() {
    modal({ title: t('brain.upload'), sub: 'Docs, PDFs, transcripts, links and writing samples.',
      body: `<div class="seg" id="ukind" style="margin-bottom:14px"><button class="active" data-k="file">Files</button><button data-k="link">Link</button><button data-k="text">Paste text</button></div>
        <div data-p="file"><input type="file" id="uf" multiple accept="${ACCEPT}" class="input"><div class="hint">PDF, Word (.docx), text, Markdown, HTML, captions. Up to 50 MB each.</div></div>
        <div data-p="link" class="hidden"><input class="input" id="ul" type="url" placeholder="https://"></div>
        <div data-p="text" class="hidden stack-sm"><input class="input" id="utn" placeholder="Name, for example: Reel captions Nov"><textarea class="textarea" id="ut" style="min-height:160px"></textarea></div>
        <label class="row small" style="margin-top:12px"><input type="checkbox" id="uws"> These are my own writing samples (used for the style guide)</label>
        <label class="row small" style="margin-top:6px"><input type="checkbox" id="uauto" checked> Process and propose facts right away</label>
        <div id="uprog" class="small muted" style="margin-top:10px"></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>Add to Brain</button>`,
      onMount: (ov, close) => {
        let kind = 'file';
        ov.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { kind = b.dataset.k; ov.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('active', x === b)); ov.querySelectorAll('[data-p]').forEach((p) => p.classList.toggle('hidden', p.dataset.p !== kind)); });
        ov.querySelector('[data-ok]').onclick = async (ev) => { const __b = ev.currentTarget; 
          const btn = __b, prog = ov.querySelector('#uprog');
          const ws = ov.querySelector('#uws').checked, auto = ov.querySelector('#uauto').checked;
          const rows = [];
          btn.disabled = true;
          try {
            if (kind === 'file') {
              const files = [...ov.querySelector('#uf').files];
              if (!files.length) throw new Error('Choose at least one file');
              for (const f of files) {
                if (f.size > 50 * 1024 * 1024) throw new Error(`${f.name} is over 50 MB`);
                prog.textContent = `Uploading ${f.name}...`;
                const path = `${live.user.id}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, '_').slice(-120)}`;
                const { error } = await live.sb.storage.from('brain').upload(path, f, { contentType: f.type || 'application/octet-stream' });
                if (error) throw new Error(error.message);
                rows.push({ kind: 'file', name: f.name, mime: f.type, storage_path: path });
              }
            } else if (kind === 'link') {
              const url = ov.querySelector('#ul').value.trim();
              if (!/^https?:\/\//.test(url)) throw new Error('Enter a full link starting with https://');
              rows.push({ kind: 'link', name: new URL(url).hostname + new URL(url).pathname.replace(/\/$/, ''), url });
            } else {
              const content = ov.querySelector('#ut').value.trim();
              if (content.length < 20) throw new Error('Paste a bit more text');
              rows.push({ kind: 'text', name: ov.querySelector('#utn').value.trim() || 'Pasted text', content, mime: 'text/plain' });
            }
            const created = await q(live.sb.from('brain_sources').insert(rows.map((r) => ({ ...r, owner_id: live.user.id, is_writing_sample: ws }))).select('id, name'));
            if (auto) {
              for (const s of created) {
                prog.textContent = `Processing ${s.name}...`; await ingest(s.id);
                prog.textContent = `Proposing facts from ${s.name}...`; await propose(s.id);
              }
            }
            close(); if (!auto) ui.tab = 'sources'; refresh();
          } catch (e) { fail(e); prog.textContent = ''; btn.disabled = false; refresh(); }
        };
      } });
  }

  // ---------- Style guide ----------
  function stylePane(pane) {
    const g = S.styles[0];
    const samples = S.sources.filter((s) => s.is_writing_sample);
    const list = (a) => (a || []).map((x) => `<li>${esc(x)}</li>`).join('');
    pane.innerHTML = `<div class="row wrap between" style="margin-bottom:12px"><div class="small muted">${samples.length} writing sample${samples.length === 1 ? '' : 's'}: ${samples.map((s) => esc(s.name)).join(', ') || 'none yet. Mark sources as writing samples in Sources.'}</div>
      <div class="row"><button class="btn btn-primary" id="gen" ${samples.length ? '' : 'disabled'}>${icon('sparkle')} ${g ? 'Rebuild from samples' : 'Build style guide'}</button>${g ? `<button class="btn" id="sedit">${t('c.edit')}</button>` : ''}</div></div>
      ${g ? `<div class="grid g2"><div class="card stack"><div class="eyebrow">Summary · v${g.version_no}${g.authored_by === 'me' ? ' · edited by you' : ''}</div><p>${esc(g.guide.summary)}</p>
        ${g.guide.sentence_style ? `<p class="small"><b>Sentences:</b> ${esc(g.guide.sentence_style)}</p>` : ''}
        <div class="eyebrow">Rules</div><ul class="small" style="padding-left:18px;margin:0">${list(g.guide.rules)}</ul>
        ${g.guide.french_notes ? `<div class="eyebrow">Quebec French</div><p class="small">${esc(g.guide.french_notes)}</p>` : ''}</div>
        <div class="card stack"><div class="eyebrow">Avoid</div><ul class="small" style="padding-left:18px;margin:0">${list(g.guide.avoid)}</ul>
        ${g.guide.vocabulary?.length ? `<div class="eyebrow">Words you use</div><div>${g.guide.vocabulary.map((v) => `<span class="chip outline" style="margin:0 4px 4px 0">${esc(v)}</span>`).join('')}</div>` : ''}
        <div class="eyebrow">Sounds like you</div>${(g.guide.examples || []).map((e) => `<div class="preview-box small">${esc(e)}</div>`).join('')}</div></div>`
      : '<div class="empty card soft">No style guide yet.</div>'}`;
    const gen = $('#gen', pane); if (gen) gen.onclick = () => run(gen, async () => { await api('brain', { body: { action: 'style' } }); toast('Style guide built'); });
    const se = $('#sedit', pane); if (se) se.onclick = () => editStyle(g);
  }

  function editStyle(g) {
    const lines = (a) => esc((a || []).join('\n'));
    modal({ title: 'Edit style guide', sub: 'Saved as a new version written by you.', wide: true,
      body: `<div class="stack"><div class="field"><label>Summary</label><textarea class="textarea" id="s1">${esc(g.guide.summary)}</textarea></div>
        <div class="grid g2"><div class="field"><label>Rules (one per line)</label><textarea class="textarea" id="s2" style="min-height:160px">${lines(g.guide.rules)}</textarea></div>
        <div class="field"><label>Avoid (one per line)</label><textarea class="textarea" id="s3" style="min-height:160px">${lines(g.guide.avoid)}</textarea></div></div>
        <div class="field"><label>Quebec French notes</label><input class="input" id="s4" value="${esc(g.guide.french_notes || '')}"></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        const split = (id) => ov.querySelector(id).value.split('\n').map((x) => x.trim()).filter(Boolean);
        const guide = { ...g.guide, summary: ov.querySelector('#s1').value.trim(), rules: split('#s2'), avoid: split('#s3'), french_notes: ov.querySelector('#s4').value.trim() };
        try { await q(live.sb.from('style_guides').insert({ owner_id: live.user.id, version_no: g.version_no + 1, guide, sample_source_ids: g.sample_source_ids, authored_by: 'me' })); close(); refresh(); }
        catch (e) { fail(/duplicate/.test(e.message) ? new Error('A newer version was saved meanwhile. Reload and try again.') : e); }
      }; } });
  }

  // ---------- Brand DNA ----------
  function dnaPane(pane) {
    const d = S.active;
    pane.innerHTML = `<div class="split"><div>
        <div class="row between wrap" style="margin-bottom:12px"><div class="small muted">${d ? `Active: v${d.version_no}, compiled ${ago(d.created_at)}` : 'Not compiled yet.'}</div><button class="btn btn-primary" id="compile">${icon('refresh')} Compile Brand DNA</button></div>
        ${d ? `<div class="dna">${mdToHtml(d.markdown)}</div>` : '<div class="empty card soft">Approve some facts, then compile.</div>'}
        <p class="xs muted" style="margin-top:8px">Every AI feature reads the active Brand DNA first. Only approved facts, your style guide and the offers you tick are included.</p></div>
      <div class="stack"><div class="card"><div class="card-head"><h3>Offers in DNA</h3></div>
        ${S.offers.map((o) => `<div class="row top" style="margin-bottom:12px"><label class="toggle" style="margin-top:2px"><input type="checkbox" data-od="${o.id}" ${o.in_dna ? 'checked' : ''}><span></span></label>
          <div class="grow small"><b>${esc(o.name)}</b><div class="muted xs">${o.price == null ? 'No price' : `$${Number(o.price)} ${o.currency}${o.cadence === 'one_time' ? '' : ' / ' + o.cadence}`} · ${o.status}</div></div>
          <button class="btn btn-ghost btn-sm" data-oe="${o.id}">${t('c.edit')}</button></div>`).join('')}
        <button class="btn btn-sm" id="oadd">${icon('plus')} Offer</button></div>
        ${S.dna.length > 1 ? `<div class="card"><h3 style="margin-bottom:8px">History</h3>${S.dna.map((x) => `<div class="row between small" style="margin-bottom:6px"><span>v${x.version_no} · ${ago(x.created_at)}</span>${x.is_active ? '<span class="chip ok">active</span>' : `<button class="btn btn-sm btn-ghost" data-act="${x.id}">Make active</button>`}</div>`).join('')}</div>` : ''}
      </div></div>`;
    $('#compile', pane).onclick = compile;
    pane.querySelectorAll('[data-od]').forEach((c) => c.onchange = async () => { const o = S.offers.find((x) => x.id === c.dataset.od); const r = await versionedUpdate('offers', o, { in_dna: c.checked }).catch(fail); if (r?.conflict) { toast('Offer changed elsewhere. Reloaded.'); } refresh(); });
    pane.querySelectorAll('[data-oe]').forEach((b) => b.onclick = () => editOffer(S.offers.find((x) => x.id === b.dataset.oe)));
    $('#oadd', pane).onclick = () => editOffer(null);
    pane.querySelectorAll('[data-act]').forEach((b) => b.onclick = async () => {
      try { await q(live.sb.from('brand_dna').update({ is_active: false }).eq('is_active', true)); await q(live.sb.from('brand_dna').update({ is_active: true }).eq('id', b.dataset.act)); refresh(); } catch (e) { fail(e); }
    });
  }

  async function compile() {
    try { const r = await api('brain', { body: { action: 'compile' } }); toast(`Brand DNA v${r.brand_dna.version_no} is active`); ui.tab = 'dna'; refresh(); } catch (e) { fail(e); }
  }

  function editOffer(o) {
    modal({ title: o ? 'Edit offer' : 'New offer', sub: 'Positioning context only. HighLevel still owns real products and prices.',
      body: `<div class="stack"><div class="field"><label>Name</label><input class="input" id="on" value="${esc(o?.name || '')}"></div>
        <div class="grid g3"><div class="field"><label>Price</label><input class="input" id="op" type="number" min="0" step="0.01" value="${o?.price ?? ''}"></div>
        <div class="field"><label>Billing</label><select class="select" id="oc">${[['month', 'Monthly'], ['year', 'Yearly'], ['one_time', 'One time']].map(([v, l]) => `<option value="${v}" ${(o?.cadence || 'month') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Status</label><select class="select" id="os">${['live', 'paused', 'draft'].map((v) => `<option ${o?.status === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
        <div class="field"><label>Services (one per line)</label><textarea class="textarea" id="osv" style="min-height:140px">${esc((o?.services || []).join('\n'))}</textarea></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        const v = (id) => ov.querySelector(id).value.trim();
        const patch = { name: v('#on'), price: v('#op') === '' ? null : Number(v('#op')), cadence: v('#oc'), status: v('#os'), services: v('#osv').split('\n').map((x) => x.trim()).filter(Boolean), authored_by: 'me' };
        if (!patch.name) return;
        try {
          if (o) { const r = await versionedUpdate('offers', o, patch); if (r.conflict) toast('Offer changed elsewhere. Your edit was not saved.'); }
          else await q(live.sb.from('offers').insert({ ...patch, owner_id: live.user.id, sort: S.offers.length + 1 }));
          close(); refresh();
        } catch (e) { fail(e); }
      }; } });
  }

  // ---------- Search ----------
  function searchPane(pane) {
    pane.innerHTML = `<div class="card row" style="margin-bottom:14px"><input class="input grow" id="sq" placeholder="Search everything in your Brain, for example: how I follow up with mortgage leads"><button class="btn btn-primary" id="sgo">${icon('search')} ${t('c.search')}</button></div><div id="sres"></div>`;
    const go = async () => {
      const qv = $('#sq', pane).value.trim(); if (!qv) return;
      const out = $('#sres', pane); out.innerHTML = '<div class="small muted">Searching...</div>';
      try {
        const { results } = await api('brain', { body: { action: 'search', query: qv } });
        out.innerHTML = results.length ? `<div class="stack">${results.map((r) => `<div class="card tight"><div class="row between xs muted" style="margin-bottom:6px"><b>${esc(r.source_name)}</b><span>match ${Math.round(r.similarity * 100)}%</span></div><div class="small" style="white-space:pre-wrap">${esc(r.content.slice(0, 700))}${r.content.length > 700 ? '...' : ''}</div></div>`).join('')}</div>` : '<div class="empty">No close matches.</div>';
      } catch (e) { out.innerHTML = ''; fail(e); }
    };
    $('#sgo', pane).onclick = go;
    $('#sq', pane).onkeydown = (e) => { if (e.key === 'Enter') go(); };
  }

  el.innerHTML = '<div class="empty">Loading your Brain...</div>';
  try { await load(); draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load the Brain</h2><p class="mono">${esc(e.message)}</p><p class="small">If this is a fresh project, run the SQL migrations in Supabase first.</p></div>`; }
}

// Minimal Markdown for the Brand DNA view: headings, bullets, quotes, paragraphs.
function mdToHtml(md) {
  return md.split('\n').map((l) => {
    if (l.startsWith('# ')) return `<div class="eyebrow">Brand DNA</div><h2 style="margin:6px 0 4px">${esc(l.slice(2))}</h2>`;
    if (l.startsWith('## ')) return `<div class="dna-sec"><div class="eyebrow" style="color:#A2A2A2">${esc(l.slice(3))}</div></div>`;
    if (l.startsWith('- ')) return `<div style="padding-left:14px;text-indent:-10px;margin:3px 0">• ${esc(l.slice(2))}</div>`;
    if (l.startsWith('> ')) return `<div style="color:#C8F36B;margin:3px 0">"${esc(l.slice(2))}"</div>`;
    return l.trim() ? `<p style="margin:4px 0;color:#D0D0D0">${esc(l)}</p>` : '';
  }).join('');
}
