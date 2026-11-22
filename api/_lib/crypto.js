// AES-256-GCM for provider keys. The master key lives only in the ENCRYPTION_KEY env var.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function masterKey(b64 = process.env.ENCRYPTION_KEY) {
  if (!b64) throw new Error('ENCRYPTION_KEY is not set');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64 encoded');
  return key;
}

export function encrypt(plain, key = masterKey()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return { ciphertext: ct.toString('base64'), iv: iv.toString('base64'), auth_tag: cipher.getAuthTag().toString('base64') };
}

export function decrypt({ ciphertext, iv, auth_tag }, key = masterKey()) {
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(auth_tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ciphertext, 'base64')), d.final()]).toString('utf8');
}

export const last4 = (s) => (s && s.length > 8 ? s.slice(-4) : '');
