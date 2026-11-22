import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, drawer, tabsHtml, confirmWrite, toggleHtml, $ } from '../ui.js';
import { contentItems, contentStages, creators, outliers, learningSignals, approvals } from '../data.js';

let tab = 'board';
const fmtDate = (d) => new Date(d + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function render(el, ctx) {
  const draw = () => {
    el.innerHTML = `
      ${head(t('content.title'), t('content.sub'), `<button class="btn btn-primary" id="new-card">${icon('plus')} ${t('c.new')}</button>`)}
      ${tabsHtml([['board', t('content.board')], ['calendar', t('content.calendar')], ['research', t('content.research')], ['learning', t('content.learning')]], tab)}
      <div id="pane"></div>`;
    el.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; draw(); });
    $('#new-card', el).onclick = newCard;
    const pane = $('#pane', el);
    ({ board, calendar, research, learning })[tab](pane);
  };

  const cardHtml = (c) => {
    const done = Object.values(c.tasks).filter(Boolean).length;
    return `<div class="kcard" draggable="true" data-card="${c.id}"><div class="t">${esc(c.title)}</div>
      <div class="row wrap xs muted" style="gap:6px"><span class="chip">${esc(c.format)}</span>${c.lang === 'FR-QC' ? '<span class="chip info">FR-QC</span>' : ''}<span>${fmtDate(c.date)}</span></div>
      <div class="xs muted" style="margin-top:6px">"${esc(c.hook)}"</div>
      <div class="progress accent" style="margin-top:8px"><span style="width:${done * 20}%"></span></div><div class="xs faint" style="margin-top:3px">${done}/5 tasks</div></div>`;
  };

  function board(pane) {
    pane.innerHTML = `<div class="kanban">${contentStages.map((s) => {
      const items = contentItems.filter((c) => c.stage === s);
      return `<div class="kcol" data-col="${s}"><div class="kcol-head"><span>${s}</span><span class="chip">${items.length}</span></div>${items.map(cardHtml).join('')}</div>`;
    }).join('')}</div><p class="xs muted">Drag cards between columns. The board is yours, so moves here need no confirmation. Nothing reaches HighLevel until you press Send.</p>`;
    bindCards(pane);
    let dragId = null;
    pane.querySelectorAll('[data-card]').forEach((c) => c.ondragstart = () => { dragId = c.dataset.card; });
    pane.querySelectorAll('[data-col]').forEach((col) => {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add('drop'); };
      col.ondragleave = () => col.classList.remove('drop');
      col.ondrop = () => { const c = contentItems.find((x) => x.id === dragId); if (c) { c.stage = col.dataset.col; toast(`Moved to ${c.stage}`); draw(); } };
    });
  }

  function calendar(pane) {
    const start = new Date('2026-11-01T12:00'); const lead = start.getDay();
    const days = [];
    for (let i = 0; i < 35; i++) { const d = new Date(start); d.setDate(1 - lead + i); days.push(d); }
    pane.innerHTML = `<div class="row between" style="margin-bottom:10px"><h3>November 2026</h3><div class="seg"><button class="active">Month</button><button>Week</button></div></div>
      <div class="cal">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="dow">${d}</div>`).join('')}
      ${days.map((d) => { const iso = d.toISOString().slice(0, 10); const evs = contentItems.filter((c) => c.date === iso);
        return `<div class="day ${d.getMonth() !== 10 ? 'out' : ''}"><div>${d.getDate()}</div>${evs.map((c) => `<span class="ev ${c.format === 'Short video' ? 'reel' : ''}" data-card="${c.id}" title="${esc(c.title)}">${esc(c.title)}</span>`).join('')}</div>`; }).join('')}</div>`;
    bindCards(pane);
  }

  function research(pane) {
    pane.innerHTML = `<div class="notice neutral small" style="margin-bottom:14px">${icon('info')}<span>Public data only, via Apify and YouTube once connected. Outlier score = views divided by that creator's median. Sample handles shown.</span></div>
      <div class="split"><div><h3 style="margin-bottom:10px">Outlier posts</h3><div class="table-wrap"><table class="table">
      <thead><tr><th>Post</th><th>Creator</th><th>Views</th><th>Outlier</th><th></th></tr></thead><tbody>
      ${outliers.map((o, i) => { const x = (o.views / o.median).toFixed(1); return `<tr><td><div style="font-weight:600">${esc(o.title)}</div><div class="xs muted">${o.format} · ${o.posted}</div></td><td class="small">${esc(o.creator)}</td>
        <td class="small">${o.views.toLocaleString()}</td><td><span class="chip ${x >= 5 ? 'accent' : x >= 3 ? 'ok' : ''}">${x}×</span></td><td><button class="btn btn-sm" data-remix="${i}">${t('content.remix')}</button></td></tr>`; }).join('')}
      </tbody></table></div></div>
      <div class="card"><div class="card-head"><h3>Tracked channels</h3><button class="btn btn-sm">${icon('plus')}</button></div>
      ${creators.map((c) => `<div class="row" style="margin-bottom:10px"><div class="grow small"><div style="font-weight:600">${esc(c.handle)}</div><div class="xs muted">${c.platform} · median ${c.median.toLocaleString()} views</div></div>${c.mine ? '<span class="chip accent">You</span>' : ''}</div>`).join('')}</div></div>`;
    pane.querySelectorAll('[data-remix]').forEach((b) => b.onclick = () => remix(outliers[b.dataset.remix]));
  }

  function learning(pane) {
    pane.innerHTML = `<p class="muted small" style="margin-bottom:12px">These signals shape future ideas. Pause or ignore any of them.</p>
      <div class="list">${learningSignals.map((s) => `<div class="list-item"><div class="grow"><div style="font-weight:600" class="${s.state === 'ignored' ? 'faint' : ''}">${esc(s.text)}</div><div class="xs muted">From ${esc(s.from)} · weight ${s.weight}</div></div>
        <span class="chip ${s.state === 'on' ? 'ok' : s.state === 'paused' ? 'warn' : ''}">${s.state}</span>
        <button class="btn btn-sm" data-sig="${s.id}" data-to="${s.state === 'on' ? 'paused' : 'on'}">${s.state === 'on' ? 'Pause' : 'Resume'}</button>
        <button class="btn btn-sm btn-ghost" data-sig="${s.id}" data-to="ignored">Ignore</button></div>`).join('')}</div>`;
    pane.querySelectorAll('[data-sig]').forEach((b) => b.onclick = () => { learningSignals.find((s) => s.id === b.dataset.sig).state = b.dataset.to; draw(); });
  }

  function bindCards(pane) { pane.querySelectorAll('[data-card]').forEach((c) => c.onclick = () => openCard(contentItems.find((x) => x.id === c.dataset.card))); }

  function openCard(c) {
    const d = drawer({ title: c.title, body: `
      <div class="row wrap" style="margin-bottom:12px"><span class="chip">${esc(c.format)}</span><span class="chip outline">${esc(c.channel)}</span><span class="chip">${esc(c.stage)}</span>${c.lang === 'FR-QC' ? '<span class="chip info">FR-QC</span>' : ''}</div>
      <div class="stack">
        <div class="field"><label>Hook</label><input class="input" value="${esc(c.hook)}" id="d-hook"></div>
        <div class="field"><label>Publish date</label><input class="input" type="date" value="${c.date}" id="d-date"></div>
        <div class="field"><label>Notes</label><textarea class="textarea" id="d-notes">${esc(c.notes)}</textarea></div>
        <div class="field"><label>Tasks</label>${Object.keys(c.tasks).map((k) => `<label class="row small" style="margin:6px 0"><input type="checkbox" data-task="${k}" ${c.tasks[k] ? 'checked' : ''}> ${k[0].toUpperCase() + k.slice(1)}</label>`).join('')}</div>
      </div>`,
      foot: `<button class="btn" id="d-save">${t('c.save')}</button><button class="btn btn-primary hl-btn" id="d-send">${t('content.sendSocial')}</button>` });
    d.el.querySelectorAll('[data-task]').forEach((x) => x.onchange = () => { c.tasks[x.dataset.task] = x.checked; });
    d.el.querySelector('#d-save').onclick = () => { c.hook = $('#d-hook', d.el).value; c.date = $('#d-date', d.el).value; c.notes = $('#d-notes', d.el).value; d.close(); toast('Saved'); draw(); };
    d.el.querySelector('#d-send').onclick = () => confirmWrite({
      action: 'Social Planner post (draft)', target: `HighLevel Social Planner · ${c.channel}`,
      payload: { status: 'draft', accounts: [c.channel], summary: c.hook, scheduleDate: c.date + 'T15:00:00-05:00', media: ['(attached file from card)'] },
      onConfirm: d.close,
    });
  }

  function remix(o) {
    modal({ title: 'Remix into my voice', sub: `From: "${esc(o.title)}" (${esc(o.creator)})`,
      body: `<p class="small muted">The idea is reused, never the creator's words or face. No forced sales pitch.</p>
        <div class="field"><label>Formats</label><div class="row wrap">${['Long video', 'Short video', 'Carousel', 'Written post', 'Email'].map((f, i) => `<label class="row small"><input type="checkbox" ${i === 1 || i === 2 ? 'checked' : ''} data-fmt="${f}"> ${f}</label>`).join('')}</div></div>
        <div class="field" style="margin-top:12px"><label>${t('c.language')}</label><div class="seg" id="rl"><button class="active" data-l="EN">English</button><button data-l="FR-QC">Quebec French</button><button data-l="BOTH">Both</button></div></div>
        <div class="field" style="margin-top:12px"><label>Angle (optional)</label><input class="input" placeholder="Example: aim it at mortgage brokers"></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>Create drafts</button>`,
      onMount: (ov, close) => {
        let l = 'EN';
        ov.querySelectorAll('#rl button').forEach((b) => b.onclick = () => { l = b.dataset.l; ov.querySelectorAll('#rl button').forEach((x) => x.classList.toggle('active', x === b)); });
        ov.querySelector('[data-ok]').onclick = () => {
          const fmts = [...ov.querySelectorAll('[data-fmt]:checked')].map((x) => x.dataset.fmt);
          fmts.forEach((f) => approvals.unshift({ id: 'a' + Math.random(), title: `${f}: ${o.title} (remix)`, type: f, agent: 'Content Strategist', target: 'Content', tags: ['remix'], status: 'pending', age: 'Just now', lang: l === 'BOTH' ? 'FR-QC' : l, body: `Remix of an outlier idea in your voice. [DEMO: real draft is written in Phase 3]` }));
          close(); ctx.refreshNav(); toast(`${fmts.length} drafts sent to Approvals`);
        };
      } });
  }

  function newCard() {
    modal({ title: 'New content card', body: `<div class="stack"><div class="field"><label>Title</label><input class="input" id="n-title"></div>
      <div class="grid g2"><div class="field"><label>Format</label><select class="select" id="n-fmt">${['Short video', 'Long video', 'Carousel', 'Written post', 'Email', 'Meta Ad copy'].map((f) => `<option>${f}</option>`).join('')}</select></div>
      <div class="field"><label>Date</label><input class="input" type="date" id="n-date" value="2026-12-01"></div></div>
      <div class="field"><label>Hook</label><input class="input" id="n-hook"></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = () => {
        const title = ov.querySelector('#n-title').value.trim() || 'Untitled';
        contentItems.push({ id: 'c' + Date.now(), title, format: ov.querySelector('#n-fmt').value, stage: 'Idea', date: ov.querySelector('#n-date').value, hook: ov.querySelector('#n-hook').value, channel: 'Instagram', lang: 'EN', notes: '', tasks: { script: false, film: false, edit: false, thumbnail: false, upload: false } });
        close(); tab = 'board'; draw(); }; } });
  }
  draw();
}
