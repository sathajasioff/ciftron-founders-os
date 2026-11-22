// Brain actions: bootstrap, ingest a source, propose facts, build the style guide,
// compile Brand DNA, and semantic search.
import { handler, requireOwner, HttpError, audit } from './_lib/http.js';
import { getSecret, embed, claude } from './_lib/providers.js';
import { AGENT_SEEDS } from './_lib/chat.js';
import {
  extractText, htmlToText, chunkText, parseJson, validateFacts, FACTS_SYSTEM, factsPrompt,
  STYLE_SYSTEM, stylePrompt, finalizeStyle, compileDna, SEED_OFFERS, ABOUT_ME,
} from './_lib/brain.js';

export const config = { maxDuration: 60 };

const one = async (q) => { const { data, error } = await q; if (error) throw new HttpError(400, error.message); return data; };

export default handler(['POST'], async (req, body) => {
  const { user, db, admin } = await requireOwner(req);
  const action = body.action;

  // First sign-in: profile, the three offers from about_me, and about_me as a Brain source.
  if (action === 'bootstrap') {
    // Agents are added on every bootstrap so new ones appear without wiping existing settings.
    await one(db.from('agents').upsert(AGENT_SEEDS.map(({ phase, ...a }) => ({ ...a, owner_id: user.id, instructions: a.instructions || '', enabled: !!a.enabled, pinned: !!a.pinned })),
      { onConflict: 'owner_id,slug', ignoreDuplicates: true }));
    // Fill instructions for agents seeded before they were built (empty instructions only; edits are kept).
    const blank = await one(db.from('agents').select('id, slug, version').eq('instructions', ''));
    for (const b of blank) {
      const seed = AGENT_SEEDS.find((x) => x.slug === b.slug);
      if (seed?.instructions) await one(db.from('agents').update({ instructions: seed.instructions, enabled: true, version: b.version + 1 }).eq('id', b.id).eq('version', b.version));
    }
    const existing = await one(db.from('profiles').select('owner_id').maybeSingle());
    if (existing) return { created: false };
    await one(db.from('profiles').insert({ owner_id: user.id, full_name: 'Jasinthan Ukaananthan' }));
    await one(db.from('offers').insert(SEED_OFFERS.map((o) => ({ ...o, owner_id: user.id }))));
    await one(db.from('brain_sources').insert({ owner_id: user.id, kind: 'text', name: 'about_me (build brief)', content: ABOUT_ME, mime: 'text/plain' }));
    await audit(db, user.id, 'bootstrap', 'profile', user.id);
    return { created: true };
  }

  if (action === 'ingest') {
    const src = await one(db.from('brain_sources').select('*').eq('id', body.source_id).single());
    await one(db.from('brain_sources').update({ status: 'processing', error: null }).eq('id', src.id));
    try {
      let text = src.content || '';
      if (src.kind === 'file') {
        const { data: blob, error } = await db.storage.from('brain').download(src.storage_path);
        if (error) throw new HttpError(400, 'Could not read the uploaded file: ' + error.message);
        text = await extractText({ bytes: await blob.arrayBuffer(), mime: src.mime || '', name: src.name });
      } else if (src.kind === 'link') {
        text = await fetchLink(src.url);
      }
      if (!text || text.length < 20) throw new HttpError(400, 'No readable text found. Scanned PDFs need OCR first.');
      const chunks = chunkText(text);
      const vectors = await embed(await getSecret(admin, user.id, 'openai', 'api_key'), chunks);
      await one(db.from('brain_chunks').delete().eq('source_id', src.id));
      for (let i = 0; i < chunks.length; i += 200) {
        await one(db.from('brain_chunks').insert(chunks.slice(i, i + 200).map((c, k) => ({
          owner_id: user.id, source_id: src.id, idx: i + k, content: c, embedding: JSON.stringify(vectors[i + k]),
        }))));
      }
      await one(db.from('brain_sources').update({ status: 'ready', content: text, text_length: text.length, chunk_count: chunks.length }).eq('id', src.id));
      return { ok: true, chunks: chunks.length, characters: text.length };
    } catch (e) {
      await db.from('brain_sources').update({ status: 'error', error: String(e.message).slice(0, 500) }).eq('id', src.id);
      throw e;
    }
  }

  // AI proposes facts from one source. They land as "proposed" and never skip review.
  if (action === 'propose') {
    const src = await one(db.from('brain_sources').select('id, name, content, status').eq('id', body.source_id).single());
    if (!src.content) throw new HttpError(400, 'Process this source first');
    const existing = await one(db.from('brain_facts').select('text, status'));
    const known = existing.filter((f) => f.status !== 'rejected').map((f) => f.text);
    const reply = await claude(await getSecret(admin, user.id, 'anthropic', 'api_key'), {
      system: FACTS_SYSTEM, prompt: factsPrompt({ sourceName: src.name, text: src.content, known }), maxTokens: 4000,
    });
    // Rejected facts are also skipped so the AI cannot re-propose them.
    const facts = validateFacts(parseJson(reply), { known: existing.map((f) => f.text), sourceText: src.content });
    if (facts.length) {
      await one(db.from('brain_facts').insert(facts.map((f) => ({ ...f, owner_id: user.id, source_id: src.id, status: 'proposed', authored_by: 'ai' }))));
    }
    await one(db.from('brain_sources').update({ facts_proposed_at: new Date().toISOString() }).eq('id', src.id));
    return { proposed: facts.length };
  }

  if (action === 'style') {
    const samples = await one(db.from('brain_sources').select('id, name, content').eq('is_writing_sample', true).eq('status', 'ready'));
    if (!samples.length) throw new HttpError(400, 'Mark at least one processed source as a writing sample');
    const reply = await claude(await getSecret(admin, user.id, 'anthropic', 'api_key'), { system: STYLE_SYSTEM, prompt: stylePrompt(samples), maxTokens: 2500 });
    const guide = finalizeStyle(parseJson(reply));
    const last = await one(db.from('style_guides').select('version_no').order('version_no', { ascending: false }).limit(1));
    const row = await one(db.from('style_guides').insert({ owner_id: user.id, version_no: (last[0]?.version_no || 0) + 1, guide, sample_source_ids: samples.map((s) => s.id) }).select().single());
    return { style_guide: row };
  }

  if (action === 'compile') {
    const [facts, styles, offers, last] = await Promise.all([
      one(db.from('brain_facts').select('id, category, text, status, starred').eq('status', 'approved')),
      one(db.from('style_guides').select('guide').order('version_no', { ascending: false }).limit(1)),
      one(db.from('offers').select('*').order('sort')),
      one(db.from('brand_dna').select('version_no').order('version_no', { ascending: false }).limit(1)),
    ]);
    const versionNo = (last[0]?.version_no || 0) + 1;
    const { content, markdown } = compileDna({ facts, style: styles[0]?.guide || null, offers, versionNo });
    await one(db.from('brand_dna').update({ is_active: false }).eq('is_active', true));
    const row = await one(db.from('brand_dna').insert({ owner_id: user.id, version_no: versionNo, content, markdown, is_active: true }).select().single());
    await audit(db, user.id, 'brand_dna_compiled', 'brand_dna', row.id, { version: versionNo, facts: facts.length });
    return { brand_dna: row };
  }

  if (action === 'search') {
    const q = String(body.query || '').trim().slice(0, 2000);
    if (!q) throw new HttpError(400, 'Type something to search');
    const [v] = await embed(await getSecret(admin, user.id, 'openai', 'api_key'), [q]);
    const results = await one(db.rpc('match_chunks', { query_embedding: JSON.stringify(v), match_count: Math.min(+body.limit || 8, 20), min_similarity: 0.2 }));
    return { results };
  }

  throw new HttpError(400, 'Unknown action');
});

async function fetchLink(url) {
  let u;
  try { u = new URL(url); } catch { throw new HttpError(400, 'That link is not a valid URL'); }
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, 'Only http and https links');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$)/.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) {
    throw new HttpError(400, 'Private network links are not allowed');
  }
  const r = await fetch(u, { headers: { 'User-Agent': 'FoundersAIOS/1.0' }, redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new HttpError(400, `The page returned ${r.status}`);
  const type = r.headers.get('content-type') || '';
  const buf = await r.arrayBuffer();
  if (buf.byteLength > 10_000_000) throw new HttpError(400, 'That page is too large');
  if (type.includes('pdf')) return extractText({ bytes: buf, mime: 'application/pdf', name: 'link.pdf' });
  const text = Buffer.from(buf).toString('utf8');
  return type.includes('html') ? htmlToText(text) : text;
}
