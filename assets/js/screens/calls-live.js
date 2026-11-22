// Calls: import Google Meet transcripts, upload or paste one, get an AI review, feed the Brain and the playbook.
import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, $ } from '../ui.js';
import { live, api, q, versionedUpdate } from '../live.js';

const KINDS = { sales: 'Sales call', coaching: 'Coaching call', team: 'Team call', other: 'Other' };
const SRC = { google_meet: 'Google Meet', upload: 'Upload', paste: 'Pasted' };
const ui = { sel: null, kind: 'all' };
const day = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date');
const listHtml = (items) => (items?.length ? `<ul style="margin:6px 0 0;padding-left:18px">${items.map((x) => `<li class="small" style="margin:3px 0">${esc(x)}</li>`).join('')}</ul>` : '<p class="small muted">None</p>');

export async function render(el, ctx) {
  let calls = [];
  const load = async () => { calls = await q(live.sb.from('calls').select('id, title, kind, occurred_at, source, duration_min, speakers, status, analysis, error, brain_source_id, version, created_at').order('occurred_at', { ascending: false, nullsFirst: false }).limit(200)); };
  const refresh = async () => { await load(); draw(); };

  const draw = () => {
    const list = calls.filter((c) => ui.kind === 'all' || c.kind === ui.kind);
    const c = calls.find((x) => x.id === ui.sel) || list[0];
    el.innerHTML = `
      ${head(t('nav.calls'), 'Your sales and coaching calls. Review each one, then add it to the Brain so drafts learn how you talk and what clients ask.',
        `<button class="btn" id="paste">${icon('edit')} Paste</button><label class="btn">${icon('upload')} Upload<input type="file" id="upl" accept=".txt,.vtt,.srt,.md,.pdf,.docx" hidden></label><button class="btn btn-primary" id="meet">${icon('phone')} Import from Google Meet</button>`)}
      <div class="seg" style="margin-bottom:12px">${['all', ...Object.keys(KINDS)].map((k) => `<button data-k="${k}" class="${ui.kind === k ? 'active' : ''}">${k === 'all' ? 'All' : KINDS[k]}</button>`).join('')}</div>
      ${calls.length ? `<div class="split-l" style="grid-template-columns:300px minmax(0,1fr)">
        <div class="list">${list.map((x) => `<div class="list-item clickable ${x.id === c?.id ? 'selected' : ''}" data-call="${x.id}"><div class="grow small">
          <div style="font-weight:600">${esc(x.title)}</div><div class="xs muted">${day(x.occurred_at || x.created_at)} · ${KINDS[x.kind]}${x.duration_min ? ` · ${x.duration_min} min` : ''}</div></div>
          <span class="chip ${x.status === 'analyzed' ? 'ok' : x.status === 'error' ? 'danger' : ''}">${x.status === 'analyzed' ? 'Reviewed' : x.status === 'error' ? 'Failed' : 'New'}</span></div>`).join('') || '<div class="empty small">No calls of this kind</div>'}</div>
        <div id="detail"></div></div>`
        : `<div class="empty card soft"><h3 style="margin-bottom:6px">No calls yet</h3><p class="small">Import a Google Meet call that had transcription on, upload a transcript file, or paste one. Google Meet keeps transcripts for 30 days, so import calls soon after they end.</p></div>`}`;
    el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { ui.kind = b.dataset.k; draw(); });
    el.querySelectorAll('[data-call]').forEach((r) => r.onclick = () => { ui.sel = r.dataset.call; draw(); });
    $('#meet', el).onclick = importMeet;
    $('#paste', el).onclick = pasteCall;
    $('#upl', el).onchange = (e) => uploadCall(e.target.files[0]);
    if (c) detail($('#detail', el), c);
  };

  async function detail(box, c) {
    const a = c.analysis;
    box.innerHTML = `<div class="card stack">
      <div class="row between top"><div><h2>${esc(c.title)}</h2><div class="xs muted" style="margin-top:4px">${day(c.occurred_at || c.created_at)} · ${SRC[c.source]}${c.duration_min ? ` · ${c.duration_min} min` : ''}${c.speakers?.length ? ` · ${c.speakers.map(esc).join(', ')}` : ''}</div></div>
        <div class="row"><select class="select" id="ck" style="height:32px;width:auto">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="btn btn-sm btn-ghost" id="cdel" title="Delete call">${icon('trash')}</button></div></div>
      <div class="row wrap"><button class="btn btn-primary" id="crev">${icon('sparkle')} ${a ? 'Review again' : 'Review with AI'}</button>
        <button class="btn" id="cbrain" ${c.brain_source_id ? 'disabled' : ''}>${icon('brain')} ${c.brain_source_id ? 'In the Brain' : 'Add to Brain'}</button>
        ${a?.faq_candidates?.length ? `<button class="btn" id="cpb">${icon('chat')} Add ${a.faq_candidates.length} answers to Playbook</button>` : ''}</div>
      ${c.status === 'error' ? `<div class="notice warn small">${icon('alert')}<span>${esc(c.error || 'Review failed')}</span></div>` : ''}
      ${a ? `<div><div class="eyebrow">Summary</div><p class="small" style="margin:6px 0 0">${esc(a.summary)}</p><p class="small" style="margin:8px 0 0"><b>Outcome:</b> ${esc(a.outcome || '')}</p></div>
        <div class="grid g2">
          <div><div class="eyebrow">What went well</div>${listHtml(a.went_well)}</div>
          <div><div class="eyebrow">Improve next time</div>${listHtml(a.improve)}</div>
          <div><div class="eyebrow">Questions they asked</div>${listHtml(a.questions_asked)}</div>
          <div><div class="eyebrow">Next steps</div>${listHtml(a.next_steps)}</div></div>
        ${a.objections?.length ? `<div><div class="eyebrow">Objections</div><div class="table-wrap" style="border:0;margin-top:6px"><table class="table"><thead><tr><th>Objection</th><th>How you handled it</th><th>Better response</th></tr></thead><tbody>
          ${a.objections.map((o) => `<tr><td class="small">${esc(o.objection)}</td><td class="small">${esc(o.how_handled)}</td><td class="small">${esc(o.better_response)}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`
        : '<p class="small muted">Not reviewed yet. The review lists their questions and objections, what went well, what to say next time, and next steps.</p>'}
      <details><summary class="small" style="cursor:pointer;font-weight:600">Transcript</summary><div id="tx" class="small" style="white-space:pre-wrap;max-height:420px;overflow:auto;margin-top:8px">Loading...</div></details>
    </div>`;
    const det = box.querySelector('details');
    det.addEventListener('toggle', async () => {
      if (!det.open) return;
      const [row] = await q(live.sb.from('calls').select('transcript').eq('id', c.id)).catch(() => [{}]);
      box.querySelector('#tx').textContent = row?.transcript || '(empty)';
    }, { once: true });
    $('#ck', box).onchange = async (e) => { const r = await versionedUpdate('calls', c, { kind: e.target.value }).catch((x) => toast(x.message)); if (r?.conflict) toast('Changed elsewhere. Reloaded.'); refresh(); };
    $('#cdel', box).onclick = () => modal({ title: 'Delete this call', body: '<p class="small">The transcript and review are deleted. If you added it to the Brain, that source stays until you delete it there.</p>',
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-danger solid" data-ok>Delete</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => { try { await q(live.sb.from('calls').delete().eq('id', c.id)); close(); ui.sel = null; refresh(); } catch (x) { toast(x.message); } }; } });
    $('#crev', box).onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Reviewing...';
      try { await api('studio', { body: { action: 'call_analyze', id: c.id } }); toast('Review ready'); } catch (x) { toast(x.message, { ms: 7000 }); }
      refresh();
    };
    const cb = $('#cbrain', box);
    if (cb && !c.brain_source_id) cb.onclick = async () => {
      cb.disabled = true; cb.textContent = 'Adding...';
      try {
        const r = await api('studio', { body: { action: 'call_to_brain', id: c.id } });
        await api('brain', { body: { action: 'ingest', source_id: r.source_id } });
        api('brain', { body: { action: 'propose', source_id: r.source_id } }).catch(() => {});
        toast('Added to the Brain. Facts from it will appear in Brain to review.');
      } catch (x) { toast(x.message, { ms: 7000 }); }
      refresh();
    };
    const pb = $('#cpb', box);
    if (pb) pb.onclick = async () => {
      pb.disabled = true;
      try { const r = await api('studio', { body: { action: 'call_to_playbook', id: c.id } }); toast(r.proposed ? `${r.proposed} answer${r.proposed === 1 ? '' : 's'} sent to Brain → Playbook to review` : 'Those answers are already in the Playbook'); }
      catch (x) { toast(x.message); pb.disabled = false; }
    };
  }

  function importMeet() {
    modal({ title: 'Import from Google Meet', sub: 'Calls from the last 30 days that had transcription turned on.', wide: true,
      body: '<div id="mlist"><p class="small muted">Loading your calls from Google...</p></div>',
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok disabled>Import selected</button>`,
      onMount: async (ov, close) => {
        const box = ov.querySelector('#mlist'), ok = ov.querySelector('[data-ok]');
        let items = [];
        try { items = (await api('google', { body: { action: 'meet_list' } })).calls; }
        catch (x) { box.innerHTML = `<p class="small down">${esc(x.message)}</p>${/not connected|Connections first/i.test(x.message) ? '<p class="small">Connect Google in <a href="#connections">Connections and Settings</a> first.</p>' : ''}`; return; }
        if (!items.length) { box.innerHTML = '<p class="small muted">No calls with a transcript in the last 30 days. In Google Meet, turn on transcription during a call (Activities → Transcripts).</p>'; return; }
        box.innerHTML = `<div class="list">${items.map((m, i) => `<label class="list-item" style="cursor:pointer"><input type="checkbox" data-mi="${i}" ${m.imported ? 'disabled' : ''}>
          <div class="grow small"><div style="font-weight:600">${esc(m.title)}</div><div class="xs muted">${day(m.start)}${m.end ? ` · ${Math.max(1, Math.round((new Date(m.end) - new Date(m.start)) / 60000))} min` : ''}</div></div>
          ${m.imported ? '<span class="chip ok">Imported</span>' : `<select class="select" data-mk="${i}" style="height:30px;width:auto;flex:none">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>`}</label>`).join('')}</div>`;
        box.querySelectorAll('[data-mi]').forEach((cb) => cb.onchange = () => { ok.disabled = !box.querySelector('[data-mi]:checked'); });
        ok.onclick = async () => {
          ok.disabled = true; ok.textContent = 'Importing...';
          let n = 0;
          for (const cb of box.querySelectorAll('[data-mi]:checked')) {
            const m = items[+cb.dataset.mi];
            try { const r = await api('google', { body: { action: 'meet_import', record: m.record, transcript: m.transcript, title: m.title, start: m.start, kind: box.querySelector(`[data-mk="${cb.dataset.mi}"]`).value } }); if (r.call_id) { n++; ui.sel = r.call_id; } }
            catch (x) { toast(`${m.title}: ${x.message}`, { ms: 7000 }); }
          }
          close(); toast(`${n} call${n === 1 ? '' : 's'} imported`); refresh();
        };
      } });
  }

  function pasteCall() {
    modal({ title: 'Paste a transcript', wide: true,
      body: `<div class="stack"><div class="grid g3"><div class="field"><label>Title</label><input class="input" id="pt" placeholder="Discovery call with a mortgage broker"></div>
        <div class="field"><label>Kind</label><select class="select" id="pk">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>Date</label><input class="input" type="date" id="pd" value="${new Date().toISOString().slice(0, 10)}"></div></div>
        <div class="field"><label>Transcript</label><textarea class="textarea" id="px" style="min-height:260px" placeholder="Speaker: what they said..."></textarea></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        const transcript = ov.querySelector('#px').value.trim();
        if (transcript.length < 50) return toast('Paste the full transcript');
        const speakers = [...new Set(transcript.split('\n').map((l) => (l.match(/^([^:\n]{2,40}):/) || [])[1]).filter(Boolean))].slice(0, 12);
        try {
          const [r] = await q(live.sb.from('calls').insert({ owner_id: live.ownerId, title: ov.querySelector('#pt').value.trim() || 'Pasted call', kind: ov.querySelector('#pk').value,
            occurred_at: ov.querySelector('#pd').value ? new Date(ov.querySelector('#pd').value + 'T12:00').toISOString() : null, source: 'paste', transcript, speakers, authored_by: 'me' }).select('id'));
          ui.sel = r.id; close(); refresh();
        } catch (x) { toast(x.message); }
      }; } });
  }

  async function uploadCall(f) {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return toast('Files up to 20 MB');
    toast('Reading the transcript...');
    try {
      const path = `${live.ownerId}/calls/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, '_').slice(-100)}`;
      const { error } = await live.sb.storage.from('brain').upload(path, f, { contentType: f.type || 'application/octet-stream' });
      if (error) throw new Error(error.message);
      const r = await api('studio', { body: { action: 'call_from_file', path, name: f.name, mime: f.type, title: f.name.replace(/\.[^.]+$/, '') } });
      ui.sel = r.call_id; toast('Call added'); refresh();
    } catch (x) { toast(x.message, { ms: 7000 }); }
  }

  el.innerHTML = '<div class="empty">Loading calls...</div>';
  try { await load(); draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load calls</h2><p class="mono">${esc(e.message)}</p><p class="small">Run migration 009 in Supabase if you just updated.</p></div>`; }
}
