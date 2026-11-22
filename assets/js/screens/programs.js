import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, confirmWrite, $ } from '../ui.js';
import { programs, approvals } from '../data.js';

let sel = 'pr1';

export function render(el, ctx = {}) {
  if (ctx.live) return import('./programs-live.js').then((m) => m.render(el, ctx));
  const draw = () => {
    const p = programs.find((x) => x.id === sel);
    el.innerHTML = `
      ${head(t('programs.title'), t('programs.sub'), `<button class="btn" id="propose">${icon('sparkle')} AI: propose a program</button>`)}
      <div class="split-l">
        <div class="list">${programs.map((x) => `<div class="list-item clickable ${x.id === sel ? 'selected' : ''}" data-p="${x.id}"><div class="grow"><b class="small">${esc(x.name)}</b><div class="xs muted">${x.modules.length} modules · ${x.modules.reduce((n, m) => n + m.lessons.length, 0)} lessons</div></div><span class="chip">${x.stage}</span></div>`).join('')}</div>
        <div class="stack">
          <div class="card row between wrap"><div><h2>${esc(p.name)}</h2><div class="small muted">Stage: ${p.stage}</div></div><button class="btn btn-primary hl-btn" id="send">${t('programs.sendHL')}</button></div>
          <div class="kanban">${p.modules.map((m, i) => `<div class="kcol"><div class="kcol-head"><span>${esc(m.name)}</span></div>${m.lessons.map((l) => `<div class="kcard"><div class="t">${esc(l)}</div><div class="xs muted">Lesson · notes and files</div></div>`).join('')}
            <button class="btn btn-sm btn-ghost" data-addl="${i}" style="width:100%">${icon('plus')} Lesson</button></div>`).join('')}
            <div class="kcol" style="background:transparent;border-style:dashed"><button class="btn btn-ghost" id="addm" style="width:100%">${icon('plus')} Module</button></div></div>
          <div class="card"><div class="eyebrow" style="margin-bottom:6px">Private notes</div><textarea class="textarea" id="pnotes">${esc(p.notes)}</textarea><div class="row" style="margin-top:10px"><button class="btn btn-sm">${icon('upload')} Attach file</button></div></div>
        </div>
      </div>`;
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { sel = b.dataset.p; draw(); });
    $('#pnotes', el).oninput = (e) => { p.notes = e.target.value; };
    el.querySelectorAll('[data-addl]').forEach((b) => b.onclick = () => { p.modules[+b.dataset.addl].lessons.push('New lesson'); draw(); });
    $('#addm', el).onclick = () => { p.modules.push({ name: `Module ${p.modules.length + 1}: Untitled`, lessons: [] }); draw(); };
    $('#send', el).onclick = () => confirmWrite({ action: 'Draft course', target: 'HighLevel Memberships (draft, unpublished)',
      payload: { title: p.name, status: 'draft', modules: p.modules.map((m) => ({ title: m.name, lessons: m.lessons })) } });
    $('#propose', el).onclick = () => modal({ title: 'Propose a program', body: `<div class="field"><label>What should it teach?</label><textarea class="textarea" placeholder="Example: help mortgage brokers set up a 10-minute lead response system in HighLevel"></textarea></div><p class="xs muted" style="margin-top:8px">The proposal goes to Approvals. Nothing is created until you confirm it exactly.</p>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>Propose</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = () => { approvals.unshift({ id: 'a' + Date.now(), title: 'Program proposal: lead response system', type: 'Program', agent: 'Content Strategist', target: 'Programs', tags: ['program'], status: 'pending', age: 'Just now', lang: 'EN', body: 'Module 1: Why speed matters\nModule 2: The first 3 messages\nModule 3: Booking and reminders\n[DEMO: full outline in Phase 5]' }); close(); ctx.refreshNav(); toast('Proposal sent to Approvals'); }; } });
  };
  draw();
}
