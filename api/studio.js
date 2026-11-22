// Creation studio. Every AI draft is saved to Approvals; nothing is published or sent from here.
import { handler, requireOwner, HttpError } from './_lib/http.js';
import { getSecret, claude } from './_lib/providers.js';
import { parseJson } from './_lib/brain.js';
import { systemPrompt, extractDrafts, linkDrafts, cleanCopy, AGENT_SEEDS } from './_lib/chat.js';
import { hlBoard, metaNow } from './_lib/context.js';
import {
  EMAIL_SYSTEM, emailPrompt, validateSequence, REWRITE_SYSTEM, FUNNEL_SYSTEM, funnelPrompt, validateFunnel, GOAL_SYSTEM, goalPrompt, validateGoal, goalValue,
  PROGRAM_SYSTEM, validateProgram, programText, VAULT_SYSTEM, validateBrief, briefText, graphicPrompt, aspectFor, scorePosts, mapInstagram, mapYouTube,
  computeSignals, signalsBlock, SEQUENCE_TYPES, apifyPlan, apifyRun, FUNNEL_STAGES, CONTENT_FUNNEL_SYSTEM, contentFunnelPrompt, validateContentFunnel, ideaBody,
  PLAYBOOK_SYSTEM, playbookPrompt, validatePlaybook, CALL_SYSTEM, callPrompt, validateCall, callBrainText, CALL_KINDS,
} from './_lib/studio.js';
import { extractText } from './_lib/brain.js';
import { revenueNow } from './_lib/context.js';
import { runRoutine } from './_lib/routines.js';

export const config = { maxDuration: 60 };
const one = async (q) => { const { data, error } = await q; if (error) throw new HttpError(400, error.message); return data; };

