// Provider catalog, key storage helpers, connection tests and the two AI calls the Brain needs.
import { decrypt } from './crypto.js';
import { HttpError } from './http.js';
import { hlFetch } from './hl.js';
import { metaFetch } from './meta.js';

// fields: secret fields are encrypted in provider_keys; plain fields go to connections.config.
export const PROVIDERS = {
  highlevel: { name: 'HighLevel', secret: ['private_integration_token'], plain: ['location_id'] },
  meta_ads: { name: 'Meta Ads', secret: ['access_token'], plain: ['ad_account_id'] },
  anthropic: { name: 'Anthropic', secret: ['api_key'], plain: [] },
  openai: { name: 'OpenAI', secret: ['api_key'], plain: [] },
  openrouter: { name: 'OpenRouter', secret: ['api_key'], plain: [] },
  elevenlabs: { name: 'ElevenLabs', secret: ['api_key'], plain: ['voice_id'] },
  apify: { name: 'Apify', secret: ['api_token'], plain: [] },
  youtube: { name: 'YouTube', secret: ['api_key'], plain: [] },
  mcp: { name: 'Custom MCP server', secret: ['token'], plain: ['server_url'], phase: 6 },
};

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
export const EMBED_MODEL = 'text-embedding-3-small';

export async function getSecret(admin, ownerId, provider, field) {
  const { data, error } = await admin.from('provider_keys').select('ciphertext, iv, auth_tag')
    .eq('owner_id', ownerId).eq('provider', provider).eq('field', field).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(400, `Add your ${PROVIDERS[provider].name} key in Connections first`, { needs: provider });
  return decrypt(data);
}

async function check(url, init, okMsg) {
  let r;
  try { r = await fetch(url, { ...init, signal: AbortSignal.timeout(10000) }); } catch (e) { return { ok: false, message: 'Could not reach the provider: ' + e.message }; }
  if (r.ok) return { ok: true, message: okMsg };
  const text = (await r.text()).slice(0, 200);
  return { ok: false, message: `${r.status}: ${r.status === 401 || r.status === 403 ? 'key was rejected' : text}` };
}

// Each test makes one cheap, read-only request.
export async function testProvider(provider, s, config = {}) {
  switch (provider) {
    case 'highlevel': return testHighLevel(s.private_integration_token, config.location_id);
    case 'meta_ads': return testMeta(s.access_token, config.ad_account_id);
    case 'anthropic': return check('https://api.anthropic.com/v1/models?limit=1', { headers: { 'x-api-key': s.api_key, 'anthropic-version': '2023-06-01' } }, 'Key works');
    case 'openai': return check('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${s.api_key}` } }, 'Key works');
    case 'openrouter': return check('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${s.api_key}` } }, 'Key works');
    case 'elevenlabs': return check('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': s.api_key } }, 'Key works');
    case 'apify': return check('https://api.apify.com/v2/users/me', { headers: { Authorization: `Bearer ${s.api_token}` } }, 'Token works');
    case 'youtube': return check(`https://www.googleapis.com/youtube/v3/i18nLanguages?part=snippet&hl=en&key=${encodeURIComponent(s.api_key)}`, {}, 'Key works');
    default: return { ok: false, message: `Saved. The live test for ${PROVIDERS[provider].name} is added in Phase ${PROVIDERS[provider].phase}.`, deferred: true };
  }
}

export async function embed(apiKey, inputs) {
  const out = [];
  for (let i = 0; i < inputs.length; i += 96) {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: inputs.slice(i, i + 96) }),
    });
    if (!r.ok) throw await providerError('OpenAI', r);
    const j = await r.json();
    out.push(...j.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
  }
  return out;
}

export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-6.1-sol';

// Turn provider billing and auth errors into a plain message the owner can act on.
async function providerError(name, r) {
  const text = (await r.text()).slice(0, 300);
  if (/credit balance|insufficient_quota|billing|credit_balance/i.test(text)) return new HttpError(402, `${name} has no credits left. Add credits in your ${name} billing page.`, { needs: name.toLowerCase() });
  if (r.status === 401 || r.status === 403) return new HttpError(400, `${name} rejected the key. Update it in Connections.`, { needs: name.toLowerCase() });
  if (r.status === 429) return new HttpError(429, `${name} rate limit reached. Try again in a minute.`);
  return new HttpError(502, `${name} request failed (${r.status}): ${text}`);
}

// prompt: a single user message. messages: full history with content blocks (images, text).
export async function claude(apiKey, { system, prompt, messages, maxTokens = 4000 }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages: messages || [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw await providerError('Anthropic', r);
  const j = await r.json();
  return j.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
}

export async function gpt(apiKey, { system, prompt, messages, maxTokens = 1200 }) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OPENAI_MODEL, max_completion_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...(messages || [{ role: 'user', content: prompt }])] }),
  });
  if (!r.ok) throw await providerError('OpenAI', r);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || '';
}

// OpenRouter: one key, many models. Same message shape as OpenAI chat completions.
export async function openrouter(apiKey, { model, system, messages, maxTokens = 3000 }) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Founders AI OS' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  if (!r.ok) throw await providerError('OpenRouter', r);
  const j = await r.json();
  return j.choices?.[0]?.message?.content || '';
}

// HighLevel: the location must load; then each read scope is probed so missing ones are named.
export async function testHighLevel(token, locationId) {
  if (!locationId) return { ok: false, message: 'Add the Location ID' };
  let name;
  try { name = (await hlFetch(token, `/locations/${locationId}`, { scope: 'locations.readonly' })).location?.name; }
  catch (e) { return { ok: false, message: e.message }; }
  const probes = [
    ['opportunities.readonly', `/opportunities/pipelines`, { locationId }],
    ['products.readonly', '/products/', { locationId, limit: 1 }],
    ['funnels/funnel.readonly', '/funnels/funnel/list', { locationId, limit: 1 }],
    ['socialplanner/account.readonly', `/social-media-posting/${locationId}/accounts`, {}],
    ['locations/customValues.readonly', `/locations/${locationId}/customValues`, {}],
  ];
  const missing = [];
  for (const [scope, path, query] of probes) {
    try { await hlFetch(token, path, { query, scope }); } catch (e) { if (e.status === 403 || e.scope) missing.push(scope); }
  }
  return missing.length
    ? { ok: true, message: `Connected to ${name || 'your sub-account'}. Missing read scopes: ${missing.join(', ')}`, missing }
    : { ok: true, message: `Connected to ${name || 'your sub-account'}. All read scopes work.` };
}

export async function testMeta(token, accountId) {
  if (!accountId) return { ok: false, message: 'Add the ad account ID' };
  const act = accountId.startsWith('act_') ? accountId : 'act_' + accountId.replace(/\D/g, '');
  try {
    const a = await metaFetch(token, `/${act}`, { fields: 'name,account_status,currency' });
    return { ok: true, message: `Connected to ${a.name || act} (${a.currency || 'currency unknown'})${a.account_status === 1 ? '' : '. Account is not active'}` };
  } catch (e) { return { ok: false, message: e.message }; }
}
