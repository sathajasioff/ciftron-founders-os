import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, tabsHtml, marks, $ } from '../ui.js';
import { approvals } from '../data.js';

let view = 'pending';
let tag = '';
let type = '';

export function render(el, ctx = {}) {
  if (ctx.live) return import('./approvals-live.js').then((m) => m.render(el, ctx));
  const draw = () => {
    const inView = approvals.filter((a) => (view === 'trash' ? a.status === 'trashed' : a.status === view));
    const list = inView.filter((a) => (!tag || a.tags.includes(tag)) && (!type || a.type === type));
    const allTags = [...new Set(approvals.flatMap((a) => a.tags))];
    const types = [...new Set(approvals.map((a) => a.type))];
    const count = (s) => approvals.filter((a) => a.status === s).length;
    el.innerHTML = `
      ${head(t('appr.title'), t('appr.sub'))}
      ${tabsHtml([['pending', `${t('appr.pending')} (${count('pending')})`], ['approved', t('appr.approved')], ['passed', t('appr.passed')], ['trash', `${t('appr.trash')} (${count('trashed')})`]], view)}
      <div class="row wrap" style="margin-bottom:14px">
        <select class="select" id="ftype" style="width:auto"><option value="">All types</option>${types.map((x) => `<option ${x === type ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <div class="row wrap">${allTags.map((x) => `<button class="chip ${x === tag ? 'accent' : 'outline'}" data-tagf="${esc(x)}" style="border:0;cursor:pointer">#${esc(x)}</button>`).join('')}</div>
      </div>
      <div class="stack">
        ${list.length ? list.map(card).join('') : `<div class="empty card soft">${view === 'pending' ? 'Queue is clear. New drafts from agents land here.' : 'Nothing here.'}</div>`}
      </div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { view = b.dataset.tab; draw(); });
    $('#ftype', el).onchange = (e) => { type = e.target.value; draw(); };
    el.querySelectorAll('[data-tagf]').forEach((b) => b.onclick = () => { tag = tag === b.dataset.tagf ? '' : b.dataset.tagf; draw(); });
    el.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => act(b.dataset.id, b.dataset.act));
  };
  const act = (id, what) => {
    const a = approvals.find((x) => x.id === id);
    const prev = a.status;
    if (what === 'edit') return edit(a);
    if (what === 'approve') { a.status = 'approved'; toast(`Approved. Moved to ${a.target}.`, { undo: () => { a.status = prev; ctx.refreshNav(); draw(); } }); }
    if (what === 'pass') { a.status = 'passed'; toast('Passed. This teaches future ideas.', { undo: () => { a.status = prev; ctx.refreshNav(); draw(); } }); }
    if (what === 'trash') { a.prev = prev; a.status = 'trashed'; toast('Moved to Trash', { undo: () => { a.status = prev; ctx.refreshNav(); draw(); } }); }
    if (what === 'restore') { a.status = a.prev || 'pending'; toast('Restored'); }
    ctx.refreshNav(); draw();
  };
  const edit = (a) => modal({
    title: 'Edit draft', sub: esc(a.title), wide: true,
    body: `<textarea class="textarea" id="ebody" style="min-height:260px">${esc(a.body)}</textarea><p class="xs muted" style="margin-top:6px">Your edits are saved as version 2 and become a learning signal. AI will not overwrite them.</p>`,
    foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
    onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = () => { a.body = ov.querySelector('#ebody').value; a.edited = true; close(); toast('Saved your edit'); draw(); }; },
  });
  draw();
}

function card(a) {
  const tr = a.status === 'trashed';
  return `<div class="card">
    <div class="row between top"><div class="grow"><div class="row wrap" style="margin-bottom:4px"><span class="chip">${esc(a.type)}</span><span class="chip outline">→ ${esc(a.target)}</span>${a.lang === 'FR-QC' ? '<span class="chip info">FR-QC</span>' : ''}${a.edited ? '<span class="chip accent">Edited by you</span>' : ''}</div>
      <h3>${esc(a.title)}</h3><div class="xs muted">${esc(a.agent)} · ${esc(a.age)} · ${a.tags.map((x) => '#' + esc(x)).join(' ')}</div></div></div>
    <div class="preview-box small" style="margin-top:12px;max-height:150px">${marks(a.body)}</div>
    <div class="row wrap" style="margin-top:12px">
      ${tr ? `<button class="btn btn-sm" data-act="restore" data-id="${a.id}">${t('c.restore')}</button>` : `
      ${a.status !== 'approved' ? `<button class="btn btn-sm btn-primary" data-act="approve" data-id="${a.id}">${icon('check')} ${t('c.approve')}</button>` : ''}
      <button class="btn btn-sm" data-act="edit" data-id="${a.id}">${icon('edit')} ${t('c.edit')}</button>
      ${a.status === 'pending' ? `<button class="btn btn-sm" data-act="pass" data-id="${a.id}">${t('c.pass')}</button>` : ''}
      <button class="btn btn-sm btn-ghost" data-act="trash" data-id="${a.id}" style="margin-left:auto">${icon('trash')} ${t('c.trash')}</button>`}
    </div></div>`;
}
