// Settings card: recent errors from server functions, MCP, the daily cron and the browser.
import { icon, esc, toast } from './ui.js';
import { live, api, q } from './live.js';

const when = (d) => new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const SOURCE = { server: 'Server', browser: 'Browser', cron: 'Routine', mcp: 'MCP' };

export async function mountErrors(box) {
  let rows = [];
  const load = async () => { rows = await q(live.sb.from('error_log').select('id, source, route, status, message, detail, created_at').order('created_at', { ascending: false }).limit(50)); };
  const draw = () => {
    box.innerHTML = `<div class="card-head" style="margin:0"><h3>Error log</h3>${rows.length ? `<button class="btn btn-sm btn-ghost" id="errclear">${icon('trash')} Clear</button>` : ''}</div>
      <p class="small muted">Failures from server functions, MCP, routines and this browser, kept for 30 days. Keys and tokens are removed before anything is saved.</p>
      ${rows.length ? `<div class="table-wrap" style="border:0"><table class="table"><thead><tr><th>When</th><th>Where</th><th>Error</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td class="small muted" style="white-space:nowrap;vertical-align:top">${when(r.created_at)}</td>
          <td style="vertical-align:top"><span class="chip">${SOURCE[r.source] || esc(r.source)}</span><div class="xs mono muted" style="margin-top:4px">${esc(r.route || '')}${r.status ? ` · ${r.status}` : ''}</div></td>
          <td class="small"><div>${esc(r.message)}</div>${r.detail && Object.keys(r.detail).length ? `<details class="xs muted"><summary>Details</summary><pre class="mono" style="white-space:pre-wrap;margin:4px 0 0">${esc(JSON.stringify(r.detail, null, 2))}</pre></details>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="small muted">No errors logged in the last 30 days.</p>'}`;
    const c = box.querySelector('#errclear');
    if (c) c.onclick = async () => {
      c.disabled = true;
      try { await api('account', { body: { action: 'errors_clear' } }); rows = []; draw(); toast('Error log cleared'); } catch (e) { toast(e.message); c.disabled = false; }
    };
  };
  try { await load(); draw(); } catch (e) { box.innerHTML = `<h3>Error log</h3><p class="small down">${esc(e.message)}. Run migration 006 in Supabase if you have not yet.</p>`; }
}
