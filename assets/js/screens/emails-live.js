// Emails backed by Supabase: generate sequences from Brand DNA, edit, rewrite, copy, save as HighLevel templates.
import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, $ } from '../ui.js';
import { live, api, q, versionedUpdate } from '../live.js';
import { hlWrite } from '../hl-ui.js';

const TYPES = [['welcome', 'Welcome', 'First week after someone joins or buys.'], ['nurture', 'Nurture', 'Teach and build trust with new leads.'], ['cart', 'Abandoned cart', 'Reminders for people who left checkout.'],
  ['upsell', 'Upsell', 'Next offer after a purchase.'], ['reminder', 'Call reminders', 'Before and after a booked call.'], ['onboarding', 'Onboarding', 'Steps a new client needs to complete.'], ['launch', 'Launch', 'Announce, open, remind and close.']];
const ui = { sel: null, open: 0 };

export async function render(el, ctx) {
  let seqs = [], offers = [];
  const load = async () => {
    [seqs, offers] = await Promise.all([q(live.sb.from('email_sequences').select('*').order('created_at', { ascending: false })), q(live.sb.from('offers').select('id, name, price, currency, cadence').order('sort'))]);
    if (!seqs.find((s) => s.id === ui.sel)) ui.sel = seqs[0]?.id || null;
  };
  const refresh = async () => { await load(); draw(); };

  const draw = () => {
    const s = seqs.find((x) => x.id === ui.sel);
    el.innerHTML = `
      ${head(t('emails.title'), t('emails.sub'), `<button class="btn btn-primary" id="gen">${icon('sparkle')} ${t('emails.generate')}</button>`)}
      <div class="grid g4" style="margin-bottom:18px">${TYPES.map(([k, n, d]) => `<button class="card tight flat" data-gen="${k}" style="text-align:left;cursor:pointer"><div class="row between"><b>${n}</b>${icon('sparkle')}</div><div class="xs muted" style="margin-top:4px">${d}</div></button>`).join('')}</div>
      <div class="split-l">
        <div class="list">${seqs.map((x) => `<div class="list-item clickable ${x.id === ui.sel ? 'selected' : ''}" data-s="${x.id}"><div class="grow"><b class="small">${esc(x.name)}</b><div class="xs muted">${(x.emails || []).length} emails · ${esc(TYPES.find((tt) => tt[0] === x.sequence_type)?.[1] || x.sequence_type)}${x.language === 'fr-qc' ? ' · FR-QC' : ''}</div></div><span class="chip ${x.status === 'approved' ? 'ok' : 'warn'}">${x.status === 'approved' ? 'Approved' : 'In Approvals'}</span></div>`).join('') || '<div class="empty small">No sequences yet. Pick a template above.</div>'}</div>
        <div class="stack">${s ? sequenceHtml(s) : '<div class="empty card soft">Generate a sequence to start. It goes to Approvals first.</div>'}</div>
      </div>`;
    el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { ui.sel = b.dataset.s; ui.open = 0; draw(); });
    $('#gen', el).onclick = () => generate('nurture');
    el.querySelectorAll('[data-gen]').forEach((b) => b.onclick = () => generate(b.dataset.gen));
    if (!s) return;
    el.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { ui.open = +b.dataset.open; draw(); });
    const save = $('#esave', el); if (save) save.onclick = () => saveEmail(s);
    const cp = $('#ecopy', el); if (cp) cp.onclick = async () => { const e = s.emails[ui.open]; try { await navigator.clipboard.writeText(`Subject: ${e.subject}\n\n${e.body}`); toast('Copied'); } catch { toast('Copy blocked by the browser'); } };
    const rw = $('#erw', el); if (rw) rw.onclick = () => rewrite(s);
    const hl = $('#ehl', el); if (hl) hl.onclick = () => { const e = s.emails[ui.open]; hlWrite('email_template', { name: `${s.name} ${ui.open + 1}`, subject: e.subject, previewText: e.preview, body: e.body }); };
    $('#sdel', el).onclick = async () => { await q(live.sb.from('email_sequences').delete().eq('id', s.id)).catch((e) => toast(e.message)); toast('Sequence deleted'); refresh(); };
  };

  function sequenceHtml(s) {
    return `<div class="card row between wrap"><div><h2>${esc(s.name)}</h2><div class="small muted">${s.status === 'approved' ? 'Approved. You can save emails as HighLevel templates.' : 'Waiting in Approvals. You can edit it now.'}</div></div>
      <div class="row">${s.status !== 'approved' ? '<a class="btn btn-sm" href="#approvals">Open Approvals</a>' : ''}<button class="btn btn-sm btn-ghost" id="sdel">${icon('trash')}</button></div></div>
      ${(s.emails || []).map((e, i) => `<div class="card ${i === ui.open ? '' : 'tight flat'}">
        <div class="row between" data-open="${i}" style="cursor:pointer"><div class="row"><span class="chip">${i + 1}</span><b>${esc(e.subject)}</b></div><span class="xs muted">${esc(e.day || '')}</span></div>
        ${i === ui.open ? `<div class="stack" style="margin-top:12px"><div class="grid g2"><div class="field"><label>Subject</label><input class="input" id="esub" value="${esc(e.subject)}"></div><div class="field"><label>Preview text</label><input class="input" id="eprev" value="${esc(e.preview || '')}"></div></div>
          <textarea class="textarea" id="ebody" style="min-height:240px">${esc(e.body)}</textarea>
          <div class="row wrap"><button class="btn btn-sm btn-primary" id="esave">${t('c.save')}</button><button class="btn btn-sm" id="ecopy">${icon('download')} ${t('c.copy')}</button><button class="btn btn-sm" id="erw">${icon('refresh')} ${t('c.rewrite')}</button>
          ${s.status === 'approved' ? `<button class="btn btn-sm hl-btn" id="ehl" style="margin-left:auto">Save as HighLevel template</button>` : ''}</div></div>` : ''}</div>`).join('')}
      <div class="card soft small"><div class="eyebrow" style="margin-bottom:6px">Placeholders</div>${['NAME', 'OFFER NAME', 'CALL TIME', 'LINK'].map((p) => `<span class="chip outline" style="margin:0 4px 4px 0">${p}</span>`).join('')}<p class="xs muted" style="margin-top:6px">Swap them for HighLevel merge fields when you build the workflow. HighLevel sends; the OS only drafts.</p></div>`;
  }

  async function saveEmail(s, override) {
    const emails = [...s.emails];
    emails[ui.open] = override || { ...emails[ui.open], subject: $('#esub', el).value.trim(), preview: $('#eprev', el).value.trim(), body: $('#ebody', el).value };
    try { const r = await versionedUpdate('email_sequences', s, { emails, authored_by: 'me' }); if (r.conflict) toast('Changed elsewhere. Reloaded, your edit was not saved.'); else toast('Saved'); refresh(); } catch (e) { toast(e.message); }
  }

  function rewrite(s) {
    const e = s.emails[ui.open];
    modal({ title: 'Rewrite this email', sub: 'You see the new version first. Your text only changes if you choose it.', wide: true,
      body: `<div class="field"><label>How should it change?</label><input class="input" id="ri" placeholder="Example: shorter, warmer, add a P.S. with the booking link"></div><div id="rout" style="margin-top:12px"></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn" id="rgo">${icon('sparkle')} Rewrite</button><button class="btn btn-primary hidden" id="ruse">Use this version</button>`,
      onMount: (ov, close) => {
        let next = null;
        ov.querySelector('#rgo').onclick = async (ev) => { const __b = ev.currentTarget; 
          __b.disabled = true; ov.querySelector('#rout').innerHTML = '<span class="small muted">Writing...</span>';
          try {
            next = await api('studio', { body: { action: 'rewrite_email', subject: $('#esub', el).value, preview: $('#eprev', el).value, body: $('#ebody', el).value, instruction: ov.querySelector('#ri').value, language: s.language } });
            ov.querySelector('#rout').innerHTML = `<div class="grid g2"><div><div class="eyebrow">Yours</div><div class="preview-box small">${esc($('#ebody', el).value)}</div></div><div><div class="eyebrow">Rewrite · ${esc(next.subject)}</div><div class="preview-box small">${esc(next.body)}</div></div></div>`;
            ov.querySelector('#ruse').classList.remove('hidden');
          } catch (x) { ov.querySelector('#rout').innerHTML = ''; toast(x.message, { ms: 7000 }); }
          __b.disabled = false;
        };
        ov.querySelector('#ruse').onclick = () => { close(); saveEmail(s, { ...e, subject: next.subject, preview: next.preview || e.preview, body: next.body }); };
      } });
  }

  function generate(type) {
    modal({ title: t('emails.generate'), body: `<div class="stack">
      <div class="field"><label>Sequence</label><select class="select" id="gt">${TYPES.map(([k, n]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field"><label>Offer</label><select class="select" id="go"><option value="">No specific offer</option>${offers.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></div>
      <div class="field"><label>${t('c.language')}</label><select class="select" id="gl"><option value="en">English</option><option value="fr-qc">Quebec French</option></select></div>
      <div class="field"><label>Notes (optional)</label><textarea class="textarea" id="gn" placeholder="Example: the call is a free 15-minute Meta Ads review"></textarea></div>
      <p class="xs muted">Uses Brand DNA. The sequence lands in Approvals and appears here as a draft.</p></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${icon('sparkle')} ${t('emails.generate')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async (ev) => { const __b = ev.currentTarget; 
        __b.disabled = true; __b.textContent = 'Writing...';
        try { const r = await api('studio', { body: { action: 'email_sequence', type: ov.querySelector('#gt').value, offer_id: ov.querySelector('#go').value || null, language: ov.querySelector('#gl').value, notes: ov.querySelector('#gn').value } });
          close(); ui.sel = r.sequence_id; ui.open = 0; ctx.refreshNav(); toast('Sequence drafted and sent to Approvals'); refresh(); }
        catch (e) { toast(e.message, { ms: 7000 }); __b.disabled = false; __b.textContent = t('emails.generate'); }
      }; } });
  }

  el.innerHTML = '<div class="empty">Loading emails...</div>';
  try { await load(); draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load Emails</h2><p class="mono">${esc(e.message)}</p></div>`; }
}
