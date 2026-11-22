// Home with real numbers: HighLevel pipeline, Meta Ads, Approvals and production.
import { t } from '../i18n.js';
import { head, icon, esc, money } from '../ui.js';
import { live, api, q } from '../live.js';

const delta = (now, prev, lowerIsBetter) => {
  if (prev == null || now == null) return '';
  const d = Math.round((now - prev) * 100) / 100;
  if (!d) return '<span class="delta">Same as last week</span>';
  const good = lowerIsBetter ? d < 0 : d > 0;
  return `<span class="delta ${good ? 'up' : 'down'}">${d > 0 ? '+' : ''}${Number.isInteger(d) ? d : d.toFixed(2)} vs last week</span>`;
};

export async function render(el) {
  el.innerHTML = '<div class="empty">Loading today...</div>';
  const settle = (p) => p.then((v) => ({ v }), (e) => ({ e: e.message }));
  const [hl, meta, pending, content, agents, cal, rev] = await Promise.all([
    settle(api('hl', { body: { action: 'board' } })),
    settle(api('meta', { body: { range: 'last_7d' } })),
    settle(q(live.sb.from('approvals').select('id, title, type, source_agent, language, created_at').eq('status', 'pending').is('trashed_at', null).order('created_at', { ascending: false }).limit(5))),
    settle(q(live.sb.from('content_items').select('id, title, format, stage, publish_date').neq('stage', 'Uploaded').order('created_at', { ascending: false }).limit(8))),
    settle(q(live.sb.from('approvals').select('source_agent, created_at').gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString()))),
    settle(api('google', { body: { action: 'calendar', days: 2 } })),
    settle(api('studio', { body: { action: 'revenue' } })),
  ]);
  const evTime = (e) => (e.all_day ? 'All day' : new Date(e.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  const today = new Date().toDateString();
  const evs = (cal.v?.events || []).filter((e) => new Date(e.all_day ? e.start + 'T12:00' : e.start).toDateString() === today || new Date(e.start) > new Date());
  const r = rev.v?.summary, rc = r?.currencies?.[0];
  const calCard = cal.e && /not connected|Connections first/i.test(cal.e) ? '' : `<div class="card" id="todaycal"><div class="card-head"><h3>Today and tomorrow</h3><span class="source-tag">Google Calendar</span></div>
    ${cal.e ? `<p class="small down">${esc(cal.e)}</p>` : evs.length ? evs.slice(0, 6).map((e) => `<div class="row small" style="margin-bottom:6px"><span class="muted" style="width:72px">${evTime(e)}</span><span class="grow">${esc(e.title)}</span>${e.meet ? '<span class="chip">Meet</span>' : ''}</div>`).join('') : '<p class="small muted">Nothing scheduled.</p>'}</div>`;
  const revCard = !rc ? '' : `<div class="card" id="homerev"><div class="card-head"><h3>Revenue</h3><a class="btn btn-sm btn-ghost" href="#revenue">${icon('arrow')}</a></div>
    ${r.currencies.map((c) => `<div class="row between small" style="margin-bottom:6px"><span>${c} this month</span><b>${r.this_month[c].toLocaleString('en-US')}</b></div><div class="row between xs muted" style="margin-bottom:8px"><span>Last month ${r.last_month[c].toLocaleString('en-US')}</span><span>MRR ${r.mrr[c].toLocaleString('en-US')}</span></div>`).join('')}</div>`;
  const s = hl.v?.stats, m = meta.v;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const tile = (label, value, sub, source, err) => `<div class="card stat"><div class="label">${label}</div><div class="value">${err ? '<span class="small muted">Not connected</span>' : value}</div>
    <div class="row between">${err ? `<a class="xs" href="#connections">Connect</a>` : sub || '<span></span>'}<span class="source-tag">${source}</span></div></div>`;
  const agentCounts = {};
  (agents.v || []).forEach((a) => { agentCounts[a.source_agent || 'AI'] = (agentCounts[a.source_agent || 'AI'] || 0) + 1; });

  el.innerHTML = `
    ${head(`${greet}, Jasinthan`, t('home.sub'), `<a class="btn" href="#chat">${icon('chat')} ${t('nav.chat')}</a><a class="btn btn-primary" href="#approvals">${icon('inbox')} ${t('nav.approvals')} (${pending.v?.length ?? 0})</a>`, new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}
    <div class="grid g4" style="margin-bottom:16px">
      ${tile('New leads (7 days)', s?.newLeads7d, '', 'HighLevel', hl.e)}
      ${tile('Appointments in pipeline', s?.appointments, '', 'HighLevel', hl.e)}
      ${tile('Cost per lead (7 days)', m?.cpl != null ? '$' + m.cpl.toFixed(2) : (m ? '<span class="small muted">No leads</span>' : ''), m ? delta(m.cpl, m.previous?.cpl, true) : '', 'Meta Ads', meta.e)}
      ${tile('Meta leads (7 days)', m?.leads, m ? delta(m.leads, m.previous?.leads) : '', 'Meta Ads', meta.e)}
    </div>
    ${hl.e && !/Add your HighLevel|Add your .*key/i.test(hl.e) ? `<div class="notice warn small" style="margin-bottom:12px">${icon('alert')}<span>HighLevel: ${esc(hl.e)}</span></div>` : ''}
    ${meta.e && !/Add your Meta|Add your .*key/i.test(meta.e) ? `<div class="notice warn small" style="margin-bottom:12px">${icon('alert')}<span>Meta Ads: ${esc(meta.e)}</span></div>` : ''}
    <div class="split">
      <div class="stack">
        <div class="card"><div class="card-head"><h3>${t('home.waiting')}</h3><a class="btn btn-sm btn-ghost" href="#approvals">${icon('arrow')}</a></div>
          ${pending.v?.length ? `<div class="list" style="border:0">${pending.v.map((a) => `<a class="list-item clickable" href="#approvals" style="text-decoration:none;padding-left:0;padding-right:0"><div class="grow"><div style="font-weight:600">${esc(a.title)}</div><div class="xs muted">${esc(a.source_agent || 'AI')}</div></div><span class="chip">${esc(a.type)}</span>${a.language === 'fr-qc' ? '<span class="chip info">FR-QC</span>' : ''}</a>`).join('')}</div>` : '<p class="small muted">Nothing waiting. Ask the Content Strategist for ideas.</p>'}</div>
        ${m?.campaigns?.length ? `<div class="card"><div class="card-head"><h3>Meta campaigns (7 days)</h3><span class="source-tag">Meta Ads</span></div><div class="table-wrap" style="border:0"><table class="table"><thead><tr><th>Campaign</th><th style="text-align:right">Spend</th><th style="text-align:right">Leads</th><th style="text-align:right">CPL</th></tr></thead><tbody>
          ${m.campaigns.slice(0, 6).map((c) => `<tr><td>${esc(c.name)}</td><td style="text-align:right">$${c.spend.toFixed(2)}</td><td style="text-align:right">${c.leads}</td><td style="text-align:right">${c.cpl != null ? '$' + c.cpl.toFixed(2) : '·'}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
        <div class="card"><div class="card-head"><h3>${t('home.production')}</h3><a class="btn btn-sm btn-ghost" href="#content">${icon('arrow')}</a></div>
          ${content.v?.length ? content.v.map((c) => `<div class="row between small" style="margin-bottom:8px"><span style="font-weight:600">${esc(c.title)}</span><span class="row"><span class="muted xs">${esc(c.format)}</span><span class="chip">${esc(c.stage)}</span></span></div>`).join('') : '<p class="small muted">Approved content drafts show up here.</p>'}</div>
      </div>
      <div class="stack">
        ${calCard}${revCard}
        <div class="card"><h3 style="margin-bottom:10px">Pipeline</h3>${s ? [['Active', s.active], ['Qualified', s.qualified], ['Won', s.won], ['Lost', s.lost]].map(([l, v]) => `<div class="row between small" style="margin-bottom:6px"><span>${l}</span><b>${v}</b></div>`).join('') + `<div class="row between small"><span>Open value</span><b>${money(s.openValue)}</b></div>` : '<p class="small muted">Connect HighLevel to see your pipeline.</p>'}
          <a class="btn btn-sm" href="#pipeline" style="margin-top:10px">${t('nav.pipeline')}</a></div>
        <div class="card"><h3 style="margin-bottom:10px">${t('home.agents')} (7 days)</h3>${Object.keys(agentCounts).length ? Object.entries(agentCounts).map(([n, c]) => `<div class="row" style="margin-bottom:8px"><div class="avatar ai">${esc(n.split(' ').map((w) => w[0]).join('').slice(0, 2))}</div><div class="grow small"><b>${esc(n)}</b><div class="xs muted">${c} draft${c > 1 ? 's' : ''}</div></div></div>`).join('') : '<p class="small muted">No drafts this week.</p>'}
          <a class="btn btn-sm" href="#team">${t('nav.team')}</a></div>
        <div class="card soft small"><b>${t('home.goals')}</b><p class="muted" style="margin:4px 0 8px">Targets sync from HighLevel, Meta Ads and Content.</p><a class="btn btn-sm" href="#goals">${t('nav.goals')}</a></div>
      </div>
    </div>`;
}
