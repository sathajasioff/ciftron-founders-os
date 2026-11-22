// Live mode: Supabase auth and calls to our server functions.
// If /api/config is missing (local static server, hosted demo), the app stays in demo mode.
export const live = { on: false, sb: null, session: null, user: null };

const SUPABASE_ESM = 'https://esm.sh/@supabase/supabase-js@2.119.2';

export async function initLive() {
  let cfg;
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (!r.ok) return live;
    cfg = await r.json();
  } catch (e) { return live; }
  const { createClient } = await import(SUPABASE_ESM);
  live.sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
  live.on = true;
  const { data } = await live.sb.auth.getSession();
  setSession(data.session);
  live.sb.auth.onAuthStateChange((_e, s) => {
    const was = !!live.session;
    setSession(s);
    if (was !== !!s) location.reload();
  });
  return live;
}

function setSession(s) { live.session = s; live.user = s?.user || null; }

export async function api(path, { method = 'POST', body } = {}) {
  const { data } = await live.sb.auth.getSession();
  const r = await fetch(`/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({ error: `Server returned ${r.status}` }));
  if (!r.ok) { const e = new Error(j.error || 'Request failed'); e.status = r.status; e.needs = j.needs; throw e; }
  return j;
}

// Supabase query helper that throws instead of returning { error }.
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

// Optimistic-locking update: only applies if nobody saved a newer version first.
export async function versionedUpdate(table, row, patch) {
  const { data, error } = await live.sb.from(table).update({ ...patch, version: row.version + 1 }).eq('id', row.id).eq('version', row.version).select().maybeSingle();
  if (error && /version_conflict/.test(error.message)) return { conflict: true };
  if (error) throw new Error(error.message);
  if (!data) return { conflict: true };
  return { row: data };
}

export function loginScreen(root) {
  root.innerHTML = `<div style="min-height:100vh;display:grid;place-items:center;padding:20px">
    <form class="card" id="login" style="width:min(400px,100%);padding:28px">
      <div class="brand" style="padding:0 0 18px"><div class="brand-mark"><span></span></div><div><div class="brand-name">Founders AI OS</div><div class="brand-sub">Ciftron · private</div></div></div>
      <h2 style="margin-bottom:6px">Sign in</h2><p class="small muted">We email you a one-time sign-in link. Only the owner account can sign in.</p>
      <div class="field" style="margin:16px 0 12px"><label for="em">Email</label><input class="input" id="em" type="email" autocomplete="email" required></div>
      <button class="btn btn-primary" style="width:100%" id="go">Email me a sign-in link</button>
      <p class="small" id="msg" style="margin-top:12px" role="status"></p>
    </form></div>`;
  root.querySelector('#login').onsubmit = async (e) => { 
    e.preventDefault();
    const msg = root.querySelector('#msg'), btn = root.querySelector('#go');
    btn.disabled = true; msg.className = 'small muted'; msg.textContent = 'Sending...';
    const { error } = await live.sb.auth.signInWithOtp({ email: root.querySelector('#em').value.trim(), options: { shouldCreateUser: false, emailRedirectTo: location.origin } });
    btn.disabled = false;
    if (error) { msg.className = 'small down'; msg.textContent = /not found|signups/i.test(error.message) ? 'That email is not the owner account.' : error.message; }
    else { msg.className = 'small up'; msg.textContent = 'Check your inbox for the sign-in link.'; }
  };
}
