/**
 * Minimal MCP HTTP client — initialize, tools/list, and tools/call against live
 * server endpoints. Supports JSON and SSE (streamable HTTP) responses.
 * tools/call uses this same POST helper. Redirects stay manual for callers
 * that pass redirect: 'manual'.
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
 * @param {{ sessionId?: string; timeoutMs?: number; redirect?: RequestRedirect; bearerToken?: string }} [opts]
 */
function bearerAuthorization(token) {
  const value = String(token || '').trim();
  if (!value || value.length > 2048 || /[\r\n\0]/.test(value)) return null;
  return `Bearer ${value}`;
}

function followUpOpts(opts, sessionId) {
  return {
    sessionId: sessionId || undefined,
    timeoutMs: opts.timeoutMs,
    redirect: opts.redirect,
    bearerToken: opts.bearerToken,
  };
}

async function postMcpMessage(endpoint, payload, opts = {}) {
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (opts.sessionId) headers['Mcp-Session-Id'] = opts.sessionId;
  const authorization = bearerAuthorization(opts.bearerToken);
  if (authorization) headers.Authorization = authorization;

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
    const location = res.headers.get('location') || null;
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
      location,
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
  const started = Date.now();
  const result = await probeLiveMcpTools(endpoint, opts);
  if (result && typeof result === 'object' && result.latency_ms == null) {
    result.latency_ms = Math.max(0, Date.now() - started);
  }
  return result;
}

