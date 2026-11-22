// Jarvis voice: ElevenLabs text-to-speech. The browser falls back to its own voice if this fails.
import { handler, requireOwner, HttpError } from './_lib/http.js';
import { getSecret } from './_lib/providers.js';

export const config = { maxDuration: 30 };
const DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb';
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';

export default handler(['POST'], async (req, body) => {
  const { user, db, admin } = await requireOwner(req);
  const text = String(body.text || '').trim().slice(0, 1200);
  if (!text) throw new HttpError(400, 'Nothing to say');
  const key = await getSecret(admin, user.id, 'elevenlabs', 'api_key');
  const { data: conn } = await db.from('connections').select('config').eq('provider', 'elevenlabs').maybeSingle();
  const voice = String(conn?.config?.voice_id || DEFAULT_VOICE).replace(/[^A-Za-z0-9]/g, '');
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL }), signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 200);
    throw new HttpError(r.status === 401 ? 400 : 502, /quota|credits/i.test(t) ? 'ElevenLabs has no characters left this month.' : `ElevenLabs error ${r.status}`, { fallback: true });
  }
  return { audio: Buffer.from(await r.arrayBuffer()).toString('base64'), type: 'audio/mpeg' };
});
