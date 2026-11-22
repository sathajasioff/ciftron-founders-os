import { t } from '../i18n.js';
import { head, icon, esc, toast, toggleHtml, $ } from '../ui.js';
import { approvals } from '../data.js';

const thread = [
  { me: true, text: 'My Meta campaign for mortgage brokers has a $14 CPL but only 2 of 38 leads booked. Where do I look first?' },
  { me: false, html: `<p>Look after the form before you touch the ads. A $14 CPL with 5% booking usually points to follow-up speed or the booking step.</p>
    <ol><li><b>Speed to first reply.</b> Check how long new leads wait before the first SMS in HighLevel.</li>
    <li><b>The booking step.</b> Is the calendar link in the first message, or only after a reply?</li>
    <li><b>Lead quality.</b> Add one qualifying question to the Meta form, for example timeline to buy.</li></ol>
    <p>If you want, I can draft a 3-message follow-up for the first 10 minutes and send it to Approvals.</p>`,
    sources: [['Fact', 'Offer 1: Lead Generation & Paid Advertising Management'], ['Fact', 'Most businesses need faster follow-up first'], ['Meta Ads', 'Mortgage campaign, last 7 days'], ['HighLevel', 'Agency Pipeline stage counts']] },
];
const room = [
  ['Strategist', 'Claude', 'Fix follow-up before ad spend. Add an instant SMS with the calendar link and a 3-touch sequence in the first hour.'],
  ['Challenger', 'GPT', 'Speed helps, but 38 leads is a small sample. Check whether the form is pre-filled and too easy. Low intent leads will not book however fast you reply.'],
  ['Strategist', 'Claude', 'Fair. Both can be true. Higher intent form plus instant reply is a cleaner test than either alone.'],
];

export function render(el, ctx) {
  let strategy = false;
  let attachments = 0;
  const q = ctx.params.get('q');
  const draw = () => {
    el.innerHTML = `
      ${head(t('chat.title'), t('chat.sub'), `<label class="row small" style="font-weight:600">${t('chat.room')} ${toggleHtml(strategy, 'id="room-toggle"')}</label><span class="chip accent">Brand DNA v4 loaded</span>`)}
      <div class="chat">
        <div class="chat-scroll" id="scroll">
          ${thread.map(msgHtml).join('')}
          ${strategy ? roomHtml() : ''}
        </div>
        <div class="composer">
          <textarea id="prompt" rows="2" placeholder="${esc(t('chat.placeholder'))}">${esc(q || '')}</textarea>
          <div class="row between">
            <div class="row">
              <button class="btn btn-sm btn-ghost" id="attach">${icon('clip')} ${t('chat.attach')}</button>
              <span class="xs muted" id="att-count">${attachments ? attachments + ' of 8 files' : 'Up to 8 files, images included'}</span>
            </div>
            <div class="row"><span class="xs faint">Claude Sonnet${strategy ? ' + GPT' : ''}</span><button class="btn btn-primary btn-sm" id="send">${icon('send')} ${t('c.send')}</button></div>
          </div>
        </div>
      </div>`;
    const sc = $('#scroll', el); sc.scrollTop = sc.scrollHeight;
    $('#room-toggle', el).onchange = (e) => { strategy = e.target.checked; draw(); };
    $('#attach', el).onclick = () => { if (attachments >= 8) return toast('Limit is 8 files per message'); attachments++; $('#att-count', el).textContent = attachments + ' of 8 files'; };
    $('#send', el).onclick = send;
    $('#prompt', el).onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
    el.querySelectorAll('[data-save]').forEach((b) => b.onclick = () => {
      approvals.unshift({ id: 'a' + Date.now(), title: 'Chat draft: 10-minute follow-up', type: 'Draft', agent: 'AI Chat', target: 'Emails', tags: ['chat'], status: 'pending', age: 'Just now', lang: 'EN', body: 'Draft saved from AI Chat.' });
      ctx.refreshNav(); toast('Saved to Approvals');
    });
  };
  const send = () => {
    const v = $('#prompt', el).value.trim();
    if (!v) return;
    thread.push({ me: true, text: v });
    thread.push({ me: false, html: `<p>Demo reply. In Phase 3 this answer comes from Claude with your Brand DNA and the top Brain matches for: <i>${esc(v)}</i></p>`, sources: [['Fact', 'Voice: plain, human and specific'], ['Brain', 'Sales call notes.pdf, p. 3']] });
    attachments = 0;
    draw();
  };
  draw();
}

function msgHtml(m) {
  if (m.me) return `<div class="msg me"><div class="avatar">JU</div><div class="bubble">${esc(m.text)}</div></div>`;
  return `<div class="msg"><div class="avatar ai">OS</div><div class="grow"><div class="bubble">${m.html}</div>
    ${m.sources ? `<div class="sources">${m.sources.map(([k, v]) => `<span class="source-card"><span class="chip ${k === 'Fact' ? 'accent' : k === 'Brain' ? '' : 'info'}">${k}</span><b>${esc(v)}</b></span>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:6px"><button class="btn btn-sm btn-ghost" data-save>${icon('inbox')} Save to Approvals</button></div></div></div>`;
}
function roomHtml() {
  return `<div class="msg"><div class="avatar ai">SR</div><div class="grow"><div class="eyebrow" style="margin-bottom:8px">Strategy Room</div>
    ${room.map(([r, m, txt]) => `<div class="room"><div class="row between" style="margin-bottom:4px"><b>${r}</b><span class="xs faint">${m}</span></div><div class="small">${esc(txt)}</div></div>`).join('')}
    <div class="room verdict"><b>Verdict</b><p class="small" style="margin:4px 0 6px">Run two changes together for 7 days: an instant SMS with the calendar link, and one intent question on the Meta form. Judge on booked calls per 100 leads, not CPL.</p>
    <div class="small"><b>Next steps</b><ol style="margin:4px 0;padding-left:20px"><li>Draft the instant SMS (Content Strategist)</li><li>Add the form question in Ads Manager</li><li>Set a goal: 8 booked per 100 leads</li></ol></div></div></div></div>`;
}
