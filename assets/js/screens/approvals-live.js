// Approvals backed by Supabase: the single queue for every AI idea and draft.
import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, tabsHtml, marks, $ } from '../ui.js';
import { live, q, versionedUpdate } from '../live.js';

const ui = { view: 'pending', tag: '', type: '', lang: '' };
const FORMAT = { Hooks: 'Short video', 'Video script': 'Short video', Carousel: 'Carousel', 'Written post': 'Written post', Caption: 'Written post', 'Ad copy': 'Meta Ad copy', Email: 'Email', 'Email sequence': 'Email', 'Content plan': 'Content plan', Idea: 'Idea', Brief: 'Idea' };
const MODULE = { content: 'Content', emails: 'Emails', funnels: 'Funnels', graphics: 'Graphics', programs: 'Programs', goals: 'Goals' };
const ago = (d) => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };

export async function render(el, ctx) {
  let items = [];
  const load = async () => { items = await q(live.sb.from('approvals').select('*').order('created_at', { ascending: false }).limit(300)); };

  const draw = () => {
    const inView = items.filter((a) => (ui.view === 'trash' ? a.trashed_at : !a.trashed_at && a.status === ui.view));
    const list = inView.filter((a) => (!ui.tag || a.tags.includes(ui.tag)) && (!ui.type || a.type === ui.type) && (!ui.lang || a.language === ui.lang));
    const tags = [...new Set(items.flatMap((a) => a.tags))].slice(0, 20);
    const types = [...new Set(items.map((a) => a.type))];
    const count = (s) => items.filter((a) => (s === 'trash' ? a.trashed_at : !a.trashed_at && a.status === s)).length;
    el.innerHTML = `
      ${head(t('appr.title'), t('appr.sub'))}
      ${tabsHtml([['pending', `${t('appr.pending')} (${count('pending')})`], ['approved', `${t('appr.approved')} (${count('approved')})`], ['passed', `${t('appr.passed')} (${count('passed')})`], ['trash', `${t('appr.trash')} (${count('trash')})`]], ui.view)}
      <div class="row wrap" style="margin-bottom:14px">
        <select class="select" id="ftype" style="width:auto"><option value="">All types</option>${types.map((x) => `<option ${x === ui.type ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <select class="select" id="flang" style="width:auto"><option value="">All languages</option><option value="en" ${ui.lang === 'en' ? 'selected' : ''}>English</option><option value="fr-qc" ${ui.lang === 'fr-qc' ? 'selected' : ''}>Quebec French</option></select>
        <div class="row wrap">${tags.map((x) => `<button class="chip ${x === ui.tag ? 'accent' : 'outline'}" data-tagf="${esc(x)}" style="border:0;cursor:pointer">#${esc(x)}</button>`).join('')}</div>
      </div>
      <div class="stack">${list.length ? list.map(card).join('') : `<div class="empty card soft">${ui.view === 'pending' ? 'Queue is clear. Drafts from AI Chat and AI Team land here.' : 'Nothing here.'}</div>`}</div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { ui.view = b.dataset.tab; draw(); });
    $('#ftype', el).onchange = (e) => { ui.type = e.target.value; draw(); };
    $('#flang', el).onchange = (e) => { ui.lang = e.target.value; draw(); };
    el.querySelectorAll('[data-tagf]').forEach((b) => b.onclick = () => { ui.tag = ui.tag === b.dataset.tagf ? '' : b.dataset.tagf; draw(); });
    el.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => act(items.find((x) => x.id === b.dataset.id), b.dataset.act));
  };

  const update = async (a, patch) => {
    const r = await versionedUpdate('approvals', a, patch);
    if (r.conflict) { toast('This draft changed somewhere else. Reloaded the latest.'); await load(); draw(); return null; }
    Object.assign(a, r.row);
    return r.row;
  };

  async function act(a, what) {
    try {
      if (what === 'edit') return edit(a);
      if (what === 'approve') {
        // Approving moves the item into its module. Content gets a planning card right away.
        let card = null;
        if (a.target_module === 'content') {
          const body = a.payload?.body || '';
          card = (await q(live.sb.from('content_items').insert({ owner_id: live.user.id, title: a.title, format: FORMAT[a.type] || a.type, language: a.language, stage: 'Idea', hook: body.split('\n').find((l) => l.trim())?.replace(/^\s*\d+[.)]\s*/, '').slice(0, 200) || null, notes: body, approval_id: a.id, authored_by: a.authored_by }).select('id')))[0];
        }
        if (!(await update(a, { status: 'approved' }))) return;
        toast(`Approved. Moved to ${MODULE[a.target_module] || 'its module'}${a.target_module === 'content' ? '' : ' (opens in Phase 5)'}.`, { undo: async () => {
          if (card) await q(live.sb.from('content_items').delete().eq('id', card.id));
          await update(a, { status: 'pending' }); ctx.refreshNav(); draw();
        } });
      }
      if (what === 'pass') { if (!(await update(a, { status: 'passed' }))) return; toast('Passed. This teaches future ideas.', { undo: async () => { await update(a, { status: 'pending' }); ctx.refreshNav(); draw(); } }); }
      if (what === 'trash') { if (!(await update(a, { trashed_at: new Date().toISOString() }))) return; toast('Moved to Trash', { undo: async () => { await update(a, { trashed_at: null }); ctx.refreshNav(); draw(); } }); }
      if (what === 'restore') { if (!(await update(a, { trashed_at: null }))) return; toast('Restored'); }
      ctx.refreshNav(); draw();
    } catch (e) { toast(e.message); }
  }

  function edit(a) {
    modal({ title: 'Edit draft', sub: esc(a.title), wide: true,
      body: `<div class="stack"><div class="field"><label>Title</label><input class="input" id="et" value="${esc(a.title)}"></div>
        <div class="field"><label>Draft</label><textarea class="textarea" id="eb" style="min-height:300px">${esc(a.payload?.body || '')}</textarea></div>
        <p class="xs muted">Saved as your text. AI will not overwrite it.</p></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        try {
          const r = await update(a, { title: ov.querySelector('#et').value.trim() || a.title, payload: { ...a.payload, body: ov.querySelector('#eb').value, original: a.payload?.original ?? a.payload?.body }, authored_by: 'me' });
          close(); if (r) { toast('Saved your edit'); draw(); }
        } catch (e) { toast(e.message); }
      }; } });
  }

  el.innerHTML = '<div class="empty">Loading approvals...</div>';
  try { await load(); draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load Approvals</h2><p class="mono">${esc(e.message)}</p></div>`; }
}

function card(a) {
  const tr = !!a.trashed_at;
  return `<div class="card">
    <div class="row between top"><div class="grow"><div class="row wrap" style="margin-bottom:4px"><span class="chip">${esc(a.type)}</span><span class="chip outline">→ ${esc(MODULE[a.target_module] || a.target_module || 'Content')}</span>${a.language === 'fr-qc' ? '<span class="chip info">FR-QC</span>' : ''}${a.authored_by === 'me' ? '<span class="chip accent">Edited by you</span>' : ''}</div>
      <h3>${esc(a.title)}</h3><div class="xs muted">${esc(a.source_agent || 'AI')} · ${ago(a.created_at)}${a.tags.length ? ' · ' + a.tags.map((x) => '#' + esc(x)).join(' ') : ''}</div></div></div>
    <div class="preview-box small" style="margin-top:12px;max-height:220px">${marks(a.payload?.body || '')}</div>
    <div class="row wrap" style="margin-top:12px">
      ${tr ? `<button class="btn btn-sm" data-act="restore" data-id="${a.id}">${t('c.restore')}</button>` : `
      ${a.status !== 'approved' ? `<button class="btn btn-sm btn-primary" data-act="approve" data-id="${a.id}">${icon('check')} ${t('c.approve')}</button>` : ''}
      <button class="btn btn-sm" data-act="edit" data-id="${a.id}">${icon('edit')} ${t('c.edit')}</button>
      ${a.status === 'pending' ? `<button class="btn btn-sm" data-act="pass" data-id="${a.id}">${t('c.pass')}</button>` : ''}
      <button class="btn btn-sm btn-ghost" data-act="trash" data-id="${a.id}" style="margin-left:auto">${icon('trash')} ${t('c.trash')}</button>`}
    </div></div>`;
}
