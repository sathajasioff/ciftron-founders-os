// Content backed by Supabase: board, calendar, research with outliers, remix, learning panel.
import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, drawer, tabsHtml, $ } from '../ui.js';
import { live, api, q, versionedUpdate } from '../live.js';
import { hlWrite } from '../hl-ui.js';

const STAGES = ['Idea', 'Scripting', 'Filming', 'Editing', 'Scheduled', 'Uploaded'];
const FORMATS = ['Short video', 'Long video', 'Carousel', 'Written post', 'Email', 'Meta Ad copy', 'Content plan', 'Idea'];
const TASKS = ['script', 'film', 'edit', 'thumbnail', 'upload'];
const ui = { tab: 'board', month: null };
const fmt = (d) => (d ? new Date(d + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date');

export async function render(el, ctx) {
  let items = [], creators = [], posts = [], signals = [];
  const load = async () => {
    [items, creators, posts, signals] = await Promise.all([
      q(live.sb.from('content_items').select('*').order('publish_date', { ascending: true })),
      q(live.sb.from('research_creators').select('*').order('created_at')),
      q(live.sb.from('research_posts').select('*, research_creators(handle, platform, is_mine)').order('outlier_score', { ascending: false }).limit(60)),
      q(live.sb.from('learning_signals').select('*').order('updated_at', { ascending: false })),
    ]);
  };
  const refresh = async () => { await load(); draw(); };

  const draw = () => {
    el.innerHTML = `
      ${head(t('content.title'), t('content.sub'), `<button class="btn btn-primary" id="new-card">${icon('plus')} ${t('c.new')}</button>`)}
      ${tabsHtml([['board', t('content.board')], ['calendar', t('content.calendar')], ['research', t('content.research')], ['learning', t('content.learning')]], ui.tab)}
      <div id="pane"></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { ui.tab = b.dataset.tab; draw(); });
    $('#new-card', el).onclick = () => editCard(null);
    ({ board, calendar, research, learning })[ui.tab]($('#pane', el));
  };

  const cardHtml = (c) => {
    const done = TASKS.filter((k) => c.tasks?.[k]).length;
    return `<div class="kcard" draggable="true" data-card="${c.id}"><div class="t">${esc(c.title)}</div>
      <div class="row wrap xs muted" style="gap:6px"><span class="chip">${esc(c.format)}</span>${c.language === 'fr-qc' ? '<span class="chip info">FR-QC</span>' : ''}<span>${fmt(c.publish_date)}</span></div>
      ${c.hook ? `<div class="xs muted" style="margin-top:6px">"${esc(c.hook.slice(0, 120))}"</div>` : ''}
      <div class="progress accent" style="margin-top:8px"><span style="width:${done * 20}%"></span></div><div class="xs faint" style="margin-top:3px">${done}/5 tasks${c.approval_id ? ' · from Approvals' : ''}</div></div>`;
  };

  function board(pane) {
    pane.innerHTML = `<div class="kanban">${STAGES.map((s) => { const list = items.filter((c) => c.stage === s);
      return `<div class="kcol" data-col="${s}"><div class="kcol-head"><span>${s}</span><span class="chip">${list.length}</span></div>${list.map(cardHtml).join('') || '<div class="xs faint" style="padding:6px">Drop cards here</div>'}</div>`; }).join('')}</div>
      <p class="xs muted">${items.length ? 'Drag cards between columns. Approved drafts from Approvals land in Idea.' : 'Approve a content draft in Approvals or press New to add your first card.'}</p>`;
    bindCards(pane);
    let dragId = null;
    pane.querySelectorAll('[data-card]').forEach((c) => c.ondragstart = () => { dragId = c.dataset.card; });
    pane.querySelectorAll('[data-col]').forEach((col) => {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add('drop'); };
      col.ondragleave = () => col.classList.remove('drop');
      col.ondrop = async () => { col.classList.remove('drop'); const c = items.find((x) => x.id === dragId); if (!c || c.stage === col.dataset.col) return;
        const patch = { stage: col.dataset.col, ...(col.dataset.col === 'Uploaded' ? { tasks: { ...c.tasks, upload: true } } : {}) };
        const r = await versionedUpdate('content_items', c, patch).catch((e) => toast(e.message)); if (r?.conflict) toast('Changed elsewhere. Reloaded.'); refresh(); };
    });
  }

  function calendar(pane) {
    const base = ui.month ? new Date(ui.month) : new Date(); base.setDate(1); base.setHours(12);
    const lead = base.getDay(), days = [];
    for (let i = 0; i < 42; i++) { const d = new Date(base); d.setDate(1 - lead + i); days.push(d); }
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const undated = items.filter((c) => !c.publish_date);
    pane.innerHTML = `<div class="row between" style="margin-bottom:10px"><div class="row"><button class="btn btn-sm btn-ghost" id="prevm">‹</button><h3>${base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3><button class="btn btn-sm btn-ghost" id="nextm">›</button></div>
      ${undated.length ? `<span class="xs muted">${undated.length} card${undated.length > 1 ? 's' : ''} without a date</span>` : ''}</div>
      <div class="cal">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="dow">${d}</div>`).join('')}
      ${days.map((d) => { const evs = items.filter((c) => c.publish_date === iso(d));
        return `<div class="day ${d.getMonth() !== base.getMonth() ? 'out' : ''}" data-day="${iso(d)}"><div>${d.getDate()}</div>${evs.map((c) => `<span class="ev ${c.format === 'Short video' ? 'reel' : ''}" data-card="${c.id}" title="${esc(c.title)}">${esc(c.title)}</span>`).join('')}</div>`; }).join('')}</div>
      <p class="xs muted" style="margin-top:6px">Click a day to add a card on that date.</p>`;
    $('#prevm', pane).onclick = () => { base.setMonth(base.getMonth() - 1); ui.month = base.toISOString(); draw(); };
    $('#nextm', pane).onclick = () => { base.setMonth(base.getMonth() + 1); ui.month = base.toISOString(); draw(); };
    pane.querySelectorAll('[data-day]').forEach((d) => d.addEventListener('click', (e) => { if (!e.target.closest('[data-card]')) editCard(null, d.dataset.day); }));
    bindCards(pane);
  }

  function research(pane) {
    pane.innerHTML = `<div class="notice neutral small" style="margin-bottom:14px">${icon('info')}<span>Public data only: Instagram through Apify, YouTube through the YouTube API. Outlier score is a post's views divided by that creator's median.</span></div>
      <div class="split"><div><h3 style="margin-bottom:10px">Outlier posts</h3>
      ${posts.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Post</th><th>Creator</th><th style="text-align:right">Views</th><th>Outlier</th><th></th></tr></thead><tbody>
      ${posts.map((p, i) => `<tr><td><div style="font-weight:600">${esc((p.title || '(no caption)').slice(0, 90))}</div><div class="xs muted">${esc(p.format || '')}${p.posted_at ? ' · ' + new Date(p.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">open</a>` : ''}</div></td>
        <td class="small">${esc(p.research_creators?.handle || '')}</td><td class="small" style="text-align:right">${(p.views || 0).toLocaleString()}</td>
        <td><span class="chip ${p.outlier_score >= 5 ? 'accent' : p.outlier_score >= 2 ? 'ok' : ''}">${p.outlier_score ?? '·'}×</span></td><td><button class="btn btn-sm" data-remix="${i}">${t('content.remix')}</button></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty card soft">Add a creator and press Fetch to find outlier posts.</div>'}</div>
      <div class="card"><div class="card-head"><h3>Tracked channels</h3><button class="btn btn-sm" id="addcr">${icon('plus')}</button></div>
      ${creators.map((c) => `<div class="row top" style="margin-bottom:12px"><div class="grow small"><div style="font-weight:600">${esc(c.handle)} ${c.is_mine ? '<span class="chip accent">You</span>' : ''}</div>
        <div class="xs muted">${c.platform}${c.median_views ? ` · median ${c.median_views.toLocaleString()} views` : ''}${c.last_fetched_at ? ` · ${new Date(c.last_fetched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</div>
        ${c.fetch_error ? `<div class="xs down">${esc(c.fetch_error)}</div>` : ''}</div>
        <button class="btn btn-sm" data-fetch="${c.id}">Fetch</button><button class="btn btn-sm btn-ghost" data-rmcr="${c.id}">${icon('trash')}</button></div>`).join('') || '<p class="small muted">No channels yet.</p>'}
      <div class="divider"></div><button class="btn btn-sm" id="rmx-free">${icon('sparkle')} Remix my own idea</button></div></div>`;
    pane.querySelectorAll('[data-remix]').forEach((b) => b.onclick = () => { const p = posts[+b.dataset.remix]; remix({ title: p.title, creator: p.research_creators?.handle, format: p.format, views: p.views, score: p.outlier_score, url: p.url }); });
    $('#rmx-free', pane).onclick = () => remix(null);
    $('#addcr', pane).onclick = addCreator;
    pane.querySelectorAll('[data-fetch]').forEach((b) => b.onclick = async () => { b.disabled = true; b.textContent = 'Fetching...';
      try { const r = await api('studio', { body: { action: 'research_fetch', creator_id: b.dataset.fetch } }); toast(`${r.posts} posts, median ${r.median.toLocaleString()} views`); } catch (e) { toast(e.message, { ms: 7000 }); }
      refresh(); });
    pane.querySelectorAll('[data-rmcr]').forEach((b) => b.onclick = async () => { await q(live.sb.from('research_creators').delete().eq('id', b.dataset.rmcr)).catch((e) => toast(e.message)); refresh(); });
  }

  function learning(pane) {
    pane.innerHTML = `<div class="row between wrap" style="margin-bottom:12px"><p class="muted small" style="margin:0">Patterns from your own approvals, passes and edits. Signals that are on shape what the content agents draft. Pause or ignore any of them.</p>
      <button class="btn btn-sm" id="relearn">${icon('refresh')} Recalculate</button></div>
      <div class="list">${signals.map((s) => `<div class="list-item"><div class="grow"><div style="font-weight:600" class="${s.state === 'ignored' ? 'faint' : ''}">${esc(s.signal)}</div><div class="xs muted">${esc(s.evidence || '')} · weight ${s.weight}</div></div>
        <span class="chip ${s.state === 'on' ? 'ok' : s.state === 'paused' ? 'warn' : ''}">${s.state}</span>
        <button class="btn btn-sm" data-sig="${s.id}" data-to="${s.state === 'on' ? 'paused' : 'on'}">${s.state === 'on' ? 'Pause' : 'Turn on'}</button>
        ${s.state !== 'ignored' ? `<button class="btn btn-sm btn-ghost" data-sig="${s.id}" data-to="ignored">Ignore</button>` : ''}</div>`).join('') || '<div class="empty">No signals yet. They appear after a few approvals and passes.</div>'}</div>`;
    $('#relearn', pane).onclick = async (e) => { const __b = e.currentTarget;  __b.disabled = true; try { const r = await api('studio', { body: { action: 'learning_refresh' } }); toast(`${r.signals} signal${r.signals === 1 ? '' : 's'} found`); } catch (x) { toast(x.message); } refresh(); };
    pane.querySelectorAll('[data-sig]').forEach((b) => b.onclick = async () => { await q(live.sb.from('learning_signals').update({ state: b.dataset.to }).eq('id', b.dataset.sig)).catch((e) => toast(e.message)); refresh(); });
  }

  function bindCards(pane) { pane.querySelectorAll('[data-card]').forEach((c) => c.addEventListener('click', () => openCard(items.find((x) => x.id === c.dataset.card)))); }

  function openCard(c) {
    const d = drawer({ title: c.title, body: `<div class="stack">
        <div class="row wrap"><span class="chip">${esc(c.format)}</span><span class="chip">${esc(c.stage)}</span>${c.language === 'fr-qc' ? '<span class="chip info">FR-QC</span>' : ''}${c.authored_by === 'me' ? '<span class="chip accent">Your text</span>' : ''}</div>
        <div class="field"><label>Title</label><input class="input" id="d-title" value="${esc(c.title)}"></div>
        <div class="grid g2"><div class="field"><label>Format</label><select class="select" id="d-fmt">${FORMATS.map((f) => `<option ${f === c.format ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          <div class="field"><label>Publish date</label><input class="input" type="date" value="${c.publish_date || ''}" id="d-date"></div></div>
        <div class="grid g2"><div class="field"><label>Channel</label><select class="select" id="d-ch">${['', 'Instagram', 'Facebook', 'LinkedIn', 'YouTube', 'Email', 'Meta Ads'].map((f) => `<option ${f === (c.channel || '') ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
          <div class="field"><label>${t('c.language')}</label><select class="select" id="d-lang"><option value="en">English</option><option value="fr-qc" ${c.language === 'fr-qc' ? 'selected' : ''}>Quebec French</option></select></div></div>
        <div class="field"><label>Hook</label><input class="input" value="${esc(c.hook || '')}" id="d-hook"></div>
        <div class="field"><label>Script and notes</label><textarea class="textarea" id="d-notes" style="min-height:180px">${esc(c.notes || '')}</textarea></div>
        <div class="field"><label>Tasks</label>${TASKS.map((k) => `<label class="row small" style="margin:6px 0"><input type="checkbox" data-task="${k}" ${c.tasks?.[k] ? 'checked' : ''}> ${k[0].toUpperCase() + k.slice(1)}</label>`).join('')}</div>
      </div>`,
      foot: `<button class="btn btn-ghost" id="d-del">${icon('trash')}</button><button class="btn" id="d-save">${t('c.save')}</button><button class="btn btn-primary hl-btn" id="d-send">${t('content.sendSocial')}</button>` });
    const v = (id) => d.el.querySelector(id).value;
    const patch = () => ({ title: v('#d-title').trim() || c.title, format: v('#d-fmt'), publish_date: v('#d-date') || null, channel: v('#d-ch') || null, language: v('#d-lang'), hook: v('#d-hook'), notes: v('#d-notes'),
      tasks: Object.fromEntries(TASKS.map((k) => [k, d.el.querySelector(`[data-task="${k}"]`).checked])), authored_by: 'me' });
    d.el.querySelector('#d-save').onclick = async () => { try { const r = await versionedUpdate('content_items', c, patch()); if (r.conflict) toast('This card changed elsewhere. Reloaded, your edit was not saved.'); else toast('Saved'); d.close(); refresh(); } catch (e) { toast(e.message); } };
    d.el.querySelector('#d-del').onclick = async () => { await q(live.sb.from('content_items').delete().eq('id', c.id)).catch((e) => toast(e.message)); d.close(); toast('Card deleted'); refresh(); };
    d.el.querySelector('#d-send').onclick = () => { const p = patch(); hlWrite('social_draft', { title: p.title, text: [p.hook, p.notes].filter(Boolean).join('\n\n') }, { onDone: async () => { const r = await versionedUpdate('content_items', c, { ...p, stage: c.stage === 'Idea' || c.stage === 'Scripting' ? 'Scheduled' : c.stage }); if (!r.conflict) toast('Draft is in the Social Planner'); d.close(); refresh(); } }); };
  }

  function editCard(_c, date) {
    modal({ title: 'New content card', body: `<div class="stack"><div class="field"><label>Title</label><input class="input" id="n-title"></div>
      <div class="grid g2"><div class="field"><label>Format</label><select class="select" id="n-fmt">${FORMATS.map((f) => `<option>${f}</option>`).join('')}</select></div>
      <div class="field"><label>Date</label><input class="input" type="date" id="n-date" value="${date || ''}"></div></div>
      <div class="field"><label>Hook</label><input class="input" id="n-hook"></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        const title = ov.querySelector('#n-title').value.trim(); if (!title) return;
        try { await q(live.sb.from('content_items').insert({ owner_id: live.ownerId, title, format: ov.querySelector('#n-fmt').value, publish_date: ov.querySelector('#n-date').value || null, hook: ov.querySelector('#n-hook').value, stage: 'Idea', authored_by: 'me' })); close(); refresh(); }
        catch (e) { toast(e.message); }
      }; } });
  }

  function addCreator() {
    modal({ title: 'Track a channel', body: `<div class="stack"><div class="grid g2"><div class="field"><label>Platform</label><select class="select" id="cp"><option>Instagram</option><option>YouTube</option></select></div>
      <div class="field"><label>Handle</label><input class="input" id="ch" placeholder="@handle"></div></div>
      <label class="row small"><input type="checkbox" id="cm"> This is my own channel</label>
      <p class="xs muted">Instagram needs an Apify token, YouTube needs a YouTube API key, both in Connections.</p></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        let h = ov.querySelector('#ch').value.trim(); if (!h) return; if (!h.startsWith('@')) h = '@' + h;
        try { await q(live.sb.from('research_creators').insert({ owner_id: live.ownerId, platform: ov.querySelector('#cp').value, handle: h, is_mine: ov.querySelector('#cm').checked })); close(); refresh(); } catch (e) { toast(/duplicate/.test(e.message) ? 'Already tracked' : e.message); }
      }; } });
  }

  function remix(idea) {
    modal({ title: 'Remix into my voice', sub: idea ? `From: "${esc((idea.title || '').slice(0, 90))}" (${esc(idea.creator || '')})` : 'Start from your own idea',
      body: `<p class="small muted">The idea is reused, never the creator's words or face. No forced sales pitch. Drafts go to Approvals.</p>
        ${idea ? '' : '<div class="field"><label>Idea</label><textarea class="textarea" id="ri" placeholder="Example: why mortgage leads go cold after 2 hours"></textarea></div>'}
        <div class="field" style="margin-top:10px"><label>Formats</label><div class="row wrap">${['Long video', 'Short video', 'Carousel', 'Written post', 'Email'].map((f, i) => `<label class="row small"><input type="checkbox" ${i === 1 || i === 2 ? 'checked' : ''} data-fmt="${f}"> ${f}</label>`).join('')}</div></div>
        <div class="field" style="margin-top:12px"><label>${t('c.language')}</label><div class="seg" id="rl"><button class="active" data-l="en">English</button><button data-l="fr-qc">Quebec French</button><button data-l="both">Both</button></div></div>
        <div class="field" style="margin-top:12px"><label>Angle (optional)</label><input class="input" id="ra" placeholder="Example: aim it at mortgage brokers"></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${icon('sparkle')} Create drafts</button>`,
      onMount: (ov, close) => {
        let l = 'en';
        ov.querySelectorAll('#rl button').forEach((b) => b.onclick = () => { l = b.dataset.l; ov.querySelectorAll('#rl button').forEach((x) => x.classList.toggle('active', x === b)); });
        ov.querySelector('[data-ok]').onclick = async (ev) => { const __b = ev.currentTarget; 
          const formats = [...ov.querySelectorAll('[data-fmt]:checked')].map((x) => x.dataset.fmt);
          const src = idea || { title: ov.querySelector('#ri').value.trim() };
          if (!src.title) return toast('Describe the idea');
          __b.disabled = true; __b.textContent = 'Writing...';
          try { const r = await api('studio', { body: { action: 'remix', idea: src, formats, language: l, angle: ov.querySelector('#ra').value } }); close(); ctx.refreshNav(); toast(`${r.drafts} draft${r.drafts === 1 ? '' : 's'} sent to Approvals`); }
          catch (e) { toast(e.message, { ms: 7000 }); __b.disabled = false; __b.textContent = 'Create drafts'; }
        };
      } });
  }

  el.innerHTML = '<div class="empty">Loading content...</div>';
  try { await load(); draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load Content</h2><p class="mono">${esc(e.message)}</p><p class="small">Run the newest SQL migration in Supabase if you just updated.</p></div>`; }
}
