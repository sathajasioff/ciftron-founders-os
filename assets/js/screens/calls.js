// Calls: live only. In demo mode it explains what the screen does.
import { t } from '../i18n.js';
import { head } from '../ui.js';

export function render(el, ctx = {}) {
  if (ctx.live) return import('./calls-live.js').then((m) => m.render(el, ctx));
  el.innerHTML = `${head(t('nav.calls'), 'Sales and coaching calls from Google Meet or uploads, with an AI review and your answers added to the Brain.')}
    <div class="empty card soft">Sign in to see your calls. This screen has no sample data.</div>`;
}
