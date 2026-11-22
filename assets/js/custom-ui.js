// Custom API connections: the Settings card (owner adds, tests, removes) and the "Attach data" picker
// used in AI Chat and AI Team. Requests are read-only and run on the server; keys never reach the browser.
import { icon, esc, toast, modal } from './ui.js';
import { live, api, q } from './live.js';

const AUTH = [['bearer', 'Bearer token (Authorization header)'], ['header', 'Key in a header'], ['query', 'Key in the address (?name=key)'], ['none', 'No key']];

export async function mountCustom(box, { isOwner }) {
  let conns = [], keys = [];
  const load = async () => {
    [conns, keys] = await Promise.all([q(live.sb.from('custom_connections').select('*').order('name')), isOwner ? api('keys', { method: 'GET' }).then((r) => r.custom || []).catch(() => []) : []]);
  };
  const draw = () => {
    box.innerHTML = `<div class="card-head" style="margin:0"><h3>Custom API connections</h3>${isOwner ? `<button class="btn btn-sm" id="ccadd">${icon('plus')} Add connection</button>` : ''}</div>
      <p class="small muted">Connect any app that has an API key, read-only. In AI Chat or AI Team, use <b>Attach data</b> to preview what it returns and add it to your message. Nothing is sent to these apps except GET requests, and keys stay encrypted on the server.</p>
      <div class="list">${conns.map((c) => { const k = keys.find((x) => x.id === c.id);
        return `<div class="list-item wrap"><span class="dot ${c.last_status === 'ok' ? 'on' : ''}" style="${c.last_status === 'error' ? 'background:var(--danger)' : ''}"></span><div class="grow"><b class="small">${esc(c.name)}</b>
          <div class="xs muted mono">${esc(c.base_url)} · ${c.endpoints.length} endpoint${c.endpoints.length === 1 ? '' : 's'}${isOwner && c.auth !== 'none' ? ` · ${k ? 'key ending ' + esc(k.last4 || '') : 'no key yet'}` : ''}</div>
          ${c.last_message ? `<div class="xs ${c.last_status === 'error' ? 'down' : 'muted'}">${esc(c.last_message)}</div>` : ''}</div>
          ${isOwner ? `<button class="btn btn-sm" data-cct="${c.id}">${icon('refresh')} Test</button><button class="btn btn-sm btn-ghost" data-cce="${c.id}">Edit</button><button class="btn btn-sm btn-ghost" data-ccd="${c.id}">${icon('trash')}</button>` : ''}</div>`; }).join('') || '<div class="empty small">No custom connections yet</div>'}</div>`;
    if (!isOwner) return;
    box.querySelector('#ccadd').onclick = () => edit(null);
    box.querySelectorAll('[data-cce]').forEach((b) => b.onclick = () => edit(conns.find((c) => c.id === b.dataset.cce)));
    box.querySelectorAll('[data-cct]').forEach((b) => b.onclick = async () => { b.disabled = true; b.textContent = 'Testing...';
      try { const r = await api('keys', { body: { action: 'custom_test', id: b.dataset.cct } }); toast(r.message, { ms: 6000 }); } catch (e) { toast(e.message, { ms: 6000 }); } await refresh(); });
    box.querySelectorAll('[data-ccd]').forEach((b) => b.onclick = () => { const c = conns.find((x) => x.id === b.dataset.ccd);
      modal({ title: 'Remove connection', body: `<p class="small">Removes "${esc(c.name)}" and its saved key. Messages you already sent keep the data you attached.</p>`, foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-danger solid" data-ok>Remove</button>',
        onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => { try { await api('keys', { body: { action: 'custom_delete', id: c.id } }); close(); toast('Connection removed'); refresh(); } catch (e) { toast(e.message); } }; } }); });
  };
  const refresh = async () => { try { await load(); draw(); } catch (e) { box.innerHTML = `<h3>Custom API connections</h3><p class="small muted">${esc(e.message)}</p>`; } };

  function edit(c) {
    const eps = c?.endpoints?.length ? c.endpoints : [{ name: '', path: '' }];
    modal({ title: c ? `Edit ${c.name}` : 'Add an API connection', wide: true, body: `<div class="stack">
      <div class="grid g2"><div class="field"><label>Name</label><input class="input" id="ccn" maxlength="60" value="${esc(c?.name || '')}" placeholder="Example: Calendly"></div>
      <div class="field"><label>API address</label><input class="input mono" id="ccu" value="${esc(c?.base_url || '')}" placeholder="https://api.calendly.com"></div></div>
      <div class="grid g2"><div class="field"><label>How the key is sent</label><select class="select" id="cca">${AUTH.map(([k, l]) => `<option value="${k}" ${k === (c?.auth || 'bearer') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field" id="ccnf"><label>Header or parameter name</label><input class="input mono" id="ccan" value="${esc(c?.auth_name || '')}" placeholder="X-API-Key"></div></div>
      <div class="field" id="cckf"><label>API key</label><input class="input mono" id="cck" type="password" autocomplete="off" placeholder="${c ? 'Leave empty to keep the saved key' : 'Paste the key'}"><div class="hint">Use a read-only key if the app offers one. It is encrypted and never shown again.</div></div>
      <div class="field"><label>Endpoints you want to read</label><div id="cceps" class="stack-sm"></div><button class="btn btn-sm btn-ghost" id="ccep" style="margin-top:6px">${icon('plus')} Endpoint</button>
        <div class="hint">A short name and the path after the address, for example "Upcoming events" and /scheduled_events?status=active</div></div></div>`,
      foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Save</button>',
      onMount: (ov, close) => {
        const list = ov.querySelector('#cceps');
        const row = (e) => { const d = document.createElement('div'); d.className = 'row'; d.innerHTML = `<input class="input" data-epn placeholder="Name" style="max-width:200px" value="${esc(e.name)}"><input class="input mono grow" data-epp placeholder="/path" value="${esc(e.path)}"><button class="btn btn-sm btn-ghost" data-eprm>${icon('x')}</button>`; d.querySelector('[data-eprm]').onclick = () => d.remove(); list.appendChild(d); };
        eps.forEach(row);
        ov.querySelector('#ccep').onclick = () => row({ name: '', path: '' });
        const sync = () => { const a = ov.querySelector('#cca').value; ov.querySelector('#ccnf').style.display = a === 'header' || a === 'query' ? '' : 'none'; ov.querySelector('#cckf').style.display = a === 'none' ? 'none' : ''; };
        ov.querySelector('#cca').onchange = sync; sync();
        ov.querySelector('[data-ok]').onclick = async (ev) => {
          const b = ev.currentTarget;
          const connection = { name: ov.querySelector('#ccn').value, base_url: ov.querySelector('#ccu').value, auth: ov.querySelector('#cca').value, auth_name: ov.querySelector('#ccan').value,
            endpoints: [...list.children].map((d) => ({ name: d.querySelector('[data-epn]').value, path: d.querySelector('[data-epp]').value })).filter((e) => e.name.trim() && e.path.trim()) };
          if (!connection.endpoints.length) return toast('Add at least one endpoint');
          b.disabled = true;
          try { await api('keys', { body: { action: 'custom_save', id: c?.id, connection, key: ov.querySelector('#cck').value } }); close(); toast('Saved. Click Test to check it.'); refresh(); }
          catch (e) { toast(e.message, { ms: 7000 }); b.disabled = false; }
        };
      } });
  }
  box.innerHTML = '<h3>Custom API connections</h3><p class="small muted">Loading...</p>';
  await refresh();
}

// Picker: choose a connection and endpoint, preview the response, then attach it. Resolves with the text block or null.
export function attachData() {
  return new Promise(async (resolve) => {
    let conns = [];
    try { conns = await q(live.sb.from('custom_connections').select('id, name, endpoints').order('name')); } catch (e) { toast(e.message); return resolve(null); }
    if (!conns.length) { toast('Add a custom API connection in Connections and Settings first.', { ms: 6000 }); return resolve(null); }
    let result = null, done = false;
    modal({ title: 'Attach data from a connection', wide: true, body: `<div class="stack">
      <div class="grid g2"><div class="field"><label>Connection</label><select class="select" id="adc">${conns.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Endpoint</label><select class="select" id="ade"></select></div></div>
      <div class="field"><label>Path (you can add filters)</label><input class="input mono" id="adp"></div>
      <div class="row"><button class="btn" id="adgo">${icon('refresh')} Preview</button><span class="xs muted" id="adst"></span></div>
      <pre class="preview-box mono xs" id="adout" style="max-height:300px;overflow:auto;white-space:pre-wrap;display:none"></pre>
      <p class="xs muted">Only what you see here is added to your message, so the AI reads exactly this data.</p></div>`,
      foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok disabled>Attach to message</button>',
      onMount: (ov, close) => {
        const fillEps = () => { const c = conns.find((x) => x.id === ov.querySelector('#adc').value); ov.querySelector('#ade').innerHTML = c.endpoints.map((e, i) => `<option value="${i}">${esc(e.name)}</option>`).join(''); ov.querySelector('#adp').value = c.endpoints[0]?.path || '/'; };
        ov.querySelector('#adc').onchange = fillEps; fillEps();
        ov.querySelector('#ade').onchange = () => { const c = conns.find((x) => x.id === ov.querySelector('#adc').value); ov.querySelector('#adp').value = c.endpoints[+ov.querySelector('#ade').value]?.path || '/'; };
        ov.querySelector('#adgo').onclick = async (ev) => {
          const b = ev.currentTarget; b.disabled = true; ov.querySelector('#adst').textContent = 'Reading...';
          try {
            const r = await api('studio', { body: { action: 'custom_fetch', id: ov.querySelector('#adc').value, path: ov.querySelector('#adp').value.trim() } });
            const text = r.text.slice(0, 20000);
            ov.querySelector('#adout').textContent = text || '(empty response)'; ov.querySelector('#adout').style.display = '';
            ov.querySelector('#adst').textContent = `${r.status} · ${r.type || 'unknown type'}${r.truncated || r.text.length > 20000 ? ' · cut to 20,000 characters' : ''}`;
            result = r.ok ? `Data from ${r.name} (GET ${r.path}):\n\`\`\`\n${text}\n\`\`\`` : null;
            ov.querySelector('[data-ok]').disabled = !r.ok;
            if (!r.ok) toast(`The API returned ${r.status}. Check the path or the key.`, { ms: 6000 });
          } catch (e) { ov.querySelector('#adst').textContent = ''; toast(e.message, { ms: 7000 }); }
          b.disabled = false;
        };
        ov.querySelector('[data-ok]').onclick = () => { done = true; close(); resolve(result); };
      },
      onClose: () => { if (!done) resolve(null); } });
  });
}
