// Meta Ads, read-only: spend, leads and cost per lead from the Insights API. Needs ads_read only.
import { handler, requireOwner, HttpError } from './_lib/http.js';
import { getSecret } from './_lib/providers.js';
import { metaSummary } from './_lib/meta.js';

export const config = { maxDuration: 30 };

export default handler(['POST'], async (req, body) => {
  const { user, db, admin } = await requireOwner(req);
  const token = await getSecret(admin, user.id, 'meta_ads', 'access_token');
  const { data: conn } = await db.from('connections').select('config').eq('provider', 'meta_ads').maybeSingle();
  let account = String(conn?.config?.ad_account_id || '').trim();
  if (!account) throw new HttpError(400, 'Add your Meta ad account ID in Connections', { needs: 'meta_ads' });
  if (!account.startsWith('act_')) account = 'act_' + account.replace(/\D/g, '');
  const range = body.range;

  return metaSummary(token, account, range);
});

