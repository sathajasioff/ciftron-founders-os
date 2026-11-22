// Provider catalog, key storage helpers, connection tests and the two AI calls the Brain needs.
import { decrypt } from './crypto.js';
import { HttpError } from './http.js';

// fields: secret fields are encrypted in provider_keys; plain fields go to connections.config.
export const PROVIDERS = {
  highlevel: { name: 'HighLevel', secret: ['private_integration_token'], plain: ['location_id'], phase: 4 },
  meta_ads: { name: 'Meta Ads', secret: ['access_token'], plain: ['ad_account_id'], phase: 4 },
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
export async function testProvider(provider, s) {
  switch (provider) {
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
    if (!r.ok) throw new HttpError(502, `OpenAI embeddings failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    out.push(...j.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
  }
  return out;
}

export async function claude(apiKey, { system, prompt, maxTokens = 4000 }) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new HttpError(502, `Anthropic request failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return j.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
}
