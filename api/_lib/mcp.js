// MCP protocol over Streamable HTTP. Speaks the current stateless revision (2026-07-28)
// and the earlier initialize-handshake revisions, so older clients keep working.
// Pure functions: no database or network here, which keeps the protocol easy to test.
import { createHash, randomBytes } from 'node:crypto';

export const MODERN_VERSIONS = ['2026-07-28'];
export const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
export const SERVER_INFO = { name: 'ciftron-founders-os', title: 'Ciftron Founders OS', version: '6.0.0' };
export const INSTRUCTIONS = 'Private OS for one founder. Read Brand DNA, Brain, drafts, content, goals and pipeline numbers. '
  + 'Write tools only create or edit drafts and planning rows inside the OS. Nothing is published, posted or sent from here. '
  + 'New AI work goes to Approvals with create_draft. Updates need the row version you read, and text the owner wrote is only changed when they asked you to.';
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';

export const ERR = { PARSE: -32700, INVALID: -32600, METHOD: -32601, PARAMS: -32602, INTERNAL: -32603, HEADER_MISMATCH: -32020, UNSUPPORTED_VERSION: -32022 };

export class McpError extends Error {
  constructor(code, message, data, status = 200) { super(message); this.code = code; this.data = data; this.status = status; }
}

// Tokens look like cfos_<43 url-safe chars>. Only the sha256 hash is stored.
export const newToken = () => 'cfos_' + randomBytes(32).toString('base64url');
export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');
export const tokenPrefix = (t) => String(t).slice(0, 12);

// Browser pages from other sites must not reach the endpoint (DNS rebinding, CSRF).
// CLI clients send no Origin header at all.
export function originAllowed(origin, host, extra = process.env.APP_ORIGIN) {
  if (!origin) return true;
  let o;
  try { o = new URL(origin); } catch { return false; }
  const allowed = [host && `https://${host}`, ...(String(extra || '').split(',').map((s) => s.trim()).filter(Boolean))];
  return allowed.includes(o.origin);
}

const decodeHeader = (v) => {
  const m = String(v ?? '').match(/^=\?base64\?(.*)\?=$/);
  return m ? Buffer.from(m[1], 'base64').toString('utf8') : v;
};

const rpcError = (id, code, message, data) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } });
const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

// Works out which era a request belongs to and checks the mirrored headers.
// Returns { era: 'modern' | 'legacy', version }.
export function negotiate(msg, headers = {}) {
  const h = (k) => headers[k.toLowerCase()];
  const metaVersion = msg?.params?._meta?.[META_VERSION];
  const headerVersion = h('mcp-protocol-version');

  if (msg.method === 'initialize') return { era: 'legacy', version: LEGACY_VERSIONS.includes(msg.params?.protocolVersion) ? msg.params.protocolVersion : LEGACY_VERSIONS[0] };

  if (metaVersion !== undefined || MODERN_VERSIONS.includes(headerVersion)) {
    const version = metaVersion ?? headerVersion;
    if (!MODERN_VERSIONS.includes(version)) {
      throw new McpError(ERR.UNSUPPORTED_VERSION, `Unsupported protocol version ${version}`, { supported: [...MODERN_VERSIONS, ...LEGACY_VERSIONS], requested: version }, 400);
    }
    if (!headerVersion) throw new McpError(ERR.HEADER_MISMATCH, 'Header mismatch: MCP-Protocol-Version header is missing', undefined, 400);
    if (headerVersion !== version) throw new McpError(ERR.HEADER_MISMATCH, `Header mismatch: MCP-Protocol-Version header ${headerVersion} does not match body ${version}`, undefined, 400);
    const method = h('mcp-method');
    if (method === undefined) throw new McpError(ERR.HEADER_MISMATCH, 'Header mismatch: Mcp-Method header is missing', undefined, 400);
    if (method !== msg.method) throw new McpError(ERR.HEADER_MISMATCH, `Header mismatch: Mcp-Method header value '${method}' does not match body value '${msg.method}'`, undefined, 400);
    if (msg.method === 'tools/call') {
      const name = h('mcp-name');
      if (name === undefined) throw new McpError(ERR.HEADER_MISMATCH, 'Header mismatch: Mcp-Name header is missing', undefined, 400);
      if (decodeHeader(name) !== msg.params?.name) throw new McpError(ERR.HEADER_MISMATCH, `Header mismatch: Mcp-Name header value '${name}' does not match body value '${msg.params?.name}'`, undefined, 400);
    }
    return { era: 'modern', version };
  }

  // Legacy client after its handshake. A missing header means 2025-03-26 (allowed by the spec).
  const version = headerVersion || '2025-03-26';
  if (!LEGACY_VERSIONS.includes(version)) {
    throw new McpError(ERR.UNSUPPORTED_VERSION, `Unsupported protocol version ${version}`, { supported: [...MODERN_VERSIONS, ...LEGACY_VERSIONS], requested: version }, 400);
  }
  return { era: 'legacy', version };
}

const toolView = (t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations });

