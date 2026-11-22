import { t } from '../i18n.js';
import { head, icon, esc, toast, toggleHtml, $ } from '../ui.js';
import { agents, agentThreads, agentHistory } from '../data.js';

let active = 'cs';

export function render(el, ctx = {}) {
  if (ctx.live) return import('./team-live.js').then((m) => m.render(el, ctx));
  const draw = () => {
    const a = agents.find((x) => x.id === active);
    const msgs = agentThreads[a.id] || [];
    el.innerHTML = `
      ${head(t('team.title'), t('team.sub'))}
      <div class="messenger">
        <div class="mcol agents">
          ${agents.map((x) => `<div class="agent-row ${x.id === active ? 'active' : ''} ${x.enabled ? '' : 'off'}" data-agent="${x.id}">
            <div class="avatar ai">${x.initials}</div><div class="grow"><div class="small" style="font-weight:600">${esc(x.name)} ${x.pinned ? '<span class="chip accent" style="margin-left:4px">Pinned</span>' : ''}</div>
            <div class="xs muted">${esc(x.role)}</div></div>${x.enabled ? '<span class="dot on"></span>' : ''}</div>`).join('')}
        </div>
        <div class="mcol convo" style="display:flex;flex-direction:column">
          <div class="row between" style="padding:12px 16px;border-bottom:1px solid var(--border)">
            <div><b>${esc(a.name)}</b><div class="xs muted">${a.enabled ? 'Drafts go to Approvals' : 'Not enabled yet, arrives in Phase 5'}</div></div>
          </div>
          <div style="flex:1;overflow-y:auto;padding:16px" id="mscroll">
            ${msgs.length ? msgs.map((m) => m.from === 'me'
              ? `<div class="msg me"><div class="avatar">JU</div><div class="bubble">${esc(m.text)}</div></div>`
              : `<div class="msg"><div class="avatar ai">${a.initials}</div><div class="bubble">${m.html || esc(m.text)}</div></div>`).join('')
              : `<div class="empty small">${a.enabled ? 'No messages yet.' : 'Enable this agent to give it a job and its own history.'}</div>`}
          </div>
          <div style="padding:12px;border-top:1px solid var(--border)"><div class="composer row" style="padding:6px 8px">
            <input class="grow" id="amsg" style="border:0;outline:none;background:transparent;padding:6px" placeholder="Message ${esc(a.name)}" ${a.enabled ? '' : 'disabled'}>
            <button class="btn btn-primary btn-sm" id="asend" ${a.enabled ? '' : 'disabled'}>${icon('send')}</button></div></div>
        </div>
        <div class="mcol profile" style="padding:18px">
          <div class="avatar ai lg" style="margin-bottom:10px">${a.initials}</div>
          <h3>${esc(a.name)}</h3><p class="small muted">${esc(a.role)}</p>
          <div class="row between small" style="margin:10px 0"><span style="font-weight:600">${t('team.enable')}</span>${toggleHtml(a.enabled, `id="aen" ${a.pinned ? 'disabled' : ''}`)}</div>
          <div class="divider"></div>
          <div class="eyebrow">${t('team.instructions')}</div>
          <p class="small" style="margin-top:6px">${esc(a.instructions || 'Instructions are written when you enable this agent.')}</p>
          <div class="eyebrow" style="margin-top:14px">${t('team.history')}</div>
          <ul class="small" style="padding-left:18px;margin:6px 0">${(agentHistory[a.id] || ['Nothing yet']).map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
          <div class="eyebrow" style="margin-top:14px">${t('team.routines')}</div>
          <div class="small muted" style="margin-top:6px">${a.id === 'cs' ? 'Weekly: Monday 9 AM, 10 hook ideas (drafts only). Phase 6.' : 'None'}</div>
          <div class="notice neutral xs" style="margin-top:14px">Cannot publish, send messages or edit HighLevel without your confirmation.</div>
        </div>
      </div>`;
    el.querySelectorAll('[data-agent]').forEach((r) => r.onclick = () => { active = r.dataset.agent; draw(); });
    const sc = $('#mscroll', el); sc.scrollTop = sc.scrollHeight;
    const aen = $('#aen', el);
    aen.onchange = () => { a.enabled = aen.checked; toast(a.enabled ? `${a.name} enabled (demo)` : `${a.name} disabled`); draw(); };
    const send = () => {
      const v = $('#amsg', el).value.trim(); if (!v) return;
      (agentThreads[a.id] = agentThreads[a.id] || []).push({ from: 'me', text: v }, { from: 'ai', text: 'Got it. Demo reply. In Phase 3 I draft this and save it to Approvals.' });
      draw();
    };
    $('#asend', el).onclick = send;
    $('#amsg', el).onkeydown = (e) => { if (e.key === 'Enter') send(); };
  };
  draw();
}
