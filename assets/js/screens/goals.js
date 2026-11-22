import { t } from '../i18n.js';
import { head, icon, esc, toast, $ } from '../ui.js';
import { goals } from '../data.js';

// Phase 1 stand-in for the AI step: turns plain words into a measurable target.
function measurable(raw) {
  const num = (raw.match(/\d+/) || [])[0];
  const l = raw.toLowerCase();
  let unit = 'items', source = 'Manual', target = raw;
  if (/lead/.test(l)) { unit = 'leads'; source = 'HighLevel'; target = `${num || '[NUMBER]'} contacts reaching "Qualified Lead" by [DATE]`; }
  else if (/appoint|call|book/.test(l)) { unit = 'appointments'; source = 'HighLevel'; target = `${num || '[NUMBER]'} opportunities reaching "Appointment Booked" by [DATE]`; }
  else if (/content|post|reel|publish/.test(l)) { unit = 'pieces'; source = 'OS Content'; target = `${num || '[NUMBER]'} content cards marked Uploaded by [DATE]`; }
  else if (/cpl|cost per lead/.test(l)) { unit = '% of the way'; source = 'Meta Ads'; target = 'Meta cost per lead below [TARGET] (now $14.20)'; }
  else if (/revenue|mrr/.test(l)) { unit = 'USD'; source = 'HighLevel'; target = 'Monthly won opportunity value of [TARGET] USD'; }
  return { id: 'gl' + Date.now(), raw, target, current: 0, total: +num || 100, unit, source, checklist: [{ t: 'Confirm target number and date', done: false }, { t: 'Pick 3 actions (AI drafts in Phase 5)', done: false }] };
}

export function render(el) {
  const draw = () => {
    el.innerHTML = `
      ${head(t('goals.title'), t('goals.sub'))}
      <div class="card row" style="margin-bottom:16px"><input class="input grow" id="graw" placeholder="${esc(t('goals.placeholder'))}"><button class="btn btn-primary" id="gadd">${icon('sparkle')} ${t('goals.add')}</button></div>
      <div class="grid g2">${goals.map((g) => { const pct = Math.min(100, Math.round((g.current / g.total) * 100));
        return `<div class="card stack"><div class="row between top"><div><div class="xs muted">"${esc(g.raw)}"</div><h3 style="margin-top:4px">${esc(g.target).replace(/\[(.+?)\]/g, '<span class="placeholder">[$1]</span>')}</h3></div><span class="chip ${g.source === 'Manual' ? '' : 'info'}">${esc(g.source)}</span></div>
        <div><div class="row between small"><span><b>${g.current}</b> of ${g.total} ${esc(g.unit)}</span><span class="muted">${pct}%</span></div><div class="progress accent" style="margin-top:6px"><span style="width:${pct}%"></span></div></div>
        <div>${g.checklist.map((c, i) => `<label class="row small" style="margin:6px 0"><input type="checkbox" data-g="${g.id}" data-i="${i}" ${c.done ? 'checked' : ''}> <span class="${c.done ? 'faint' : ''}">${esc(c.t)}</span></label>`).join('')}</div></div>`; }).join('')}</div>`;
    const add = () => { const v = $('#graw', el).value.trim(); if (!v) return; goals.unshift(measurable(v)); toast('Goal added. Placeholders need your numbers.'); draw(); };
    $('#gadd', el).onclick = add;
    $('#graw', el).onkeydown = (e) => { if (e.key === 'Enter') add(); };
    el.querySelectorAll('[data-g]').forEach((c) => c.onchange = () => { goals.find((g) => g.id === c.dataset.g).checklist[+c.dataset.i].done = c.checked; draw(); });
  };
  draw();
}
