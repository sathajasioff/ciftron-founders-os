// Revenue: Stripe (read-only, restricted key) plus entries the owner logs. No customer names or emails are read.
export class StripeError extends Error { constructor(message, status = 502) { super(message); this.status = status; } }

async function stripeGet(key, path, params, fetchImpl) {
  const r = await fetchImpl(`https://api.stripe.com/v1/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${key}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401) throw new StripeError('Stripe rejected the key. Update it in Connections.', 400);
    if (r.status === 403) throw new StripeError(`Stripe key is missing a read permission: ${j.error?.message || 'check the restricted key'}`, 400);
    throw new StripeError(`Stripe: ${j.error?.message || r.status}`);
  }
  return j;
}

// Paid charges since `since` (net of refunds) and monthly recurring revenue from active subscriptions.
export async function stripeData(key, { since, fetchImpl = fetch, maxPages = 5 } = {}) {
  const charges = [];
  let after = null;
  for (let i = 0; i < maxPages; i++) {
    const p = { limit: '100', 'created[gte]': String(Math.floor(since.getTime() / 1000)) };
    if (after) p.starting_after = after;
    const j = await stripeGet(key, 'charges', p, fetchImpl);
    for (const c of j.data || []) {
      if (c.status !== 'succeeded' || !c.paid) continue;
      charges.push({ id: c.id, amount: (c.amount - (c.amount_refunded || 0)) / 100, currency: String(c.currency || 'usd').toUpperCase(), date: new Date(c.created * 1000).toISOString().slice(0, 10), description: String(c.description || c.statement_descriptor || 'Stripe payment').slice(0, 140) });
    }
    if (!j.has_more || !j.data?.length) break;
    after = j.data[j.data.length - 1].id;
  }
  const mrr = {};
  after = null;
  for (let i = 0; i < maxPages; i++) {
    const p = { limit: '100', status: 'active' };
    if (after) p.starting_after = after;
    const j = await stripeGet(key, 'subscriptions', p, fetchImpl);
    for (const s of j.data || []) for (const it of s.items?.data || []) {
      const pr = it.price || {};
      if (pr.unit_amount == null || !pr.recurring) continue;
      const per = { day: 30.44, week: 4.345, month: 1, year: 1 / 12 }[pr.recurring.interval] || 1;
      const cur = String(pr.currency || 'usd').toUpperCase();
      mrr[cur] = (mrr[cur] || 0) + (pr.unit_amount / 100) * (it.quantity || 1) * per / (pr.recurring.interval_count || 1);
    }
    if (!j.has_more || !j.data?.length) break;
    after = j.data[j.data.length - 1].id;
  }
  for (const k of Object.keys(mrr)) mrr[k] = Math.round(mrr[k] * 100) / 100;
  return { charges, mrr };
}

const monthKey = (d) => String(d).slice(0, 7);
const round = (n) => Math.round(n * 100) / 100;

// Totals per month and currency for the last `months` months, this month vs last, and MRR.
export function revenueSummary({ entries = [], charges = [], stripeMrr = {}, now = new Date(), months = 6 }) {
  const keys = [];
  for (let i = months - 1; i >= 0; i--) { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)); keys.push(d.toISOString().slice(0, 7)); }
  const rows = [
    ...charges.map((c) => ({ date: c.date, amount: c.amount, currency: c.currency, source: 'stripe' })),
    ...entries.map((e) => ({ date: e.occurred_on, amount: Number(e.amount), currency: e.currency, source: 'manual' })),
  ];
  const currencies = [...new Set(rows.map((r) => r.currency).concat(Object.keys(stripeMrr)))].sort((a, b) => (a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b)));
  const byMonth = keys.map((m) => {
    const row = { month: m };
    for (const c of currencies) {
      const inM = rows.filter((r) => r.currency === c && monthKey(r.date) === m);
      row[c] = { stripe: round(inM.filter((r) => r.source === 'stripe').reduce((a, r) => a + r.amount, 0)), manual: round(inM.filter((r) => r.source === 'manual').reduce((a, r) => a + r.amount, 0)) };
      row[c].total = round(row[c].stripe + row[c].manual);
    }
    return row;
  });
  // Manual MRR: each recurring client's most recent entry in the last 45 days counts once.
  const recent = new Date(now.getTime() - 45 * 864e5).toISOString().slice(0, 10);
  const latest = {};
  for (const e of entries.filter((x) => x.recurring && x.occurred_on >= recent).sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))) latest[`${e.currency}|${(e.client || e.description || e.id).toLowerCase()}`] = e;
  const mrr = {};
  for (const c of currencies) mrr[c] = round((stripeMrr[c] || 0) + Object.values(latest).filter((e) => e.currency === c).reduce((a, e) => a + Number(e.amount), 0));
  const cur = byMonth[byMonth.length - 1], prev = byMonth[byMonth.length - 2];
  return {
    currencies, months: byMonth, mrr,
    this_month: Object.fromEntries(currencies.map((c) => [c, cur?.[c]?.total || 0])),
    last_month: Object.fromEntries(currencies.map((c) => [c, prev?.[c]?.total || 0])),
  };
}

export function revenueText(s) {
  if (!s.currencies.length) return 'Revenue: nothing recorded yet.';
  return 'Revenue: ' + s.currencies.map((c) => `${c} ${s.this_month[c].toLocaleString('en-US')} this month (last month ${s.last_month[c].toLocaleString('en-US')}), MRR ${s.mrr[c].toLocaleString('en-US')}`).join('; ') + '.';
}
