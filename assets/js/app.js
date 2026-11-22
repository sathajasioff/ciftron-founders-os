import { t, getLang, setLang } from './i18n.js';
import { icon, $, esc } from './ui.js';
import { approvals, owner } from './data.js';
import { live, initLive, loginScreen, api, reportError, watchErrors } from './live.js';

// Screens backed by real data once Supabase is configured. The rest stay demo until their phase.
const LIVE_ROUTES = ['brain', 'connections', 'chat', 'team', 'approvals', 'pipeline', 'home', 'content', 'emails', 'funnels', 'graphics', 'vault', 'goals', 'programs', 'revenue', 'calls'];

const NAV = [
  ['nav.workspace', [['home', 'sparkle'], ['chat', 'chat'], ['team', 'team'], ['approvals', 'inbox']]],
  ['nav.create', [['content', 'play'], ['funnels', 'funnel'], ['emails', 'mail'], ['graphics', 'image'], ['programs', 'book']]],
  ['nav.knowledge', [['brain', 'brain'], ['vault', 'vault']]],
  ['nav.crm', [['pipeline', 'kanban'], ['revenue', 'dollar'], ['calls', 'phone'], ['goals', 'target']]],
  ['nav.system', [['connections', 'plug']]],
];
const ROUTES = ['home', 'chat', 'team', 'approvals', 'content', 'funnels', 'emails', 'graphics', 'programs', 'brain', 'vault', 'pipeline', 'revenue', 'calls', 'goals', 'connections'];
const FILE = { connections: 'settings', home: 'jarvis' };
const LABEL = { connections: 'settings' };

let livePending = 0;
export const pendingCount = () => (live.on ? livePending : approvals.filter((a) => a.status === 'pending').length);
async function refreshPending() {
  if (!live.on) return;
  const { count } = await live.sb.from('approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('trashed_at', null);
  livePending = count || 0;
}

function shell() {
  $('#app').innerHTML = `<div class="shell" id="shell">
    <nav class="sidebar" id="sidebar" aria-label="Main">
      <div class="brand"><div class="brand-mark"><span></span></div><div><div class="brand-name">Founders AI OS</div><div class="brand-sub">Ciftron</div></div></div>
      <div id="nav"></div>
      <div class="sidebar-foot">
        <div class="avatar">${live.on && live.role === 'member' ? esc((live.user.email || '?')[0].toUpperCase()) : owner.initials}</div>
        <div class="grow small"><div style="font-weight:600;line-height:1.2">${live.on && live.role === 'member' ? 'Team member' : esc(owner.name)}</div><div class="xs muted">${live.on ? esc(live.user.email) : 'Owner'}</div></div>
        ${live.on ? `<button class="btn btn-ghost btn-sm" id="signout" title="Sign out">Sign out</button>` : ''}
      </div>
    </nav>
    <div class="main">
      <header class="topbar">
        <button class="btn btn-ghost btn-icon menu-btn" id="menu-btn" aria-label="Menu">${icon('menu')}</button>
        <label class="search-box">${icon('search')}<input id="global-search" placeholder="" aria-label="Search"></label>
        <span class="demo-pill" id="demo-pill"></span>
        <div style="margin-left:auto" class="row">
          <div class="seg" id="lang-seg" aria-label="Language"><button data-lang="en">EN</button><button data-lang="fr">FR-QC</button></div>
          <button class="btn btn-ghost btn-icon" id="theme-btn" aria-label="Toggle theme"></button>
        </div>
      </header>
      <main class="content" id="view" tabindex="-1"></main>
    </div>
  </div>`;
  if (live.on) $('#signout').onclick = () => live.sb.auth.signOut();
  $('#menu-btn').onclick = () => $('#shell').classList.toggle('nav-open');
  $('#shell').addEventListener('click', (e) => { if (e.target.id === 'shell') $('#shell').classList.remove('nav-open'); });
  $('#theme-btn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  $('#lang-seg').onclick = (e) => { const b = e.target.closest('[data-lang]'); if (b) { setLang(b.dataset.lang); route(); } };
  $('#global-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) location.hash = '#chat?q=' + encodeURIComponent(e.target.value.trim());
  });
}

export function setTheme(th) {
  document.documentElement.dataset.theme = th;
  try { localStorage.setItem('os.theme', th); } catch (e) {}
  paintChrome();
  window.dispatchEvent(new Event('themechange'));
}

export function paintChrome(current) {
  current = current || (location.hash.replace(/^#\/?/, '').split('?')[0] || 'home');
  $('#nav').innerHTML = NAV.map(([g, items]) => `<div class="nav-group">${t(g)}</div>` + items.map(([k, ic]) =>
    `<a class="nav-link ${k === current ? 'active' : ''}" href="#${k}" ${k === current ? 'aria-current="page"' : ''}>${icon(ic)}<span>${t('nav.' + (LABEL[k] || k))}</span>${k === 'approvals' && pendingCount() ? `<span class="count">${pendingCount()}</span>` : ''}</a>`).join('')).join('');
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#theme-btn').innerHTML = icon(dark ? 'sun' : 'moon');
  $('#global-search').placeholder = t('top.search');
  const isLive = live.on && LIVE_ROUTES.includes(current);
  $('#demo-pill').textContent = isLive ? 'Live' : t('top.demo');
  $('#demo-pill').style.cssText = isLive ? 'border-style:solid;border-color:var(--accent);color:var(--text)' : '';
  [...$('#lang-seg').children].forEach((b) => b.classList.toggle('active', b.dataset.lang === getLang()));
}

const cache = {};
async function route() {
  const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
  const name = ROUTES.includes(path) ? path : 'home';
  paintChrome(name);
  $('#shell').classList.remove('nav-open');
  const view = $('#view');
  try {
    const mod = cache[name] || (cache[name] = await import(`./screens/${FILE[name] || name}.js`));
    view.innerHTML = '';
    mod.render(view, { params: new URLSearchParams(qs || ''), refreshNav: async () => { await refreshPending().catch(() => {}); paintChrome(name); }, live: live.on && LIVE_ROUTES.includes(name) });
    refreshPending().then(() => paintChrome(name)).catch(() => {});
  } catch (err) {
    console.error(err);
    reportError(err, { screen: name });
    view.innerHTML = `<div class="empty"><h2>Something went wrong</h2><p class="mono">${esc(err.message)}</p></div>`;
  }
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  document.title = `${t('nav.' + (LABEL[name] || name))} · Founders AI OS`;
}

setLang(getLang());
(async () => {
  await initLive();
  if (live.on && !live.session) return loginScreen($('#app'));
  if (live.on) watchErrors();
  shell();
  window.addEventListener('hashchange', route);
  if (live.on) { try { await api('brain', { body: { action: 'bootstrap' } }); } catch (e) { console.error(e); } }
  route();
})();
