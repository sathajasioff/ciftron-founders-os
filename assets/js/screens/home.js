import { t } from '../i18n.js';
import { head, icon, esc } from '../ui.js';
import { snapshot, approvals, goals, contentItems, agents } from '../data.js';

export function render(el) {
  const pending = approvals.filter((a) => a.status === 'pending');
  const thisWeek = contentItems.filter((c) => c.date <= '2026-11-29' && c.stage !== 'Idea');
  el.innerHTML = `
    ${head(t('home.title'), t('home.sub'), `<a class="btn" href="#chat">${icon('chat')} ${t('nav.chat')}</a><a class="btn btn-primary" href="#approvals">${icon('inbox')} ${t('nav.approvals')} (${pending.length})</a>`, 'Sunday, November 22')}
    <div class="grid g4" style="margin-bottom:16px">
      ${snapshot.map((s) => `<div class="card stat"><div class="label">${esc(s.label)}</div><div class="value">${esc(s.value)}</div>
        <div class="row between"><span class="delta ${s.dir}">${esc(s.delta)}</span><span class="source-tag">${esc(s.source)}</span></div></div>`).join('')}
    </div>
    <div class="split">
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>${t('home.waiting')}</h3><a class="btn btn-sm btn-ghost" href="#approvals">${icon('arrow')}</a></div>
          <div class="list" style="border:0">
            ${pending.slice(0, 4).map((a) => `<a class="list-item clickable" href="#approvals" style="text-decoration:none;padding-left:0;padding-right:0">
              <div class="grow"><div style="font-weight:600">${esc(a.title)}</div><div class="xs muted">${esc(a.agent)} · ${esc(a.age)}</div></div>
              <span class="chip">${esc(a.type)}</span>${a.lang === 'FR-QC' ? '<span class="chip info">FR-QC</span>' : ''}</a>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>${t('home.production')}</h3><a class="btn btn-sm btn-ghost" href="#content">${icon('arrow')}</a></div>
          <div class="table-wrap" style="border:0"><table class="table">
            <thead><tr><th>Title</th><th>Format</th><th>Stage</th><th>Date</th></tr></thead>
            <tbody>${thisWeek.map((c) => `<tr><td style="font-weight:600">${esc(c.title)}</td><td class="muted">${esc(c.format)}</td><td><span class="chip">${esc(c.stage)}</span></td><td class="muted small">${new Date(c.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td></tr>`).join('')}</tbody>
          </table></div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><h3>${t('home.goals')}</h3><a class="btn btn-sm btn-ghost" href="#goals">${icon('arrow')}</a></div>
          <div class="stack">${goals.map((g) => `<div><div class="row between small"><span style="font-weight:600">${esc(g.raw)}</span><span class="muted">${g.current}/${g.total}</span></div>
            <div class="progress" style="margin-top:6px"><span style="width:${Math.round((g.current / g.total) * 100)}%"></span></div><div class="source-tag" style="margin-top:3px">${esc(g.source)}</div></div>`).join('')}</div>
        </div>
        <div class="card">
          <h3 style="margin-bottom:10px">${t('home.agents')}</h3>
          ${agents.filter((a) => a.enabled).map((a) => `<div class="row" style="margin-bottom:10px"><div class="avatar ai">${a.initials}</div><div class="grow small"><div style="font-weight:600">${esc(a.name)}</div><div class="muted xs">${a.id === 'cs' ? '4 drafts in Approvals' : 'Routed 2 requests today'}</div></div><span class="dot on"></span></div>`).join('')}
          <a class="btn btn-sm" href="#team">${t('nav.team')}</a>
        </div>
      </div>
    </div>`;
}