async function probeLiveMcpTools(endpoint, opts = {}) {
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
    followUpOpts(opts, sessionId),
  );

  const toolsRes = await postMcpMessage(
    endpoint,
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    followUpOpts(opts, sessionId),
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

function capabilityAdvertised(capabilities, key) {
  return Boolean(capabilities && typeof capabilities === 'object' && Object.prototype.hasOwnProperty.call(capabilities, key));
}

/**
 * Count a list method without keeping the items. Stops early so a huge
 * catalog cannot be pulled into the check record.
 */
async function countListed(endpoint, sessionId, method, resultKey, idBase, opts) {
  let count = 0;
  let cursor = '';
  for (let page = 0; page < 4; page += 1) {
    const res = await postMcpMessage(
      endpoint,
      {
        jsonrpc: '2.0',
        id: idBase + page,
        method,
        params: cursor ? { cursor } : {},
      },
      followUpOpts(opts, sessionId),
    );
    if (res.networkError || res.authError || !res.ok || (res.status >= 300 && res.status < 400)) {
      return { count: null, truncated: false, location: res.location || null, failed: true };
    }
    const reply = pickJsonRpcReply(res.messages, idBase + page);
    if (!reply?.result || reply.error) return { count: null, truncated: false, failed: true };
    const batch = reply.result[resultKey];
    count += Array.isArray(batch) ? batch.length : 0;
    cursor = reply.result.nextCursor ? String(reply.result.nextCursor) : '';
    if (!cursor) return { count, truncated: false, failed: false };
    if (count >= 500) return { count, truncated: true, failed: false };
  }
  return { count, truncated: true, failed: false };
}

/**
 * Same handshake client as fetchLiveMcpTools, with the raw tool objects,
 * server instructions, and resource/prompt counts kept for a reviewer.
 * Redirects are returned, not followed.
 *
 * @param {string} endpoint
 * @param {{ timeoutMs?: number; bearerToken?: string; clientInfo?: { name: string; version: string } }} [opts]
 */
async function inspectLiveMcpServer(endpoint, opts = {}) {
  const started = Date.now();
  const finish = (result) => {
    if (result && result.latency_ms == null) result.latency_ms = Math.max(0, Date.now() - started);
    return result;
  };
  const callOpts = {
    timeoutMs: opts.timeoutMs,
    redirect: 'manual',
    bearerToken: opts.bearerToken,
    clientInfo: opts.clientInfo,
  };

  if (!endpoint || !/^https?:\/\//i.test(endpoint)) {
    return finish({ status: 'skipped', reason: 'no_http_endpoint', tools: [] });
  }

  const initRes = await postMcpMessage(
    endpoint,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: opts.clientInfo || CLIENT_INFO,
      },
    },
    callOpts,
  );

  if (initRes.status >= 300 && initRes.status < 400) {
    return finish({
      status: 'redirect',
      location: initRes.location,
      httpStatus: initRes.status,
      tools: [],
      contentType: initRes.contentType,
    });
  }
  if (initRes.networkError) {
    return finish({ status: 'unreachable', reason: initRes.networkError, tools: [], httpStatus: initRes.status });
  }
  if (initRes.authError) {
    return finish({
      status: 'auth_required',
      reason: initRes.rawError || 'Authentication required',
      tools: [],
      httpStatus: initRes.status,
    });
  }
  if (!initRes.ok) {
    return finish({
      status: 'error',
      reason: humanizeHandshakeFailure(initRes),
      tools: [],
      httpStatus: initRes.status,
      contentType: initRes.contentType,
    });
  }

  const initReply = pickJsonRpcReply(initRes.messages, 1);
  if (initReply?.error) {
    return finish({ status: 'error', reason: initReply.error.message || 'initialize failed', tools: [] });
  }
  if (!initReply?.result) {
    return finish({ status: 'error', reason: 'No initialize result', tools: [] });
  }

  const sessionId = initRes.sessionId;
  const initResult = initReply.result;
  const serverContext = {
    serverInfo: initResult.serverInfo || null,
    instructions: typeof initResult.instructions === 'string' ? initResult.instructions : null,
    capabilities: initResult.capabilities && typeof initResult.capabilities === 'object' ? initResult.capabilities : null,
    protocolVersion: initResult.protocolVersion || null,
    contentType: initRes.contentType || null,
  };

  await postMcpMessage(
    endpoint,
    { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
    followUpOpts(callOpts, sessionId),
  );

  const tools = [];
  let cursor = '';
  let toolsTruncated = false;
  let toolsHttp = initRes.status;
  for (let page = 0; page < 4; page += 1) {
    const toolsRes = await postMcpMessage(
      endpoint,
      {
        jsonrpc: '2.0',
        id: 2 + page,
        method: 'tools/list',
        params: cursor ? { cursor } : {},
      },
      followUpOpts(callOpts, sessionId),
    );
    if (toolsRes.status >= 300 && toolsRes.status < 400) {
      return finish({
        ...serverContext,
        status: 'error',
        reason: 'tools/list returned a redirect, which was not followed',
        location: toolsRes.location,
        tools,
        httpStatus: toolsRes.status,
        tools_truncated: toolsTruncated,
      });
    }
    if (toolsRes.authError) {
      return finish({
        ...serverContext,
        status: 'auth_required',
        reason: toolsRes.rawError || 'Authentication required',
        tools: [],
        httpStatus: toolsRes.status,
      });
    }
    if (toolsRes.networkError) {
      return finish({
        ...serverContext,
        status: 'unreachable',
        reason: toolsRes.networkError,
        tools,
        httpStatus: toolsRes.status,
      });
    }
    if (!toolsRes.ok) {
      return finish({
        ...serverContext,
        status: 'error',
        reason: toolsRes.rawError || `tools/list HTTP ${toolsRes.status}`,
        tools,
        httpStatus: toolsRes.status,
      });
    }
    const toolsReply = pickJsonRpcReply(toolsRes.messages, 2 + page);
    if (toolsReply?.error) {
      return finish({
        ...serverContext,
        status: 'error',
        reason: toolsReply.error.message || 'tools/list failed',
        tools,
        httpStatus: toolsRes.status,
      });
    }
    const batch = toolsReply?.result?.tools;
    if (Array.isArray(batch)) tools.push(...batch);
    toolsHttp = toolsRes.status;
    serverContext.contentType = toolsRes.contentType || serverContext.contentType;
    cursor = toolsReply?.result?.nextCursor ? String(toolsReply.result.nextCursor) : '';
    if (!cursor) break;
    if (tools.length >= 80) {
      toolsTruncated = true;
      break;
    }
  }
  if (cursor) toolsTruncated = true;

  let resourceCount = null;
  let resourceTruncated = false;
  let promptCount = null;
  let promptTruncated = false;
  let listLocation = null;
  const resourcesAdvertised = capabilityAdvertised(serverContext.capabilities, 'resources');
  const promptsAdvertised = capabilityAdvertised(serverContext.capabilities, 'prompts');
  if (resourcesAdvertised) {
    const listed = await countListed(endpoint, sessionId, 'resources/list', 'resources', 20, callOpts);
    resourceCount = listed.count;
    resourceTruncated = listed.truncated;
    if (listed.location) listLocation = listed.location;
  }
  if (promptsAdvertised) {
    const listed = await countListed(endpoint, sessionId, 'prompts/list', 'prompts', 30, callOpts);
    promptCount = listed.count;
    promptTruncated = listed.truncated;
    if (listed.location) listLocation = listed.location;
  }

  const kept = tools.slice(0, 80);
  return finish({
    ...serverContext,
    status: kept.length ? 'ok' : 'ok_empty',
    tools: kept,
    tools_truncated: toolsTruncated || tools.length > kept.length,
    httpStatus: toolsHttp,
    resource_count: resourceCount,
    resource_truncated: resourceTruncated,
    resources_advertised: resourcesAdvertised,
    prompt_count: promptCount,
    prompt_truncated: promptTruncated,
    prompts_advertised: promptsAdvertised,
    location: listLocation,
  });
}

