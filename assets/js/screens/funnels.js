import { t } from '../i18n.js';
import { head, icon, esc, toast, tabsHtml, confirmWrite, marks, modal, $ } from '../ui.js';
import { funnels, offers } from '../data.js';

let sel = 'f1';
let tab = 'brief';
const orderUrl = { f1: '', f2: '', f3: 'https://link.ciftron.com/order/ai-checklist' };

const page = (f, o) => ({
  headline: 'Find out where your Meta leads are leaking before you spend another dollar',
  sub: 'A 15-minute review call for service businesses, real estate and mortgage professionals running Meta Ads.',
  bullets: ['We look at your ad, form and follow-up together', 'You leave with the first 3 fixes, in order', 'No pitch on the call unless you ask for one'],
  proof: '[PROOF: add a real client result or leave this section out]',
  price: `${o.name}: $${o.price}/month after the call, if it is a fit`,
  cta: 'Book my review call',
});

export function render(el) {
  const draw = () => {
    const f = funnels.find((x) => x.id === sel);
    const o = offers.find((x) => x.id === f.offer);
    el.innerHTML = `
      ${head(t('funnels.title'), t('funnels.sub'), `<a class="btn btn-primary" href="#chat?q=${encodeURIComponent('Start a new funnel brief')}">${icon('plus')} Start from AI Chat</a>`)}
      <div class="split-l">
        <div class="list">${funnels.map((x) => `<div class="list-item clickable ${x.id === sel ? 'selected' : ''}" data-f="${x.id}"><div class="grow"><div style="font-weight:600" class="small">${esc(x.name)}</div><div class="xs muted">${esc(x.type)} · v${x.version}</div></div>${x.status.includes('Sent') ? '<span class="chip ok">Sent</span>' : '<span class="chip">Draft</span>'}</div>`).join('')}</div>
        <div>
          <div class="card" style="margin-bottom:14px"><div class="row between wrap"><div><h2>${esc(f.name)}</h2><div class="small muted">${esc(f.type)} · ${esc(o.name)} · v${f.version} · updated ${esc(f.updated)}</div></div>
            <div class="row"><button class="btn" id="prev">${icon('ext')} ${t('c.preview')}</button><button class="btn btn-primary hl-btn" id="send">${t('funnels.sendHL')}</button></div></div></div>
          ${tabsHtml([['brief', 'Brief'], ['page', 'Sales page'], ['images', 'Images'], ['emails', 'Buyer emails'], ['notes', 'HighLevel setup notes'], ['versions', t('c.versions')]], tab)}
          <div id="fpane"></div>
        </div>
      </div>`;
    el.querySelectorAll('[data-f]').forEach((x) => x.onclick = () => { sel = x.dataset.f; draw(); });
    el.querySelectorAll('[data-tab]').forEach((x) => x.onclick = () => { tab = x.dataset.tab; draw(); });
    const p = page(f, o);
    const pane = $('#fpane', el);
    if (tab === 'brief') pane.innerHTML = `<div class="card stack">
      <div class="grid g2"><div class="field"><label>Offer</label><select class="select">${offers.map((x) => `<option ${x.id === f.offer ? 'selected' : ''}>${esc(x.name)} ($${x.price}/mo)</option>`).join('')}</select></div>
      <div class="field"><label>Funnel type</label><select class="select">${['Lead generation funnel', 'Appointment booking funnel', 'Lead magnet funnel', 'Webinar funnel', 'Sales funnel'].map((x) => `<option ${x === f.type ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
      <div class="field"><label>Audience</label><input class="input" value="Service businesses, real estate and mortgage professionals running Meta Ads in Canada"></div>
      <div class="field"><label>Main promise</label><input class="input" value="See where leads leak between the ad and the booked call"></div>
      <div class="field"><label>Qualification form questions</label><textarea class="textarea">Monthly ad spend?\nHow do leads reach you today?\nWho follows up with new leads?</textarea></div>
      <div class="field"><label>HighLevel order form URL</label><input class="input" id="order" placeholder="https://..." value="${esc(orderUrl[f.id])}"><div class="hint">Attached to every button on the page.</div></div>
      <div class="field"><label>Proof</label><textarea class="textarea" placeholder="Left empty. Add real testimonials or results here. AI will not invent them."></textarea></div>
      <div class="field"><label>${t('c.language')}</label><div class="seg"><button class="active">English</button><button>Quebec French</button></div></div>
      <div class="row"><button class="btn btn-primary" id="build">${icon('sparkle')} ${t('c.build')}</button><span class="xs muted">Builds copy, preview, images, six emails and setup notes as v${f.version + 1}.</span></div></div>`;
    if (tab === 'page') pane.innerHTML = `<div class="card stack"><div class="eyebrow">Headline</div><h2>${esc(p.headline)}</h2><p class="muted">${esc(p.sub)}</p>
      <ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul><div class="eyebrow">Proof</div><p>${marks(p.proof)}</p><div class="eyebrow">Price line</div><p>${esc(p.price)}</p>
      <div class="row"><span class="btn btn-accent">${esc(p.cta)}</span><span class="xs muted">${orderUrl[f.id] ? 'Links to ' + esc(orderUrl[f.id]) : '<span class="placeholder">[ORDER FORM URL missing]</span>'}</span></div>
      <div class="divider"></div><div class="row"><input class="input grow" placeholder="Ask for a revision, for example: shorter headline, more direct"><button class="btn" id="rev">${t('c.rewrite')}</button></div></div>`;
    if (tab === 'images') pane.innerHTML = `<div class="grid g3">${[['Hero', '16/9', ''], ['Section image', '4/3', 'light'], ['Ad thumbnail', '1/1', 'lime']].map(([n, r, s]) => `<div><div class="art ${s}" style="aspect-ratio:${r}"><span class="k">${n}</span><span class="h">Where are your leads leaking?</span></div><div class="xs muted" style="margin-top:4px">${n}</div></div>`).join('')}</div>`;
    if (tab === 'emails') pane.innerHTML = `<div class="list">${['Your call is booked', 'What to bring to the call', 'Reminder: tomorrow', 'Starting in 1 hour', 'Thanks, here is your summary', 'Next steps if it is a fit'].map((s, i) => `<div class="list-item"><span class="chip">${i + 1}</span><div class="grow"><div style="font-weight:600">${s}</div><div class="xs muted">Uses NAME, OFFER NAME, CALL TIME</div></div><button class="btn btn-sm">${t('c.edit')}</button></div>`).join('')}</div>`;
    if (tab === 'notes') pane.innerHTML = `<div class="card small stack"><p><b>1.</b> Create a funnel with 2 steps: Booking page, Thank you page.</p><p><b>2.</b> Add the qualification form fields as custom fields: ad_spend, lead_source, follow_up_owner.</p><p><b>3.</b> Calendar: 15 minute slots, 2 hour buffer, reminder workflow from Emails.</p><p><b>4.</b> Workflow trigger: Appointment booked → move opportunity to "Appointment Booked" in Agency Pipeline.</p><p><b>5.</b> Custom values used: OS_offer_name, OS_order_url.</p></div>`;
    if (tab === 'versions') pane.innerHTML = `<div class="list">${Array.from({ length: f.version }, (_, i) => f.version - i).map((v) => `<div class="list-item"><b>v${v}</b><div class="grow small muted">${v === f.version ? 'Current · headline shortened via chat' : v === 1 ? 'First build from brief' : 'Added qualification questions'}</div><button class="btn btn-sm" ${v === f.version ? 'disabled' : ''}>Restore</button></div>`).join('')}</div>`;
    const order = $('#order', el); if (order) order.oninput = () => { orderUrl[f.id] = order.value; };
    const build = $('#build', el); if (build) build.onclick = () => { f.version++; f.updated = 'Just now'; tab = 'page'; toast(`Built v${f.version} (demo)`); draw(); };
    const rev = $('#rev', el); if (rev) rev.onclick = () => { f.version++; toast(`Revision saved as v${f.version}`); draw(); };
    $('#prev', el).onclick = () => preview(p, orderUrl[f.id]);
    $('#send', el).onclick = () => confirmWrite({ action: 'Products, media and email templates', target: 'HighLevel (Ciftron sub-account)',
      payload: { product: { name: o.name, price: { amount: o.price, currency: 'USD', interval: 'month' } }, media: ['hero.png', 'section.png', 'ad-thumb.png'], emailTemplates: 6, customValues: { OS_offer_name: o.name, OS_order_url: orderUrl[f.id] || '(empty)' } },
      warn: orderUrl[f.id] ? '' : 'Order form URL is empty. Buttons will have no link.' });
  };
  draw();
}

function preview(p, url) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preview</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&family=Space+Grotesk:wght@600&display=swap" rel="stylesheet">
  <style>body{margin:0;font-family:'DM Sans',sans-serif;background:#111;color:#F5F5F3}main{max-width:760px;margin:0 auto;padding:72px 24px}h1{font-family:'Space Grotesk';font-size:clamp(30px,6vw,48px);line-height:1.1;margin:0 0 16px}
  p{color:#A2A2A2;font-size:18px}li{margin:10px 0;font-size:17px}.cta{display:inline-block;background:#C8F36B;color:#111;padding:14px 26px;border-radius:100px;font-weight:600;text-decoration:none;margin-top:24px}
  .ph{background:rgba(246,173,85,.2);color:#f6ad55;padding:2px 6px;border-radius:4px}.k{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#C8F36B}</style></head>
  <body><main><div class="k">01 / Review call</div><h1>${esc(p.headline)}</h1><p>${esc(p.sub)}</p><ul>${p.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
  <p><span class="ph">${esc(p.proof)}</span></p><a class="cta" href="${esc(url || '#')}">${esc(p.cta)} ↗</a></main></body></html>`;
  const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  modal({ title: 'Page preview', wide: true, body: `<div class="seg" id="pvw" style="margin-bottom:10px"><button class="active" data-w="100%">Desktop</button><button data-w="390px">Mobile</button></div>
    <div style="display:grid;place-items:center;background:var(--surface-2);border-radius:12px;padding:10px"><iframe id="pvf" title="Preview" sandbox="" style="width:100%;height:60vh;border:0;border-radius:8px;background:#111"></iframe></div>`,
    foot: `<a class="btn" href="${blobUrl}" target="_blank" rel="noopener">${icon('ext')} Open in new tab</a><button class="btn btn-primary" data-close>${t('c.close')}</button>`,
    onMount: (ov) => { ov.querySelector('#pvf').srcdoc = html; ov.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => { ov.querySelector('#pvf').style.width = b.dataset.w; ov.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('active', x === b)); }); } });
}
