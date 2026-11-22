// AI Team backed by Supabase and /api/chat: Chief of Staff routes, Content Strategist drafts to Approvals.
import { t } from '../i18n.js';
import { head, icon, esc, toast, md, modal, toggleHtml, $ } from '../ui.js';
import { attachData } from '../custom-ui.js';
import { live, api, q, versionedUpdate } from '../live.js';

const ACTIVE = ['chief-of-staff', 'content-strategist', 'researcher', 'copywriter', 'designer', 'funnel-builder', 'email-writer', 'crm-assistant', 'marketing-analyst',
  'ads-manager', 'video-producer', 'sales-coach', 'offer-strategist', 'outreach-writer', 'client-success', 'french-localizer', 'project-manager'];
const LIVE_DATA = ['crm-assistant', 'marketing-analyst', 'ads-manager', 'offer-strategist', 'client-success', 'project-manager'];
const ini = (n) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const st = { slug: 'content-strategist' };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
// Starting points for a new routine. The owner edits the prompt before saving.
const PRESETS = {
  'chief-of-staff': ['daily', 'Morning brief', 'Write a short brief for today: what is waiting in Approvals, how the pipeline moved, what the ads did, and the three things I should do first.'],
  'content-strategist': ['weekly', 'Next week of content', 'Plan next week of content: five short video ideas and two carousels, built on what is working for me. One draft per idea.'],
  'marketing-analyst': ['weekly', 'Weekly ads and pipeline review', 'Review last week of Meta Ads and the HighLevel pipeline. Note changes in cost per lead and lead flow, and suggest one test for next week. Brief only.'],
  'email-writer': ['monthly', 'Monthly newsletter', 'Draft this month newsletter to my list from my recent content and approved Brain facts. One email.'],
  'project-manager': ['weekly', 'Monday plan', 'Plan my week: the three priorities that move my goals, tasks by day with time estimates, and what to delegate or drop.'],
  'ads-manager': ['weekly', 'Weekly creative test', 'From last week of Meta numbers, propose one creative test for this week with the hypothesis, the variants and the kill and scale rules.'],
  'outreach-writer': ['weekly', 'Fresh outreach angles', 'Write three new cold email openers and two DM openers for my main niche, each with a different angle. Personalization in [BRACKETS].'],
  'client-success': ['monthly', 'Client update drafts', 'Draft a short monthly update template for my retainer clients with sections for wins, numbers, next month and one ask. Mark numbers as [NUMBER].'],
  'crm-assistant': ['weekly', 'Pipeline follow-up list', 'List the stages where leads are stuck and draft one follow-up message per stage for me to review. Do not name contacts.'],
};
const cadenceText = (r) => r.cadence === 'daily' ? 'Every day' : r.cadence === 'weekly' ? `Every ${DAYS[r.weekday ?? 1]}` : `Monthly, day ${r.day_of_month ?? 1}`;
const runTime = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 10, 30)).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };

