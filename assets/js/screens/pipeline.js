import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, drawer, confirmWrite, money, toggleHtml, $ } from '../ui.js';
import { pipelineStages, opportunities } from '../data.js';

let q = '';
let allowBack = false;
const WARN = 'HighLevel automations may trigger on this move (stage changes, tags or new contacts).';

export function render(el) {
  const draw = () => {
    const match = (o) => !q || `${o.name} ${o.company} ${o.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase());
    const n = (fn) => opportunities.filter(fn).length;
    const sum = [
      ['New leads', n((o) => o.stage <= 2)], ['Qualified', n((o) => o.stage === 4)], ['Appointments', n((o) => o.stage === 5 || o.stage === 6)],
      ['Active', n((o) => o.stage < 8)], ['Won', n((o) => o.stage === 8)], ['Lost', n((o) => o.stage === 9)],
    ];
    el.innerHTML = `
      ${head(t('pipe.title'), t('pipe.sub'), `<button class="btn btn-primary" id="newc">${icon('plus')} ${t('pipe.newContact')}</button>`)}
      <div class="grid g6" style="margin-bottom:14px">${sum.map(([l, v]) => `<div class="card tight stat"><div class="label">${l}</div><div class="value" style="font-size:22px">${v}</div></div>`).join('')}</div>
      <div class="notice warn" style="margin-bottom:12px">${icon('alert')}<span>${t('pipe.warn')} Conversations are never read or shown here.</span></div>
      <div class="row wrap between" style="margin-bottom:12px">
        <input class="input" id="pq" placeholder="${t('c.search')} name, company or tag" value="${esc(q)}" style="max-width:320px">
        <div class="row small"><span class="muted">Agency Pipeline · sample stages</span><label class="row">Allow backward moves ${toggleHtml(allowBack, 'id="back"')}</label></div>
      </div>
      <div class="kanban">${pipelineStages.map((s, i) => { const items = opportunities.filter((o) => o.stage === i && match(o));
        const total = items.reduce((a, o) => a + o.value, 0);
        return `<div class="kcol" data-col="${i}"><div class="kcol-head"><span>${esc(s)}</span><span class="chip">${items.length}</span></div><div class="xs muted" style="padding:0 4px 8px">${money(total)}/mo</div>
        ${items.map((o) => `<div class="kcard" draggable="true" data-op="${o.id}"><div class="t">${esc(o.name)}</div><div class="xs muted">${esc(o.company)}</div>
          <div class="row between xs" style="margin-top:6px"><span>${money(o.value)}/mo</span><span class="faint">${esc(o.added)}</span></div>
          <div class="row wrap" style="gap:4px;margin-top:6px">${o.tags.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>`).join('')}</div>`; }).join('')}</div>`;
    const pq = $('#pq', el);
    pq.oninput = () => { q = pq.value; draw(); const p2 = $('#pq', el); p2.focus(); p2.setSelectionRange(q.length, q.length); };
    $('#back', el).onchange = (e) => { allowBack = e.target.checked; };
    $('#newc', el).onclick = newContact;
    let dragId = null;
    el.querySelectorAll('[data-op]').forEach((c) => { c.ondragstart = () => { dragId = c.dataset.op; }; c.onclick = () => openOp(opportunities.find((o) => o.id === c.dataset.op)); });
    el.querySelectorAll('[data-col]').forEach((col) => {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add('drop'); };
      col.ondragleave = () => col.classList.remove('drop');
      col.ondrop = () => { col.classList.remove('drop'); const o = opportunities.find((x) => x.id === dragId); if (o) move(o, +col.dataset.col); };
    });
  };

  const move = (o, to, after) => {
    if (to === o.stage) return;
    if (to < o.stage && !allowBack) return toast('Moves are forward-only. Turn on backward moves to allow this.');
    confirmWrite({ action: 'Pipeline move', target: `${o.name}: ${pipelineStages[o.stage]} → ${pipelineStages[to]}`,
      payload: { opportunityId: o.id, pipeline: 'Agency Pipeline', pipelineStageId: `(stage id for "${pipelineStages[to]}")` },
      warn: to < o.stage ? 'Backward move. ' + WARN : WARN,
      onConfirm: () => { o.stage = to; after && after(); draw(); } });
  };

  function openOp(o) {
    const d = drawer({ title: o.name, body: `<div class="stack small">
      <div><div class="eyebrow">Company</div>${esc(o.company)}</div>
      <div class="grid g2"><div><div class="eyebrow">Email</div>${esc(o.email)}</div><div><div class="eyebrow">Phone</div>${esc(o.phone)}</div></div>
      <div class="grid g2"><div><div class="eyebrow">Stage</div>${esc(pipelineStages[o.stage])}</div><div><div class="eyebrow">Value</div>${money(o.value)}/mo</div></div>
      <div><div class="eyebrow">Source</div>${esc(o.source)}</div>
      <div><div class="eyebrow">Tags</div><div class="row wrap" style="gap:4px;margin-top:4px">${o.tags.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>
      <div class="notice neutral xs">Read from HighLevel. Edit the contact in HighLevel. Conversations are not shown in the OS.</div></div>`,
      foot: o.stage < 9 ? `<button class="btn btn-primary hl-btn" id="fwd">${t('pipe.forward')}: ${esc(pipelineStages[o.stage + 1])}</button>` : '' });
    const f = d.el.querySelector('#fwd'); if (f) f.onclick = () => move(o, o.stage + 1, d.close);
  }

  function newContact() {
    modal({ title: t('pipe.newContact'), body: `<div class="stack"><div class="grid g2"><div class="field"><label>First name</label><input class="input" id="fn"></div><div class="field"><label>Last name</label><input class="input" id="ln"></div></div>
      <div class="field"><label>Email</label><input class="input" id="em" type="email"></div><div class="field"><label>Company</label><input class="input" id="co"></div>
      <div class="notice warn small">${icon('alert')}<span>Creating a contact needs your explicit approval on the next screen and can trigger HighLevel automations.</span></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>Review</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = () => {
        const v = (id) => ov.querySelector('#' + id).value.trim();
        const c = { firstName: v('fn'), lastName: v('ln'), email: v('em'), companyName: v('co') };
        close();
        confirmWrite({ action: 'Create contact', target: 'HighLevel Contacts', payload: c, warn: WARN,
          onConfirm: () => { opportunities.unshift({ id: 'p' + Date.now(), name: `${c.firstName} ${c.lastName}`.trim() || 'New contact', company: c.companyName, stage: 0, value: 0, source: 'Added in OS', tags: [], email: c.email, phone: '', added: 'Just now' }); draw(); } });
      }; } });
  }
  draw();
}
