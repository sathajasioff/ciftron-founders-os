// Live HighLevel pipeline board. HighLevel stays the system of record; every change is confirmed and logged.
import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, drawer, money, toggleHtml, $ } from '../ui.js';
import { api } from '../live.js';
import { hlWrite } from '../hl-ui.js';

const ui = { pipelineId: null, q: '', allowBack: false };
const date = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

export async function render(el) {
  let B = null;
  const load = async () => {
    B = await api('hl', { body: { action: 'board', pipelineId: ui.pipelineId } });
    ui.pipelineId = B.pipeline?.id || null;
  };

  const draw = () => {
    if (!B.pipeline) { el.innerHTML = `${head(t('pipe.title'), t('pipe.sub'))}<div class="empty card soft">No pipelines found in this HighLevel sub-account.</div>`; return; }
    const term = ui.q.toLowerCase();
    const match = (o) => !term || [o.name, o.contact?.name, o.contact?.companyName, o.contact?.email, ...(o.contact?.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(term);
    const s = B.stats;
    el.innerHTML = `
      ${head(t('pipe.title'), t('pipe.sub'), `<button class="btn" id="reload">${icon('refresh')}</button><button class="btn btn-primary" id="newc">${icon('plus')} ${t('pipe.newContact')}</button>`)}
      <div class="grid g6" style="margin-bottom:14px">${[['New leads (7 days)', s.newLeads7d], ['Qualified', s.qualified], ['Appointments', s.appointments], ['Active', s.active], ['Won', s.won], ['Lost', s.lost]].map(([l, v]) => `<div class="card tight stat"><div class="label">${l}</div><div class="value" style="font-size:22px">${v}</div></div>`).join('')}</div>
      <div class="notice warn" style="margin-bottom:12px">${icon('alert')}<span>${t('pipe.warn')} Conversations are never read or shown here.</span></div>
      <div class="row wrap between" style="margin-bottom:12px">
        <div class="row wrap"><select class="select" id="pp" style="width:auto">${B.pipelines.map((p) => `<option value="${p.id}" ${p.id === B.pipeline.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
          <input class="input" id="pq" placeholder="${t('c.search')} name, company, email or tag" value="${esc(ui.q)}" style="max-width:300px"></div>
        <div class="row small"><span class="muted">${s.total} opportunities${B.truncated ? ' (first 500)' : ''} · ${money(s.openValue)} open</span><label class="row">Allow backward moves ${toggleHtml(ui.allowBack, 'id="back"')}</label></div>
      </div>
      <div class="kanban">${B.stages.map((st) => { const items = B.opportunities.filter((o) => o.pipelineStageId === st.id && match(o));
        return `<div class="kcol" data-col="${st.id}"><div class="kcol-head"><span>${esc(st.name)}</span><span class="chip">${items.length}</span></div>
          <div class="xs muted" style="padding:0 4px 8px">${money(items.reduce((a, o) => a + (Number(o.monetaryValue) || 0), 0))}</div>
          ${items.map((o) => `<div class="kcard" draggable="true" data-op="${o.id}"><div class="t">${esc(o.contact?.name || o.name)}</div>${o.contact?.companyName ? `<div class="xs muted">${esc(o.contact.companyName)}</div>` : ''}
            <div class="row between xs" style="margin-top:6px"><span>${o.monetaryValue ? money(o.monetaryValue) : ''}</span><span class="faint">${date(o.createdAt)}</span></div>
            ${o.status !== 'open' ? `<span class="chip ${o.status === 'won' ? 'ok' : 'danger'}" style="margin-top:6px">${o.status}</span>` : ''}
            ${o.contact?.tags?.length ? `<div class="row wrap" style="gap:4px;margin-top:6px">${o.contact.tags.slice(0, 3).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}</div>`).join('')}</div>`; }).join('')}</div>`;
    $('#reload', el).onclick = refresh;
    $('#pp', el).onchange = (e) => { ui.pipelineId = e.target.value; refresh(); };
    const pq = $('#pq', el); pq.oninput = () => { ui.q = pq.value; draw(); const p2 = $('#pq', el); p2.focus(); p2.setSelectionRange(ui.q.length, ui.q.length); };
    $('#back', el).onchange = (e) => { ui.allowBack = e.target.checked; };
    $('#newc', el).onclick = newContact;
    let dragId = null;
    el.querySelectorAll('[data-op]').forEach((c) => { c.ondragstart = () => { dragId = c.dataset.op; }; c.onclick = () => openOp(B.opportunities.find((o) => o.id === c.dataset.op)); });
    el.querySelectorAll('[data-col]').forEach((col) => {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add('drop'); };
      col.ondragleave = () => col.classList.remove('drop');
      col.ondrop = () => { col.classList.remove('drop'); const o = B.opportunities.find((x) => x.id === dragId); if (o) move(o, col.dataset.col); };
    });
  };
  const refresh = async () => { el.querySelector('.kanban')?.classList.add('faint'); try { await load(); draw(); } catch (e) { toast(e.message, { ms: 7000 }); } };

  function move(o, toStageId, after) {
    if (o.pipelineStageId === toStageId) return;
    const idx = (id) => B.stages.findIndex((s) => s.id === id);
    if (idx(toStageId) < idx(o.pipelineStageId) && !ui.allowBack) return toast('Moves are forward-only. Turn on backward moves to allow this.');
    hlWrite('move', { opportunityId: o.id, pipelineId: B.pipeline.id, fromStageId: o.pipelineStageId, toStageId, allowBackward: ui.allowBack, name: o.contact?.name || o.name }, {
      onDone: () => { o.pipelineStageId = toStageId; after && after(); draw(); },
    });
  }

  async function openOp(o) {
    const stageIdx = B.stages.findIndex((s) => s.id === o.pipelineStageId);
    const next = B.stages[stageIdx + 1];
    const d = drawer({ title: o.contact?.name || o.name, body: '<div class="small muted">Loading contact...</div>',
      foot: next ? `<button class="btn btn-primary hl-btn" id="fwd">${t('pipe.forward')}: ${esc(next.name)}</button>` : '' });
    const f = d.el.querySelector('#fwd'); if (f) f.onclick = () => move(o, next.id, d.close);
    let c = o.contact || {};
    if (o.contact?.id) { try { c = { ...c, ...(await api('hl', { body: { action: 'contact', contactId: o.contact.id } })).contact }; } catch (e) { toast(e.message); } }
    d.el.querySelector('.modal-body').innerHTML = `<div class="stack small">
      <div><div class="eyebrow">Opportunity</div>${esc(o.name)}</div>
      <div class="grid g2"><div><div class="eyebrow">Stage</div>${esc(B.stages[stageIdx]?.name || '')}</div><div><div class="eyebrow">Value</div>${o.monetaryValue ? money(o.monetaryValue) : 'Not set'}</div></div>
      <div class="grid g2"><div><div class="eyebrow">Status</div>${esc(o.status)}</div><div><div class="eyebrow">Added</div>${date(o.createdAt)}</div></div>
      ${c.companyName ? `<div><div class="eyebrow">Company</div>${esc(c.companyName)}</div>` : ''}
      <div class="grid g2"><div><div class="eyebrow">Email</div>${esc(c.email || '·')}</div><div><div class="eyebrow">Phone</div>${esc(c.phone || '·')}</div></div>
      ${c.source || o.source ? `<div><div class="eyebrow">Source</div>${esc(c.source || o.source)}</div>` : ''}
      ${[c.city, c.state, c.country].filter(Boolean).length ? `<div><div class="eyebrow">Location</div>${esc([c.city, c.state, c.country].filter(Boolean).join(', '))}</div>` : ''}
      ${c.tags?.length ? `<div><div class="eyebrow">Tags</div><div class="row wrap" style="gap:4px;margin-top:4px">${c.tags.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>` : ''}
      <div class="notice neutral xs">Read from HighLevel. Edit the contact in HighLevel. Conversations are not shown in the OS.</div></div>`;
  }

  function newContact() {
    modal({ title: t('pipe.newContact'), body: `<div class="stack"><div class="grid g2"><div class="field"><label>First name</label><input class="input" id="fn"></div><div class="field"><label>Last name</label><input class="input" id="ln"></div></div>
      <div class="grid g2"><div class="field"><label>Email</label><input class="input" id="em" type="email"></div><div class="field"><label>Phone</label><input class="input" id="ph" type="tel"></div></div>
      <div class="field"><label>Company</label><input class="input" id="co"></div>
      <div class="field"><label>Tags (comma separated)</label><input class="input" id="tg"></div>
      <div class="notice warn small">${icon('alert')}<span>The next screen shows exactly what is sent. Creating a contact can trigger HighLevel automations.</span></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>Review</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = () => {
        const v = (id) => ov.querySelector('#' + id).value.trim();
        const input = { firstName: v('fn'), lastName: v('ln'), email: v('em'), phone: v('ph'), companyName: v('co'), tags: v('tg').split(',').map((x) => x.trim()).filter(Boolean) };
        close(); hlWrite('contact', input, { onDone: () => toast('Contact created. Add it to the pipeline in HighLevel, or wait for your automation.', { ms: 6000 }) });
      }; } });
  }

  el.innerHTML = '<div class="empty">Loading your HighLevel pipeline...</div>';
  try { await load(); draw(); }
  catch (e) {
    el.innerHTML = `${head(t('pipe.title'), t('pipe.sub'))}<div class="empty card soft"><h3 style="margin-bottom:6px">Could not load HighLevel</h3><p class="small">${esc(e.message)}</p>
      <a class="btn btn-sm" href="#connections" style="margin-top:8px">Open Connections</a></div>`;
  }
}
