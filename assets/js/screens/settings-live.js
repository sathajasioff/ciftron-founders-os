// Connections and Settings backed by the server: encrypted keys, tests, export, danger zone.
import { t, getLang, setLang } from '../i18n.js';
import { head, icon, esc, toast, modal, $ } from '../ui.js';
import { live, api, q } from '../live.js';
import { setTheme, paintChrome } from '../app.js';
import { hlWrite } from '../hl-ui.js';

const HL_SCOPES = {
  read: ['locations.readonly', 'opportunities.readonly', 'contacts.readonly', 'products.readonly', 'funnels/funnel.readonly', 'socialplanner/account.readonly', 'locations/customValues.readonly'],
  write: ['opportunities.write', 'contacts.write', 'socialplanner/post.write', 'emails/templates.write', 'locations/customValues.write', 'products.write', 'products/prices.write', 'courses.write'],
};

const DESC = {
  highlevel: 'Private Integration token and Location ID for the Ciftron sub-account. Read context, pipeline and confirmed drafts.',
  meta_ads: 'Read-only Marketing API: campaigns, spend, leads and cost per lead. Needs only the ads_read permission.',
  anthropic: 'Claude models for chat, agents, fact proposals and the style guide.',
  openai: 'Embeddings for Brain search (text-embedding-3-small) and GPT for the Strategy Room.',
  openrouter: 'Image generation for Graphics.',
  elevenlabs: 'Voice for Jarvis. Voice ID is optional; a default voice is used if empty.',
  apify: 'Instagram research for Content (public posts only).',
  youtube: 'YouTube research for Content (public stats only).',
  mcp: 'Connect another MCP server.',
};
const FIELD_LABEL = { private_integration_token: 'Private Integration token', location_id: 'Location ID', access_token: 'System user access token', ad_account_id: 'Ad account ID (act_...)', api_key: 'API key', api_token: 'API token', voice_id: 'Voice ID', token: 'Token', server_url: 'Server URL' };
const NEEDED_NOW = ['anthropic', 'openai'];
const ui = { q: '', filter: 'all' };

