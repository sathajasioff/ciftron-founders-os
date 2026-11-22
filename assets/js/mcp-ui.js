// Settings card: MCP tokens and the MCP edit log with Undo.
import { icon, esc, toast, modal } from './ui.js';
import { live, api, q } from './live.js';

const when = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never');
const TABLE = { approvals: 'Draft', content_items: 'Content card', brain_facts: 'Brain fact', goals: 'Goal', vault_items: 'Vault item' };
const endpoint = () => `${location.origin}/api/mcp`;

function summary(e) {
  const what = TABLE[e.table_name] || e.table_name;
  if (e.action === 'insert') return `Added ${what.toLowerCase()}${e.new_value?.title ? `: ${e.new_value.title}` : ''}`;
  const fields = Object.keys(e.new_value || {}).filter((k) => k !== 'version');
  return `Edited ${what.toLowerCase()} (${fields.join(', ') || 'no fields'})`;
}

const copy = async (text, label = 'Copied') => { try { await navigator.clipboard.writeText(text); toast(label); } catch { toast('Copy failed. Select the text and copy it.'); } };

// Settings redraws on every search keystroke, so keep the last load briefly.
const cache = { at: 0, tokens: [], edits: [] };

export async function mountMcp(box) {
  let { tokens, edits } = cache;
  const load = async (fresh = true) => {
    if (!fresh && Date.now() - cache.at < 30000) return;
    [tokens, edits] = await Promise.all([
      // token_hash is not readable from the browser; list the safe columns only.
      q(live.sb.from('mcp_tokens').select('id, name, scope, token_prefix, last_used_at, revoked_at, created_at').order('created_at', { ascending: false })),
      q(live.sb.from('mcp_edit_log').select('id, token_id, action, tool, table_name, row_id, previous_value, new_value, undone_at, created_at').order('created_at', { ascending: false }).limit(30)),
    ]);
    Object.assign(cache, { at: Date.now(), tokens, edits });
  };

  const draw = () => {
    const active = tokens.filter((x) => !x.revoked_at);
    const name = (id) => tokens.find((x) => x.id === id)?.name || 'Deleted token';
    box.innerHTML = `
      <div class="card-head" style="margin:0"><h3>MCP access</h3><button class="btn btn-sm btn-primary" id="mcpnew">${icon('plus')} New token</button></div>
      <p class="small muted">Let Claude Code, Codex or another MCP client work inside the OS. Read tokens can look. Read and write tokens can also save drafts to Approvals and edit planning rows. API keys, connection settings and HighLevel conversations are never exposed, and nothing is published or sent.</p>
      <div class="row wrap small"><span class="muted">Endpoint</span><span class="mono" id="mcpurl">${esc(endpoint())}</span><button class="btn btn-sm btn-ghost" id="mcpcopy">${icon('copy')} Copy</button></div>
      ${tokens.length ? `<div class="table-wrap" style="border:0"><table class="table"><thead><tr><th>Name</th><th>Access</th><th>Token</th><th>Last used</th><th>Created</th><th></th></tr></thead><tbody>
        ${tokens.map((x) => `<tr${x.revoked_at ? ' style="opacity:.55"' : ''}><td class="small">${esc(x.name)}</td>
          <td><span class="chip ${x.scope === 'read_write' ? 'warn' : ''}">${x.scope === 'read_write' ? 'Read and write' : 'Read only'}</span></td>
          <td class="xs mono muted">${esc(x.token_prefix || 'cfos_')}...</td><td class="small muted">${when(x.last_used_at)}</td><td class="small muted">${when(x.created_at)}</td>
          <td style="text-align:right">${x.revoked_at ? '<span class="chip">Revoked</span>' : `<button class="btn btn-sm btn-ghost" data-revoke="${x.id}">Revoke</button>`}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="small muted">No tokens yet.</p>'}
      <div class="card-head" style="margin:6px 0 0"><h3 style="font-size:15px">Edits made through MCP</h3><span class="xs muted">${active.length} active token${active.length === 1 ? '' : 's'}</span></div>
      ${edits.length ? `<div class="table-wrap" style="border:0"><table class="table"><thead><tr><th>When</th><th>Token</th><th>Change</th><th></th></tr></thead><tbody>
        ${edits.map((e) => `<tr><td class="small muted" style="white-space:nowrap">${when(e.created_at)}</td><td class="small">${esc(name(e.token_id))}</td>
          <td class="small"><div>${esc(summary(e))}</div>${e.action === 'update' ? `<details class="xs muted"><summary>Previous value</summary><pre class="mono" style="white-space:pre-wrap;margin:4px 0 0">${esc(JSON.stringify(e.previous_value, null, 2))}</pre></details>` : ''}</td>
          <td style="text-align:right">${e.undone_at ? '<span class="chip">Undone</span>' : `<button class="btn btn-sm" data-undo="${e.id}">${icon('undo')} Undo</button>`}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="small muted">No MCP edits yet. Every write through MCP shows up here with the previous value and an Undo button.</p>'}`;

    box.querySelector('#mcpcopy').onclick = () => copy(endpoint(), 'Endpoint copied');
    box.querySelector('#mcpnew').onclick = create;
    box.querySelectorAll('[data-revoke]').forEach((b) => b.onclick = () => revoke(tokens.find((x) => x.id === b.dataset.revoke)));
    box.querySelectorAll('[data-undo]').forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try { const r = await api('account', { body: { action: 'mcp_undo', id: +b.dataset.undo } }); toast(r.message || 'Undone'); await load(); draw(); }
      catch (e) { toast(e.message); b.disabled = false; }
    });
  };

  function create() {
    modal({ title: 'New MCP token', sub: 'The token is shown once. Store it in your MCP client, not in chat or a repo.',
      body: `<div class="stack"><div class="field"><label for="mtn">Name</label><input class="input" id="mtn" placeholder="Claude Code laptop" maxlength="60" autocomplete="off"></div>
        <div class="field"><label>Access</label><div class="seg" id="mts"><button class="active" data-s="read">Read only</button><button data-s="read_write">Read and write</button></div>
        <div class="hint">Read and write can add drafts to Approvals, edit pending drafts, content cards, Brain facts and goals, and save to the vault. Every edit is logged with Undo.</div></div></div>`,
      foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Create token</button>',
      onMount: (ov, close) => {
        let scope = 'read';
        ov.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { scope = b.dataset.s; ov.querySelectorAll('[data-s]').forEach((x) => x.classList.toggle('active', x === b)); });
        ov.querySelector('[data-ok]').onclick = async (ev) => {
          const b = ev.currentTarget;
          const name = ov.querySelector('#mtn').value.trim();
          if (!name) return toast('Give the token a name');
          b.disabled = true;
          try { const r = await api('account', { body: { action: 'mcp_token_create', name, scope } }); close(); reveal(r); await load(); draw(); }
          catch (e) { toast(e.message); b.disabled = false; }
        };
      } });
  }

  function reveal(r) {
    const cmd = `claude mcp add --transport http founders-os ${endpoint()} --header "Authorization: Bearer ${r.token}"`;
    modal({ title: 'Copy your token now', sub: 'It will not be shown again. If you lose it, revoke it and make a new one.', wide: true,
      body: `<div class="stack"><div class="field"><label>Token (${r.scope === 'read_write' ? 'read and write' : 'read only'})</label><div class="preview-box mono" style="word-break:break-all">${esc(r.token)}</div></div>
        <div class="field"><label>Claude Code</label><div class="preview-box mono xs" style="word-break:break-all">${esc(cmd)}</div><div class="hint">Run in a terminal. Other clients: add an HTTP MCP server with the endpoint above and the header Authorization: Bearer &lt;token&gt;.</div></div></div>`,
      foot: '<button class="btn" data-cmd>Copy command</button><button class="btn btn-primary" data-tok>Copy token</button>',
      onMount: (ov) => { ov.querySelector('[data-tok]').onclick = () => copy(r.token, 'Token copied'); ov.querySelector('[data-cmd]').onclick = () => copy(cmd, 'Command copied'); } });
  }

  function revoke(x) {
    modal({ title: `Revoke ${x.name}`, body: '<p class="small">Any client using this token loses access right away. This cannot be undone.</p>',
      foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-danger solid" data-ok>Revoke</button>',
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        try { await api('account', { body: { action: 'mcp_token_revoke', id: x.id } }); close(); toast('Revoked'); await load(); draw(); } catch (e) { toast(e.message); }
      }; } });
  }

  if (Date.now() - cache.at >= 30000) box.innerHTML = '<span class="small muted">Loading MCP access...</span>';
  try { await load(false); draw(); } catch (e) { box.innerHTML = `<h3>MCP access</h3><p class="small down">${esc(e.message)}. Run migration 005 in Supabase if you have not yet.</p>`; }
}
