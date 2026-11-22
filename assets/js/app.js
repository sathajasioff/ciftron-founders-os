import { t, getLang, setLang } from './i18n.js';
import { icon, $, esc } from './ui.js';
import { approvals, owner } from './data.js';

const NAV = [
  ['nav.workspace', [['home', 'home'], ['chat', 'chat'], ['team', 'team'], ['approvals', 'inbox']]],
  ['nav.create', [['content', 'play'], ['funnels', 'funnel'], ['emails', 'mail'], ['graphics', 'image'], ['programs', 'book']]],
  ['nav.knowledge', [['brain', 'brain'], ['vault', 'vault']]],
  ['nav.crm', [['pipeline', 'kanban'], ['goals', 'target']]],
  ['nav.system', [['settings', 'plug']]],
];
const ROUTES = ['home', 'chat', 'team', 'approvals', 'content', 'funnels', 'emails', 'graphics', 'programs', 'brain', 'vault', 'pipeline', 'goals', 'settings'];

export const pendingCount = () => approvals.filter((a) => a.status === 'pending').length;

function shell() {
  $('#app').innerHTML = `<div class="shell" id="shell">
    <nav class="sidebar" id="sidebar" aria-label="Main">
      <div class="brand"><div class="brand-mark"><span></span></div><div><div class="brand-name">Founders AI OS</div><div class="brand-sub">Ciftron</div></div></div>
      <div id="nav"></div>
      <div class="sidebar-foot">
        <div class="avatar">${owner.initials}</div>
        <div class="grow small"><div style="font-weight:600;line-height:1.2">${esc(owner.name)}</div><div class="xs muted">Owner</div></div>
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
  $('#menu-btn').onclick = () => $('#shell').classList.toggle('nav-open');
  $('#shell').addEventListener('click', (e) => { if (e.target.id === 'shell') $('#shell').classList.remove('nav-open'); });
  $('#theme-btn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  $('#lang-seg').onclick = (e) => { const b = e.target.closest('[data-lang]'); if (b) { setLang(b.dataset.lang); route(); } };
  $('#global-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) location.hash = '#/chat?q=' + encodeURIComponent(e.target.value.trim());
  });
}

export function setTheme(th) {
  document.documentElement.dataset.theme = th;
  try { localStorage.setItem('os.theme', th); } catch (e) {}
  paintChrome();
  window.dispatchEvent(new Event('themechange'));
}

export function paintChrome(current) {
  current = current || (location.hash.replace('#/', '').split('?')[0] || 'home');
  $('#nav').innerHTML = NAV.map(([g, items]) => `<div class="nav-group">${t(g)}</div>` + items.map(([k, ic]) =>
    `<a class="nav-link ${k === current ? 'active' : ''}" href="#/${k}" ${k === current ? 'aria-current="page"' : ''}>${icon(ic)}<span>${t('nav.' + k)}</span>${k === 'approvals' && pendingCount() ? `<span class="count">${pendingCount()}</span>` : ''}</a>`).join('')).join('');
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#theme-btn').innerHTML = icon(dark ? 'sun' : 'moon');
  $('#global-search').placeholder = t('top.search');
  $('#demo-pill').textContent = t('top.demo');
  [...$('#lang-seg').children].forEach((b) => b.classList.toggle('active', b.dataset.lang === getLang()));
}

const cache = {};
async function route() {
  const [path, qs] = location.hash.replace('#/', '').split('?');
  const name = ROUTES.includes(path) ? path : 'home';
  paintChrome(name);
  $('#shell').classList.remove('nav-open');
  const view = $('#view');
  try {
    const mod = cache[name] || (cache[name] = await import(`./screens/${name}.js`));
    view.innerHTML = '';
    mod.render(view, { params: new URLSearchParams(qs || ''), refreshNav: () => paintChrome(name) });
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty"><h2>Something went wrong</h2><p class="mono">${esc(err.message)}</p></div>`;
  }
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  document.title = `${t('nav.' + name)} · Founders AI OS`;
}

setLang(getLang());
shell();
window.addEventListener('hashchange', route);
route();
