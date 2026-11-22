import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, confirmWrite, $ } from '../ui.js';
import { emailTemplates, sampleSequence, offers } from '../data.js';

let sel = 'reminder';
let open = 1;

export function render(el, ctx = {}) {
  if (ctx.live) return import('./emails-live.js').then((m) => m.render(el, ctx));
  const draw = () => {
    const tpl = emailTemplates.find((x) => x.id === sel);
    el.innerHTML = `
      ${head(t('emails.title'), t('emails.sub'), `<button class="btn btn-primary" id="gen">${icon('sparkle')} ${t('emails.generate')}</button>`)}
      <div class="grid g4" style="margin-bottom:18px">${emailTemplates.map((x) => `<button class="card tight ${x.id === sel ? '' : 'flat'}" data-t="${x.id}" style="text-align:left;cursor:pointer;${x.id === sel ? 'border-color:var(--text)' : ''}">
        <div class="row between"><b>${esc(x.name)}</b><span class="chip">${x.count}</span></div><div class="xs muted" style="margin-top:4px">${esc(x.desc)}</div></button>`).join('')}</div>
      <div class="split">
        <div class="stack">${sampleSequence.map((e) => `<div class="card ${e.n === open ? '' : 'tight flat'}">
          <div class="row between" data-open="${e.n}" style="cursor:pointer"><div class="row"><span class="chip">${e.n}</span><b>${esc(e.subject)}</b></div><span class="xs muted">${esc(e.day)}</span></div>
          ${e.n === open ? `<textarea class="textarea" style="margin-top:12px;min-height:200px" data-body="${e.n}">${esc(e.body)}</textarea>
          <div class="row" style="margin-top:10px"><button class="btn btn-sm" data-copy="${e.n}">${icon('download')} ${t('c.copy')}</button><button class="btn btn-sm" data-rw="${e.n}">${icon('refresh')} ${t('c.rewrite')}</button>
          <button class="btn btn-sm btn-ghost hl-btn" data-hl="${e.n}" style="margin-left:auto">Send as HighLevel template</button></div>` : ''}</div>`).join('')}</div>
        <div class="card soft small stack"><h3>${esc(tpl.name)} sequence</h3><p class="muted">Placeholders stay in plain words so HighLevel merge fields can replace them.</p>
          <div>${['NAME', 'OFFER NAME', 'CALL TIME', 'RESCHEDULE LINK', 'MEETING LINK', 'SUMMARY'].map((p) => `<span class="chip outline" style="margin:0 4px 6px 0">${p}</span>`).join('')}</div>
          <div class="notice neutral xs">HighLevel sends. The OS only drafts and can save templates to HighLevel after you confirm.</div></div>
      </div>`;
    el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { sel = b.dataset.t; draw(); });
    el.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { open = +b.dataset.open; draw(); });
    el.querySelectorAll('[data-body]').forEach((b) => b.oninput = () => { sampleSequence.find((e) => e.n === +b.dataset.body).body = b.value; });
    el.querySelectorAll('[data-copy]').forEach((b) => b.onclick = async () => { const e = sampleSequence.find((x) => x.n === +b.dataset.copy); try { await navigator.clipboard.writeText(`Subject: ${e.subject}\n\n${e.body}`); toast('Copied'); } catch (_) { toast('Copy blocked by the browser'); } });
    el.querySelectorAll('[data-rw]').forEach((b) => b.onclick = () => toast('Rewrite goes to Approvals as a new version. Your text stays.'));
    el.querySelectorAll('[data-hl]').forEach((b) => b.onclick = () => { const e = sampleSequence.find((x) => x.n === +b.dataset.hl);
      confirmWrite({ action: 'Email template', target: 'HighLevel Email Templates', payload: { name: `OS · ${e.subject}`, subject: e.subject, body: e.body } }); });
    $('#gen', el).onclick = () => modal({ title: t('emails.generate'), body: `<div class="stack"><div class="field"><label>Offer</label><select class="select">${offers.map((o) => `<option>${esc(o.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Sequence type</label><select class="select">${emailTemplates.map((x) => `<option>${x.name}</option>`).join('')}</select></div>
      <div class="field"><label>${t('c.language')}</label><div class="seg"><button class="active">English</button><button>Quebec French</button></div></div>
      <p class="xs muted">Uses Brand DNA. The draft lands in Approvals.</p></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-close>${t('emails.generate')}</button>`,
      onMount: (ov) => ov.querySelector('.btn-primary').addEventListener('click', () => toast('Sequence draft sent to Approvals (demo)')) });
  };
  draw();
}
