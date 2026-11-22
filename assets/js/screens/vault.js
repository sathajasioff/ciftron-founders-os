import { t } from '../i18n.js';
import { head, icon, esc, toast, modal } from '../ui.js';
import { vault, approvals } from '../data.js';

export function render(el, ctx) {
  const draw = () => {
    el.innerHTML = `
      ${head(t('vault.title'), t('vault.sub'), `<button class="btn btn-primary" id="add">${icon('plus')} Save example</button>`)}
      <div class="grid g3">${vault.map((v) => `<div class="card stack-sm">
        <div class="row between"><span class="chip">${v.kind}</span><span class="chip warn">Inspiration</span></div>
        <h3 style="margin-top:8px">${esc(v.title)}</h3><div class="xs muted">${esc(v.from)}</div>
        <p class="small">${esc(v.note)}</p>
        <div class="row">${v.briefed ? '<span class="chip ok">Brief ready</span>' : `<button class="btn btn-sm" data-brief="${v.id}">${icon('sparkle')} ${t('vault.brief')}</button>`}</div></div>`).join('')}</div>`;
    el.querySelector('#add').onclick = () => modal({ title: 'Save example', body: `<div class="stack"><div class="seg"><button class="active">URL</button><button>Text</button><button>Screenshot</button></div>
      <div class="field"><label>URL or text</label><input class="input"></div><div class="field"><label>What do you like about it?</label><input class="input"></div></div>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${t('c.save')}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = () => { vault.unshift({ id: 'v' + Date.now(), kind: 'URL', title: ov.querySelector('.input').value || 'New example', from: 'Saved now', note: ov.querySelectorAll('.input')[1].value, briefed: false }); close(); draw(); }; } });
    el.querySelectorAll('[data-brief]').forEach((b) => b.onclick = () => { const v = vault.find((x) => x.id === b.dataset.brief); v.briefed = true;
      approvals.unshift({ id: 'a' + Date.now(), title: `Brief from Vault: ${v.title}`, type: 'Brief', agent: 'Content Strategist', target: 'Content', tags: ['vault', 'inspiration'], status: 'pending', age: 'Just now', lang: 'EN', body: 'Reusable brief based on structure only. Labeled inspiration.' });
      ctx.refreshNav(); toast('Brief sent to Approvals'); draw(); });
  };
  draw();
}
