// Daily cron (vercel.json). Runs every routine that is due today and saves the drafts to Approvals.
// Vercel sends Authorization: Bearer <CRON_SECRET>; any other caller is refused.
import { timingSafeEqual } from 'node:crypto';
import { adminClient } from './_lib/http.js';
import { isDue, runRoutine } from './_lib/routines.js';

export const config = { maxDuration: 60 };

export function cronAuthorized(header, secret = process.env.CRON_SECRET) {
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(String(header || ''));
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function cron(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.CRON_SECRET) return res.status(500).json({ error: 'Set CRON_SECRET in Vercel to turn on routines' });
  if (!cronAuthorized(req.headers.authorization)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const admin = adminClient();
    const now = new Date();
    const { data: routines, error } = await admin.from('agent_routines').select('*').eq('enabled', true);
    if (error) throw error;
    const owners = [...new Set(routines.map((r) => r.owner_id))];
    const { data: profiles } = owners.length ? await admin.from('profiles').select('owner_id, timezone').in('owner_id', owners) : { data: [] };
    const tz = Object.fromEntries((profiles || []).map((p) => [p.owner_id, p.timezone]));
    // At most 6 per day keeps a run inside the time limit; the rest wait for tomorrow.
    const due = routines.filter((r) => isDue(r, now, tz[r.owner_id])).slice(0, 6);
    const results = await Promise.all(due.map((r) => runRoutine(admin, r.owner_id, r, { now, timeZone: tz[r.owner_id] }).then((o) => ({ id: r.id, ...o }))));
    return res.status(200).json({ ran: results.length, results });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Cron failed' });
  }
}
