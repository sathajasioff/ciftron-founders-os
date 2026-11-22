import { supabaseUrl } from './_lib/http.js';

// Public, non-secret config the browser needs to start Supabase auth.
// The anon key is designed to be public; row level security protects the data.
export default function config(req, res) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  res.setHeader('Cache-Control', 'no-store');
  if (!url || !anonKey) return res.status(503).json({ error: 'Supabase is not configured yet' });
  let clean;
  try { clean = supabaseUrl(url); } catch (e) { return res.status(500).json({ error: e.message }); }
  res.status(200).json({ supabaseUrl: clean, supabaseAnonKey: anonKey.trim(), phase: 2 });
}