export async function render(el, ctx) {
  let agents = [], thread = null, msgs = [], history = [], routines = [], busy = false;
  const loadAgents = async () => { agents = await q(live.sb.from('agents').select('*').order('sort')); };
  const loadThread = async () => {
    const a = agents.find((x) => x.slug === st.slug);
    thread = a ? await q(live.sb.from('threads').select('*').eq('agent_id', a.id).order('updated_at', { ascending: false }).limit(1).maybeSingle()) : null;
    msgs = thread ? await q(live.sb.from('messages').select('*').eq('thread_id', thread.id).order('created_at')) : [];
    routines = a ? await q(live.sb.from('agent_routines').select('*').eq('agent_id', a.id).order('created_at')) : [];
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
          <div class="xs muted">${ACTIVE.includes(x.slug) ? esc(x.role || '') : 'Not available'}</div></div>${x.enabled ? '<span class="dot on"></span>' : ''}</div>`).join('')}</div>
        <div class="mcol convo" style="display:flex;flex-direction:column">
          <div class="row between" style="padding:12px 16px;border-bottom:1px solid var(--border)"><div><b>${esc(a.name)}</b><div class="xs muted">${usable ? (a.slug === 'chief-of-staff' ? 'Routes work to the right specialist' : LIVE_DATA.includes(a.slug) ? 'Reads your live business numbers' : 'Drafts go to Approvals') : 'Not available'}</div></div>
            ${thread ? `<button class="btn btn-sm btn-ghost" id="newt">${icon('plus')} New thread</button>` : ''}</div>
          <div style="flex:1;overflow-y:auto;padding:16px" id="mscroll">
            ${msgs.length ? msgs.map((m) => m.role === 'user' ? `<div class="msg me"><div class="avatar">${m.content.startsWith('From Chief of Staff:') ? 'CS' : 'JU'}</div><div class="bubble">${esc(m.content)}</div></div>`
              : m.role === 'system' ? `<div class="notice neutral small" style="margin:0 0 14px">${icon('info')}<span>${esc(m.content)}</span></div>`
              : `<div class="msg"><div class="avatar ai">${ini(a.name)}</div><div class="bubble">${md(m.content)}</div></div>`).join('')
              : `<div class="empty small">${usable ? (a.slug === 'chief-of-staff' ? 'Tell me what you need. I route it to the right specialist.' : esc(a.role || '') + '. English or Quebec French.') : 'This agent is not available.'}</div>`}
            ${busy ? `<div class="msg"><div class="avatar ai">${ini(a.name)}</div><div class="bubble muted small">Working...</div></div>` : ''}
          </div>
          <div style="padding:12px;border-top:1px solid var(--border)"><div class="composer row" style="padding:6px 8px">
            <textarea class="grow" id="amsg" rows="1" style="border:0;outline:none;background:transparent;padding:6px;resize:none" placeholder="Message ${esc(a.name)}" ${usable && a.enabled && !busy ? '' : 'disabled'}></textarea>
            <button class="btn btn-ghost btn-sm" id="adata" title="Attach data from a custom API connection" ${usable && a.enabled && !busy ? '' : 'disabled'}>${icon('globe')}</button><button class="btn btn-primary btn-sm" id="asend" ${usable && a.enabled && !busy ? '' : 'disabled'}>${icon('send')}</button></div></div>
        </div>
        <div class="mcol profile" style="padding:18px">
          <div class="avatar ai lg" style="margin-bottom:10px">${ini(a.name)}</div>
          <h3>${esc(a.name)}</h3><p class="small muted">${esc(a.role || '')}</p>
          <div class="row between small" style="margin:10px 0"><span style="font-weight:600">${t('team.enable')}</span>${toggleHtml(a.enabled, `id="aen" ${a.pinned || !usable ? 'disabled' : ''}`)}</div>
          <div class="divider"></div>
          <div class="row between"><div class="eyebrow">${t('team.instructions')}</div>${usable ? `<button class="btn btn-sm btn-ghost" id="aedit">${t('c.edit')}</button>` : ''}</div>
          <p class="small" style="margin-top:6px;white-space:pre-wrap">${esc(a.instructions || 'No instructions yet.')}</p>
          <div class="eyebrow" style="margin-top:14px">${t('team.history')}</div>
          ${history.length ? history.map((h) => `<a href="#approvals" class="row between small" style="text-decoration:none;margin:6px 0"><span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(h.title)}</span><span class="chip ${h.status === 'approved' ? 'ok' : h.status === 'passed' ? '' : 'warn'}">${h.status}</span></a>`).join('') : '<p class="small muted" style="margin-top:6px">Nothing yet</p>'}
          <div class="row between" style="margin-top:14px"><div class="eyebrow">${t('team.routines')}</div>${usable ? `<button class="btn btn-sm btn-ghost" id="rnew">${icon('plus')} Add</button>` : ''}</div>
          ${routines.length ? routines.map((r) => `<div class="card soft" style="padding:10px;margin-top:8px">
            <div class="row between small"><b class="grow">${esc(r.title || 'Routine')}</b>${toggleHtml(r.enabled, `data-ren="${r.id}" aria-label="Routine on or off"`)}</div>
            <div class="xs muted">${cadenceText(r)} · ${r.language === 'fr-qc' ? 'FR-QC' : 'EN'}${r.last_run_at ? ` · Last run ${new Date(r.last_run_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</div>
            ${r.last_status === 'error' ? `<div class="xs down" style="margin-top:4px">${esc(r.last_error || 'Failed')}</div>` : r.last_status === 'skipped' ? `<div class="xs muted" style="margin-top:4px">Skipped: ${esc(r.last_error || '')}</div>` : r.last_status === 'ok' ? `<div class="xs muted" style="margin-top:4px">${r.last_draft_count} draft${r.last_draft_count === 1 ? '' : 's'} to Approvals</div>` : ''}
            <div class="row" style="margin-top:6px"><button class="btn btn-sm" data-rrun="${r.id}" ${a.enabled ? '' : 'disabled'}>${icon('play')} Run now</button><button class="btn btn-sm btn-ghost" data-redit="${r.id}">${t('c.edit')}</button><button class="btn btn-sm btn-ghost" data-rdel="${r.id}" style="margin-left:auto" title="Delete routine">${icon('trash')}</button></div></div>`).join('')
            : `<p class="small muted" style="margin-top:6px">${usable ? 'None yet. A routine runs this agent on a schedule and saves drafts to Approvals.' : 'Available once this agent is built.'}</p>`}
          ${routines.some((r) => r.enabled) ? `<p class="xs muted" style="margin-top:6px">${icon('clock')} Runs once a day around ${runTime()} your time.</p>` : ''}
          <div class="notice neutral xs" style="margin-top:14px">Cannot publish, send messages or edit HighLevel without your confirmation.</div>
        </div>
      </div>`;
    el.querySelectorAll('[data-agent]').forEach((r) => r.onclick = async () => { st.slug = r.dataset.agent; await loadThread(); draw(); });
    const sc = $('#mscroll', el); sc.scrollTop = sc.scrollHeight;
    $('#aen', el).onchange = async (e) => {  const r = await versionedUpdate('agents', a, { enabled: e.target.checked }).catch((x) => toast(x.message)); if (r?.conflict) toast('Changed elsewhere. Reloaded.'); await loadAgents(); draw(); };
    const ed = $('#aedit', el); if (ed) ed.onclick = () => editInstructions(a);
    const rn = $('#rnew', el); if (rn) rn.onclick = () => editRoutine(a, null);
    el.querySelectorAll('[data-redit]').forEach((b) => b.onclick = () => editRoutine(a, routines.find((r) => r.id === b.dataset.redit)));
    el.querySelectorAll('[data-ren]').forEach((b) => b.onchange = async (e) => {
      try { await q(live.sb.from('agent_routines').update({ enabled: e.target.checked }).eq('id', b.dataset.ren).select('id')); toast(e.target.checked ? 'Routine on' : 'Routine off'); } catch (x) { toast(x.message); }
      await loadThread(); draw();
    });
    el.querySelectorAll('[data-rdel]').forEach((b) => b.onclick = () => modal({ title: 'Delete routine', body: '<p class="small">Drafts it already made stay in Approvals.</p>',
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-danger solid" data-ok>Delete</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => { try { await q(live.sb.from('agent_routines').delete().eq('id', b.dataset.rdel).select('id')); close(); await loadThread(); draw(); } catch (x) { toast(x.message); } }; } }));
    el.querySelectorAll('[data-rrun]').forEach((b) => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Running...';
      try { const r = await api('studio', { body: { action: 'routine_run', id: b.dataset.rrun } }); toast(`${r.drafts} draft${r.drafts === 1 ? '' : 's'} saved to Approvals`); ctx.refreshNav(); }
      catch (x) { toast(x.message, { ms: 7000 }); }
      await loadThread(); draw();
    });
    const nt = $('#newt', el); if (nt) nt.onclick = () => { thread = null; msgs = []; draw(); };
    $('#asend', el).onclick = send;
    const ad = $('#adata', el); if (ad) ad.onclick = async () => { const block = await attachData(); if (!block) return; const m = $('#amsg', el); m.value = (m.value.trim() ? m.value.trim() + '\n\n' : '') + block + '\n\n'; m.rows = 6; m.focus(); };
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

  function editRoutine(a, r) {
    const p = PRESETS[a.slug] || ['weekly', '', ''];
    const v = r || { cadence: p[0], title: p[1], prompt: p[2], weekday: 1, day_of_month: 1, language: 'en', enabled: true };
    modal({ title: r ? 'Edit routine' : `New routine for ${a.name}`, sub: 'Each run saves drafts to Approvals. Nothing is published, posted or sent.', wide: true,
      body: `<div class="stack"><div class="field"><label for="rt">Name</label><input class="input" id="rt" maxlength="80" value="${esc(v.title || '')}" placeholder="Weekly content plan"></div>
        <div class="row wrap"><div class="field"><label>How often</label><div class="seg" id="rc">${['daily', 'weekly', 'monthly'].map((c) => `<button data-c="${c}" class="${v.cadence === c ? 'active' : ''}">${c[0].toUpperCase() + c.slice(1)}</button>`).join('')}</div></div>
          <div class="field" id="rwd"><label for="rw">Day</label><select class="input" id="rw">${DAYS.map((d, i) => `<option value="${i}" ${(v.weekday ?? 1) === i ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
          <div class="field" id="rdm"><label for="rd">Day of month</label><select class="input" id="rd">${Array.from({ length: 28 }, (_, i) => `<option ${(v.day_of_month ?? 1) === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></div>
          <div class="field"><label>Language</label><div class="seg" id="rl"><button data-l="en" class="${v.language !== 'fr-qc' ? 'active' : ''}">English</button><button data-l="fr-qc" class="${v.language === 'fr-qc' ? 'active' : ''}">Français (QC)</button></div></div></div>
        <div class="field"><label for="rp">What should ${esc(a.name)} do each time?</label><textarea class="textarea" id="rp" style="min-height:140px" maxlength="4000">${esc(v.prompt || '')}</textarea>
          <div class="hint">Runs once a day around ${runTime()} your time. Brand DNA, the Brain and live numbers are added automatically.</div></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => {
        let cadence = v.cadence, language = v.language || 'en';
        const sync = () => { ov.querySelector('#rwd').style.display = cadence === 'weekly' ? '' : 'none'; ov.querySelector('#rdm').style.display = cadence === 'monthly' ? '' : 'none'; };
        ov.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { cadence = b.dataset.c; ov.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('active', x === b)); sync(); });
        ov.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => { language = b.dataset.l; ov.querySelectorAll('[data-l]').forEach((x) => x.classList.toggle('active', x === b)); });
        sync();
        ov.querySelector('[data-ok]').onclick = async () => {
          const row = { title: ov.querySelector('#rt').value.trim() || null, cadence, language, prompt: ov.querySelector('#rp').value.trim(),
            weekday: cadence === 'weekly' ? +ov.querySelector('#rw').value : null, day_of_month: cadence === 'monthly' ? +ov.querySelector('#rd').value : null };
          if (!row.prompt) return toast('Write what the routine should do');
          try {
            if (r) await q(live.sb.from('agent_routines').update(row).eq('id', r.id).select('id'));
            else await q(live.sb.from('agent_routines').insert({ ...row, owner_id: live.ownerId, agent_id: a.id, enabled: true }).select('id'));
            close(); toast(r ? 'Routine saved' : 'Routine added'); await loadThread(); draw();
          } catch (e) { toast(e.message); }
        };
      } });
  }

  el.innerHTML = '<div class="empty">Loading your team...</div>';
  try { await loadAgents(); await loadThread(); draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load AI Team</h2><p class="mono">${esc(e.message)}</p></div>`; }
}
