// Goals backed by Supabase: plain-language goals become measurable targets with live numbers.
import { t } from '../i18n.js';
import { head, icon, esc, toast, modal, $ } from '../ui.js';
import { live, api, q, versionedUpdate } from '../live.js';

const SRC = { highlevel: 'HighLevel', meta_ads: 'Meta Ads', content: 'OS Content', manual: 'Manual' };
const METRIC = (k) => (!k ? 'Manual' : k === 'hl_new_leads' ? 'New HighLevel opportunities' : k.startsWith('hl_stage:') ? `Reached "${k.slice(9)}"` : k === 'hl_won' ? 'Won opportunities' : k === 'meta_leads' ? 'Meta leads (30 days)' : k === 'meta_cpl' ? 'Meta cost per lead (7 days)' : k === 'content_published' ? 'Content uploaded' : 'Manual');

export async function render(el) {
  let goals = [], items = [];
  const load = async () => { [goals, items] = await Promise.all([q(live.sb.from('goals').select('*').order('created_at', { ascending: false })), q(live.sb.from('goal_items').select('*').order('sort'))]); };
  const refresh = async () => { await load(); draw(); };
  const pct = (g) => {
    if (!g.target_value) return null;
    if (g.metric_key === 'meta_cpl') return g.current_value ? Math.max(0, Math.min(100, Math.round((g.target_value / g.current_value) * 100))) : 0;
    return Math.min(100, Math.round((Number(g.current_value) / Number(g.target_value)) * 100));
  };
  const draw = () => {
    el.innerHTML = `
      ${head(t('goals.title'), t('goals.sub'), `<button class="btn" id="sync">${icon('refresh')} Sync numbers</button>`)}
      <form class="card row" id="gform" style="margin-bottom:16px"><input class="input grow" id="graw" placeholder="${esc(t('goals.placeholder'))}"><button class="btn btn-primary" id="gadd">${icon('sparkle')} ${t('goals.add')}</button></form>
      <div class="grid g2">${goals.map((g) => { const p = pct(g); const its = items.filter((i) => i.goal_id === g.id);
        return `<div class="card stack"><div class="row between top"><div class="grow"><div class="xs muted">"${esc(g.raw)}"</div><h3 style="margin-top:4px">${esc(g.target || g.raw)}</h3></div><span class="chip ${g.metric_source === 'manual' ? '' : 'info'}">${SRC[g.metric_source] || 'Manual'}</span></div>
          <div><div class="row between small"><span><b>${g.metric_key === 'meta_cpl' ? '$' + Number(g.current_value).toFixed(2) : Number(g.current_value)}</b> ${g.target_value != null ? `of ${g.metric_key === 'meta_cpl' ? '$' + Number(g.target_value).toFixed(2) + ' target' : Number(g.target_value)}` : '<span class="placeholder">[TARGET]</span>'} ${esc(g.unit || '')}</span><span class="muted">${p != null ? p + '%' : ''}</span></div>
            <div class="progress accent" style="margin-top:6px"><span style="width:${p || 0}%"></span></div>
            <div class="xs muted" style="margin-top:4px">${METRIC(g.metric_key)}${g.due_date ? ` · due ${new Date(g.due_date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ' · <span class="placeholder">[DATE]</span>'}${g.last_synced_at ? ` · synced ${new Date(g.last_synced_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}</div></div>
          <div>${its.map((i) => `<label class="row small" style="margin:6px 0"><input type="checkbox" data-item="${i.id}" ${i.done ? 'checked' : ''}> <span class="${i.done ? 'faint' : ''}">${esc(i.text)}</span></label>`).join('')}</div>
          <div class="row"><button class="btn btn-sm" data-edit="${g.id}">${t('c.edit')}</button>${g.metric_source === 'manual' ? `<button class="btn btn-sm" data-set="${g.id}">Update number</button>` : ''}<button class="btn btn-sm btn-ghost" data-del="${g.id}" style="margin-left:auto">${icon('trash')}</button></div></div>`; }).join('') || '<div class="empty card soft">Type a goal above. Examples: Generate 100 qualified leads. Book 15 qualified appointments. Publish 20 pieces of content.</div>'}</div>`;
    $('#gform', el).onsubmit = async (e) => {  e.preventDefault(); const raw = $('#graw', el).value.trim(); if (!raw) return; const b = $('#gadd', el); b.disabled = true; b.textContent = 'Thinking...';
      try { await api('studio', { body: { action: 'goal', raw } }); await api('studio', { body: { action: 'goals_sync' } }).catch(() => {}); toast('Goal added. Fill any placeholders.'); } catch (x) { toast(x.message, { ms: 7000 }); } refresh(); };
    $('#sync', el).onclick = async (e) => { const __b = e.currentTarget;  __b.disabled = true; try { const r = await api('studio', { body: { action: 'goals_sync' } }); toast(`${r.updated} goal${r.updated === 1 ? '' : 's'} updated`); } catch (x) { toast(x.message); } refresh(); };
    el.querySelectorAll('[data-item]').forEach((c) => c.onchange = async () => { await q(live.sb.from('goal_items').update({ done: c.checked }).eq('id', c.dataset.item)).catch((e) => toast(e.message)); refresh(); });
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await q(live.sb.from('goals').delete().eq('id', b.dataset.del)).catch((e) => toast(e.message)); refresh(); });
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => edit(goals.find((g) => g.id === b.dataset.edit)));
    el.querySelectorAll('[data-set]').forEach((b) => b.onclick = () => edit(goals.find((g) => g.id === b.dataset.set), true));
  };
  function edit(g, numberOnly) {
    modal({ title: numberOnly ? 'Update number' : 'Edit goal', body: `<div class="stack">${numberOnly ? '' : `<div class="field"><label>Target</label><input class="input" id="et" value="${esc(g.target || '')}"></div>
      <div class="grid g2"><div class="field"><label>Target value</label><input class="input" id="ev" type="number" step="any" value="${g.target_value ?? ''}"></div><div class="field"><label>Due date</label><input class="input" id="ed" type="date" value="${g.due_date || ''}"></div></div>`}
      ${g.metric_source === 'manual' ? `<div class="field"><label>Current value</label><input class="input" id="ec" type="number" step="any" value="${g.current_value}"></div>` : ''}</div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        const v = (id) => ov.querySelector(id)?.value;
        const patch = {};
        if (!numberOnly) { patch.target = v('#et'); patch.target_value = v('#ev') === '' ? null : Number(v('#ev')); patch.due_date = v('#ed') || null; }
        if (ov.querySelector('#ec')) patch.current_value = Number(v('#ec')) || 0;
        try { const r = await versionedUpdate('goals', g, patch); if (r.conflict) toast('Changed elsewhere. Reloaded.'); close(); refresh(); } catch (e) { toast(e.message); }
      }; } });
  }
  el.innerHTML = '<div class="empty">Loading goals...</div>';
  try { await load(); draw(); if (goals.some((g) => g.metric_source !== 'manual')) api('studio', { body: { action: 'goals_sync' } }).then(refresh).catch(() => {}); }
  catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load Goals</h2><p class="mono">${esc(e.message)}</p></div>`; }
}
