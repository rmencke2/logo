/**
 * Minimal MCP HTTP client — initialize + tools/list against live server endpoints.
 * Supports JSON and SSE (streamable HTTP) responses.
 */

const { normalizeTools } = require('./normalize');

const DEFAULT_TIMEOUT_MS = Number(process.env.MCP_LIVE_TIMEOUT_MS) || 20000;
const PROTOCOL_VERSION = '2024-11-05';
const CLIENT_INFO = { name: 'influzer-mcp-validator', version: '1.0.0' };

/**
 * @param {string} text
 */
function parseSseJsonMessages(text) {
  const messages = [];
  const chunks = String(text).split(/\n\n+/);
  for (const chunk of chunks) {
    const dataLines = chunk
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim());
    if (!dataLines.length) continue;
    try {
      messages.push(JSON.parse(dataLines.join('\n')));
    } catch {
      /* ignore malformed chunk */
    }
  }
  return messages;
}

/**
 * @param {string} body
 * @param {string|null} contentType
 */
function parseMcpResponseBody(body, contentType) {
  const trimmed = String(body || '').trim();
  if (!trimmed) return [];

  if (contentType?.includes('text/event-stream') || trimmed.startsWith('event:')) {
    return parseSseJsonMessages(trimmed);
  }

  try {
    const json = JSON.parse(trimmed);
    return Array.isArray(json) ? json : [json];
  } catch {
    if (trimmed.includes('data:')) return parseSseJsonMessages(trimmed);
    throw new Error('Unparseable MCP response');
  }
}

/**
 * CDN/HTML bodies must never surface as the admin alert (Arvow /mcp docs page).
 */
function looksLikeWebsiteOrCdnError(body, contentType) {
  const ct = String(contentType || '').toLowerCase();
  const text = String(body || '').trim();
  if (!text) return false;
  if (ct.includes('xml') || ct.includes('text/html')) return true;
  if (/^<\?xml/i.test(text) || /^<!doctype html/i.test(text) || /^<html/i.test(text)) return true;
  if (text.includes('<Error>') && /InvalidRequest|Couldn.?t route/i.test(text)) return true;
  return false;
}

function humanizeHandshakeFailure(initRes) {
  const body = initRes.rawError || initRes.body || '';
  if (looksLikeWebsiteOrCdnError(body, initRes.contentType)) {
    return 'This URL is not a Streamable HTTP MCP endpoint. POST hit a website or CDN, not initialize. Use the vendor MCP host from their docs (often https://api.<domain>/mcp), not a marketing /mcp page.';
  }
  const clipped = String(body).replace(/\s+/g, ' ').trim().slice(0, 200);
  return clipped || `HTTP ${initRes.status}`;
}

function suggestApiMcpUrl(endpoint) {
  try {
    const u = new URL(String(endpoint || '').trim());
    if (!/^https?:$/i.test(u.protocol)) return null;
    const host = u.hostname.replace(/^www\./i, '');
    if (!host || host.startsWith('api.')) return null;
    return `https://api.${host}/mcp`;
  } catch {
    return null;
  }
}

/**
 * @param {object[]} messages
 * @param {number|string} id
 */
function pickJsonRpcReply(messages, id) {
  for (const msg of messages) {
    if (msg?.id === id) return msg;
  }
  return messages.find((m) => m?.result || m?.error) || null;
}

/**
 * @param {string} endpoint
 * @param {object} payload
 * @param {{ sessionId?: string; timeoutMs?: number; redirect?: RequestRedirect }} [opts]
 */
