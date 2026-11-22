// Jarvis: the command-center home. Ask by typing or voice; Jarvis answers from live context.
import { t, getLang } from '../i18n.js';
import { icon, esc, toast, modal, $ } from '../ui.js';
import { live, api, q } from '../live.js';
import { createCore } from '../jarvis-core.js';
import { createVoice } from '../voice.js';
import * as demo from '../data.js';

const NODES = [
  ['brain', 'Brain', 'brain', 'left'], ['pipeline', 'Pipeline', 'kanban', 'left'], ['meta', 'Meta Ads', 'globe', 'left'], ['research', 'Research', 'search', 'left'], ['vault', 'Vault', 'vault', 'left'],
  ['content', 'Content', 'play', 'right'], ['funnels', 'Funnels', 'funnel', 'right'], ['emails', 'Emails', 'mail', 'right'], ['graphics', 'Graphics', 'image', 'right'], ['team', 'Agents', 'team', 'right'], ['goals', 'Goals', 'target', 'right'],
];
const ROUTE = { research: 'content' };
const PROMPTS = ['What needs me today?', 'How is my pipeline?', 'How are my Meta ads doing?', 'What should I post this week?'];
const history = [];

export async function render(el, ctx = {}) {
  const now = new Date();
  const greet = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  el.innerHTML = `
    <section class="jv">
      <h1 class="jv-title">${greet}, Jasinthan.</h1>
      <div class="jv-status"><span class="dot on"></span><span id="jv-state">Jarvis online</span><span>·</span><span>${now.toLocaleDateString(getLang() === 'fr' ? 'fr-CA' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span><span>·</span><span id="jv-clock" class="mono"></span></div>
      <p class="jv-summary" id="jv-summary">Reading your workspace...</p>
      <form class="jv-bar" id="jv-form" autocomplete="off">
        ${icon('search')}<input id="jv-q" placeholder="Tell Jarvis what you need. Try: what needs me today?" aria-label="Ask Jarvis">
        <button type="button" class="btn btn-sm" id="jv-talk">${icon('mic')} Talk</button><button class="btn btn-sm btn-accent" id="jv-ask">Ask</button>
      </form>
      <div class="jv-prompts">${PROMPTS.map((p) => `<button class="jv-chip" data-p="${esc(p)}">${esc(p)}</button>`).join('')}<button class="jv-chip" id="jv-hold">${icon('x')} <span>Hold drafting agents</span></button></div>
      <div class="jv-answer hidden" id="jv-answer" role="status"></div>
      <div class="jv-core" id="jv-core">
        <div class="jv-label">Jarvis core</div>
        <canvas id="jv-canvas" aria-label="Jarvis core. Click to talk."></canvas>
        ${NODES.map(([k, label, ic, side]) => `<button class="jv-node" data-node="${k}" data-side="${side}" title="${label}"><span class="jv-node-ic">${icon(ic)}</span><span class="jv-node-label">${label}</span><span class="jv-badge hidden" data-badge="${k}"></span></button>`).join('')}
        <div class="jv-foot"><span class="row"><span class="jv-led" id="jv-led"></span><span id="jv-mode">ONLINE</span></span>
          <span class="row"><button class="jv-ctl" id="jv-mute" aria-pressed="false">${icon('mic')}<span>Mute</span></button><button class="jv-ctl" id="jv-stop">${icon('x')}<span>Stop</span></button><span class="jv-hint">TAP THE CORE TO TALK</span></span></div>
      </div>
    </section>
    <div id="jv-below"></div>`;

  const nodes = NODES.map(([k, label, , side]) => ({ key: k, label, side, el: el.querySelector(`[data-node="${k}"]`) }));
  const setMode = (s) => {
    const labels = { online: 'ONLINE', listening: 'LISTENING', thinking: 'THINKING', speaking: 'SPEAKING' };
    $('#jv-mode', el).textContent = labels[s]; $('#jv-state', el).textContent = s === 'online' ? 'Jarvis online' : `Jarvis ${s}`;
    $('#jv-led', el).dataset.s = s; core.setState(s);
    $('#jv-talk', el).classList.toggle('btn-primary', s === 'listening');
  };
  const core = createCore($('#jv-canvas', el), { nodes, onNode: (n) => { if (n.key === 'meta') return $('#jv-below', el).scrollIntoView({ behavior: 'smooth' }); location.hash = '#' + (ROUTE[n.key] || n.key); }, onCore: () => talk() });
  const voice = createVoice({ onState: setMode, onLevel: (v) => core.setLevel(v), onHeard: (text) => ask(text, true), onError: (m) => toast(m, { ms: 6000 }) });

  const clock = () => { const c = $('#jv-clock', el); if (!c) return clearInterval(ti); c.textContent = new Date().toLocaleTimeString('en-GB'); };
  const ti = setInterval(clock, 1000); clock();

  async function ask(text, spoken) {
    text = String(text || '').trim(); if (!text) return;
    voice.stop(); setMode('thinking');
    const box = $('#jv-answer', el);
    let reply;
    try {
      if (live.on) reply = (await api('chat', { body: { mode: 'jarvis', message: text, history } })).reply;
      else { await new Promise((r) => setTimeout(r, 600)); reply = demoReply(text); }
    } catch (e) {
      setMode('online'); toast(e.message, { ms: 7000 }); return;
    }
    history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
    while (history.length > 8) history.shift();
    // Typed questions show the latest answer; spoken ones are only spoken (no transcript).
    if (!spoken || voice.isMuted()) { box.textContent = reply; box.classList.remove('hidden'); } else box.classList.add('hidden');
    if (spoken) voice.speak(reply); else setMode('online');
  }
  function talk() { if ($('#jv-mode', el).textContent === 'LISTENING') voice.stop(); else voice.listen(); }

  $('#jv-form', el).onsubmit = (e) => { e.preventDefault(); const v = $('#jv-q', el).value; $('#jv-q', el).value = ''; ask(v, false); };
  $('#jv-talk', el).onclick = talk;
  $('#jv-stop', el).onclick = () => voice.stop();
  $('#jv-mute', el).onclick = (e) => { const __b = e.currentTarget; const m = !voice.isMuted(); voice.setMuted(m); __b.setAttribute('aria-pressed', m); __b.querySelector('span').textContent = m ? 'Unmute' : 'Mute'; };
  el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => ask(b.dataset.p, false));
  $('#jv-hold', el).onclick = holdAgents;
  if (!voice.canListen) $('#jv-talk', el).title = 'Voice input needs Chrome, Edge or Safari';

  // Summary and badges
  if (live.on) {
    const settle = (p) => p.then((v) => ({ v }), (e) => ({ e: e.message }));
    const [agents, board, meta] = await Promise.all([
      settle(q(live.sb.from('agents').select('slug, enabled, pinned'))),
      settle(api('hl', { body: { action: 'board' } })),
      settle(api('meta', { body: { range: 'last_7d' } })),
    ]);
    const { count } = await live.sb.from('approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('trashed_at', null);
    const on = (agents.v || []).filter((a) => a.enabled).length, total = (agents.v || []).length;
    const parts = [`${on} of ${total} agents are on`, `${count || 0} draft${count === 1 ? '' : 's'} waiting for you`];
    if (board.v) parts.push(`${board.v.stats.newLeads7d} new lead${board.v.stats.newLeads7d === 1 ? '' : 's'} this week and ${board.v.stats.active} open in the pipeline`);
    if (meta.v?.cpl != null) parts.push(`Meta cost per lead is $${meta.v.cpl.toFixed(2)}`);
    $('#jv-summary', el).textContent = parts.join(', ') + '.';
    badge('team', count); if (board.v) badge('pipeline', board.v.stats.newLeads7d); if (meta.v) badge('meta', meta.v.leads);
    const anyOn = (agents.v || []).some((a) => !a.pinned && a.enabled);
    $('#jv-hold span', el).textContent = anyOn ? 'Hold drafting agents' : 'Resume drafting agents';
    const below = $('#jv-below', el);
    const home = await import('./home-live.js');
    await home.render(below);
    below.querySelector('.page-head')?.remove();
  } else {
    $('#jv-summary', el).textContent = `9 of 9 agents are on, ${demo.approvals.filter((a) => a.status === 'pending').length} drafts waiting for you, 38 new leads this week. Demo data.`;
    badge('team', demo.approvals.filter((a) => a.status === 'pending').length); badge('pipeline', 38);
  }

  function badge(k, n) { const b = el.querySelector(`[data-badge="${k}"]`); if (b && n) { b.textContent = n > 99 ? '99+' : n; b.classList.remove('hidden'); } }

  async function holdAgents() {
    if (!live.on) return toast('Demo mode: agents not changed');
    const agents = await q(live.sb.from('agents').select('*'));
    const anyOn = agents.some((a) => !a.pinned && a.enabled);
    modal({ title: anyOn ? 'Hold all drafting agents?' : 'Resume drafting agents?', body: `<p class="small">${anyOn ? 'Every agent except the Chief of Staff stops drafting until you resume them. Nothing already in Approvals changes.' : 'All agents are turned back on.'}</p>`,
      foot: `<button class="btn" data-close>${t('c.cancel')}</button><button class="btn btn-primary" data-ok>${anyOn ? 'Hold agents' : 'Resume agents'}</button>`,
      onMount: (ov, close) => { ov.querySelector('[data-ok]').onclick = async () => {
        for (const a of agents.filter((x) => !x.pinned)) await live.sb.from('agents').update({ enabled: !anyOn, version: a.version + 1 }).eq('id', a.id).eq('version', a.version);
        close(); toast(anyOn ? 'Drafting agents are on hold' : 'Drafting agents resumed'); $('#jv-hold span', el).textContent = anyOn ? 'Resume drafting agents' : 'Hold drafting agents';
      }; } });
  }
}

function demoReply(text) {
  const s = text.toLowerCase();
  if (/pipeline/.test(s)) return 'You have 12 opportunities in the Agency Pipeline. Two are new today and two appointments are booked. Demo data.';
  if (/meta|ads|cpl/.test(s)) return 'Meta spent 199 dollars this week for 14 leads, so cost per lead is about 14 dollars and 20 cents, down from 16. Demo data.';
  if (/post|content/.test(s)) return 'Film the follow-up speed Reel first. It matches the hooks you approve most. Demo data.';
  return 'Four drafts are waiting in Approvals, and Marc Tremblay is a new mortgage lead from today. Start with those. Demo data.';
}
