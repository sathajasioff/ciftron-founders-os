// Creation studio. Every AI draft is saved to Approvals; nothing is published or sent from here.
import { handler, requireOwner, HttpError } from './_lib/http.js';
import { getSecret, claude } from './_lib/providers.js';
import { parseJson } from './_lib/brain.js';
import { systemPrompt, extractDrafts, linkDrafts, cleanCopy, AGENT_SEEDS } from './_lib/chat.js';
import { hlBoard, metaNow } from './_lib/context.js';
import {
  EMAIL_SYSTEM, emailPrompt, validateSequence, REWRITE_SYSTEM, FUNNEL_SYSTEM, funnelPrompt, validateFunnel, GOAL_SYSTEM, goalPrompt, validateGoal, goalValue,
  PROGRAM_SYSTEM, validateProgram, programText, VAULT_SYSTEM, validateBrief, briefText, graphicPrompt, aspectFor, scorePosts, mapInstagram, mapYouTube,
  computeSignals, signalsBlock, SEQUENCE_TYPES,
} from './_lib/studio.js';
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
    try {
      if (c.platform === 'Instagram') {
        const token = await getSecret(admin, user.id, 'apify', 'api_token');
        const r = await fetch('https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items?timeout=50', {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: [c.handle.replace(/^@/, '')], resultsLimit: 24 }), signal: AbortSignal.timeout(55000),
        });
        if (!r.ok) throw new HttpError(502, `Apify returned ${r.status}: ${(await r.text()).slice(0, 150)}`);
        posts = (await r.json()).map(mapInstagram).filter((p) => p.external_id);
      } else if (c.platform === 'YouTube') {
        const key = await getSecret(admin, user.id, 'youtube', 'api_key');
        const yt = async (path) => { const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${encodeURIComponent(key)}`); const j = await r.json(); if (!r.ok) throw new HttpError(502, `YouTube: ${j.error?.message || r.status}`); return j; };
        const ch = await yt(`channels?part=contentDetails&forHandle=${encodeURIComponent(c.handle.startsWith('@') ? c.handle : '@' + c.handle)}`);
        const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        if (!uploads) throw new HttpError(400, 'YouTube channel not found');
        const pl = await yt(`playlistItems?part=contentDetails&maxResults=30&playlistId=${uploads}`);
        const ids = pl.items.map((i) => i.contentDetails.videoId).join(',');
        posts = ids ? (await yt(`videos?part=snippet,statistics&id=${ids}`)).items.map(mapYouTube) : [];
      } else throw new HttpError(400, 'Supported platforms: Instagram, YouTube');
    } catch (e) {
      await db.from('research_creators').update({ fetch_error: String(e.message).slice(0, 300), last_fetched_at: new Date().toISOString() }).eq('id', c.id);
      throw e;
    }
    const scored = scorePosts(posts);
    if (scored.posts.length) await one(db.from('research_posts').upsert(scored.posts.map((p) => ({ owner_id: user.id, creator_id: c.id, ...p, fetched_at: new Date().toISOString() })), { onConflict: 'owner_id,creator_id,external_id' }));
    await one(db.from('research_creators').update({ median_views: scored.median, last_fetched_at: new Date().toISOString(), fetch_error: null }).eq('id', c.id));
    return { posts: scored.posts.length, median: scored.median };
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

