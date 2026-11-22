// Revenue: live only. In demo mode it explains what the screen does.
import { t } from '../i18n.js';
import { head } from '../ui.js';

export function render(el, ctx = {}) {
  if (ctx.live) return import('./revenue-live.js').then((m) => m.render(el, ctx));
  el.innerHTML = `${head(t('nav.revenue'), 'Stripe payments and the retainers you log, by month, with monthly recurring revenue.')}
    <div class="empty card soft">Sign in to see your revenue. This screen has no sample data.</div>`;
}
