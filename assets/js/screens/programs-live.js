// Programs backed by Supabase: course boards with modules, lessons, notes and files. AI proposals go through Approvals.
import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, $ } from '../ui.js';
import { live, api, q, versionedUpdate } from '../live.js';
import { hlWrite } from '../hl-ui.js';
import { slideCss, slideHtml, deckPrintHtml } from '../slides-render.js';

const ui = { sel: null };

export async function render(el, ctx) {
  let programs = [], modules = [], lessons = [], decks = [];
  const load = async () => {
    programs = await q(live.sb.from('programs').select('*').order('created_at', { ascending: false }));
    if (!programs.find((p) => p.id === ui.sel)) ui.sel = programs[0]?.id || null;
    modules = ui.sel ? await q(live.sb.from('program_modules').select('*').eq('program_id', ui.sel).order('sort')) : [];
    lessons = modules.length ? await q(live.sb.from('program_lessons').select('*').in('module_id', modules.map((m) => m.id)).order('sort')) : [];
    decks = ui.sel ? await q(live.sb.from('program_decks').select('*').eq('program_id', ui.sel).order('created_at', { ascending: false })).catch(() => []) : [];
  };
  const refresh = async () => { await load(); draw(); };
  const asProgram = (p) => ({ name: p.name, description: p.description || '', modules: modules.map((m) => ({ title: m.title, lessons: lessons.filter((l) => l.module_id === m.id).map((l) => ({ title: l.title, summary: l.body || '' })) })) });

  const draw = () => {
    const p = programs.find((x) => x.id === ui.sel);
    el.innerHTML = `
      ${head(t('programs.title'), t('programs.sub'), `<button class="btn" id="propose">${icon('sparkle')} AI: propose a program</button><button class="btn btn-primary" id="newp">${icon('plus')} New program</button>`)}
      <div class="split-l">
        <div class="list">${programs.map((x) => `<div class="list-item clickable ${x.id === ui.sel ? 'selected' : ''}" data-p="${x.id}"><div class="grow"><b class="small">${esc(x.name)}</b><div class="xs muted">${esc(x.stage)}</div></div></div>`).join('') || '<div class="empty small">No programs yet</div>'}</div>
        <div class="stack">${p ? `
          <div class="card row between wrap"><div><h2>${esc(p.name)}</h2><div class="small muted">${esc(p.description || '')}</div></div>
            <div class="row"><select class="select" id="pstage" style="width:auto">${['idea', 'draft', 'building', 'live'].map((s) => `<option ${s === p.stage ? 'selected' : ''}>${s}</option>`).join('')}</select><button class="btn btn-primary hl-btn" id="send" ${modules.length ? '' : 'disabled'}>${t('programs.sendHL')}</button></div></div>
          <div class="kanban">${modules.map((m) => `<div class="kcol"><div class="kcol-head"><input class="input" data-mt="${m.id}" value="${esc(m.title)}" style="font-weight:600;padding:4px 8px"></div>
            ${lessons.filter((l) => l.module_id === m.id).map((l) => `<div class="kcard" data-lesson="${l.id}"><div class="t">${esc(l.title)}</div><div class="xs muted">${l.body ? esc(l.body.slice(0, 80)) : 'No notes yet'}${l.file_paths?.length ? ` · ${l.file_paths.length} file${l.file_paths.length > 1 ? 's' : ''}` : ''}</div></div>`).join('')}
            <button class="btn btn-sm btn-ghost" data-addl="${m.id}" style="width:100%">${icon('plus')} Lesson</button><button class="btn btn-sm btn-ghost" data-rmm="${m.id}" style="width:100%;color:var(--faint)">${icon('trash')} Module</button></div>`).join('')}
            <div class="kcol" style="background:transparent;border-style:dashed"><button class="btn btn-ghost" id="addm" style="width:100%">${icon('plus')} Module</button></div></div>
          <div class="card"><div class="row between wrap"><div><div class="eyebrow">Slides</div><div class="xs muted">Teaching slides written from your lessons, in your brand colors. Download as PowerPoint or save as PDF.</div></div><button class="btn btn-sm btn-primary" id="mkslides" ${lessons.length ? '' : 'disabled title="Add lessons first"'}>${icon('sparkle')} Make slides</button></div>
            <div class="list" style="margin-top:10px">${decks.map((d) => `<div class="list-item wrap"><div class="grow"><b class="small">${esc(d.title)}</b><div class="xs muted">${d.slides.length} slides · ${d.module_id ? esc(modules.find((m) => m.id === d.module_id)?.title || 'one module') : 'whole program'} · ${esc(d.style)}${d.authored_by === 'me' ? ' · edited by you' : ''}</div></div>
              <span class="chip ${d.status === 'approved' ? 'ok' : 'warn'}">${d.status === 'approved' ? 'approved' : 'in Approvals'}</span>
              <button class="btn btn-sm" data-deck="${d.id}">Open</button><button class="btn btn-sm" data-pptx="${d.id}">PowerPoint</button><button class="btn btn-sm" data-pdf="${d.id}">PDF</button><button class="btn btn-sm btn-ghost" data-ddel="${d.id}">${icon('trash')}</button></div>`).join('') || '<div class="empty small">No slide decks yet</div>'}</div></div>
          <div class="card"><div class="eyebrow" style="margin-bottom:6px">Private notes</div><textarea class="textarea" id="pnotes">${esc(p.private_notes || '')}</textarea><div class="row" style="margin-top:8px"><button class="btn btn-sm" id="psave">${t('c.save')}</button><button class="btn btn-sm btn-ghost" id="pdel" style="margin-left:auto">${icon('trash')} Delete program</button></div></div>` :
          '<div class="empty card soft">Create a program, or ask AI to propose one. Proposals go to Approvals; approving one builds the board.</div>'}</div>
      </div>`;
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = async () => { ui.sel = b.dataset.p; refresh(); });
    $('#propose', el).onclick = propose;
    $('#newp', el).onclick = newProgram;
    if (!p) return;
    const upd = async (patch) => { const r = await versionedUpdate('programs', p, patch); if (r.conflict) toast('Changed elsewhere. Reloaded.'); refresh(); };
    $('#pstage', el).onchange = (e) => upd({ stage: e.target.value });
    $('#psave', el).onclick = () => upd({ private_notes: $('#pnotes', el).value }).then(() => toast('Notes saved'));
    $('#pdel', el).onclick = () => modal({ title: 'Delete program', body: `<p class="small">Deletes "${esc(p.name)}" with its modules and lessons. Anything already sent to HighLevel stays there.</p>`, foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-danger solid" data-ok>Delete</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => { await q(live.sb.from('programs').delete().eq('id', p.id)).catch((e) => toast(e.message)); close(); ui.sel = null; refresh(); }; } });
    el.querySelectorAll('[data-mt]').forEach((i) => i.onchange = async () => { await q(live.sb.from('program_modules').update({ title: i.value.trim() || 'Module' }).eq('id', i.dataset.mt)).catch((e) => toast(e.message)); });
    el.querySelectorAll('[data-addl]').forEach((b) => b.onclick = async () => { const n = lessons.filter((l) => l.module_id === b.dataset.addl).length; await q(live.sb.from('program_lessons').insert({ owner_id: live.ownerId, module_id: b.dataset.addl, title: 'New lesson', sort: n })).catch((e) => toast(e.message)); refresh(); });
    el.querySelectorAll('[data-rmm]').forEach((b) => b.onclick = async () => { await q(live.sb.from('program_modules').delete().eq('id', b.dataset.rmm)).catch((e) => toast(e.message)); refresh(); });
    $('#addm', el).onclick = async () => { await q(live.sb.from('program_modules').insert({ owner_id: live.ownerId, program_id: p.id, title: `Module ${modules.length + 1}`, sort: modules.length })).catch((e) => toast(e.message)); refresh(); };
    el.querySelectorAll('[data-lesson]').forEach((c) => c.onclick = () => editLesson(lessons.find((l) => l.id === c.dataset.lesson)));
    $('#mkslides', el).onclick = () => makeSlides(p);
    el.querySelectorAll('[data-deck]').forEach((b) => b.onclick = () => openDeck(decks.find((d) => d.id === b.dataset.deck)));
    el.querySelectorAll('[data-pptx]').forEach((b) => b.onclick = () => downloadPptx(b, b.dataset.pptx));
    el.querySelectorAll('[data-pdf]').forEach((b) => b.onclick = () => savePdf(decks.find((d) => d.id === b.dataset.pdf)));
    el.querySelectorAll('[data-ddel]').forEach((b) => b.onclick = () => modal({ title: 'Delete slides', body: '<p class="small">Deletes this deck. Your lessons stay.</p>', foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-danger solid" data-ok>Delete</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => { await q(live.sb.from('program_decks').delete().eq('id', b.dataset.ddel)).catch((e) => toast(e.message)); close(); refresh(); }; } }));
    $('#send', el).onclick = () => hlWrite('course', { program: asProgram(p) }, { onDone: () => upd({ stage: p.stage === 'idea' ? 'draft' : p.stage }) });
  };

  const themes = {};
  const themeFor = async (style) => (themes[style] ||= (await api('studio', { body: { action: 'theme', style } })).theme);

  function makeSlides(p) {
    modal({ title: 'Make slides', body: `<div class="stack">
      <div class="field"><label>From</label><select class="select" id="sm"><option value="">Whole program</option>${modules.map((m) => `<option value="${m.id}">${esc(m.title)}</option>`).join('')}</select></div>
      <div class="grid g2"><div class="field"><label>Style</label><select class="select" id="ss"><option value="brand">My brand colors</option><option value="dark">Dark</option><option value="light">Light</option></select></div>
      <div class="field"><label>${t('c.language')}</label><select class="select" id="sl"><option value="en">English</option><option value="fr-qc">Quebec French</option></select></div></div>
      <div class="field"><label>Slides per lesson</label><select class="select" id="sp"><option>2</option><option selected>3</option><option>4</option></select></div>
      <p class="xs muted">Written only from your lesson notes. Where a real example belongs, the slide says [EXAMPLE NEEDED]. The deck goes to Approvals.</p></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${icon('sparkle')} Make slides</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async (ev) => { const b = ev.currentTarget; b.disabled = true; b.textContent = 'Writing slides... about 30 seconds';
        try { const r = await api('studio', { body: { action: 'slides_build', program_id: p.id, module_id: ov.querySelector('#sm').value || null, style: ov.querySelector('#ss').value, language: ov.querySelector('#sl').value, per_lesson: +ov.querySelector('#sp').value } });
          close(); ctx.refreshNav(); toast(`${r.slides} slides made. They are in Approvals.`); refresh(); }
        catch (e) { toast(e.message, { ms: 7000 }); b.disabled = false; b.textContent = 'Make slides'; } }; } });
  }

  async function openDeck(d) {
    let theme; try { theme = await themeFor(d.style); } catch (e) { return toast(e.message); }
    let i = 0;
    modal({ title: d.title, wide: true, body: `<style>${slideCss(theme)}</style><div id="dv"></div>
      <div class="row between" style="margin-top:10px"><button class="btn btn-sm" id="dprev">Previous</button><span class="xs muted" id="dpos"></span><button class="btn btn-sm" id="dnext">Next</button></div>
      <div class="divider"></div><div class="stack" id="dedit"></div>`,
      foot: `<button class="btn" data-close>${t('c.close')}</button><button class="btn btn-primary" id="dsave">${t('c.save')}</button>`,
      onMount: (ov, close) => {
        const fields = (s) => `<div class="grid g2"><div class="field"><label>Title</label><input class="input" data-k="title" value="${esc(s.title)}"></div><div class="field"><label>${s.layout === 'cta' ? 'Button label' : 'Subtitle'}</label><input class="input" data-k="subtitle" value="${esc(s.subtitle)}"></div></div>
          ${['bullets', 'steps'].includes(s.layout) || s.bullets.length ? `<div class="field"><label>Bullets (one per line)</label><textarea class="textarea" data-k="bullets">${esc(s.bullets.join('\n'))}</textarea></div>` : ''}
          ${s.layout === 'two_column' ? `<div class="grid g2"><div class="field"><label>Left</label><textarea class="textarea" data-k="left">${esc(s.left.join('\n'))}</textarea></div><div class="field"><label>Right</label><textarea class="textarea" data-k="right">${esc(s.right.join('\n'))}</textarea></div></div>` : ''}
          ${s.layout === 'quote' ? `<div class="field"><label>Quote (your own words)</label><textarea class="textarea" data-k="quote">${esc(s.quote)}</textarea></div>` : ''}
          <div class="field"><label>Speaker notes</label><textarea class="textarea" data-k="notes">${esc(s.notes)}</textarea></div>`;
        const slides = d.slides.map((s) => ({ ...s }));
        const read = () => ov.querySelectorAll('#dedit [data-k]').forEach((x) => { slides[i][x.dataset.k] = ['bullets', 'left', 'right'].includes(x.dataset.k) ? x.value.split('\n').map((v) => v.trim()).filter(Boolean) : x.value; });
        const show = () => { ov.querySelector('#dv').innerHTML = slideHtml(slides[i]); ov.querySelector('#dpos').textContent = `${i + 1} of ${slides.length} · ${slides[i].layout.replace('_', ' ')}`; ov.querySelector('#dedit').innerHTML = fields(slides[i]);
          ov.querySelectorAll('#dedit [data-k]').forEach((x) => x.oninput = () => { read(); ov.querySelector('#dv').innerHTML = slideHtml(slides[i]); }); };
        ov.querySelector('#dprev').onclick = () => { read(); i = Math.max(0, i - 1); show(); };
        ov.querySelector('#dnext').onclick = () => { read(); i = Math.min(slides.length - 1, i + 1); show(); };
        ov.querySelector('#dsave').onclick = async () => { read();
          try { const r = await versionedUpdate('program_decks', d, { slides, authored_by: 'me' }); if (r.conflict) return toast('This deck changed somewhere else. Close and open it again.'); Object.assign(d, r.row); toast('Slides saved'); close(); refresh(); } catch (e) { toast(e.message); } };
        show();
      } });
  }

  async function downloadPptx(btn, id) {
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'Building...';
    try {
      const r = await api('studio', { body: { action: 'slides_pptx', deck_id: id } });
      const bytes = Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })); a.download = r.filename; a.click();
    } catch (e) { toast(e.message, { ms: 7000 }); }
    btn.disabled = false; btn.textContent = label;
  }

  async function savePdf(d) {
    let theme; try { theme = await themeFor(d.style); } catch (e) { return toast(e.message); }
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    fr.srcdoc = deckPrintHtml(d, theme);
    fr.onload = () => { setTimeout(() => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('Could not open print: ' + e.message); } setTimeout(() => fr.remove(), 60000); }, 600); };
    document.body.appendChild(fr);
    toast('In the print window, choose "Save as PDF".', { ms: 6000 });
  }

  function editLesson(l) {
    modal({ title: 'Lesson', wide: true, body: `<div class="stack"><div class="field"><label>Title</label><input class="input" id="lt" value="${esc(l.title)}"></div>
      <div class="field"><label>Notes and script</label><textarea class="textarea" id="lb" style="min-height:220px">${esc(l.body || '')}</textarea></div>
      <div class="field"><label>Files</label><div class="small">${(l.file_paths || []).map((f) => esc(f.split('-').slice(-1)[0])).join(', ') || 'None'}</div><input type="file" id="lf" class="input" style="margin-top:6px"></div></div>`,
      foot: `<button class="btn btn-ghost" id="ldel">${icon('trash')}</button><button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => {
        ov.querySelector('#ldel').onclick = async () => { await q(live.sb.from('program_lessons').delete().eq('id', l.id)).catch((e) => toast(e.message)); close(); refresh(); };
        ov.querySelector('[data-ok]').onclick = async () => {
          const patch = { title: ov.querySelector('#lt').value.trim() || 'Lesson', body: ov.querySelector('#lb').value };
          const f = ov.querySelector('#lf').files[0];
          try {
            if (f) { const path = `${live.ownerId}/programs/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, '_').slice(-80)}`; const { error } = await live.sb.storage.from('brain').upload(path, f); if (error) throw new Error(error.message); patch.file_paths = [...(l.file_paths || []), path]; }
            await q(live.sb.from('program_lessons').update(patch).eq('id', l.id)); close(); refresh();
          } catch (e) { toast(e.message); }
        };
      } });
  }

  function newProgram() {
    modal({ title: 'New program', body: `<div class="stack"><div class="field"><label>Name</label><input class="input" id="pn"></div><div class="field"><label>Description</label><textarea class="textarea" id="pd"></textarea></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>Create</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => { const name = ov.querySelector('#pn').value.trim(); if (!name) return;
        try { const [r] = await q(live.sb.from('programs').insert({ owner_id: live.ownerId, name, description: ov.querySelector('#pd').value.trim() || null }).select('id')); close(); ui.sel = r.id; refresh(); } catch (e) { toast(e.message); } }; } });
  }

  function propose() {
    modal({ title: 'Propose a program', body: `<div class="field"><label>What should it teach?</label><textarea class="textarea" id="pt" placeholder="Example: help mortgage brokers set up a 10-minute lead response system in HighLevel"></textarea></div><p class="xs muted" style="margin-top:8px">The proposal goes to Approvals. The board is only created when you approve it.</p>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${icon('sparkle')} Propose</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async (ev) => { const __b = ev.currentTarget;  const topic = ov.querySelector('#pt').value.trim(); if (!topic) return; __b.disabled = true; __b.textContent = 'Writing...';
        try { await api('studio', { body: { action: 'program_propose', topic } }); close(); ctx.refreshNav(); toast('Proposal sent to Approvals'); } catch (e) { toast(e.message, { ms: 7000 }); __b.disabled = false; } }; } });
  }

  el.innerHTML = '<div class="empty">Loading programs...</div>';
  try { await load(); draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load Programs</h2><p class="mono">${esc(e.message)}</p></div>`; }
}
