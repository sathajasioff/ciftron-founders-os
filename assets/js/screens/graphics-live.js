// Graphics backed by Supabase + OpenRouter: brand board, generation cropped to exact sizes, versions, download all.
import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, tabsHtml, $ } from '../ui.js';
import { live, api, q } from '../live.js';

const FORMATS = { 'Instagram feed post': [1080, 1350], 'Instagram Story': [1080, 1920], 'Facebook feed post': [1080, 1080], 'Carousel slide': [1080, 1350], 'Meta Ads graphic': [1080, 1080], 'YouTube thumbnail': [1280, 720], 'LinkedIn graphic': [1200, 627] };
const DEFAULT_BOARD = { palettes: [{ name: 'Core', colors: ['#111111', '#F5F5F3', '#C8F36B', '#A2A2A2'] }], fonts: [{ heading: 'Space Grotesk', body: 'DM Sans' }], photo_paths: [] };
const ui = { tab: 'generate', model: null };
const urls = new Map();
async function signed(path) {
  if (!path) return '';
  if (urls.has(path)) return urls.get(path);
  const { data } = await live.sb.storage.from('brain').createSignedUrl(path, 3600);
  urls.set(path, data?.signedUrl || ''); return data?.signedUrl || '';
}
// Cover-crop to the exact pixel size of the format.
async function toExact(b64, type, w, h) {
  const img = new Image(); img.src = `data:${type};base64,${b64}`; await img.decode();
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const s = Math.max(w / img.width, h / img.height), dw = img.width * s, dh = img.height * s;
  c.getContext('2d').drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
async function upload(blob, folder, name = 'image.png') {
  const path = `${live.ownerId}/${folder}/${crypto.randomUUID()}-${name.replace(/[^\w.\-]+/g, '_').slice(-80)}`;
  const { error } = await live.sb.storage.from('brain').upload(path, blob, { contentType: blob.type || 'image/png' });
  if (error) throw new Error(error.message);
  return path;
}

export async function render(el, ctx) {
  let board = null, graphics = [], versions = [], models = [];
  const load = async () => {
    [board, graphics, versions] = await Promise.all([
      q(live.sb.from('brand_board').select('*').maybeSingle()),
      q(live.sb.from('graphics').select('*').order('created_at', { ascending: false }).limit(60)),
      q(live.sb.from('graphic_versions').select('*').order('version_no', { ascending: false })),
    ]);
    board = board || { ...DEFAULT_BOARD, _new: true };
  };
  const refresh = async () => { await load(); await draw(); };
  const latest = (g) => versions.find((v) => v.graphic_id === g.id);

  const draw = async () => {
    el.innerHTML = `
      ${head(t('graphics.title'), t('graphics.sub'), `<button class="btn" id="dl">${icon('download')} ${t('c.download')}</button>`)}
      ${tabsHtml([['generate', t('graphics.generate')], ['board', t('graphics.board')]], ui.tab)}
      <div id="gpane"></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { ui.tab = b.dataset.tab; draw(); });
    $('#dl', el).onclick = downloadAll;
    const pane = $('#gpane', el);
    if (ui.tab === 'board') return boardPane(pane);
    const cards = await Promise.all(graphics.map(async (g) => { const v = latest(g); return { g, v, url: v ? await signed(v.storage_path) : '' }; }));
    let notes = ''; try { notes = sessionStorage.getItem('os.graphicNotes') || ''; sessionStorage.removeItem('os.graphicNotes'); } catch {}
    pane.innerHTML = `<div class="split"><div>${cards.length ? `<div class="grid g3">${cards.map(({ g, v, url }) => `<div class="card tight flat">
        <div style="aspect-ratio:${g.width}/${g.height};background:var(--surface-3);border-radius:10px;overflow:hidden">${url ? `<img src="${esc(url)}" alt="${esc(g.title || g.format)}" style="width:100%;height:100%;object-fit:cover">` : ''}</div>
        <div class="row between" style="margin-top:8px"><div class="xs"><b>${esc(g.title || g.format)}</b><div class="muted">${g.width} × ${g.height} · v${v?.version_no || 0} · ${v?.status === 'approved' ? 'approved' : 'in Approvals'}</div></div>
        <div class="row" style="gap:2px"><button class="btn btn-ghost btn-icon btn-sm" title="${t('c.edit')}" data-edit="${g.id}">${icon('edit')}</button><button class="btn btn-ghost btn-icon btn-sm" title="${t('c.regenerate')}" data-regen="${g.id}">${icon('refresh')}</button><button class="btn btn-ghost btn-icon btn-sm" title="${t('c.versions')}" data-hist="${g.id}">${icon('book')}</button></div></div></div>`).join('')}</div>`
        : '<div class="empty card soft">Your generated graphics appear here, cropped to the exact size of each format.</div>'}</div>
      <div class="card stack"><h3>New creative</h3>
        <div class="field"><label>Format</label><select class="select" id="gfmt">${Object.keys(FORMATS).map((f) => `<option>${f}</option>`).join('')}</select><div class="hint" id="gsize">Exact size: 1080 × 1350</div></div>
        <div class="field"><label>Headline on image</label><input class="input" id="ghead" placeholder="Short line, 6 words or fewer"></div>
        <div class="field"><label>Details</label><textarea class="textarea" id="gnotes" placeholder="Scene, mood, what should be in the picture">${esc(notes)}</textarea></div>
        <div class="field"><label>Reference image (layout only)</label><input type="file" id="gref" accept="image/*" class="input"><div class="hint">Guides layout only. Another creator's words or face are never copied.</div></div>
        <div class="field"><label>Model</label><select class="select" id="gmodel"><option value="">Default (${esc('google/gemini-2.5-flash-image')})</option></select><button class="btn btn-sm btn-ghost" id="gmodels" style="margin-top:4px">Load models from OpenRouter</button></div>
        <button class="btn btn-primary" id="ggo">${icon('sparkle')} ${t('graphics.generate')}</button><p class="xs muted">Uses your OpenRouter key and brand board. Each image goes to Approvals.</p></div></div>`;
    $('#gfmt', pane).onchange = (e) => { $('#gsize', pane).textContent = 'Exact size: ' + FORMATS[e.target.value].join(' × '); };
    $('#gmodels', pane).onclick = async (e) => { const __b = e.currentTarget;  __b.disabled = true; try { models = (await api('studio', { body: { action: 'image_models' } })).models; $('#gmodel', pane).innerHTML = '<option value="">Default</option>' + models.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}${m.refs ? ' · references' : ''}</option>`).join(''); } catch (x) { toast(x.message, { ms: 7000 }); } };
    $('#ggo', pane).onclick = async (ev) => { const __b = ev.currentTarget; 
      const b = __b; b.disabled = true; b.textContent = 'Generating...';
      try {
        const file = $('#gref', pane).files[0];
        const reference_path = file ? await upload(file, 'graphics/refs', file.name) : null;
        await generate({ format: $('#gfmt', pane).value, headline: $('#ghead', pane).value.trim(), notes: $('#gnotes', pane).value.trim(), model: $('#gmodel', pane).value, reference_path });
      } catch (x) { toast(x.message, { ms: 8000 }); }
      b.disabled = false; b.textContent = t('graphics.generate');
    };
    pane.querySelectorAll('[data-regen]').forEach((b) => b.onclick = () => regen(graphics.find((g) => g.id === b.dataset.regen), b));
    pane.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editImage(graphics.find((g) => g.id === b.dataset.edit)));
    pane.querySelectorAll('[data-hist]').forEach((b) => b.onclick = () => history(graphics.find((g) => g.id === b.dataset.hist)));
  };

  // Generate, crop to the exact size, save a version, and queue it in Approvals.
  async function generate({ graphic, format, headline, notes, model, reference_path, base_path, instruction }) {
    const [w, h] = FORMATS[format || graphic.format];
    const r = await api('studio', { body: { action: 'graphic', format: format || graphic.format, headline: headline ?? graphic?.brief?.headline, notes: notes ?? graphic?.brief?.notes, model: model || graphic?.brief?.model, reference_path: reference_path ?? graphic?.brief?.reference_path, base_path, instruction } });
    const blob = await toExact(r.b64, r.media_type, w, h);
    const path = await upload(blob, 'graphics', `${(format || graphic.format).replace(/\s+/g, '-').toLowerCase()}.png`);
    let g = graphic;
    if (!g) [g] = await q(live.sb.from('graphics').insert({ owner_id: live.ownerId, format, width: w, height: h, title: headline || format, brief: { headline, notes, model, reference_path } }).select());
    const versionNo = (versions.filter((v) => v.graphic_id === g.id)[0]?.version_no || 0) + 1;
    const [v] = await q(live.sb.from('graphic_versions').insert({ owner_id: live.ownerId, graphic_id: g.id, version_no: versionNo, storage_path: path, prompt: r.prompt }).select('id'));
    const [ap] = await q(live.sb.from('approvals').insert({ owner_id: live.ownerId, type: 'Graphic', title: `${g.title || g.format} v${versionNo}`, payload: { body: `${g.format}, ${w} × ${h}. ${instruction ? 'Edit: ' + instruction : (headline || '')}`, graphic_id: g.id, graphic_version_id: v.id, storage_path: path }, tags: ['graphic'], source_agent: 'Designer', target_module: 'graphics', authored_by: 'ai' }).select('id'));
    await q(live.sb.from('graphic_versions').update({ approval_id: ap.id }).eq('id', v.id));
    await q(live.sb.from('graphics').update({ current_version: versionNo }).eq('id', g.id));
    ctx.refreshNav(); toast(`Saved v${versionNo} (${w} × ${h}). It is in Approvals.${r.cost ? ` Cost $${Number(r.cost).toFixed(3)}.` : ''}`, { ms: 6000 });
    await refresh();
  }
  async function regen(g, b) { b.disabled = true; try { await generate({ graphic: g }); } catch (x) { toast(x.message, { ms: 8000 }); b.disabled = false; } }
  function editImage(g) {
    const v = latest(g);
    modal({ title: `Edit ${g.title || g.format}`, sub: 'Describe the change. The current version is kept; the edit becomes a new version.',
      body: `<div class="field"><label>Change</label><textarea class="textarea" id="ei" placeholder="Example: make the background darker and the headline larger"></textarea></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${icon('sparkle')} Make new version</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async (ev) => { const __b = ev.currentTarget;  const ins = ov.querySelector('#ei').value.trim(); if (!ins) return; __b.disabled = true; __b.textContent = 'Working...';
        try { await generate({ graphic: g, base_path: v?.storage_path, instruction: ins }); close(); } catch (x) { toast(x.message, { ms: 8000 }); __b.disabled = false; } }; } });
  }
  async function history(g) {
    const vs = versions.filter((v) => v.graphic_id === g.id);
    const imgs = await Promise.all(vs.map((v) => signed(v.storage_path)));
    modal({ title: `${g.title || g.format} versions`, wide: true, body: `<div class="grid g3">${vs.map((v, i) => `<div><img src="${esc(imgs[i])}" alt="v${v.version_no}" style="width:100%;border-radius:8px;aspect-ratio:${g.width}/${g.height};object-fit:cover"><div class="row between xs" style="margin-top:4px"><b>v${v.version_no}</b><span class="chip ${v.status === 'approved' ? 'ok' : 'warn'}">${v.status === 'approved' ? 'approved' : 'in Approvals'}</span><a href="${esc(imgs[i])}" download="${esc((g.title || g.format) + '-v' + v.version_no)}.png" target="_blank" rel="noopener">${icon('download')}</a></div></div>`).join('')}</div>` });
  }

  async function downloadAll() {
    if (!graphics.length) return toast('Nothing to download yet');
    toast('Preparing zip...');
    try {
      const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
      const zip = new JSZip();
      for (const g of graphics) { const v = latest(g); if (!v) continue; const r = await fetch(await signed(v.storage_path)); zip.file(`${(g.title || g.format).replace(/[^\w\-]+/g, '_')}-${g.width}x${g.height}-v${v.version_no}.png`, await r.blob()); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(await zip.generateAsync({ type: 'blob' })); a.download = 'founders-os-graphics.zip'; a.click();
    } catch (e) { toast('Download failed: ' + e.message); }
  }

  async function boardPane(pane) {
    const photos = await Promise.all((board.photo_paths || []).map(signed));
    const logo = board.logo_path ? await signed(board.logo_path) : '';
    pane.innerHTML = `<div class="grid g2">
      <div class="card"><div class="card-head"><h3>Palettes</h3><button class="btn btn-sm" id="addpal">${icon('plus')}</button></div>
        ${(board.palettes || []).map((p, i) => `<div style="margin-bottom:14px"><div class="row between"><input class="input" data-pn="${i}" value="${esc(p.name)}" style="max-width:180px"><button class="btn btn-sm btn-ghost" data-rmpal="${i}">${icon('trash')}</button></div>
          <div class="row wrap" style="margin-top:8px">${p.colors.map((c, j) => `<label style="text-align:center"><input type="color" value="${esc(c)}" data-pc="${i}:${j}" style="width:44px;height:44px;border:1px solid var(--border);border-radius:10px;padding:0;background:none"><div class="xs mono muted">${esc(c)}</div></label>`).join('')}</div></div>`).join('')}</div>
      <div class="card"><div class="card-head"><h3>Font pairs</h3><button class="btn btn-sm" id="addfont">${icon('plus')}</button></div>
        ${(board.fonts || []).map((f, i) => `<div style="margin-bottom:14px"><div class="grid g2"><div class="field"><label>Headings</label><input class="input" data-fh="${i}" value="${esc(f.heading)}"></div><div class="field"><label>Body</label><input class="input" data-fb="${i}" value="${esc(f.body)}"></div></div>
          <div style="font-family:'${esc(f.heading)}';font-size:20px;font-weight:600;margin-top:6px">${esc(f.heading)}</div><div class="small" style="font-family:'${esc(f.body)}'">${esc(f.body)}: the quick follow-up books the call.</div>${f.file ? `<div class="xs muted">Uploaded font: ${esc(f.file.split('-').slice(-1)[0])}</div>` : ''}</div>`).join('')}
        <label class="btn btn-sm">${icon('upload')} Upload font<input type="file" id="fontf" accept=".ttf,.otf,.woff,.woff2" hidden></label></div>
      <div class="card"><h3 style="margin-bottom:12px">Logo</h3><div class="row">${logo ? `<img src="${esc(logo)}" alt="Logo" style="height:64px;border-radius:12px;background:var(--surface-2);padding:6px">` : '<div class="brand-mark" style="width:64px;height:64px;border-radius:16px"><span style="width:22px;height:22px"></span></div>'}
        <label class="btn btn-sm">${icon('upload')} Upload logo<input type="file" id="logof" accept="image/*" hidden></label></div></div>
      <div class="card"><div class="card-head"><h3>Photos</h3><span class="xs muted">${photos.length} of 20</span></div>
        <div class="grid" style="grid-template-columns:repeat(5,1fr);gap:8px">${photos.map((u, i) => `<div style="position:relative"><img src="${esc(u)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px"><button class="star" data-rmph="${i}" style="position:absolute;top:2px;right:2px;background:var(--surface);border-radius:50%">${icon('x')}</button></div>`).join('')}
        ${photos.length < 20 ? `<label class="photo-slot" style="cursor:pointer">+<input type="file" id="photof" accept="image/*" multiple hidden></label>` : ''}</div></div>
    </div><div class="row" style="margin-top:14px"><button class="btn btn-primary" id="bsave">${t('c.save')} brand board</button></div>`;
    const collect = () => {
      board.palettes = board.palettes.map((p, i) => ({ name: pane.querySelector(`[data-pn="${i}"]`).value, colors: p.colors.map((_, j) => pane.querySelector(`[data-pc="${i}:${j}"]`).value.toUpperCase()) }));
      board.fonts = board.fonts.map((f, i) => ({ ...f, heading: pane.querySelector(`[data-fh="${i}"]`).value, body: pane.querySelector(`[data-fb="${i}"]`).value }));
    };
    const save = async (msg = 'Brand board saved') => {
      const row = { palettes: board.palettes, fonts: board.fonts, logo_path: board.logo_path || null, photo_paths: board.photo_paths || [] };
      try {
        if (board._new) { await q(live.sb.from('brand_board').insert({ owner_id: live.ownerId, ...row })); }
        else { const { data, error } = await live.sb.from('brand_board').update({ ...row, version: board.version + 1 }).eq('owner_id', live.ownerId).eq('version', board.version).select().maybeSingle(); if (error || !data) throw new Error(error?.message || 'Changed elsewhere. Reload and try again.'); }
        toast(msg); await refresh();
      } catch (e) { toast(e.message); }
    };
    $('#bsave', pane).onclick = () => { collect(); save(); };
    $('#addpal', pane).onclick = () => { collect(); board.palettes.push({ name: 'New palette', colors: ['#111111', '#FFFFFF', '#C8F36B', '#888888'] }); boardPane(pane); };
    $('#addfont', pane).onclick = () => { collect(); board.fonts.push({ heading: 'Manrope', body: 'Inter' }); boardPane(pane); };
    pane.querySelectorAll('[data-rmpal]').forEach((b) => b.onclick = () => { collect(); board.palettes.splice(+b.dataset.rmpal, 1); boardPane(pane); });
    pane.querySelectorAll('[data-rmph]').forEach((b) => b.onclick = () => { collect(); board.photo_paths.splice(+b.dataset.rmph, 1); save('Photo removed'); });
    $('#logof', pane).onchange = async (e) => {  collect(); try { board.logo_path = await upload(e.target.files[0], 'brand', e.target.files[0].name); save('Logo uploaded'); } catch (x) { toast(x.message); } };
    $('#fontf', pane).onchange = async (e) => {  collect(); const f = e.target.files[0]; try { const p = await upload(f, 'brand/fonts', f.name); board.fonts.push({ heading: f.name.replace(/\.[^.]+$/, ''), body: board.fonts[0]?.body || 'DM Sans', file: p }); save('Font uploaded'); } catch (x) { toast(x.message); } };
    const pf = $('#photof', pane); if (pf) pf.onchange = async (e) => {  collect(); const files = [...e.target.files].slice(0, 20 - (board.photo_paths || []).length);
      try { for (const f of files) board.photo_paths = [...(board.photo_paths || []), await upload(f, 'brand/photos', f.name)]; save(`${files.length} photo${files.length > 1 ? 's' : ''} added`); } catch (x) { toast(x.message); } };
  }

  el.innerHTML = '<div class="empty">Loading graphics...</div>';
  try { await load(); await draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load Graphics</h2><p class="mono">${esc(e.message)}</p></div>`; }
}
