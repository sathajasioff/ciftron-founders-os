// MCP endpoint (Streamable HTTP). Connect Claude Code, Codex or another MCP client with a
// token created in Settings. Read tokens see; read-write tokens can also save drafts and edits.
import { adminClient } from './_lib/http.js';
import { handleMessage, hashToken, originAllowed, ERR } from './_lib/mcp.js';
import { buildTools } from './_lib/mcp-tools.js';
import { logError } from './_lib/errors.js';

export const config = { maxDuration: 60 };

const send = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store');
  if (body === null) return res.status(status).end();
  res.setHeader('Content-Type', 'application/json');
  return res.status(status).send(JSON.stringify(body));
};
const bad = (code, message) => ({ jsonrpc: '2.0', id: null, error: { code, message } });

class AuthError extends Error { constructor(m, status = 401) { super(m); this.status = status; } }

export default async function mcp(req, res) {
  if (!originAllowed(req.headers.origin, req.headers.host)) return send(res, 403, bad(ERR.INVALID, 'Origin not allowed'));
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, bad(ERR.INVALID, 'Use POST'));
  }

  let msg = req.body;
  if (typeof msg === 'string' || Buffer.isBuffer(msg)) {
    try { msg = JSON.parse(String(msg)); } catch { return send(res, 400, bad(ERR.PARSE, 'Body is not valid JSON')); }
  }

  const raw = String(req.headers.authorization || '');
  const presented = raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
  let ctx = null;
  const authorize = async () => {
    if (!presented) throw new AuthError('Missing token. Create one in Settings > MCP access and send it as a Bearer token.');
    const admin = adminClient();
    const { data: token, error } = await admin.from('mcp_tokens').select('id, owner_id, name, scope, revoked_at').eq('token_hash', hashToken(presented)).maybeSingle();
    if (error) throw new AuthError('Server error', 500);
    if (!token || token.revoked_at) throw new AuthError('Token not valid or revoked');
    // Touch last_used_at at most once a minute. Failure here never blocks the request.
    admin.from('mcp_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', token.id)
      .or(`last_used_at.is.null,last_used_at.lt.${new Date(Date.now() - 60000).toISOString()}`).then(() => {}, () => {});
    ctx = { admin, token };
  };

  // Built after the token check, so the token's scope decides what is listed and callable.
  const tools = () => buildTools({ admin: ctx.admin, ownerId: ctx.token.owner_id, token: ctx.token });

  try {
    const onError = (e, name) => logError(ctx?.admin, { ownerId: ctx?.token.owner_id, source: 'mcp', route: `tools/call ${name}`, error: e, detail: { token: ctx?.token.name } });
    const out = await handleMessage(msg, req.headers, { tools, authorize, onError });
    if (out.status === 401) res.setHeader('WWW-Authenticate', 'Bearer realm="ciftron-founders-os"');
    return send(res, out.status, out.body);
  } catch (e) {
    await logError(ctx?.admin, { ownerId: ctx?.token.owner_id, source: 'mcp', route: msg?.method, status: 500, error: e });
    return send(res, 500, bad(ERR.INTERNAL, 'Server error'));
  }
}