export async function render(el) {
  let providers = [], log = [];
  const load = async () => {
    const [k, l] = await Promise.all([api('keys', { method: 'GET' }), q(live.sb.from('hl_write_log').select('created_at, action, target, status').order('created_at', { ascending: false }).limit(20))]);
    providers = k.providers; log = l;
  };

  const draw = () => {
    const list = providers.filter((c) => (ui.filter === 'all' || (ui.filter === 'on' ? c.connected : !c.connected)) && `${c.name} ${DESC[c.id]}`.toLowerCase().includes(ui.q.toLowerCase()));
    const theme = document.documentElement.dataset.theme;
    const missing = NEEDED_NOW.filter((id) => !providers.find((p) => p.id === id)?.connected);
    el.innerHTML = `
      ${head(t('set.title'), t('set.sub'))}
      ${missing.length ? `<div class="notice info" style="margin-bottom:14px">${icon('info')}<span>The Brain needs ${missing.map((m) => providers.find((p) => p.id === m).name).join(' and ')} to process sources and propose facts.</span></div>` : ''}
      <div class="row wrap between" style="margin-bottom:14px">
        <input class="input" id="cq" placeholder="${t('c.search')} connections" value="${esc(ui.q)}" style="max-width:320px">
        <div class="seg">${[['all', t('c.all')], ['on', t('set.connected')], ['off', t('set.notConnected')]].map(([k, l]) => `<button class="${k === ui.filter ? 'active' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="grid g3" style="margin-bottom:26px">${list.map((c) => `<div class="card stack-sm">
        <div class="row between"><div class="row"><span class="dot ${c.status === 'ok' ? 'on' : ''}" style="${c.status === 'error' ? 'background:var(--danger)' : ''}"></span><h3>${esc(c.name)}</h3></div>
          ${c.connected ? `<span class="chip ${c.status === 'ok' ? 'ok' : c.status === 'error' ? 'danger' : 'warn'}">${c.status === 'ok' ? 'Working' : c.status === 'error' ? 'Failing' : 'Not tested'}</span>` : c.phase ? `<span class="chip">Phase ${c.phase}</span>` : ''}</div>
        <p class="small muted" style="margin-top:6px">${esc(DESC[c.id])}</p>
        ${c.connected ? `<div class="xs mono muted">${c.last4 ? 'Key ending ' + esc(c.last4) : 'Saved'}${Object.entries(c.config || {}).filter(([, v]) => v).map(([k, v]) => ` · ${esc(FIELD_LABEL[k] || k)}: ${esc(v)}`).join('')}</div>` : ''}
        ${c.test_message ? `<div class="xs ${c.status === 'error' ? 'down' : 'muted'}">${esc(c.test_message)}</div>` : ''}
        <div class="row" style="margin-top:10px">${c.connected
          ? `<button class="btn btn-sm" data-test="${c.id}">${icon('refresh')} ${t('c.test')}</button><button class="btn btn-sm btn-ghost" data-conn="${c.id}">${t('c.edit')}</button><button class="btn btn-sm btn-ghost" data-rm="${c.id}" style="margin-left:auto" title="Remove key">${icon('trash')}</button>`
          : `<button class="btn btn-sm btn-primary" data-conn="${c.id}">${t('c.connect')}</button>`}</div></div>`).join('') || '<div class="empty">No connections match.</div>'}</div>

      <div class="grid g2">
        <div class="card stack"><h3>${t('set.appearance')}</h3>
          <div class="row between"><span class="small">${t('set.theme')}</span><div class="seg"><button data-th="light" class="${theme === 'light' ? 'active' : ''}">${t('set.light')}</button><button data-th="dark" class="${theme === 'dark' ? 'active' : ''}">${t('set.dark')}</button></div></div>
          <div class="row between"><span class="small">${t('c.language')}</span><div class="seg"><button data-l="en" class="${getLang() === 'en' ? 'active' : ''}">English</button><button data-l="fr" class="${getLang() === 'fr' ? 'active' : ''}">Français (QC)</button></div></div>
        </div>
        <div class="card stack"><h3>${t('set.export')}</h3><p class="small muted">Download everything the OS stores as JSON. API keys and embeddings are never included.</p>
          <div><button class="btn" id="exp">${icon('download')} Export JSON</button></div></div>
        <div class="card"><div class="card-head"><h3>${t('set.log')}</h3><span class="xs muted">Every write is logged</span></div>
          ${log.length ? `<div class="table-wrap" style="border:0"><table class="table"><thead><tr><th>When</th><th>Action</th><th>Target</th><th>Status</th></tr></thead><tbody>
          ${log.map((w) => `<tr><td class="small muted" style="white-space:nowrap">${new Date(w.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td><td class="small">${esc(w.action)}</td><td class="small">${esc(w.target)}</td><td><span class="chip ${w.status === 'sent' ? 'ok' : 'danger'}">${esc(w.status)}</span></td></tr>`).join('')}</tbody></table></div>`
          : '<p class="small muted">No HighLevel writes yet. They start in Phase 4.</p>'}</div>
        <div class="card stack" id="cvcard"><div class="card-head" style="margin:0"><h3>HighLevel custom values (OS_)</h3>${providers.find((p) => p.id === 'highlevel')?.connected ? '<button class="btn btn-sm" id="cvload">Load</button>' : '<span class="chip">Connect HighLevel</span>'}</div>
          <p class="small muted">The OS can only create or change custom values whose name starts with OS_. Each change is previewed and logged.</p><div id="cvlist"></div></div>
        <div class="card stack"><div class="card-head" style="margin:0"><h3>MCP access tokens</h3><span class="chip">Phase 6</span></div>
          <p class="small muted">Let Claude Code or Codex work inside the OS through /api/mcp. Read-only or read-write, revocable. Secrets and HighLevel conversations are never exposed.</p></div>
      </div>

      <div class="card" style="margin-top:16px;border-color:color-mix(in srgb,var(--danger) 45%,transparent)">
        <h3 style="color:var(--danger)">${t('set.danger')}</h3><p class="small muted" style="margin-top:4px">Deletes all OS data: Brain, facts, offers, drafts, saved keys and logs. Your login stays. HighLevel is not touched. This cannot be undone.</p>
        <div class="row wrap" style="margin-top:10px"><input class="input" id="del" placeholder='Type "delete" to confirm' style="max-width:260px" autocomplete="off"><button class="btn btn-danger solid" id="delbtn" disabled>Delete all OS data</button></div></div>`;

    const cq = $('#cq', el); cq.oninput = () => { ui.q = cq.value; draw(); const c2 = $('#cq', el); c2.focus(); c2.setSelectionRange(ui.q.length, ui.q.length); };
    el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { ui.filter = b.dataset.f; draw(); });
    el.querySelectorAll('[data-test]').forEach((b) => b.onclick = async () => {
      b.disabled = true; b.textContent = 'Testing...';
      try { const r = await api('keys', { body: { action: 'test', provider: b.dataset.test } }); toast(r.message); } catch (e) { toast(e.message); }
      await load(); draw();
    });
    el.querySelectorAll('[data-conn]').forEach((b) => b.onclick = () => connect(providers.find((x) => x.id === b.dataset.conn)));
    el.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => remove(providers.find((x) => x.id === b.dataset.rm)));
    el.querySelectorAll('[data-th]').forEach((b) => b.onclick = () => { setTheme(b.dataset.th); draw(); });
    el.querySelectorAll('[data-l]').forEach((b) => b.onclick = () => { setLang(b.dataset.l); paintChrome('connections'); draw(); });
    $('#exp', el).onclick = async (ev) => { const __b = ev.currentTarget; 
      const b = __b; b.disabled = true;
      try {
        const data = await api('account', { body: { action: 'export' } });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        a.download = `founders-os-export-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      } catch (e) { toast(e.message); }
      b.disabled = false;
    };
    const cvl = $('#cvload', el); if (cvl) cvl.onclick = () => loadCustomValues();
    const del = $('#del', el), delbtn = $('#delbtn', el);
    del.oninput = () => { delbtn.disabled = del.value.trim() !== 'delete'; };
    delbtn.onclick = async () => {
      delbtn.disabled = true;
      try { await api('account', { body: { action: 'delete', confirm: del.value.trim() } }); toast('All OS data deleted'); setTimeout(() => location.reload(), 1200); }
      catch (e) { toast(e.message); delbtn.disabled = false; }
    };
  };

  function connect(c) {
    const fields = [...c.fields.secret.map((f) => [f, true]), ...c.fields.plain.map((f) => [f, false])];
    const scopes = c.id === 'highlevel' ? `In HighLevel: Settings → Private Integrations → your integration → Scopes. Tick these read scopes: <span class="mono">${HL_SCOPES.read.join(', ')}</span>. Add write scopes only when you want those actions: <span class="mono">${HL_SCOPES.write.join(', ')}</span>.`
      : c.id === 'meta_ads' ? 'Read-only: give the system user token only the ads_read permission. The OS never edits campaigns.' : '';
    modal({ title: `${c.connected ? 'Update' : 'Connect'} ${c.name}`, sub: esc(DESC[c.id]),
      body: `<form class="stack" id="kf" autocomplete="off">${fields.map(([f, secret]) => `<div class="field"><label for="k_${f}">${esc(FIELD_LABEL[f] || f)}</label>
          <input class="input" id="k_${f}" name="${f}" type="${secret ? 'password' : 'text'}" autocomplete="off" spellcheck="false" value="${secret ? '' : esc(c.config?.[f] || '')}" placeholder="${secret && c.connected ? 'Saved. Leave blank to keep it.' : ''}"></div>`).join('')}</form>
        <div class="notice neutral xs" style="margin-top:12px">${icon('info')}<span>Sent once over HTTPS to a server function, encrypted with AES-256-GCM, and stored server-side. The browser never reads it back.</span></div>
        ${scopes ? `<div class="notice info small" style="margin-top:10px">${icon('info')}<span>${scopes}</span></div>` : ''}`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${c.phase ? t('c.save') : 'Save and test'}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async (ev) => { const __b = ev.currentTarget; 
        const b = __b;
        const values = Object.fromEntries(fields.map(([f]) => [f, ov.querySelector(`#k_${f}`).value]));
        if (!c.connected && c.fields.secret.some((f) => !values[f].trim())) return toast('Fill in every field');
        b.disabled = true;
        try {
          await api('keys', { body: { provider: c.id, values } });
          fields.forEach(([f]) => { ov.querySelector(`#k_${f}`).value = ''; });
          let msg = 'Saved';
          if (!c.phase) { const r = await api('keys', { body: { action: 'test', provider: c.id } }); msg = r.message; }
          close(); toast(msg); await load(); draw();
        } catch (e) { toast(e.message); b.disabled = false; }
      }; } });
  }

  async function loadCustomValues() {
    const box = $('#cvlist', el); box.innerHTML = '<span class="small muted">Loading...</span>';
    try {
      const { customValues } = await api('hl', { body: { action: 'context' } });
      if (customValues?.error) { box.innerHTML = `<p class="small down">${esc(customValues.error)}</p>`; return; }
      box.innerHTML = `${customValues.length ? customValues.map((v) => `<div class="row between small" style="margin-bottom:6px"><span class="mono grow">${esc(v.name)}</span><span class="muted" style="max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(v.value)}</span><button class="btn btn-sm btn-ghost" data-cv="${esc(v.id)}">${t('c.edit')}</button></div>`).join('') : '<p class="small muted">No OS_ custom values yet.</p>'}
        <button class="btn btn-sm" id="cvnew">${icon('plus')} New OS_ value</button>`;
      box.querySelectorAll('[data-cv]').forEach((b) => b.onclick = () => editValue(customValues.find((v) => v.id === b.dataset.cv)));
      $('#cvnew', box).onclick = () => editValue(null);
    } catch (e) { box.innerHTML = `<p class="small down">${esc(e.message)}</p>`; }
  }

  function editValue(v) {
    modal({ title: v ? `Edit ${v.name}` : 'New OS_ custom value', body: `<div class="stack"><div class="field"><label>Name</label><input class="input mono" id="cvn" value="${esc(v?.name || 'OS_')}" ${v ? 'readonly' : ''}><div class="hint">Must start with OS_. Letters, numbers and _ only.</div></div>
      <div class="field"><label>Value</label><textarea class="textarea" id="cvv">${esc(v?.value || '')}</textarea></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>Review</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = () => {
        const input = { id: v?.id, name: ov.querySelector('#cvn').value.trim(), value: ov.querySelector('#cvv').value };
        close(); hlWrite('custom_value', input, { onDone: loadCustomValues });
      }; } });
  }

  function remove(c) {
    modal({ title: `Remove ${c.name}`, body: `<p class="small">Deletes the saved key. Features that use ${esc(c.name)} stop working until you add it again.</p>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-danger solid" data-ok>Remove</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => { try { await api('keys', { method: 'DELETE', body: { provider: c.id } }); close(); toast('Removed'); await load(); draw(); } catch (e) { toast(e.message); } }; } });
  }

  el.innerHTML = '<div class="empty">Loading connections...</div>';
  try { await load(); draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load connections</h2><p class="mono">${esc(e.message)}</p></div>`; }
}
