// Vault backed by Supabase: examples you admire become reusable briefs. Always labeled inspiration.
import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, $ } from '../ui.js';
import { live, api, q } from '../live.js';

export async function render(el, ctx) {
  let items = [];
  const load = async () => { items = await q(live.sb.from('vault_items').select('*').order('created_at', { ascending: false })); };
  const refresh = async () => { await load(); draw(); };
  const draw = () => {
    el.innerHTML = `
      ${head(t('vault.title'), t('vault.sub'), `<button class="btn btn-primary" id="add">${icon('plus')} Save example</button>`)}
      <div class="grid g3">${items.map((v) => `<div class="card stack-sm">
        <div class="row between"><span class="chip">${v.kind}</span><span class="chip warn">Inspiration</span></div>
        <h3 style="margin-top:8px">${esc(v.title)}</h3>${v.url ? `<a class="xs muted" href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.url.slice(0, 60))}</a>` : ''}
        ${v.note ? `<p class="small">${esc(v.note)}</p>` : ''}
        ${v.brief ? `<details class="small"><summary style="cursor:pointer;font-weight:600">Brief: ${esc(v.brief.title)}</summary><p style="margin-top:6px">${esc(v.brief.reusable_brief)}</p><ol>${v.brief.structure.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}
        <div class="row"><button class="btn btn-sm" data-brief="${v.id}">${icon('sparkle')} ${v.brief ? 'Rebuild brief' : t('vault.brief')}</button><button class="btn btn-sm btn-ghost" data-del="${v.id}" style="margin-left:auto">${icon('trash')}</button></div></div>`).join('') || '<div class="empty card soft">Save URLs, text or screenshots you admire. They never become Brand DNA facts.</div>'}</div>`;
    $('#add', el).onclick = add;
    el.querySelectorAll('[data-brief]').forEach((b) => b.onclick = async () => { b.disabled = true; b.textContent = 'Writing brief...';
      try { await api('studio', { body: { action: 'vault_brief', item_id: b.dataset.brief } }); ctx.refreshNav(); toast('Brief saved here and sent to Approvals'); } catch (e) { toast(e.message, { ms: 7000 }); } refresh(); });
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await q(live.sb.from('vault_items').delete().eq('id', b.dataset.del)).catch((e) => toast(e.message)); refresh(); });
  };
  function add() {
    modal({ title: 'Save example', body: `<div class="stack"><div class="seg" id="vk"><button class="active" data-k="url">URL</button><button data-k="text">Text</button><button data-k="screenshot">Screenshot</button></div>
      <div class="field"><label>Title</label><input class="input" id="vt" placeholder="What is it?"></div>
      <div class="field" data-p="url"><label>URL</label><input class="input" id="vu" type="url" placeholder="https://"></div>
      <div class="field hidden" data-p="text"><label>Text</label><textarea class="textarea" id="vb"></textarea></div>
      <div class="field hidden" data-p="screenshot"><label>Screenshot</label><input class="input" id="vf" type="file" accept="image/*"></div>
      <div class="field"><label>What do you like about it?</label><input class="input" id="vn"></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => {
        let kind = 'url';
        ov.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { kind = b.dataset.k; ov.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('active', x === b)); ov.querySelectorAll('[data-p]').forEach((p) => p.classList.toggle('hidden', p.dataset.p !== kind)); });
        ov.querySelector('[data-ok]').onclick = async () => {
          const v = (id) => ov.querySelector(id).value.trim();
          const row = { owner_id: live.ownerId, kind, title: v('#vt') || 'Example', note: v('#vn') || null };
          try {
            if (kind === 'url') { if (!/^https?:\/\//.test(v('#vu'))) return toast('Enter a full URL'); row.url = v('#vu'); }
            if (kind === 'text') { if (!v('#vb')) return toast('Paste the text'); row.body = v('#vb'); }
            if (kind === 'screenshot') { const f = ov.querySelector('#vf').files[0]; if (!f) return toast('Choose an image');
              const path = `${live.ownerId}/vault/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, '_').slice(-80)}`;
              const { error } = await live.sb.storage.from('brain').upload(path, f, { contentType: f.type }); if (error) throw new Error(error.message); row.storage_path = path; }
            await q(live.sb.from('vault_items').insert(row)); close(); refresh();
          } catch (e) { toast(e.message); }
        };
      } });
  }
  el.innerHTML = '<div class="empty">Loading vault...</div>';
  try { await load(); draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load Vault</h2><p class="mono">${esc(e.message)}</p></div>`; }
}
