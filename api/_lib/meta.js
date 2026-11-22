// Meta Marketing API (read-only). Graph API v26.0 was current in Nov 2026; override with META_API_VERSION.
import { HttpError } from './http.js';

export const META_VERSION = process.env.META_API_VERSION || 'v26.0';
// Meta reports leads under different action types depending on the form and pixel setup.
const LEAD_TYPES = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'onsite_conversion.lead', 'leadgen_grouped'];

export async function metaFetch(token, path, query = {}) {
  const url = new URL(`https://graph.facebook.com/${META_VERSION}${path}`);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
  let r;
  try { r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }); }
  catch (e) { throw new HttpError(502, 'Could not reach Meta: ' + e.message); }
  const j = await r.json().catch(() => ({}));
  if (r.ok) return j;
  const err = j.error || {};
  if (err.code === 190) throw new HttpError(400, 'Meta rejected the access token. Create a new system user token and save it in Connections.', { needs: 'meta_ads' });
  if (err.code === 10 || err.code === 200 || /permission/i.test(err.message || '')) throw new HttpError(403, 'The Meta token needs the ads_read permission for this ad account.', { needs: 'meta_ads' });
  if (err.code === 17 || err.code === 80004) throw new HttpError(429, 'Meta rate limit reached. Try again in a few minutes.');
  throw new HttpError(400, `Meta error: ${err.message || r.status}`);
}

export function leadsFrom(actions = []) {
  const counts = LEAD_TYPES.map((t) => Number(actions.find((a) => a.action_type === t)?.value || 0));
  // Types overlap (grouped vs single), so take the largest rather than summing.
  return Math.max(0, ...counts);
}

export function summarizeInsights(acct, campaigns, prev) {
  const row = acct?.data?.[0] || {};
  const spend = Number(row.spend || 0);
  const leads = leadsFrom(row.actions);
  const p = prev?.data?.[0];
  const prevSpend = p ? Number(p.spend || 0) : null;
  const prevLeads = p ? leadsFrom(p.actions) : null;
  const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
  return {
    spend: round(spend), impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0), leads,
    cpl: leads ? round(spend / leads) : null,
    previous: p ? { spend: round(prevSpend), leads: prevLeads, cpl: prevLeads ? round(prevSpend / prevLeads) : null } : null,
    campaigns: (campaigns?.data || []).map((c) => {
      const l = leadsFrom(c.actions); const s = Number(c.spend || 0);
      return { id: c.campaign_id, name: c.campaign_name, spend: round(s), leads: l, cpl: l ? round(s / l) : null, clicks: Number(c.clicks || 0) };
    }).sort((a, b) => b.spend - a.spend),
  };
}