// Handles one JSON-RPC message. tools: [{ name, title, description, inputSchema, annotations, run(args) }].
// Returns { status, body } where body is null for an accepted notification.
export async function handleMessage(msg, headers, { tools: toolsIn, authorize }) {
  if (Array.isArray(msg)) return { status: 400, body: rpcError(null, ERR.INVALID, 'Batch requests are not supported') };
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return { status: 400, body: rpcError(msg?.id, ERR.INVALID, 'Invalid JSON-RPC request') };
  }
  const isNotification = !('id' in msg);
  if (isNotification) return { status: 202, body: null };
  if ('result' in msg || 'error' in msg) return { status: 400, body: rpcError(null, ERR.INVALID, 'This server does not accept responses') };

  let era;
  try { ({ era } = negotiate(msg, headers)); } catch (e) {
    if (e instanceof McpError) return { status: e.status, body: rpcError(msg.id, e.code, e.message, e.data) };
    throw e;
  }
  const modern = era === 'modern';
  const done = (result, cache) => ({ status: 200, body: rpcResult(msg.id, modern ? { resultType: 'complete', ...result, ...(cache || {}) } : result) });

  // Every method below needs a valid token.
  try { await authorize(); } catch (e) {
    return { status: e.status || 401, body: rpcError(msg.id, ERR.INVALID, e.message || 'Unauthorized') };
  }
  const tools = typeof toolsIn === 'function' ? toolsIn() : toolsIn;

  switch (msg.method) {
    case 'initialize':
      return done({ protocolVersion: negotiate(msg, headers).version, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    case 'server/discover':
      return done({ supportedVersions: MODERN_VERSIONS, capabilities: { tools: {} }, _meta: { 'io.modelcontextprotocol/serverInfo': SERVER_INFO }, instructions: INSTRUCTIONS }, { ttlMs: 3600000, cacheScope: 'public' });
    case 'ping':
      if (modern) break;
      return done({});
    case 'tools/list':
      // The list depends on the token's scope, so it must not be shared across tokens.
      return done({ tools: tools.map(toolView) }, { ttlMs: 300000, cacheScope: 'private' });
    case 'tools/call': {
      const name = msg.params?.name;
      const tool = tools.find((t) => t.name === name);
      if (!tool) return { status: 200, body: rpcError(msg.id, ERR.PARAMS, `Unknown tool: ${name}`) };
      const args = msg.params?.arguments ?? {};
      if (typeof args !== 'object' || Array.isArray(args)) return { status: 200, body: rpcError(msg.id, ERR.PARAMS, 'arguments must be an object') };
      const problem = checkArgs(tool.inputSchema, args);
      if (problem) return done(toolResult({ error: problem }, true));
      try {
        const out = await tool.run(args);
        return done(toolResult(out, false));
      } catch (e) {
        // Tool failures are reported to the model so it can correct itself.
        return done(toolResult({ error: e.expose === false ? 'Server error' : (e.message || 'Server error') }, true));
      }
    }
    default:
      break;
  }
  return { status: modern ? 404 : 200, body: rpcError(msg.id, ERR.METHOD, `Method not found: ${msg.method}`) };
}

export function toolResult(out, isError) {
  const text = typeof out === 'string' ? out : JSON.stringify(out, null, 2);
  const r = { content: [{ type: 'text', text }], isError };
  if (out && typeof out === 'object' && !Array.isArray(out)) r.structuredContent = out;
  return r;
}

// Small JSON-schema check for the shapes this server uses: required keys, types, enums, lengths.
export function checkArgs(schema, args) {
  for (const k of schema.required || []) if (args[k] === undefined || args[k] === null || args[k] === '') return `Missing required argument: ${k}`;
  for (const [k, v] of Object.entries(args)) {
    const p = schema.properties?.[k];
    if (!p) { if (schema.additionalProperties === false) return `Unknown argument: ${k}`; continue; }
    if (v === null && !p.required) continue;
    const type = Array.isArray(v) ? 'array' : typeof v;
    const want = p.type;
    if (want === 'integer' ? !Number.isInteger(v) : want === 'number' ? typeof v !== 'number' || !Number.isFinite(v) : type !== want) return `${k} must be ${want === 'integer' ? 'an integer' : `a ${want}`}`;
    if (p.enum && !p.enum.includes(v)) return `${k} must be one of: ${p.enum.join(', ')}`;
    if (want === 'string' && p.maxLength && v.length > p.maxLength) return `${k} is longer than ${p.maxLength} characters`;
    if (want === 'string' && p.format === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return `${k} must be a UUID`;
    if (want === 'string' && p.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${k} must be a date like 2026-12-01`;
    if (want === 'array' && p.maxItems && v.length > p.maxItems) return `${k} has more than ${p.maxItems} items`;
    if (want === 'integer' || want === 'number') {
      if (p.minimum !== undefined && v < p.minimum) return `${k} must be at least ${p.minimum}`;
      if (p.maximum !== undefined && v > p.maximum) return `${k} must be at most ${p.maximum}`;
    }
  }
  return null;
}
