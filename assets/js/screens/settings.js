import { t, getLang, setLang } from '../i18n.js';
import { head, icon, esc, toast, modal, $ } from '../ui.js';
import { connections, writeLog } from '../data.js';
import * as data from '../data.js';
import { setTheme, paintChrome } from '../app.js';

let q = '';
let filter = 'all';

export function render(el) {
  const draw = () => {
    const list = connections.filter((c) => (filter === 'all' || (filter === 'on' ? c.connected : !c.connected)) && `${c.name} ${c.desc} ${c.cat}`.toLowerCase().includes(q.toLowerCase()));
    const theme = document.documentElement.dataset.theme;
    el.innerHTML = `
      ${head(t('set.title'), t('set.sub'))}
      <div class="row wrap between" style="margin-bottom:14px">
        <input class="input" id="cq" placeholder="${t('c.search')} connections" value="${esc(q)}" style="max-width:320px">
        <div class="seg">${[['all', t('c.all')], ['on', t('set.connected')], ['off', t('set.notConnected')]].map(([k, l]) => `<button class="${k === filter ? 'active' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="grid g3" style="margin-bottom:26px">${list.map((c) => `<div class="card stack-sm">
        <div class="row between"><div class="row"><span class="dot ${c.connected ? 'on' : ''}"></span><h3>${esc(c.name)}</h3></div><span class="chip">${esc(c.cat)}</span></div>
        <p class="small muted" style="margin-top:6px">${esc(c.desc)}</p>
        ${c.connected ? `<div class="xs mono muted">${esc(c.detail)}</div>` : ''}
        <div class="row" style="margin-top:10px">${c.connected ? `<button class="btn btn-sm" data-test="${c.id}">${icon('refresh')} ${t('c.test')}</button><button class="btn btn-sm btn-ghost" data-conn="${c.id}">${t('c.edit')}</button>` : `<button class="btn btn-sm btn-primary" data-conn="${c.id}">${t('c.connect')}</button><button class="btn btn-sm" data-test="${c.id}">${t('c.test')}</button>`}</div></div>`).join('') || '<div class="empty">No connections match.</div>'}</div>

      <div class="grid g2">
        <div class="card stack"><h3>${t('set.appearance')}</h3>
          <div class="row between"><span class="small">${t('set.theme')}</span><div class="seg" id="th"><button data-th="light" class="${theme === 'light' ? 'active' : ''}">${t('set.light')}</button><button data-th="dark" class="${theme === 'dark' ? 'active' : ''}">${t('set.dark')}</button></div></div>
          <div class="row between"><span class="small">${t('c.language')}</span><div class="seg" id="lg"><button data-l="en" class="${getLang() === 'en' ? 'active' : ''}">English</button><button data-l="fr" class="${getLang() === 'fr' ? 'active' : ''}">Français (QC)</button></div></div>
        </div>
        <div class="card stack"><h3>${t('set.export')}</h3><p class="small muted">Download everything the OS stores as JSON: Brain, facts, content, approvals and logs. API keys are never included.</p>
          <div class="row"><button class="btn" id="exp">${icon('download')} Export JSON</button><button class="btn btn-ghost" id="expc">${t('c.copy')} JSON</button></div></div>
        <div class="card"><div class="card-head"><h3>${t('set.log')}</h3><span class="xs muted">Every write is logged</span></div>
          <div class="table-wrap" style="border:0"><table class="table"><thead><tr><th>When</th><th>Action</th><th>Target</th><th>Status</th></tr></thead><tbody>
          ${writeLog.map((w) => `<tr><td class="small muted" style="white-space:nowrap">${esc(w.when)}</td><td class="small">${esc(w.action)}</td><td class="small">${esc(w.target)}</td><td><span class="chip ${w.status === 'Sent' ? 'ok' : ''}">${esc(w.status)}</span></td></tr>`).join('')}</tbody></table></div></div>
        <div class="card stack"><div class="card-head" style="margin:0"><h3>MCP access tokens</h3><span class="chip">Phase 6</span></div>
          <p class="small muted">Let Claude Code or Codex work inside the OS through /api/mcp. Read-only or read-write, revocable. Secrets and HighLevel conversations are never exposed.</p>
          <div><button class="btn btn-sm" disabled>${icon('plus')} New token</button></div></div>
      </div>

      <div class="card" style="margin-top:16px;border-color:color-mix(in srgb,var(--danger) 45%,transparent)">
        <h3 style="color:var(--danger)">${t('set.danger')}</h3><p class="small muted" style="margin-top:4px">Deletes all OS data: Brain, facts, drafts, content and logs. HighLevel data is not touched.</p>
        <div class="row wrap" style="margin-top:10px"><input class="input" id="del" placeholder='Type "delete" to confirm' style="max-width:260px"><button class="btn btn-danger solid" id="delbtn" disabled>Delete all OS data</button></div></div>`;

    const cq = $('#cq', el); cq.oninput = () => { q = cq.value; draw(); const c2 = $('#cq', el); c2.focus(); c2.setSelectionRange(q.length, q.length); };
    el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; draw(); });
    el.querySelectorAll('[data-test]').forEach((b) => b.onclick = () => { const c = connections.find((x) => x.id === b.dataset.test);
      b.disabled = true; b.textContent = 'Testing...';
      setTimeout(() => { toast(c.connected ? `${c.name}: connection OK (demo)` : `${c.name}: no key saved yet`); draw(); }, 700); });
    el.querySelectorAll('[data-conn]').forEach((b) => b.onclick = () => connect(connections.find((x) => x.id === b.dataset.conn)));
    el.querySelectorAll('[data-th]').forEach((b) => b.onclick = () => { setTheme(b.dataset.th); draw(); });
    el.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => { setLang(b.dataset.l); paintChrome('connections'); draw(); });
    $('#exp', el).onclick = () => {
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), note: 'Phase 1 demo export. No API keys.', facts: data.facts, approvals: data.approvals, content: data.contentItems, goals: data.goals, writeLog: data.writeLog }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'founders-os-export.json'; a.click();
    };
    $('#expc', el).onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify({ facts: data.facts, approvals: data.approvals, content: data.contentItems, goals: data.goals }, null, 2)); toast('Copied'); } catch (_) { toast('Copy blocked by the browser'); } };
    const del = $('#del', el), delbtn = $('#delbtn', el);
    del.oninput = () => { delbtn.disabled = del.value.trim() !== 'delete'; };
    delbtn.onclick = () => { del.value = ''; delbtn.disabled = true; toast('Demo mode: nothing was deleted'); };
  };

  function connect(c) {
    const scopes = c.id === 'hl' ? `<div class="notice info small" style="margin-top:10px">${icon('info')}<span>Scopes are listed exactly in Phase 4, checked against the current HighLevel API v2 docs. Start read-only.</span></div>`
      : c.id === 'meta' ? `<div class="notice info small" style="margin-top:10px">${icon('info')}<span>Read-only: the token needs ads_read only. The OS never edits campaigns.</span></div>` : '';
    modal({ title: `${c.connected ? 'Update' : 'Connect'} ${c.name}`, sub: esc(c.desc),
      body: `<div class="stack">${c.fields.map((f) => `<div class="field"><label>${esc(f)}</label><input class="input" type="${/token|key/i.test(f) ? 'password' : 'text'}" autocomplete="off" placeholder="${c.connected && /token|key/i.test(f) ? '•••••••• saved' : ''}"></div>`).join('')}</div>
        <div class="notice neutral xs" style="margin-top:12px">${icon('info')}<span>Keys are sent once to a server function, encrypted with AES-256-GCM and stored server-side. The browser never reads them back. (Phase 2. In this demo nothing is saved.)</span></div>${scopes}`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = () => { close(); toast('Demo mode: key not stored'); }; } });
  }
  draw();
}
