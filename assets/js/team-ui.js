// Settings card: team members. The owner invites people by email; they sign in with a magic
// link and work in this workspace with everything except keys, MCP tokens, export and delete.
import { icon, esc, toast, modal } from './ui.js';
import { live, api, q } from './live.js';

const when = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const CAN = 'Members can use every screen, run agents and routines, approve drafts and send to HighLevel after the preview. They cannot see or change API keys, MCP tokens, the team, export or delete data.';

export async function mountTeam(box) {
  if (live.role === 'member') {
    box.innerHTML = `<h3>Team</h3><p class="small muted">You are a team member in this workspace, signed in as <b>${esc(live.user.email)}</b>. ${CAN}</p>`;
    return;
  }
  let members = [];
  const load = async () => { members = await q(live.sb.from('workspace_members').select('id, email, role, created_at').order('created_at')); };
  const draw = () => {
    box.innerHTML = `<div class="card-head" style="margin:0"><h3>Team</h3><span class="xs muted">${members.length} of 5</span></div>
      <p class="small muted">${CAN}</p>
      ${members.length ? `<div class="table-wrap" style="border:0"><table class="table"><thead><tr><th>Email</th><th>Role</th><th>Added</th><th></th></tr></thead><tbody>
        ${members.map((m) => `<tr><td class="small">${esc(m.email)}</td><td><span class="chip">Member</span></td><td class="small muted">${when(m.created_at)}</td>
          <td style="text-align:right"><button class="btn btn-sm btn-ghost" data-mrm="${m.id}">Remove</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="small muted">Only you have access.</p>'}
      <form class="row wrap" id="minv" autocomplete="off"><input class="input" id="mem" type="email" placeholder="teammate@example.com" style="max-width:300px" required>
        <button class="btn btn-primary btn-sm" id="minvbtn">${icon('plus')} Add member</button></form>
      <p class="xs muted">They go to ${esc(location.origin)}, enter their email and use the sign-in link. No password.</p>`;
    box.querySelector('#minv').onsubmit = async (e) => {
      e.preventDefault();
      const b = box.querySelector('#minvbtn'), email = box.querySelector('#mem').value.trim();
      if (!email) return;
      b.disabled = true;
      try { await api('account', { body: { action: 'member_invite', email } }); toast(`${email} added. They can sign in now.`); await load(); draw(); }
      catch (x) { toast(x.message); b.disabled = false; }
    };
    box.querySelectorAll('[data-mrm]').forEach((b) => b.onclick = () => {
      const m = members.find((x) => x.id === b.dataset.mrm);
      modal({ title: `Remove ${m.email}`, body: '<p class="small">They lose access right away and their sign-in account is deleted. Work they did stays in the OS.</p>',
        foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-danger solid" data-ok>Remove</button>',
        onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
          try { await api('account', { body: { action: 'member_remove', id: m.id } }); close(); toast('Removed'); await load(); draw(); } catch (x) { toast(x.message); }
        }; } });
    });
  };
  box.innerHTML = '<span class="small muted">Loading team...</span>';
  try { await load(); draw(); } catch (e) { box.innerHTML = `<h3>Team</h3><p class="small down">${esc(e.message)}. Run migration 007 in Supabase if you have not yet.</p>`; }
}
