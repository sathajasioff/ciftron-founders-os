// Funnels backed by Supabase: editable brief, build, preview, versions via chat-style revisions, send to HighLevel.
import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, tabsHtml, marks, $ } from '../ui.js';
import { live, api, q, versionedUpdate } from '../live.js';
import { hlWrite } from '../hl-ui.js';

const TYPES = ['Lead generation funnel', 'Appointment booking funnel', 'Lead magnet funnel', 'Webinar funnel', 'Sales funnel'];
const ui = { sel: null, tab: 'brief', ver: null };

export function renderPage(out, orderUrl) {
  const e = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ph = (s) => e(s).replace(/\[(.+?)\]/g, '<span class="ph">[$1]</span>');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(out.headline)}</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&family=Space+Grotesk:wght@600&display=swap" rel="stylesheet">
  <style>*{box-sizing:border-box}body{margin:0;font-family:'DM Sans',sans-serif;background:#111;color:#F5F5F3;line-height:1.6}.w{max-width:780px;margin:0 auto;padding:64px 22px}
  h1{font-family:'Space Grotesk';font-size:clamp(30px,6vw,50px);line-height:1.08;margin:0 0 14px}h2{font-family:'Space Grotesk';font-size:24px;margin:44px 0 10px}p{color:#C9C9C6;font-size:17px}li{margin:8px 0;font-size:16.5px}
  .cta{display:inline-block;background:#C8F36B;color:#111;padding:14px 26px;border-radius:100px;font-weight:600;text-decoration:none;margin:18px 0}.ph{background:rgba(246,173,85,.2);color:#f6ad55;padding:1px 5px;border-radius:4px}
  .faq{border-top:1px solid #2B2B2B;padding:14px 0}.faq b{display:block;margin-bottom:4px}.k{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#C8F36B}</style></head>
  <body><main class="w"><h1>${ph(out.headline)}</h1><p>${ph(out.subheadline)}</p><a class="cta" href="${e(orderUrl || '#')}">${e(out.cta)}</a>
  ${out.sections.map((s) => `<h2>${ph(s.heading)}</h2><p>${ph(s.body)}</p>${s.bullets.length ? `<ul>${s.bullets.map((b) => `<li>${ph(b)}</li>`).join('')}</ul>` : ''}`).join('')}
  <a class="cta" href="${e(orderUrl || '#')}">${e(out.cta)}</a>
  ${out.faq.length ? `<h2>Questions</h2>${out.faq.map((f) => `<div class="faq"><b>${ph(f.q)}</b><span>${ph(f.a)}</span></div>`).join('')}` : ''}</main></body></html>`;
}

export async function render(el, ctx) {
  let funnels = [], versions = [], offers = [];
  const load = async () => {
    [funnels, offers] = await Promise.all([q(live.sb.from('funnels').select('*').order('updated_at', { ascending: false })), q(live.sb.from('offers').select('*').order('sort'))]);
    if (!funnels.find((f) => f.id === ui.sel)) ui.sel = funnels[0]?.id || null;
    versions = ui.sel ? await q(live.sb.from('funnel_versions').select('*').eq('funnel_id', ui.sel).order('version_no', { ascending: false })) : [];
    if (!versions.find((v) => v.id === ui.ver)) ui.ver = versions[0]?.id || null;
  };
  const refresh = async () => { await load(); draw(); };

  const draw = () => {
    const f = funnels.find((x) => x.id === ui.sel);
    const v = versions.find((x) => x.id === ui.ver);
    const offer = offers.find((o) => o.id === f?.offer_id);
    el.innerHTML = `
      ${head(t('funnels.title'), t('funnels.sub'), `<button class="btn btn-primary" id="newf">${icon('plus')} New funnel</button>`)}
      <div class="split-l">
        <div class="list">${funnels.map((x) => `<div class="list-item clickable ${x.id === ui.sel ? 'selected' : ''}" data-f="${x.id}"><div class="grow"><div style="font-weight:600" class="small">${esc(x.name)}</div><div class="xs muted">${esc(x.funnel_type)} · ${x.current_version ? 'v' + x.current_version : 'not built'}</div></div></div>`).join('') || '<div class="empty small">No funnels yet</div>'}</div>
        <div>${f ? `
          <div class="card" style="margin-bottom:14px"><div class="row between wrap"><div><h2>${esc(f.name)}</h2><div class="small muted">${esc(f.funnel_type)}${offer ? ' · ' + esc(offer.name) : ''}${v ? ` · viewing v${v.version_no} · ${v.status === 'approved' ? 'approved' : 'in Approvals'}` : ''}</div></div>
            <div class="row">${v ? `<button class="btn" id="prev">${icon('ext')} ${t('c.preview')}</button>` : ''}<button class="btn btn-primary hl-btn" id="send" ${v?.status === 'approved' ? '' : 'disabled title="Approve this version in Approvals first"'}>${t('funnels.sendHL')}</button></div></div></div>
          ${tabsHtml([['brief', 'Brief'], ['page', 'Sales page'], ['images', 'Image set'], ['emails', 'Buyer emails'], ['notes', 'HighLevel setup notes'], ['versions', `${t('c.versions')} (${versions.length})`]], ui.tab)}
          <div id="fpane"></div>` : '<div class="empty card soft">Create a funnel: pick an offer, fill the brief, press Build.</div>'}</div>
      </div>`;
    el.querySelectorAll('[data-f]').forEach((x) => x.onclick = async () => { ui.sel = x.dataset.f; ui.ver = null; ui.tab = 'brief'; await refresh(); });
    $('#newf', el).onclick = newFunnel;
    if (!f) return;
    el.querySelectorAll('[data-tab]').forEach((x) => x.onclick = () => { ui.tab = x.dataset.tab; draw(); });
    const pane = $('#fpane', el);
    const out = v?.output;
    const need = '<div class="empty card soft">Press Build on the Brief tab first.</div>';
    if (ui.tab === 'brief') {
      const b = f.brief || {};
      pane.innerHTML = `<div class="card stack">
        <div class="grid g2"><div class="field"><label>Offer</label><select class="select" id="bo"><option value="">None</option>${offers.map((o) => `<option value="${o.id}" ${o.id === f.offer_id ? 'selected' : ''}>${esc(o.name)}${o.price != null ? ` ($${Number(o.price)}/${o.cadence === 'one_time' ? 'once' : o.cadence})` : ''}</option>`).join('')}</select></div>
        <div class="field"><label>Funnel type</label><select class="select" id="bt">${TYPES.map((x) => `<option ${x === f.funnel_type ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
        ${[['audience', 'Audience'], ['promise', 'Main promise'], ['lead_magnet', 'Lead magnet or call offer'], ['objections', 'Objections to answer'], ['context', 'Extra context (paste anything)']].map(([k, l]) => `<div class="field"><label>${l}</label><textarea class="textarea" data-b="${k}" style="min-height:${k === 'context' ? 110 : 60}px">${esc(b[k] || '')}</textarea></div>`).join('')}
        <div class="field"><label>HighLevel order form or booking URL</label><input class="input" id="bu" placeholder="https://..." value="${esc(f.order_form_url || '')}"><div class="hint">Attached to every button on the page.</div></div>
        <div class="field"><label>Proof</label><textarea class="textarea" data-b="proof" placeholder="Leave empty unless you have real results or testimonials. AI never invents them.">${esc(b.proof || '')}</textarea></div>
        <div class="field"><label>${t('c.language')}</label><select class="select" data-b="language"><option value="English">English</option><option ${b.language === 'Quebec French' ? 'selected' : ''}>Quebec French</option></select></div>
        <div class="row"><button class="btn" id="bsave">${t('c.save')}</button><button class="btn btn-primary" id="build">${icon('sparkle')} ${f.current_version ? `Rebuild as v${f.current_version + 1}` : t('c.build')}</button><span class="xs muted">Builds copy, preview, image prompts, six buyer emails and setup notes. Goes to Approvals.</span></div></div>`;
      const brief = () => Object.fromEntries([...pane.querySelectorAll('[data-b]')].map((x) => [x.dataset.b, x.value.trim()]));
      const saveBrief = async () => { const r = await versionedUpdate('funnels', f, { brief: brief(), offer_id: $('#bo', pane).value || null, funnel_type: $('#bt', pane).value, order_form_url: $('#bu', pane).value.trim() || null }); if (r.conflict) throw new Error('Changed elsewhere. Reload and try again.'); Object.assign(f, r.row); };
      $('#bsave', pane).onclick = async () => { try { await saveBrief(); toast('Brief saved'); } catch (e) { toast(e.message); } };
      $('#build', pane).onclick = async (ev) => { const __b = ev.currentTarget;  __b.disabled = true; __b.textContent = 'Building... about 30 seconds';
        try { await saveBrief(); const r = await api('studio', { body: { action: 'funnel_build', funnel_id: f.id } }); ctx.refreshNav(); toast(`Built v${r.version_no}. It is in Approvals.`); ui.ver = null; ui.tab = 'page'; refresh(); }
        catch (e) { toast(e.message, { ms: 7000 }); __b.disabled = false; } };
    }
    if (ui.tab === 'page') pane.innerHTML = out ? `<div class="card stack"><div class="eyebrow">Headline</div><h2>${marks(out.headline)}</h2><p class="muted">${marks(out.subheadline)}</p>
      ${out.sections.map((s) => `<div><h3>${marks(s.heading)}</h3><p class="small">${marks(s.body)}</p>${s.bullets.length ? `<ul class="small">${s.bullets.map((b) => `<li>${marks(b)}</li>`).join('')}</ul>` : ''}</div>`).join('')}
      <div class="row"><span class="btn btn-accent">${esc(out.cta)}</span><span class="xs muted">${f.order_form_url ? 'Links to ' + esc(f.order_form_url) : '<span class="placeholder">[ORDER FORM URL missing]</span>'}</span></div>
      ${out.qualification_questions.length ? `<div><div class="eyebrow">Qualification questions</div><ul class="small">${out.qualification_questions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      <div class="divider"></div><div class="row"><input class="input grow" id="rev" placeholder="Ask for a revision, for example: shorter headline, more direct, add an FAQ about price"><button class="btn" id="revgo">${t('c.rewrite')}</button></div></div>` : need;
    if (ui.tab === 'images') pane.innerHTML = out ? `<div class="stack">${out.image_prompts.map((p, i) => `<div class="card"><div class="row between"><b>${['Hero image', 'Section image', 'Ad thumbnail'][i] || 'Image'}</b><a class="btn btn-sm" href="#graphics" data-imgp="${i}">${icon('image')} Make in Graphics</a></div><p class="small" style="margin-top:6px">${esc(p)}</p></div>`).join('')}</div>` : need;
    if (ui.tab === 'emails') pane.innerHTML = out ? `<div class="stack">${out.emails.map((m, i) => `<div class="card"><div class="row"><span class="chip">${i + 1}</span><b>${esc(m.subject)}</b></div><div class="xs muted" style="margin:4px 0 8px">${esc(m.preview)}</div><div class="preview-box small">${esc(m.body)}</div></div>`).join('')}</div>` : need;
    if (ui.tab === 'notes') pane.innerHTML = out ? `<div class="card small stack">${out.hl_setup_notes.map((n, i) => `<p><b>${i + 1}.</b> ${esc(n)}</p>`).join('')}</div>` : need;
    if (ui.tab === 'versions') pane.innerHTML = `<div class="list">${versions.map((x) => `<div class="list-item"><b>v${x.version_no}</b><div class="grow small muted">${esc(x.note || '')} · ${new Date(x.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div><span class="chip ${x.status === 'approved' ? 'ok' : 'warn'}">${x.status === 'approved' ? 'approved' : 'in Approvals'}</span><button class="btn btn-sm" data-ver="${x.id}" ${x.id === ui.ver ? 'disabled' : ''}>View</button></div>`).join('') || '<div class="empty">No versions yet</div>'}</div>`;
    pane.querySelectorAll('[data-ver]').forEach((b) => b.onclick = () => { ui.ver = b.dataset.ver; ui.tab = 'page'; draw(); });
    pane.querySelectorAll('[data-imgp]').forEach((b) => b.addEventListener('click', () => { try { sessionStorage.setItem('os.graphicNotes', out.image_prompts[+b.dataset.imgp]); } catch {} }));
    const rg = $('#revgo', pane); if (rg) rg.onclick = async (ev) => { const __b = ev.currentTarget;  const ins = $('#rev', pane).value.trim(); if (!ins) return; __b.disabled = true; __b.textContent = 'Revising...';
      try { const r = await api('studio', { body: { action: 'funnel_build', funnel_id: f.id, instruction: ins } }); ctx.refreshNav(); toast(`Saved as v${r.version_no}`); ui.ver = null; refresh(); } catch (e) { toast(e.message, { ms: 7000 }); __b.disabled = false; } };
    const pv = $('#prev', el); if (pv) pv.onclick = () => preview(renderPage(out, f.order_form_url));
    const sd = $('#send', el); if (sd && v?.status === 'approved') sd.onclick = () => hlWrite('funnel_bundle', {
      funnelName: f.name, emails: out.emails,
      product: offer ? { name: offer.name, price: offer.price, cadence: offer.cadence, currency: offer.currency, description: (offer.services || []).join(', ') } : null,
      customValues: { [`OS_${f.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30)}_order_url`]: f.order_form_url || '' },
    }, { onDone: async () => { await versionedUpdate('funnels', f, { status: 'sent' }).catch(() => {}); refresh(); } });
  };

  function preview(html) {
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    modal({ title: 'Page preview', wide: true, body: `<div class="seg" id="pvw" style="margin-bottom:10px"><button class="active" data-w="100%">Desktop</button><button data-w="390px">Mobile</button></div>
      <div style="display:grid;place-items:center;background:var(--surface-2);border-radius:12px;padding:10px"><iframe id="pvf" title="Preview" sandbox="" style="width:100%;height:62vh;border:0;border-radius:8px;background:#111"></iframe></div>`,
      foot: `<a class="btn" href="${url}" target="_blank" rel="noopener">${icon('ext')} Open in new tab</a><button class="btn btn-primary" data-close>${t('c.close')}</button>`,
      onMount: (ov) => { ov.querySelector('#pvf').srcdoc = html; ov.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => { ov.querySelector('#pvf').style.width = b.dataset.w; ov.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('active', x === b)); }); } });
  }

  function newFunnel() {
    modal({ title: 'New funnel', body: `<div class="stack"><div class="field"><label>Name</label><input class="input" id="nn" placeholder="Example: Meta Ads review call"></div>
      <div class="grid g2"><div class="field"><label>Type</label><select class="select" id="nt">${TYPES.map((x) => `<option>${x}</option>`).join('')}</select></div>
      <div class="field"><label>Offer</label><select class="select" id="no"><option value="">None</option>${offers.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></div></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>Create</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        const name = ov.querySelector('#nn').value.trim(); if (!name) return;
        try { const [r] = await q(live.sb.from('funnels').insert({ owner_id: live.ownerId, name, funnel_type: ov.querySelector('#nt').value, offer_id: ov.querySelector('#no').value || null }).select('id')); close(); ui.sel = r.id; ui.tab = 'brief'; refresh(); } catch (e) { toast(e.message); }
      }; } });
  }

  el.innerHTML = '<div class="empty">Loading funnels...</div>';
  try { await load(); draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load Funnels</h2><p class="mono">${esc(e.message)}</p></div>`; }
}
