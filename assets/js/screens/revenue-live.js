// Revenue: Stripe payments (read-only) plus retainers and payments you log, by month, with MRR.
import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, $ } from '../ui.js';
import { live, api, q } from '../live.js';

const fmt = (n, c) => `${c === 'USD' ? '$' : c === 'CAD' ? 'CA$' : c === 'EUR' ? '€' : c === 'LKR' ? 'Rs ' : c + ' '}${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const monthName = (m) => new Date(m + '-15').toLocaleDateString('en-US', { month: 'short' });
const ui = { cur: null };

// Stacked bars per month: Stripe (dark) and manual (accent). Values in one currency.
function chart(months, cur) {
  const W = 1000, H = 260, pad = { l: 84, r: 12, t: 14, b: 30 };
  const max = Math.max(1, ...months.map((m) => m[cur]?.total || 0));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const bw = (W - pad.l - pad.r) / months.length;
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const ticks = [0, top / 2, top];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue by month in ${cur}" style="width:100%;height:auto">
    ${ticks.map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border)" stroke-width="1"/><text x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="13" fill="var(--muted)">${fmt(v, cur)}</text>`).join('')}
    ${months.map((m, i) => {
      const s = m[cur]?.stripe || 0, mn = m[cur]?.manual || 0, x = pad.l + i * bw + bw * 0.2, w = bw * 0.6;
      return `<g><title>${monthName(m.month)}: ${fmt(s + mn, cur)} (Stripe ${fmt(s, cur)}, logged ${fmt(mn, cur)})</title>
        ${s > 0 ? `<rect x="${x}" y="${y(s)}" width="${w}" height="${y(0) - y(s)}" rx="3" fill="var(--ink)"/>` : ''}
        ${mn > 0 ? `<rect x="${x}" y="${y(s + mn)}" width="${w}" height="${y(s) - y(s + mn)}" rx="3" fill="var(--accent)"/>` : ''}
        <text x="${x + w / 2}" y="${H - 8}" text-anchor="middle" font-size="13" fill="var(--muted)">${monthName(m.month)}</text></g>`;
    }).join('')}</svg>`;
}

export async function render(el) {
  let data = null;
  const load = async () => { data = await api('studio', { body: { action: 'revenue' } }); };
  const refresh = async () => { await load(); draw(); };

  const draw = () => {
    const s = data.summary;
    const cur = s.currencies.includes(ui.cur) ? ui.cur : s.currencies[0];
    const rows = [
      ...data.entries.map((e) => ({ id: e.id, date: e.occurred_on, amount: Number(e.amount), currency: e.currency, what: e.client || e.description || 'Logged payment', note: e.client && e.description ? e.description : '', recurring: e.recurring, src: 'manual' })),
      ...data.charges.map((c) => ({ date: c.date, amount: c.amount, currency: c.currency, what: c.description, src: 'stripe' })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    el.innerHTML = `
      ${head(t('nav.revenue'), 'Stripe payments and the retainers and payments you log. Read-only from Stripe; customer names and emails are never pulled in.', `<button class="btn btn-primary" id="radd">${icon('plus')} Log payment</button>`)}
      ${data.stripe_error ? `<div class="notice warn small" style="margin-bottom:12px">${icon('alert')}<span>Stripe: ${esc(data.stripe_error)}</span></div>` : !data.stripe ? `<div class="notice neutral small" style="margin-bottom:12px">${icon('info')}<span>Add a Stripe restricted key in <a href="#connections">Connections</a> to pull payments and subscriptions in automatically.</span></div>` : ''}
      ${!s.currencies.length ? '<div class="empty card soft">No revenue yet. Log a payment or retainer, or connect Stripe.</div>' : `
      ${s.currencies.length > 1 ? `<div class="seg" style="margin-bottom:12px">${s.currencies.map((c) => `<button data-cur="${c}" class="${c === cur ? 'active' : ''}">${c}</button>`).join('')}</div>` : ''}
      <div class="grid g3" style="margin-bottom:16px">
        <div class="card stat"><div class="label">This month</div><div class="value">${fmt(s.this_month[cur], cur)}</div><div class="row between"><span class="xs muted">Last month ${fmt(s.last_month[cur], cur)}</span></div></div>
        <div class="card stat"><div class="label">Monthly recurring</div><div class="value">${fmt(s.mrr[cur], cur)}</div><div class="row between"><span class="xs muted">Stripe subscriptions + logged retainers</span></div></div>
        <div class="card stat"><div class="label">Last 6 months</div><div class="value">${fmt(s.months.reduce((a, m) => a + (m[cur]?.total || 0), 0), cur)}</div><div class="row between"><span class="xs muted">${s.months[0] ? monthName(s.months[0].month) : ''} to ${monthName(s.months[s.months.length - 1].month)}</span></div></div>
      </div>
      <div class="card" style="margin-bottom:16px"><div class="card-head"><h3>By month (${cur})</h3><div class="row xs muted" style="gap:12px"><span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--ink)"></span> Stripe</span><span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--accent)"></span> Logged</span></div></div>${chart(s.months, cur)}</div>`}
      ${rows.length ? `<div class="card"><h3 style="margin-bottom:10px">Payments</h3><div class="table-wrap" style="border:0"><table class="table"><thead><tr><th>Date</th><th>What</th><th>Source</th><th style="text-align:right">Amount</th><th></th></tr></thead><tbody>
        ${rows.slice(0, 80).map((r) => `<tr><td class="small muted" style="white-space:nowrap">${r.date}</td><td class="small">${esc(r.what)}${r.note ? `<div class="xs muted">${esc(r.note)}</div>` : ''}</td>
          <td><span class="chip ${r.src === 'stripe' ? '' : 'accent'}">${r.src === 'stripe' ? 'Stripe' : r.recurring ? 'Retainer' : 'Logged'}</span></td>
          <td class="small" style="text-align:right;white-space:nowrap">${fmt(r.amount, r.currency)}</td>
          <td style="text-align:right">${r.src === 'manual' ? `<button class="btn btn-sm btn-ghost" data-rdel="${r.id}" title="Delete">${icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
    el.querySelectorAll('[data-cur]').forEach((b) => b.onclick = () => { ui.cur = b.dataset.cur; draw(); });
    $('#radd', el).onclick = addEntry;
    el.querySelectorAll('[data-rdel]').forEach((b) => b.onclick = async () => { try { await q(live.sb.from('revenue_entries').delete().eq('id', b.dataset.rdel)); toast('Deleted'); refresh(); } catch (x) { toast(x.message); } });
  };

  function addEntry() {
    modal({ title: 'Log a payment', sub: 'For clients who pay outside Stripe: bank transfer, Interac, PayPal, cash.',
      body: `<div class="stack"><div class="grid g2"><div class="field"><label>Client</label><input class="input" id="rc" placeholder="Client or project name"></div>
        <div class="field"><label>Date</label><input class="input" type="date" id="rd" value="${new Date().toISOString().slice(0, 10)}"></div></div>
        <div class="grid g2"><div class="field"><label>Amount</label><input class="input" type="number" step="0.01" id="ra" placeholder="497"></div>
        <div class="field"><label>Currency</label><select class="select" id="ry">${['USD', 'CAD', 'EUR', 'GBP', 'LKR', 'AUD'].map((c) => `<option>${c}</option>`).join('')}</select></div></div>
        <div class="field"><label>Note (optional)</label><input class="input" id="rn" placeholder="November retainer, Meta Ads management"></div>
        <label class="row small"><input type="checkbox" id="rr"> Monthly retainer (counts toward monthly recurring revenue)</label>
        <p class="xs muted">A refund? Enter a negative amount.</p></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        const amount = Number(ov.querySelector('#ra').value);
        if (!amount) return toast('Enter an amount');
        try {
          await q(live.sb.from('revenue_entries').insert({ owner_id: live.ownerId, client: ov.querySelector('#rc').value.trim() || null, occurred_on: ov.querySelector('#rd').value,
            amount, currency: ov.querySelector('#ry').value, description: ov.querySelector('#rn').value.trim() || null, recurring: ov.querySelector('#rr').checked }));
          close(); toast('Logged'); refresh();
        } catch (x) { toast(x.message); }
      }; } });
  }

  el.innerHTML = '<div class="empty">Loading revenue...</div>';
  try { await load(); draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load revenue</h2><p class="mono">${esc(e.message)}</p><p class="small">Run migration 009 in Supabase if you just updated.</p></div>`; }
}