/**
 * initialize + notifications/initialized + one or more tools/call on the
 * existing POST client. Does not follow redirects.
 *
 * @param {string} endpoint
 * @param {{ name: string, arguments?: object, role?: string }[]} calls
 * @param {{ timeoutMs?: number, bearerToken?: string, redirect?: RequestRedirect, clientInfo?: { name: string, version: string } }} [opts]
 */
async function callLiveMcpTools(endpoint, calls, opts = {}) {
  const started = Date.now();
  const finish = (result) => {
    if (result && result.latency_ms == null) result.latency_ms = Math.max(0, Date.now() - started);
    return result;
  };
  const callOpts = {
    timeoutMs: opts.timeoutMs,
    redirect: opts.redirect || 'manual',
    bearerToken: opts.bearerToken,
    clientInfo: opts.clientInfo,
  };

  if (!endpoint || !/^https?:\/\//i.test(endpoint)) {
    return finish({ status: 'skipped', reason: 'no_http_endpoint', calls: [] });
  }
  if (!Array.isArray(calls) || calls.length === 0) {
    return finish({ status: 'error', reason: 'No tool call was requested', calls: [] });
  }

  const initRes = await postMcpMessage(
    endpoint,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: opts.clientInfo || CLIENT_INFO,
      },
    },
    callOpts,
  );

  if (initRes.status >= 300 && initRes.status < 400) {
    return finish({
      status: 'redirect',
      location: initRes.location,
      httpStatus: initRes.status,
      reason: 'initialize returned a redirect, which was not followed',
      calls: [],
    });
  }
  if (initRes.networkError) {
    return finish({ status: 'unreachable', reason: initRes.networkError, calls: [], httpStatus: initRes.status });
  }
  if (initRes.authError) {
    return finish({
      status: 'auth_required',
      reason: initRes.rawError || 'Authentication required',
      calls: [],
      httpStatus: initRes.status,
    });
  }
  if (!initRes.ok) {
    return finish({
      status: 'error',
      reason: humanizeHandshakeFailure(initRes),
      calls: [],
      httpStatus: initRes.status,
    });
  }

  const initReply = pickJsonRpcReply(initRes.messages, 1);
  if (initReply?.error || !initReply?.result) {
    return finish({
      status: 'error',
      reason: initReply?.error?.message || 'initialize failed',
      calls: [],
    });
  }

  const sessionId = initRes.sessionId;
  await postMcpMessage(
    endpoint,
    { jsonrpc: '2.0', method: 'notifications/initialized', params: {} },
    followUpOpts(callOpts, sessionId),
  );

  const results = [];
  for (let index = 0; index < calls.length; index += 1) {
    const call = calls[index] || {};
    const id = index + 2;
    const args = call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments)
      ? call.arguments
      : {};
    const res = await postMcpMessage(
      endpoint,
      {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: String(call.name || ''), arguments: args },
      },
      followUpOpts(callOpts, sessionId),
    );
    if (res.status >= 300 && res.status < 400) {
      return finish({
        status: 'redirect',
        location: res.location,
        httpStatus: res.status,
        reason: 'tools/call returned a redirect, which was not followed',
        calls: results,
      });
    }
    if (res.networkError) {
      return finish({
        status: 'unreachable',
        reason: res.networkError,
        httpStatus: res.status,
        calls: results,
      });
    }
    if (res.authError) {
      return finish({
        status: 'auth_required',
        reason: res.rawError || 'Authentication required',
        httpStatus: res.status,
        calls: results,
      });
    }
    if (!res.ok) {
      return finish({
        status: 'error',
        reason: res.rawError || `tools/call HTTP ${res.status}`,
        httpStatus: res.status,
        calls: results,
      });
    }
    const reply = pickJsonRpcReply(res.messages, id);
    if (reply?.error) {
      results.push({
        name: call.name,
        role: call.role || null,
        ok: false,
        isError: true,
        error: reply.error.message || 'tools/call failed',
        result: null,
      });
      continue;
    }
    const result = reply?.result && typeof reply.result === 'object' ? reply.result : null;
    results.push({
      name: call.name,
      role: call.role || null,
      ok: true,
      isError: Boolean(result?.isError),
      error: result?.isError ? 'Tool reported an error' : null,
      result,
    });
  }

  return finish({ status: 'ok', httpStatus: 200, calls: results });
}

module.exports = {
  fetchLiveMcpTools,
  inspectLiveMcpServer,
  callLiveMcpTools,
  parseMcpResponseBody,
  parseSseJsonMessages,
  looksLikeWebsiteOrCdnError,
  humanizeHandshakeFailure,
  suggestApiMcpUrl,
};
