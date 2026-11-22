import { t } from './i18n.js';
import { writeLog } from './data.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const money = (n) => '$' + Number(n).toLocaleString('en-US');

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
  play: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 9 5 3-5 3z"/>',
  funnel: '<path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6 8.5 7 8.5-7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v16H5.5A1.5 1.5 0 0 0 4 20.5z"/><path d="M4 20.5A1.5 1.5 0 0 0 5.5 22H20"/>',
  brain: '<path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V3z"/><path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V3z"/>',
  vault: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 9V7M12 17v-2"/>',
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  plug: '<path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  dollar: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M4 4h16"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14-4.5L4 9M4 13a8 8 0 0 0 14 4.5L20 15"/><path d="M4 4v5h5M20 20v-5h-5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

export function toast(msg, opts = {}) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${opts.undo ? `<button type="button">${t('c.undo')}</button>` : ''}`;
  if (opts.undo) el.querySelector('button').onclick = () => { opts.undo(); el.remove(); };
  root.appendChild(el);
  while (root.children.length > 3) root.firstElementChild.remove();
  setTimeout(() => el.remove(), opts.ms || 4200);
}

export function modal({ title, sub = '', body = '', foot = '', wide = false, onMount }) {
  const root = $('#modal-root');
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><div><h2>${esc(title)}</h2>${sub ? `<p class="muted small" style="margin-top:4px">${sub}</p>` : ''}</div>
    <button class="btn btn-ghost btn-icon" data-close aria-label="${t('c.close')}">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  root.appendChild(ov);
  onMount && onMount(ov, close);
  const f = ov.querySelector('input, textarea, .btn-primary');
  f && f.focus();
  return close;
}

// The one pattern for every HighLevel write: exact preview, one explicit confirm click, logged.
export function confirmWrite({ action, target, payload, warn, onConfirm }) {
  const pretty = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  modal({
    title: t('confirm.title'),
    sub: `<b>${esc(action)}</b> → ${esc(target)}`,
    body: `${warn ? `<div class="notice warn" style="margin-bottom:12px">${icon('alert')}<span>${esc(warn)}</span></div>` : ''}
      <p class="small" style="font-weight:600">${t('confirm.exact')}</p>
      <div class="preview-box code-preview">${esc(pretty)}</div>
      <p class="xs muted" style="margin-top:10px">${t('confirm.logged')}</p>`,
    foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary hl-btn" data-ok>${t('c.confirmSend')}</button>`,
    onMount: (ov, close) => {
      ov.querySelector('[data-ok]').onclick = () => {
        writeLog.unshift({ when: new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }), action, target, status: 'Demo' });
        close();
        onConfirm && onConfirm();
        toast(t('confirm.demo'));
      };
    },
  });
}

export function drawer({ title, body, foot = '' }) {
  const ov = document.createElement('div');
  ov.className = 'drawer-overlay';
  const d = document.createElement('aside');
  d.className = 'drawer';
  d.innerHTML = `<div class="modal-head" style="padding-bottom:12px;border-bottom:1px solid var(--border)"><h2>${esc(title)}</h2><button class="btn btn-ghost btn-icon" data-close aria-label="${t('c.close')}">${icon('x')}</button></div>
    <div class="modal-body" style="flex:1">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}`;
  const close = () => { ov.remove(); d.remove(); };
  ov.onclick = close;
  d.querySelector('[data-close]').onclick = close;
  document.body.append(ov, d);
  return { el: d, close };
}

export const tabsHtml = (tabs, active) => `<div class="tabs" role="tablist">${tabs.map(([k, label]) => `<button class="tab ${k === active ? 'active' : ''}" data-tab="${k}" role="tab">${label}</button>`).join('')}</div>`;
export const chips = (arr, cls = '') => arr.map((x) => `<span class="chip ${cls}">${esc(x)}</span>`).join(' ');
// Highlight [PLACEHOLDER] markers so invented details never pass as real.
export const marks = (s) => esc(s).replace(/\[(.+?)\]/g, '<span class="placeholder">[$1]</span>').replace(/\n/g, '<br>');
export const toggleHtml = (checked, attrs = '') => `<label class="toggle"><input type="checkbox" ${checked ? 'checked' : ''} ${attrs}><span></span></label>`;

export const head = (title, sub = '', actions = '', eyebrow = '') => `<div class="page-head"><div>${eyebrow ? `<div class="eyebrow" style="margin-bottom:6px">${eyebrow}</div>` : ''}<h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>${actions ? `<div class="row wrap">${actions}</div>` : ''}</div>`;

// Light Markdown for AI replies: paragraphs, bullet and numbered lists, bold, placeholders, saved-draft chips.
export function md(text) {
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[Saved to Approvals: (.+?)\]/g, '<a class="chip accent" href="#approvals" style="text-decoration:none">Saved to Approvals: $1</a>')
    .replace(/\[([A-Z][A-Z \-]{2,40})\]/g, '<span class="placeholder">[$1]</span>');
  const out = [];
  let list = null;
  for (const line of String(text || '').split('\n')) {
    const b = line.match(/^\s*[-*•]\s+(.*)/), n = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (b || n) {
      const tag = b ? 'ul' : 'ol';
      if (!list || list.tag !== tag) { if (list) out.push(`</${list.tag}>`); list = { tag }; out.push(`<${tag}>`); }
      out.push(`<li>${inline((b || n)[1])}</li>`);
      continue;
    }
    if (list) { out.push(`</${list.tag}>`); list = null; }
    if (/^#{1,4}\s/.test(line)) out.push(`<p style="margin:8px 0 4px"><b>${inline(line.replace(/^#+\s/, ''))}</b></p>`);
    else if (line.trim()) out.push(`<p style="margin:0 0 6px">${inline(line)}</p>`);
  }
  if (list) out.push(`</${list.tag}>`);
  return out.join('');
}
