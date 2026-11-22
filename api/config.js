import { supabaseUrl, adminClient } from './_lib/http.js';
import { PAGE_HEADERS } from './_lib/page.js';

const notFound = (res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  return res.status(404).send('<!doctype html><meta charset="utf-8"><title>Not found</title><p style="font:16px system-ui;padding:40px">This preview link is not available.</p>');
};

// Public, non-secret config the browser needs to start Supabase auth.
// The anon key is designed to be public; row level security protects the data.
// Also serves designed funnel pages at /p/<token> (rewrite in vercel.json): only pages the owner has shared.
export default async function config(req, res) {
  const page = req.query?.page;
  if (page !== undefined) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end();
    if (typeof page !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(page)) return notFound(res);
    try {
      const { data } = await adminClient().from('funnel_pages').select('html').eq('public_token', page).eq('shared', true).maybeSingle();
      if (!data) return notFound(res);
      for (const [k, v] of Object.entries(PAGE_HEADERS)) res.setHeader(k, v);
      return res.status(200).send(data.html);
    } catch { return notFound(res); }
  }
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  res.setHeader('Cache-Control', 'no-store');
  if (!url || !anonKey) return res.status(503).json({ error: 'Supabase is not configured yet' });
  let clean;
  try { clean = supabaseUrl(url); } catch (e) { return res.status(500).json({ error: e.message }); }
  res.status(200).json({ supabaseUrl: clean, supabaseAnonKey: anonKey.trim(), phase: 2 });
}
