// AI Chat backed by /api/chat: Brand DNA + Brain search on every message, attachments, Strategy Room.
import { t } from '../i18n.js';
import { head, icon, esc, toast, md, toggleHtml, $ } from '../ui.js';
import { attachData } from '../custom-ui.js';
import { live, api, q } from '../live.js';

const MAX_FILES = 8;
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,.pdf,.docx,.txt,.md,.csv,.html';
const st = { threadId: null, room: false };
// Model picker. OpenRouter models load once, only when a key is saved.
const pickState = { model: (() => { try { return localStorage.getItem('os.chatModel') || 'claude'; } catch { return 'claude'; } })(), models: null };
const modelLabel = (m) => (m === 'claude' ? 'Claude' : m === 'gpt' ? 'GPT' : (pickState.models || []).find((x) => 'or:' + x.id === m)?.name || m.slice(3));

export async function render(el, ctx) {
  let threads = [], msgs = [], files = [], busy = false;
  const loadThreads = async () => { threads = await q(live.sb.from('threads').select('id, title, strategy_room, updated_at').is('agent_id', null).order('updated_at', { ascending: false }).limit(30)); };
  const loadMsgs = async () => { msgs = st.threadId ? await q(live.sb.from('messages').select('*').eq('thread_id', st.threadId).order('created_at')) : []; };

  const draw = () => {
    el.innerHTML = `
      ${head(t('chat.title'), t('chat.sub'), `<label class="row small" style="font-weight:600" title="Strategist, Challenger, then a verdict">${t('chat.room')} ${toggleHtml(st.room, 'id="room-toggle"')}</label><button class="btn" id="newchat">${icon('plus')} New chat</button>`)}
      <div class="split-l" style="grid-template-columns:240px minmax(0,1fr)">
        <div class="list" style="max-height:calc(100vh - 230px);overflow-y:auto">${threads.map((th) => `<div class="list-item clickable ${th.id === st.threadId ? 'selected' : ''}" data-th="${th.id}"><div class="grow small"><div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(th.title || 'Chat')}</div><div class="xs muted">${new Date(th.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${th.strategy_room ? ' · Strategy Room' : ''}</div></div></div>`).join('') || '<div class="empty small">No chats yet</div>'}</div>
        <div class="chat">
          <div class="chat-scroll" id="scroll">${msgs.length ? msgs.map(msgHtml).join('') : emptyState()}${busy ? `<div class="msg"><div class="avatar ai">OS</div><div class="bubble muted small">${st.room ? 'Strategist, Challenger and verdict are working...' : 'Thinking...'}</div></div>` : ''}</div>
          <div class="composer">
            ${files.length ? `<div class="row wrap" style="margin-bottom:6px">${files.map((f, i) => `<span class="chip outline">${esc(f.name)} <button class="star" data-rmf="${i}" aria-label="Remove">${icon('x')}</button></span>`).join('')}</div>` : ''}
            <textarea id="prompt" rows="2" placeholder="${esc(t('chat.placeholder'))}" ${busy ? 'disabled' : ''}>${esc(ctx.params.get('q') || '')}</textarea>
            <div class="row between">
              <div class="row"><label class="btn btn-sm btn-ghost" ${busy ? 'aria-disabled="true"' : ''}>${icon('clip')} ${t('chat.attach')}<input type="file" id="files" multiple accept="${ACCEPT}" hidden></label><button class="btn btn-sm btn-ghost" id="adata" title="Attach data from a custom API connection" ${busy ? 'disabled' : ''}>${icon('globe')} Data</button>
                <span class="xs muted">${files.length}/${MAX_FILES} files</span></div>
              <div class="row">${st.room ? '<span class="xs faint">Claude + GPT</span>' : `<select class="select" id="model" aria-label="Model" style="height:30px;padding:2px 8px;font-size:12px;max-width:220px">
                <option value="claude" ${pickState.model === 'claude' ? 'selected' : ''}>Claude</option><option value="gpt" ${pickState.model === 'gpt' ? 'selected' : ''}>GPT (OpenAI)</option>
                ${pickState.model.startsWith('or:') && !(pickState.models || []).some((x) => 'or:' + x.id === pickState.model) ? `<option value="${esc(pickState.model)}" selected>${esc(modelLabel(pickState.model))}</option>` : ''}
                ${(pickState.models || []).length ? `<optgroup label="OpenRouter">${pickState.models.map((x) => `<option value="or:${esc(x.id)}" ${pickState.model === 'or:' + x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>` : pickState.models === null ? '<option value="__load">More models (OpenRouter)...</option>' : ''}
              </select>`}<button class="btn btn-primary btn-sm" id="send" ${busy ? 'disabled' : ''}>${icon('send')} ${t('c.send')}</button></div>
            </div>
          </div>
        </div>
      </div>`;
    const sc = $('#scroll', el); sc.scrollTop = sc.scrollHeight;
    $('#room-toggle', el).onchange = (e) => { st.room = e.target.checked; draw(); };
    const ms = $('#model', el);
    if (ms) ms.onchange = async () => {
      if (ms.value === '__load') {
        ms.disabled = true;
        try { const r = await api('studio', { body: { action: 'chat_models' } }); pickState.models = r.models; if (!r.openrouter) toast('Add an OpenRouter key in Connections to use more models.'); }
        catch (x) { toast(x.message); pickState.models = []; }
        draw(); return;
      }
      pickState.model = ms.value;
      try { localStorage.setItem('os.chatModel', ms.value); } catch { /* private mode */ }
    };
    $('#newchat', el).onclick = () => { st.threadId = null; msgs = []; draw(); $('#prompt', el).focus(); };
    el.querySelectorAll('[data-th]').forEach((r) => r.onclick = async () => { st.threadId = r.dataset.th; st.room = !!threads.find((x) => x.id === st.threadId)?.strategy_room; await loadMsgs(); draw(); });
    $('#files', el).onchange = (e) => {
      const add = [...e.target.files];
      if (files.length + add.length > MAX_FILES) toast(`Up to ${MAX_FILES} files per message`);
      files = [...files, ...add].slice(0, MAX_FILES); draw();
    };
    el.querySelectorAll('[data-rmf]').forEach((b) => b.onclick = () => { files.splice(+b.dataset.rmf, 1); draw(); });
    el.querySelectorAll('[data-save]').forEach((b) => b.onclick = () => saveToApprovals(msgs.find((m) => m.id === b.dataset.save), b));
    $('#send', el).onclick = send;
    $('#adata', el).onclick = async () => { const block = await attachData(); if (!block) return; const p = $('#prompt', el); p.value = (p.value.trim() ? p.value.trim() + '\n\n' : '') + block + '\n\n'; p.focus(); };
    $('#prompt', el).onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  };

  async function send() {
    const message = $('#prompt', el).value.trim();
    if ((!message && !files.length) || busy) return;
    busy = true;
    msgs.push({ id: 'tmp', role: 'user', content: message, attachments: files.map((f) => ({ name: f.name })) });
    const pending = files; files = [];
    draw();
    try {
      const attachments = [];
      for (const f of pending) {
        if (f.size > 20 * 1024 * 1024) throw new Error(`${f.name} is over 20 MB`);
        const path = `${live.ownerId}/chat/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, '_').slice(-100)}`;
        const { error } = await live.sb.storage.from('brain').upload(path, f, { contentType: f.type || 'application/octet-stream' });
        if (error) throw new Error(error.message);
        attachments.push({ path, name: f.name, mime: f.type });
      }
      const r = await api('chat', { body: { thread_id: st.threadId, message, attachments, strategy_room: st.room, model: st.room ? 'claude' : pickState.model } });
      st.threadId = r.thread_id;
      if (r.drafts.length) { toast(`${r.drafts.length} draft${r.drafts.length > 1 ? 's' : ''} saved to Approvals`); ctx.refreshNav(); }
      r.warnings.filter((w) => !/No Brand DNA/.test(w)).forEach((w) => toast(w, { ms: 6000 }));
      await Promise.all([loadThreads(), loadMsgs()]);
    } catch (e) {
      msgs.push({ id: 'err', role: 'system', content: e.message });
      if (e.needs) msgs.push({ id: 'err2', role: 'system', content: 'Fix it in Connections and Settings, then send again.' });
    }
    busy = false; draw();
    if (!st.threadId) $('#prompt', el).value = message;
  }

  async function saveToApprovals(m, btn) {
    btn.disabled = true;
    try {
      await q(live.sb.from('approvals').insert({ owner_id: live.ownerId, type: 'Idea', title: m.content.split('\n').find((l) => l.trim())?.replace(/[#*]/g, '').slice(0, 120) || 'Chat answer', payload: { body: m.content, thread_id: st.threadId }, source_agent: 'AI Chat', target_module: 'content', authored_by: 'ai' }));
      toast('Saved to Approvals'); ctx.refreshNav(); btn.textContent = 'Saved';
    } catch (e) { toast(e.message); btn.disabled = false; }
  }

  el.innerHTML = '<div class="empty">Loading chat...</div>';
  try { await loadThreads(); await loadMsgs(); draw(); } catch (e) { el.innerHTML = `<div class="empty"><h2>Could not load chat</h2><p class="mono">${esc(e.message)}</p><p class="small">If you just updated, run the newest SQL migration in Supabase.</p></div>`; }
}

function emptyState() {
  return `<div class="empty"><h3 style="margin-bottom:6px">Ask about strategy, ads, funnels or content</h3><p class="small">Every message reads your Brand DNA and searches your Brain. Finished drafts go to Approvals.</p>
    <div class="row wrap" style="justify-content:center;margin-top:12px">${['Plan 5 Reels for mortgage brokers this week', 'Why might my Meta leads not book calls?', 'Write 6 Meta ad variations in Quebec French for private lending'].map((s) => `<span class="chip outline">${esc(s)}</span>`).join('')}</div></div>`;
}

function sourcesHtml(sources) {
  if (!sources?.length) return '';
  return `<div class="sources">${sources.map((s) => `<span class="source-card" title="${esc(s.snippet || '')}"><span class="chip ${s.kind === 'dna' ? 'accent' : ''}">${s.kind === 'dna' ? 'Brand DNA' : 'Brain'}</span><b>${esc(s.label)}</b>${s.similarity ? `<span class="faint">${s.similarity}%</span>` : ''}</span>`).join('')}</div>`;
}

function msgHtml(m) {
  if (m.role === 'user') return `<div class="msg me"><div class="avatar">JU</div><div class="bubble">${esc(m.content)}${m.attachments?.length ? `<div class="xs" style="opacity:.75;margin-top:4px">${m.attachments.map((a) => esc(a.name)).join(', ')}</div>` : ''}</div></div>`;
  if (m.role === 'system') return `<div class="notice ${/fail|credit|key|error|over|limit/i.test(m.content) ? 'warn' : 'neutral'} small" style="margin:0 0 14px 44px">${icon('info')}<span>${esc(m.content)}</span></div>`;
  if (m.role === 'strategist' || m.role === 'challenger') return `<div class="msg"><div class="avatar ai">${m.role === 'strategist' ? 'S' : 'C'}</div><div class="grow"><div class="room"><div class="row between" style="margin-bottom:4px"><b>${m.role === 'strategist' ? 'Strategist' : 'Challenger'}</b><span class="xs faint">${esc(m.model || '')}</span></div><div class="small">${md(m.content)}</div></div>${m.role === 'strategist' ? sourcesHtml(m.sources) : ''}</div></div>`;
  if (m.role === 'verdict') return `<div class="msg"><div class="avatar ai">V</div><div class="grow"><div class="room verdict"><b>Verdict</b><div class="small" style="margin-top:4px">${md(m.content)}</div></div>
    <div class="row" style="margin-top:6px"><button class="btn btn-sm btn-ghost" data-save="${m.id}">${icon('inbox')} Save to Approvals</button></div></div></div>`;
  return `<div class="msg"><div class="avatar ai">OS</div><div class="grow"><div class="bubble">${md(m.content)}</div>${m.model ? `<div class="xs faint" style="margin:2px 0 0 4px">${esc(m.model)}</div>` : ''}${sourcesHtml(m.sources)}
    <div class="row" style="margin-top:6px"><button class="btn btn-sm btn-ghost" data-save="${m.id}">${icon('inbox')} Save to Approvals</button></div></div></div>`;
}
