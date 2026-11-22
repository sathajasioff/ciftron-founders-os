// The single confirm flow for every HighLevel write: the server builds the exact request,
// the owner sees it, one click sends it, the server logs it.
import { t } from './i18n.js';
import { modal, icon, esc, toast } from './ui.js';
import { api } from './live.js';

export async function hlWrite(kind, input, { onDone } = {}) {
  let preview;
  try { ({ preview } = await api('hl', { body: { action: 'preview', kind, input } })); }
  catch (e) { toast(e.message, { ms: 7000 }); return; }
  modal({
    title: t('confirm.title'),
    sub: `<b>${esc(preview.summary)}</b>`,
    body: `${preview.warning ? `<div class="notice warn" style="margin-bottom:12px">${icon('alert')}<span>${esc(preview.warning)}</span></div>` : ''}
      <p class="small" style="font-weight:600">${t('confirm.exact')}</p>
      <div class="preview-box code-preview">${esc(`${preview.method} ${preview.url}\n\n${JSON.stringify(preview.body, null, 2)}`)}</div>
      <p class="xs muted" style="margin-top:10px">Needs the HighLevel scope <span class="mono">${esc(preview.scope)}</span>. ${t('confirm.logged')}</p>`,
    foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary hl-btn" data-ok>${t('c.confirmSend')}</button>`,
    onMount: (ov, close) => {
      ov.querySelector('[data-ok]').onclick = async (ev) => {
        const b = ev.currentTarget; b.disabled = true; b.textContent = 'Sending...';
        try {
          const r = await api('hl', { body: { action: 'write', kind, input, confirmed: true } });
          close(); toast(`Sent to HighLevel: ${r.summary}`);
          onDone && onDone(r);
        } catch (e) {
          b.disabled = false; b.textContent = t('c.confirmSend');
          toast(e.message, { ms: 8000 });
        }
      };
    },
  });
}