export default handler(['POST'], async (req, body) => {
  const { user, db, admin } = await requireOwner(req);
  const a = body.action;
  const dna = async () => (await one(db.from('brand_dna').select('markdown').eq('is_active', true).maybeSingle()))?.markdown || null;
  const signals = async () => (await one(db.from('learning_signals').select('signal').eq('state', 'on')));
  const ask = async (system, prompt, maxTokens = 3000) => claude(await getSecret(admin, user.id, 'anthropic', 'api_key'), { system, prompt, maxTokens });
  const withDna = async (sys) => { const d = await dna(); return `${sys}\n\n# Brand DNA\n${d || 'Not compiled yet. Do not assume facts about the business.'}`; };
  const approval = async (row) => (await one(db.from('approvals').insert({ owner_id: user.id, authored_by: 'ai', ...row }).select('id').single())).id;

  // Run a routine now, from AI Team. Same path as the daily cron: drafts go to Approvals.
  if (a === 'routine_run') {
    const r = await one(db.from('agent_routines').select('*').eq('id', String(body.id || '')).maybeSingle());
    if (!r) throw new HttpError(404, 'Routine not found');
    const tz = (await one(db.from('profiles').select('timezone').maybeSingle()))?.timezone;
    const out = await runRoutine(admin, user.id, { ...r, enabled: true }, { timeZone: tz });
    if (out.status === 'error') throw new HttpError(400, out.error);
    if (out.status === 'skipped') throw new HttpError(400, 'The agent is turned off. Turn it on in AI Team first.');
    return out;
  }

  if (a === 'remix') {
    const agent = AGENT_SEEDS.find((x) => x.slug === 'content-strategist');
    const idea = body.idea || {};
    const formats = (body.formats || []).slice(0, 5);
    if (!formats.length) throw new HttpError(400, 'Pick at least one format');
    const lang = body.language === 'fr-qc' ? 'Quebec French' : body.language === 'both' ? 'both English and Quebec French (one draft each)' : 'English';
    const prompt = `Remix this proven idea into the owner's voice. Reuse the idea, never the creator's words.
Idea: "${String(idea.title || '').slice(0, 500)}"${idea.creator ? ` (from ${idea.creator}, ${idea.format || ''}, ${idea.views || '?'} views, ${idea.score || '?'}x their median)` : ''}.
Formats: ${formats.join(', ')}. One draft per format. Language: ${lang}.${body.angle ? `\nAngle: ${String(body.angle).slice(0, 500)}` : ''}
No forced sales pitch.`;
    const sys = systemPrompt({ dna: await dna(), agent }) + '\n\n' + signalsBlock(await signals());
    const { drafts } = extractDrafts(await ask(sys, prompt, 4000));
    const ids = [];
    for (const d of drafts) ids.push(await approval({ type: d.type, title: d.title, payload: { body: d.body, remix_of: idea }, tags: [...new Set([...d.tags, 'remix'])], language: d.language, source_agent: 'Content Strategist', target_module: 'content' }));
    return { drafts: ids.length };
  }

  if (a === 'email_sequence') {
    const offer = body.offer_id ? await one(db.from('offers').select('*').eq('id', body.offer_id).maybeSingle()) : null;
    const seq = validateSequence(parseJson(await ask(await withDna(EMAIL_SYSTEM), emailPrompt({ type: body.type, offer, language: body.language, notes: String(body.notes || '').slice(0, 1000) }), 6000)));
    const row = await one(db.from('email_sequences').insert({ owner_id: user.id, name: seq.name, sequence_type: body.type in SEQUENCE_TYPES ? body.type : 'nurture', offer_id: offer?.id || null, language: body.language === 'fr-qc' ? 'fr-qc' : 'en', emails: seq.emails }).select().single());
    const apId = await approval({ type: 'Email sequence', title: seq.name, payload: { sequence_id: row.id, body: seq.emails.map((e, i) => `Email ${i + 1} (${e.day})\nSubject: ${e.subject}\n\n${e.body}`).join('\n\n---\n\n') }, tags: ['email', body.type || 'nurture'], language: row.language, source_agent: 'Email Writer', target_module: 'emails' });
    await one(db.from('email_sequences').update({ approval_id: apId, version: row.version + 1 }).eq('id', row.id));
    return { sequence_id: row.id };
  }

  if (a === 'rewrite_email') {
    const r = parseJson(await ask(await withDna(REWRITE_SYSTEM), `Instruction: ${String(body.instruction || 'Tighten it and make it more specific.').slice(0, 500)}\nLanguage: ${body.language === 'fr-qc' ? 'Quebec French' : 'English'}\n\nSubject: ${body.subject}\nPreview: ${body.preview || ''}\n\n${String(body.body || '').slice(0, 8000)}`, 2500));
    return { subject: cleanCopy(r.subject || body.subject), preview: cleanCopy(r.preview || ''), body: cleanCopy(r.body || '') };
  }

  if (a === 'funnel_build') {
    const f = await one(db.from('funnels').select('*').eq('id', body.funnel_id).single());
    const offer = f.offer_id ? await one(db.from('offers').select('*').eq('id', f.offer_id).maybeSingle()) : null;
    const prev = body.instruction ? await one(db.from('funnel_versions').select('output').eq('funnel_id', f.id).order('version_no', { ascending: false }).limit(1).maybeSingle()) : null;
    if (body.instruction && !prev) throw new HttpError(400, 'Build the funnel first, then ask for revisions');
    const out = validateFunnel(parseJson(await ask(await withDna(FUNNEL_SYSTEM), funnelPrompt({ brief: { type: f.funnel_type, ...f.brief }, offer, previous: prev?.output, instruction: body.instruction }), 8000)));
    const versionNo = f.current_version + 1;
    const v = await one(db.from('funnel_versions').insert({ owner_id: user.id, funnel_id: f.id, version_no: versionNo, output: out, note: body.instruction ? String(body.instruction).slice(0, 300) : 'Built from brief' }).select('id').single());
    const apId = await approval({ type: 'Funnel copy', title: `${f.name} v${versionNo}`, payload: { funnel_id: f.id, funnel_version_id: v.id, body: `${out.headline}\n${out.subheadline}\n\n${out.sections.map((s) => `${s.heading}\n${s.body}`).join('\n\n')}\n\nCTA: ${out.cta}` }, tags: ['funnel'], source_agent: 'Funnel Builder', target_module: 'funnels' });
    await one(db.from('funnel_versions').update({ approval_id: apId }).eq('id', v.id));
    await one(db.from('funnels').update({ current_version: versionNo, version: f.version + 1 }).eq('id', f.id));
    return { version_no: versionNo };
  }

  if (a === 'goal') {
    const raw = String(body.raw || '').trim().slice(0, 500);
    if (!raw) throw new HttpError(400, 'Type a goal');
    let stages = [];
    try { stages = (await hlBoard(db, admin, user.id)).stages.map((s) => s.name); } catch { /* HighLevel optional */ }
    const g = validateGoal(parseJson(await ask(GOAL_SYSTEM, goalPrompt(raw, stages), 1200)), stages);
    const src = g.metric_key.startsWith('hl_') ? 'highlevel' : g.metric_key.startsWith('meta_') ? 'meta_ads' : g.metric_key === 'content_published' ? 'content' : 'manual';
    const row = await one(db.from('goals').insert({ owner_id: user.id, raw, target: g.target, metric_key: g.metric_key, metric_source: src, target_value: g.target_value, unit: g.unit, due_date: g.due_date }).select().single());
    if (g.checklist.length) await one(db.from('goal_items').insert(g.checklist.map((t, i) => ({ owner_id: user.id, goal_id: row.id, text: t, sort: i }))));
    return { goal_id: row.id };
  }

  if (a === 'goals_sync') {
    const goals = await one(db.from('goals').select('*'));
    const need = (p) => goals.some((g) => (g.metric_key || '').startsWith(p));
    const settle = (p) => p.then((v) => v, () => null);
    const [board, meta7, meta30, content] = await Promise.all([
      need('hl_') ? settle(hlBoard(db, admin, user.id)) : null,
      need('meta_cpl') ? settle(metaNow(db, admin, user.id, 'last_7d')) : null,
      need('meta_leads') ? settle(metaNow(db, admin, user.id, 'last_30d')) : null,
      need('content_') ? one(db.from('content_items').select('stage, tasks, updated_at')) : null,
    ]);
    const meta = meta7 || meta30 ? { cpl: meta7?.cpl ?? null, leads: meta30?.leads ?? null, leads30: meta30?.leads ?? null } : null;
    let updated = 0;
    for (const g of goals) {
      const v = goalValue(g, { board, meta, content });
      if (v == null) continue;
      await one(db.from('goals').update({ current_value: v, last_synced_at: new Date().toISOString(), version: g.version + 1 }).eq('id', g.id).eq('version', g.version));
      updated++;
    }
    return { updated, sources: { highlevel: !!board, meta: !!meta, content: !!content } };
  }

  if (a === 'program_propose') {
    const p = validateProgram(parseJson(await ask(await withDna(PROGRAM_SYSTEM), `What it should teach: ${String(body.topic || '').slice(0, 1000)}`, 4000)));
    const id = await approval({ type: 'Program', title: `Program proposal: ${p.name}`, payload: { program: p, body: programText(p) }, tags: ['program'], source_agent: 'Content Strategist', target_module: 'programs' });
    return { approval_id: id };
  }

  if (a === 'vault_brief') {
    const v = await one(db.from('vault_items').select('*').eq('id', body.item_id).single());
    const content = [{ type: 'text', text: `Example (${v.kind}): ${v.title}\n${v.url ? 'URL: ' + v.url + '\n' : ''}${v.body ? 'Text:\n' + v.body.slice(0, 8000) + '\n' : ''}Owner's note: ${v.note || 'none'}` }];
    if (v.kind === 'screenshot' && v.storage_path) {
      const { data: blob } = await db.storage.from('brain').download(v.storage_path);
      if (blob) content.unshift({ type: 'image', source: { type: 'base64', media_type: blob.type || 'image/png', data: Buffer.from(await blob.arrayBuffer()).toString('base64') } });
    }
    const key = await getSecret(admin, user.id, 'anthropic', 'api_key');
    const b = validateBrief(parseJson(await claude(key, { system: await withDna(VAULT_SYSTEM), messages: [{ role: 'user', content }], maxTokens: 2500 })));
    await one(db.from('vault_items').update({ brief: b, briefed_at: new Date().toISOString() }).eq('id', v.id));
    await approval({ type: 'Brief', title: `Brief from Vault: ${b.title}`, payload: { body: briefText(b), vault_item_id: v.id, inspiration: true }, tags: ['vault', 'inspiration'], source_agent: 'Researcher', target_module: 'content' });
    return { brief: b };
  }

  if (a === 'image_models') {
    const key = await getSecret(admin, user.id, 'openrouter', 'api_key');
    const r = await fetch('https://openrouter.ai/api/v1/images/models', { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new HttpError(502, `OpenRouter returned ${r.status}`);
    const j = await r.json();
    return { models: (j.data || []).map((m) => ({ id: m.id, name: m.name || m.id, refs: (m.architecture?.input_modalities || []).includes('image') })).slice(0, 60) };
  }

  if (a === 'graphic') {
    const key = await getSecret(admin, user.id, 'openrouter', 'api_key');
    const board = await one(db.from('brand_board').select('*').maybeSingle());
    const refs = [];
    for (const p of [body.reference_path, body.base_path].filter(Boolean).slice(0, 2)) {
      if (!String(p).startsWith(user.id + '/')) throw new HttpError(400, 'Invalid image path');
      const { data: blob } = await db.storage.from('brain').download(p);
      if (blob) refs.push({ type: 'image_url', image_url: { url: `data:${blob.type || 'image/png'};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}` } });
    }
    let prompt = graphicPrompt({ format: body.format, headline: String(body.headline || '').slice(0, 120), notes: String(body.notes || '').slice(0, 800), board, brandStyle: 'modern, premium, minimal, futuristic, clean, professional', hasReference: !!body.reference_path });
    if (body.base_path && body.instruction) prompt = `Edit the provided image: ${String(body.instruction).slice(0, 500)}. Keep everything else the same. ${prompt}`;
    const model = String(body.model || process.env.OPENROUTER_IMAGE_MODEL || 'google/gemini-2.5-flash-image');
    const r = await fetch('https://openrouter.ai/api/v1/images', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Founders AI OS' },
      body: JSON.stringify({ model, prompt, aspect_ratio: aspectFor(body.format), n: 1, ...(refs.length ? { input_references: refs } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(r.status === 402 ? 402 : 502, r.status === 402 ? 'OpenRouter has no credits left.' : `Image generation failed: ${j.error?.message || r.status}`);
    const img = j.data?.[0];
    if (!img?.b64_json) throw new HttpError(502, 'The image model returned no image');
    return { b64: img.b64_json, media_type: img.media_type || 'image/png', prompt, model, cost: j.usage?.cost ?? null };
  }

  if (a === 'research_fetch') {
    const c = await one(db.from('research_creators').select('*').eq('id', body.creator_id).single());
    let posts = [];
    const plan = apifyPlan(c.platform, c);
    const logRun = (row) => db.from('apify_runs').insert({ owner_id: user.id, creator_id: c.id, platform: c.platform, actor: plan.actor, ...row }).then(() => {}, () => {});
    try {
      if (plan) {
        const token = await getSecret(admin, user.id, 'apify', 'api_token');
        try {
          const run = await apifyRun(token, plan);
          posts = run.posts;
          var runInfo = { run_id: run.runId, status: run.status, cost_usd: run.cost };
        } catch (e) {
          if (e.run) await logRun({ run_id: e.run.id, status: e.run.status, cost_usd: e.run.cost });
          throw e.status ? new HttpError(e.status, e.message) : e;
        }
      } else if (c.platform === 'YouTube') {
        const key = await getSecret(admin, user.id, 'youtube', 'api_key');
        const yt = async (path) => { const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${encodeURIComponent(key)}`); const j = await r.json(); if (!r.ok) throw new HttpError(502, `YouTube: ${j.error?.message || r.status}`); return j; };
        const ch = await yt(`channels?part=contentDetails&forHandle=${encodeURIComponent(c.handle.startsWith('@') ? c.handle : '@' + c.handle)}`);
        const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        if (!uploads) throw new HttpError(400, 'YouTube channel not found');
        const pl = await yt(`playlistItems?part=contentDetails&maxResults=30&playlistId=${uploads}`);
        const ids = pl.items.map((i) => i.contentDetails.videoId).join(',');
        posts = ids ? (await yt(`videos?part=snippet,statistics&id=${ids}`)).items.map(mapYouTube) : [];
      } else throw new HttpError(400, 'Supported platforms: Instagram, YouTube, Facebook, LinkedIn');
    } catch (e) {
      await db.from('research_creators').update({ fetch_error: String(e.message).slice(0, 300), last_fetched_at: new Date().toISOString() }).eq('id', c.id);
      throw e;
    }
    const scored = scorePosts(posts);
    const outliers = scored.posts.filter((p) => p.outlier_score >= 2).length;
    if (plan) await logRun({ ...runInfo, items: posts.length, outliers });
    if (scored.posts.length) await one(db.from('research_posts').upsert(scored.posts.map((p) => ({ owner_id: user.id, creator_id: c.id, ...p, fetched_at: new Date().toISOString() })), { onConflict: 'owner_id,creator_id,external_id' }));
    await one(db.from('research_creators').update({ median_views: scored.median, last_fetched_at: new Date().toISOString(), fetch_error: null }).eq('id', c.id));
    return { posts: scored.posts.length, median: scored.median, metric: scored.metric, outliers, cost: runInfo?.cost_usd ?? null };
  }

  // Content funnel: ideas for each stage that lead to one offer or lead magnet. Each idea is a draft in Approvals.
  if (a === 'content_funnel') {
    let target = String(body.target || '').trim().slice(0, 500);
    if (body.offer_id) {
      const o = await one(db.from('offers').select('name, price, currency, cadence, services').eq('id', body.offer_id).single());
      target = `Offer "${o.name}"${o.price != null ? ` at ${o.price} ${o.currency} per ${o.cadence}` : ''}. Services: ${(o.services || []).join(', ')}`;
    }
    if (!target) throw new HttpError(400, 'Pick an offer or describe the lead magnet');
    const clamp = (n) => Math.max(0, Math.min(8, Math.round(+n || 0)));
    const counts = { tofu: clamp(body.counts?.tofu ?? 4), mofu: clamp(body.counts?.mofu ?? 3), bofu: clamp(body.counts?.bofu ?? 2) };
    if (!counts.tofu && !counts.mofu && !counts.bofu) throw new HttpError(400, 'Ask for at least one idea');
    const sys = (await withDna(CONTENT_FUNNEL_SYSTEM)) + '\n\n' + signalsBlock(await signals());
    const plan = validateContentFunnel(parseJson(await ask(sys, contentFunnelPrompt({ target, counts, language: body.language, notes: String(body.notes || '').slice(0, 1000) }), 4000)), counts);
    const label = body.offer_id ? target.split('"')[1] : target.slice(0, 60);
    let made = 0;
    for (const [stage, ideas] of Object.entries(plan)) {
      for (const x of ideas) {
        await approval({ type: 'Idea', title: x.title, payload: { body: ideaBody(x, stage), funnel_stage: stage, funnel_target: label, format: x.format, hook: x.hook },
          tags: [stage, 'content funnel'], language: body.language === 'fr-qc' ? 'fr-qc' : 'en', source_agent: 'Content Strategist', target_module: 'content' });
        made++;
      }
    }
    return { drafts: made, by_stage: Object.fromEntries(Object.entries(plan).map(([k, v]) => [k, v.length])) };
  }

  // Voice playbook: question and answer pairs drawn from the owner's own material, each backed by a quote.
  if (a === 'playbook_propose') {
    const sources = await one(db.from('brain_sources').select('name, content').eq('status', 'ready').order('created_at', { ascending: false }).limit(20));
    let material = '';
    for (const s2 of sources) { if (material.length > 30000) break; if (s2.content) material += `\n\n## ${s2.name}\n${String(s2.content).slice(0, 8000)}`; }
    const facts = await one(db.from('brain_facts').select('text').eq('status', 'approved').limit(80));
    material += facts.length ? `\n\n## Approved facts\n${facts.map((f) => '- ' + f.text).join('\n')}` : '';
    if (material.trim().length < 200) throw new HttpError(400, 'Add more to the Brain first: past posts, sales-call notes or FAQs.');
    const existing = (await one(db.from('voice_playbook').select('question').neq('status', 'rejected'))).map((r) => r.question);
    const pairs = validatePlaybook(parseJson(await ask(PLAYBOOK_SYSTEM, playbookPrompt({ material, existing, count: Math.min(+body.count || 8, 12), language: body.language }), 4000)), material, existing);
    if (pairs.length) await one(db.from('voice_playbook').insert(pairs.map((p) => ({ owner_id: user.id, question: p.question, answer: p.answer, source_quote: p.quote, status: 'proposed', authored_by: 'ai' }))));
    return { proposed: pairs.length };
  }

  // Calls: AI review of a transcript (summary, objections, questions, what to improve, next steps).
  if (a === 'call_analyze') {
    const c = await one(db.from('calls').select('*').eq('id', String(body.id || '')).single());
    try {
      const review = validateCall(parseJson(await ask(await withDna(CALL_SYSTEM), callPrompt(c, 'The owner'), 4000)));
      const r = await one(db.from('calls').update({ analysis: review, status: 'analyzed', error: null, version: c.version + 1 }).eq('id', c.id).eq('version', c.version).select('id'));
      if (!r.length) throw new HttpError(409, 'This call changed while it was being reviewed. Try again.');
      return { analysis: review };
    } catch (e) {
      if (!(e instanceof HttpError) || e.status >= 500) await db.from('calls').update({ status: 'error', error: String(e.message).slice(0, 300), version: c.version + 1 }).eq('id', c.id).eq('version', c.version);
      throw e;
    }
  }

  // A transcript file (PDF, DOCX, TXT, VTT, SRT) uploaded to the owner's folder becomes a call.
  if (a === 'call_from_file') {
    const path = String(body.path || '');
    if (!path.startsWith(`${user.id}/calls/`)) throw new HttpError(400, 'Invalid file');
    const { data: blob, error } = await db.storage.from('brain').download(path);
    if (error) throw new HttpError(400, 'Could not read that file');
    let text = await extractText({ bytes: await blob.arrayBuffer(), mime: body.mime || blob.type || '', name: body.name || path });
    // Subtitle files: drop cue numbers and timestamps.
    if (/\.(vtt|srt)$/i.test(body.name || '')) text = text.split('\n').filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !/-->/.test(l) && !/^WEBVTT/.test(l)).join('\n');
    if (text.trim().length < 50) throw new HttpError(400, 'That file has no readable transcript');
    const row = await one(db.from('calls').insert({ owner_id: user.id, title: String(body.title || body.name || 'Uploaded call').slice(0, 200), kind: CALL_KINDS.includes(body.kind) ? body.kind : 'sales',
      occurred_at: body.occurred_at || null, source: 'upload', transcript: text.slice(0, 400000), status: 'new', authored_by: 'me' }).select('id').single());
    await db.storage.from('brain').remove([path]);
    return { call_id: row.id, chars: text.length };
  }

  // Add a call to the Brain as a source; the browser then runs the usual processing and fact proposals.
  if (a === 'call_to_brain') {
    const c = await one(db.from('calls').select('*').eq('id', String(body.id || '')).single());
    if (c.brain_source_id) return { source_id: c.brain_source_id, existing: true };
    const src = await one(db.from('brain_sources').insert({ owner_id: user.id, kind: 'text', name: `Call: ${c.title}`.slice(0, 200), content: callBrainText(c), mime: 'text/plain', is_writing_sample: false }).select('id').single());
    await one(db.from('calls').update({ brain_source_id: src.id, version: c.version + 1 }).eq('id', c.id).eq('version', c.version));
    return { source_id: src.id };
  }

  // Answers the owner gave on a call, proposed into the voice playbook for review.
  if (a === 'call_to_playbook') {
    const c = await one(db.from('calls').select('title, analysis').eq('id', String(body.id || '')).single());
    const faq = c.analysis?.faq_candidates || [];
    if (!faq.length) throw new HttpError(400, 'Review the call first. No answers were found to add.');
    const have = new Set((await one(db.from('voice_playbook').select('question'))).map((p) => p.question.toLowerCase().trim()));
    const add = faq.filter((f) => !have.has(f.question.toLowerCase().trim()));
    if (add.length) await one(db.from('voice_playbook').insert(add.map((f) => ({ owner_id: user.id, question: f.question, answer: f.answer, source_quote: `From call: ${c.title}`.slice(0, 400), status: 'proposed', authored_by: 'ai' }))));
    return { proposed: add.length };
  }

  // Revenue: Stripe (when a key is saved) plus manual entries.
  if (a === 'revenue') return revenueNow(db, admin, user.id);

  // Text models available through OpenRouter, for the model picker in AI Chat.
  if (a === 'chat_models') {
    let key = null;
    try { key = await getSecret(admin, user.id, 'openrouter', 'api_key'); } catch { return { models: [], openrouter: false }; }
    const r = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new HttpError(502, `OpenRouter returned ${r.status}`);
    const list = (await r.json()).data || [];
    const models = list.filter((m) => (m.architecture?.output_modalities || ['text']).includes('text') && !(m.architecture?.output_modalities || []).includes('image'))
      .map((m) => ({ id: m.id, name: m.name || m.id, context: m.context_length || null })).sort((x, y) => x.name.localeCompare(y.name)).slice(0, 400);
    return { models, openrouter: true };
  }

  if (a === 'learning_refresh') {
    const items = await one(db.from('approvals').select('type, status, tags, language, authored_by, trashed_at').order('created_at', { ascending: false }).limit(300));
    const found = computeSignals(items);
    const existing = await one(db.from('learning_signals').select('key, state'));
    const state = Object.fromEntries(existing.map((s) => [s.key, s.state]));
    if (found.length) await one(db.from('learning_signals').upsert(found.map((s) => ({ owner_id: user.id, key: s.key, signal: s.signal, evidence: s.evidence, weight: s.weight, state: state[s.key] || 'on' })), { onConflict: 'owner_id,key' }));
    return { signals: found.length };
  }

  throw new HttpError(400, 'Unknown action');
});