async function postMcpMessage(endpoint, payload, opts = {}) {
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (opts.sessionId) headers['Mcp-Session-Id'] = opts.sessionId;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: opts.redirect || 'follow',
    });

    const contentType = res.headers.get('content-type');
    const sessionId = res.headers.get('mcp-session-id') || opts.sessionId || null;
    const body = await res.text();
    const authError = res.status === 401 || res.status === 403;
    let messages = [];
    if (res.ok || authError) {
      try {
        messages = parseMcpResponseBody(body, contentType);
      } catch (err) {
        // Figma and others return 401 text/plain "Unauthorized" plus WWW-Authenticate.
        if (!authError) throw err;
      }
    }

    return {
      ok: res.ok,
      status: res.status,
      contentType,
      sessionId,
      body,
      messages,
      authError,
      rawError: !res.ok && body ? body.slice(0, 500) : null,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      contentType: null,
      sessionId: opts.sessionId || null,
      body: '',
      messages: [],
      authError: false,
      networkError: err.name === 'AbortError' ? 'timeout' : err.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} endpoint
 * @param {{ timeoutMs?: number; redirect?: RequestRedirect; clientInfo?: { name: string; version: string } }} [opts]
 */
async function fetchLiveMcpTools(endpoint, opts = {}) {
  if (!endpoint || !/^https?:\/\//i.test(endpoint)) {
    return { status: 'skipped', reason: 'no_http_endpoint', tools: [] };
  }

  const initPayload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: opts.clientInfo || CLIENT_INFO,
    },
  };

  const initRes = await postMcpMessage(endpoint, initPayload, opts);
  if (initRes.networkError) {
    return { status: 'unreachable', reason: initRes.networkError, tools: [], httpStatus: initRes.status };
  }
  if (initRes.authError) {
    return {
      status: 'auth_required',
      reason: initRes.rawError || 'Authentication required',
      tools: [],
      httpStatus: initRes.status,
    };
  }
  if (!initRes.ok) {
    return {
      status: 'error',
      reason: humanizeHandshakeFailure(initRes),
      tools: [],
      httpStatus: initRes.status,
    };
  }

  const initReply = pickJsonRpcReply(initRes.messages, 1);
  if (initReply?.error) {
    return { status: 'error', reason: initReply.error.message || 'initialize failed', tools: [] };
  }
  if (!initReply?.result) {
    return { status: 'error', reason: 'No initialize result', tools: [] };
  }

  const sessionId = initRes.sessionId;

  await postMcpMessage(
    endpoint,
    { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
    { sessionId, timeoutMs: opts.timeoutMs },
  );

  const toolsRes = await postMcpMessage(
    endpoint,
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { sessionId, timeoutMs: opts.timeoutMs },
  );

  if (toolsRes.authError) {
    return {
      status: 'auth_required',
      reason: toolsRes.rawError || 'Authentication required',
      tools: [],
      httpStatus: toolsRes.status,
      serverInfo: initReply.result.serverInfo,
    };
  }
  if (toolsRes.networkError) {
    return {
      status: 'error',
      reason: toolsRes.networkError,
      tools: [],
      serverInfo: initReply.result.serverInfo,
    };
  }
  if (!toolsRes.ok) {
    return {
      status: 'error',
      reason: toolsRes.rawError || `tools/list HTTP ${toolsRes.status}`,
      tools: [],
      httpStatus: toolsRes.status,
      serverInfo: initReply.result.serverInfo,
    };
  }

  const toolsReply = pickJsonRpcReply(toolsRes.messages, 2);
  if (toolsReply?.error) {
    return {
      status: 'error',
      reason: toolsReply.error.message || 'tools/list failed',
      tools: [],
      serverInfo: initReply.result.serverInfo,
    };
  }

  const rawTools = toolsReply?.result?.tools || [];
  const tools = normalizeTools(
    rawTools.map((t) => ({
      name: t.name,
      description: t.description || t.title || '',
    })),
  );

  return {
    status: tools.length ? 'ok' : 'ok_empty',
    tools,
    serverInfo: initReply.result.serverInfo,
    httpStatus: toolsRes.status,
  };
}

module.exports = {
  fetchLiveMcpTools,
  parseMcpResponseBody,
  parseSseJsonMessages,
  looksLikeWebsiteOrCdnError,
  humanizeHandshakeFailure,
  suggestApiMcpUrl,
};
