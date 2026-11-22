// AI Team backed by Supabase and /api/chat: Chief of Staff routes, Content Strategist drafts to Approvals.
import { t } from '../i18n.js';
import { head, icon, esc, toast, md, modal, toggleHtml, $ } from '../ui.js';
import { live, api, q, versionedUpdate } from '../live.js';

const ACTIVE = ['chief-of-staff', 'content-strategist', 'researcher', 'copywriter', 'designer', 'funnel-builder', 'email-writer', 'crm-assistant', 'marketing-analyst'];
const ini = (n) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const st = { slug: 'content-strategist' };

export async function render(el, ctx) {
  let agents = [], thread = null, msgs = [], history = [], busy = false;
  const loadAgents = async () => { agents = await q(live.sb.from('agents').select('*').order('sort')); };
  const loadThread = async () => {
    const a = agents.find((x) => x.slug === st.slug);
    thread = a ? await q(live.sb.from('threads').select('*').eq('agent_id', a.id).order('updated_at', { ascending: false }).limit(1).maybeSingle()) : null;
    msgs = thread ? await q(live.sb.from('messages').select('*').eq('thread_id', thread.id).order('created_at')) : [];
    history = a ? await q(live.sb.from('approvals').select('id, title, type, status, created_at').eq('source_agent', a.name).order('created_at', { ascending: false }).limit(8)) : [];
  };

  const draw = () => {
    const a = agents.find((x) => x.slug === st.slug) || agents[0];
    if (!a) { el.innerHTML = `${head(t('team.title'), t('team.sub'))}<div class="empty card soft">No agents yet. Reload the page to set them up. If this stays empty, run the newest SQL migration in Supabase.</div>`; return; }
    const usable = ACTIVE.includes(a.slug);
    el.innerHTML = `
      ${head(t('team.title'), t('team.sub'))}
      <div class="messenger">
        <div class="mcol agents">${agents.map((x) => `<div class="agent-row ${x.slug === a.slug ? 'active' : ''} ${x.enabled ? '' : 'off'}" data-agent="${x.slug}">
          <div class="avatar ai">${ini(x.name)}</div><div class="grow"><div class="small" style="font-weight:600">${esc(x.name)} ${x.pinned ? '<span class="chip accent" style="margin-left:4px">Pinned</span>' : ''}</div>
          <div class="xs muted">${ACTIVE.includes(x.slug) ? esc(x.role || '') : 'Arrives in Phase 5'}</div></div>${x.enabled ? '<span class="dot on"></span>' : ''}</div>`).join('')}</div>
        <div class="mcol convo" style="display:flex;flex-direction:column">
          <div class="row between" style="padding:12px 16px;border-bottom:1px solid var(--border)"><div><b>${esc(a.name)}</b><div class="xs muted">${usable ? (a.slug === 'chief-of-staff' ? 'Routes work to the right specialist' : ['crm-assistant', 'marketing-analyst'].includes(a.slug) ? 'Reads live HighLevel and Meta numbers' : 'Drafts go to Approvals') : 'Arrives in Phase 5'}</div></div>
            ${thread ? `<button class="btn btn-sm btn-ghost" id="newt">${icon('plus')} New thread</button>` : ''}</div>
          <div style="flex:1;overflow-y:auto;padding:16px" id="mscroll">
            ${msgs.length ? msgs.map((m) => m.role === 'user' ? `<div class="msg me"><div class="avatar">${m.content.startsWith('From Chief of Staff:') ? 'CS' : 'JU'}</div><div class="bubble">${esc(m.content)}</div></div>`
              : m.role === 'system' ? `<div class="notice neutral small" style="margin:0 0 14px">${icon('info')}<span>${esc(m.content)}</span></div>`
              : `<div class="msg"><div class="avatar ai">${ini(a.name)}</div><div class="bubble">${md(m.content)}</div></div>`).join('')
              : `<div class="empty small">${usable ? (a.slug === 'chief-of-staff' ? 'Tell me what you need. I route it to the right specialist.' : esc(a.role || '') + '. English or Quebec French.') : 'This agent is built in Phase 5.'}</div>`}
            ${busy ? `<div class="msg"><div class="avatar ai">${ini(a.name)}</div><div class="bubble muted small">Working...</div></div>` : ''}
          </div>
          <div style="padding:12px;border-top:1px solid var(--border)"><div class="composer row" style="padding:6px 8px">
            <textarea class="grow" id="amsg" rows="1" style="border:0;outline:none;background:transparent;padding:6px;resize:none" placeholder="Message ${esc(a.name)}" ${usable && a.enabled && !busy ? '' : 'disabled'}></textarea>
            <button class="btn btn-primary btn-sm" id="asend" ${usable && a.enabled && !busy ? '' : 'disabled'}>${icon('send')}</button></div></div>
        </div>
        <div class="mcol profile" style="padding:18px">
          <div class="avatar ai lg" style="margin-bottom:10px">${ini(a.name)}</div>
          <h3>${esc(a.name)}</h3><p class="small muted">${esc(a.role || '')}</p>
          <div class="row between small" style="margin:10px 0"><span style="font-weight:600">${t('team.enable')}</span>${toggleHtml(a.enabled, `id="aen" ${a.pinned || !usable ? 'disabled' : ''}`)}</div>
          <div class="divider"></div>
          <div class="row between"><div class="eyebrow">${t('team.instructions')}</div>${usable ? `<button class="btn btn-sm btn-ghost" id="aedit">${t('c.edit')}</button>` : ''}</div>
          <p class="small" style="margin-top:6px;white-space:pre-wrap">${esc(a.instructions || 'Written when this agent is built.')}</p>
          <div class="eyebrow" style="margin-top:14px">${t('team.history')}</div>
          ${history.length ? history.map((h) => `<a href="#approvals" class="row between small" style="text-decoration:none;margin:6px 0"><span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.title)}</span><span class="chip ${h.status === 'approved' ? 'ok' : h.status === 'passed' ? '' : 'warn'}">${h.status}</span></a>`).join('') : '<p class="small muted" style="margin-top:6px">Nothing yet</p>'}
          <div class="eyebrow" style="margin-top:14px">${t('team.routines')}</div><p class="small muted" style="margin-top:6px">Daily, weekly or monthly draft routines arrive in Phase 6.</p>
          <div class="notice neutral xs" style="margin-top:14px">Cannot publish, send messages or edit HighLevel without your confirmation.</div>
        </div>
      </div>`;
    el.querySelectorAll('[data-agent]').forEach((r) => r.onclick = async () => { st.slug = r.dataset.agent; await loadThread(); draw(); });
    const sc = $('#mscroll', el); sc.scrollTop = sc.scrollHeight;
    $('#aen', el).onchange = async (e) => {  const r = await versionedUpdate('agents', a, { enabled: e.target.checked }).catch((x) => toast(x.message)); if (r?.conflict) toast('Changed elsewhere. Reloaded.'); await loadAgents(); draw(); };
    const ed = $('#aedit', el); if (ed) ed.onclick = () => editInstructions(a);
    const nt = $('#newt', el); if (nt) nt.onclick = () => { thread = null; msgs = []; draw(); };
    $('#asend', el).onclick = send;
    $('#amsg', el).onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  };

  async function send() {
    const v = $('#amsg', el).value.trim(); if (!v || busy) return;
    busy = true; msgs.push({ role: 'user', content: v }); draw();
    try {
      const r = await api('chat', { body: { agent_slug: st.slug, thread_id: thread?.id, message: v } });
      if (r.drafts.length) { toast(`${r.drafts.length} draft${r.drafts.length > 1 ? 's' : ''} saved to Approvals`); ctx.refreshNav(); }
      r.warnings.filter((w) => !/No Brand DNA/.test(w)).forEach((w) => toast(w, { ms: 6000 }));
    } catch (e) { toast(e.message, { ms: 7000 }); }
    busy = false; await loadThread(); draw();
  }

  function editInstructions(a) {
    modal({ title: `${a.name} instructions`, sub: 'Brand DNA and the house rules are always added on top of these.', wide: true,
      body: `<textarea class="textarea" id="ins" style="min-height:280px">${esc(a.instructions)}</textarea>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        try { const r = await versionedUpdate('agents', a, { instructions: ov.querySelector('#ins').value.trim() }); if (r.conflict) toast('Changed elsewhere. Your edit was not saved.'); close(); await loadAgents(); draw(); }
        catch (e) { toast(e.message); }
      }; } });
  }

  el.innerHTML = '<div class="empty">Loading your team...</div>';
  try { await loadAgents(); await loadThread(); draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load AI Team</h2><p class="mono">${esc(e.message)}</p></div>`; }
}
