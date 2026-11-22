// Meta Ads, read-only: spend, leads and cost per lead from the Insights API. Needs ads_read only.
import { handler, requireOwner, HttpError } from './_lib/http.js';
import { getSecret } from './_lib/providers.js';
import { metaFetch, summarizeInsights } from './_lib/meta.js';

export const config = { maxDuration: 30 };
const RANGES = ['today', 'yesterday', 'last_7d', 'last_14d', 'last_30d', 'this_month', 'last_month'];

export default handler(['POST'], async (req, body) => {
  const { user, db, admin } = await requireOwner(req);
  const token = await getSecret(admin, user.id, 'meta_ads', 'access_token');
  const { data: conn } = await db.from('connections').select('config').eq('provider', 'meta_ads').maybeSingle();
  let account = String(conn?.config?.ad_account_id || '').trim();
  if (!account) throw new HttpError(400, 'Add your Meta ad account ID in Connections', { needs: 'meta_ads' });
  if (!account.startsWith('act_')) account = 'act_' + account.replace(/\D/g, '');
  const range = RANGES.includes(body.range) ? body.range : 'last_7d';

  const [acct, campaigns, prev] = await Promise.all([
    metaFetch(token, `/${account}/insights`, { fields: 'spend,impressions,clicks,actions,cost_per_action_type', date_preset: range, level: 'account' }),
    metaFetch(token, `/${account}/insights`, { fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions', date_preset: range, level: 'campaign', limit: 50 }),
    range === 'last_7d' ? metaFetch(token, `/${account}/insights`, { fields: 'spend,actions', time_range: JSON.stringify(prevWeek()), level: 'account' }).catch(() => null) : null,
  ]);
  return { range, account, ...summarizeInsights(acct, campaigns, prev) };
});

function prevWeek() {
  const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  return { since: d(14), until: d(8) };
}
