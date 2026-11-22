// Programs backed by Supabase: course boards with modules, lessons, notes and files. AI proposals go through Approvals.
import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, $ } from '../ui.js';
import { live, api, q, versionedUpdate } from '../live.js';
import { hlWrite } from '../hl-ui.js';

const ui = { sel: null };

export async function render(el, ctx) {
  let programs = [], modules = [], lessons = [];
  const load = async () => {
    programs = await q(live.sb.from('programs').select('*').order('created_at', { ascending: false }));
    if (!programs.find((p) => p.id === ui.sel)) ui.sel = programs[0]?.id || null;
    modules = ui.sel ? await q(live.sb.from('program_modules').select('*').eq('program_id', ui.sel).order('sort')) : [];
    lessons = modules.length ? await q(live.sb.from('program_lessons').select('*').in('module_id', modules.map((m) => m.id)).order('sort')) : [];
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
    el.querySelectorAll('[data-addl]').forEach((b) => b.onclick = async () => { const n = lessons.filter((l) => l.module_id === b.dataset.addl).length; await q(live.sb.from('program_lessons').insert({ owner_id: live.user.id, module_id: b.dataset.addl, title: 'New lesson', sort: n })).catch((e) => toast(e.message)); refresh(); });
    el.querySelectorAll('[data-rmm]').forEach((b) => b.onclick = async () => { await q(live.sb.from('program_modules').delete().eq('id', b.dataset.rmm)).catch((e) => toast(e.message)); refresh(); });
    $('#addm', el).onclick = async () => { await q(live.sb.from('program_modules').insert({ owner_id: live.user.id, program_id: p.id, title: `Module ${modules.length + 1}`, sort: modules.length })).catch((e) => toast(e.message)); refresh(); };
    el.querySelectorAll('[data-lesson]').forEach((c) => c.onclick = () => editLesson(lessons.find((l) => l.id === c.dataset.lesson)));
    $('#send', el).onclick = () => hlWrite('course', { program: asProgram(p) }, { onDone: () => upd({ stage: p.stage === 'idea' ? 'draft' : p.stage }) });
  };

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
            if (f) { const path = `${live.user.id}/programs/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, '_').slice(-80)}`; const { error } = await live.sb.storage.from('brain').upload(path, f); if (error) throw new Error(error.message); patch.file_paths = [...(l.file_paths || []), path]; }
            await q(live.sb.from('program_lessons').update(patch).eq('id', l.id)); close(); refresh();
          } catch (e) { toast(e.message); }
        };
      } });
  }

  function newProgram() {
    modal({ title: 'New program', body: `<div class="stack"><div class="field"><label>Name</label><input class="input" id="pn"></div><div class="field"><label>Description</label><textarea class="textarea" id="pd"></textarea></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>Create</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => { const name = ov.querySelector('#pn').value.trim(); if (!name) return;
        try { const [r] = await q(live.sb.from('programs').insert({ owner_id: live.user.id, name, description: ov.querySelector('#pd').value.trim() || null }).select('id')); close(); ui.sel = r.id; refresh(); } catch (e) { toast(e.message); } }; } });
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
