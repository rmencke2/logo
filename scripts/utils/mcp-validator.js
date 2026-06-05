/**
 * MCP catalog validation — probe live MCP servers (tools/list) with Smithery registry fallback.
 */

const { normalizeTools } = require('./normalize');
const { fetchSmitheryDetail, applySmitheryDetail, smitheryQualifiedName } = require('./enrich-tools');
const { fetchLiveMcpTools } = require('./mcp-live-client');

const ENDPOINT_PROBE_TIMEOUT_MS = Number(process.env.MCP_ENDPOINT_TIMEOUT_MS) || 12000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {object} server
 */
function getHttpMcpEndpoint(server) {
  const url = server.mcp_endpoint || server.deployment_url || server.connection_url || null;
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/**
 * @param {object} server
 */
function canUseSmitheryRegistry(server) {
  return (
    smitheryQualifiedName(server) ||
    String(server.docs_url || '').includes('smithery.ai/servers') ||
    server.smithery_qualified_name
  );
}

/**
 * @param {{ name: string; description?: string }[]} tools
 */
function toolFingerprint(tools) {
  if (!Array.isArray(tools) || !tools.length) return '';
  return tools
    .map((t) => `${t.name}:${String(t.description || '').slice(0, 120)}`)
    .sort()
    .join('|');
}

/**
 * @param {{ name: string; description?: string }[]} oldTools
 * @param {{ name: string; description?: string }[]} newTools
 */
function diffTools(oldTools, newTools) {
  const oldMap = new Map((oldTools || []).map((t) => [t.name, t.description || '']));
  const newMap = new Map((newTools || []).map((t) => [t.name, t.description || '']));
  const added = [];
  const removed = [];
  const changed = [];

  for (const [name, description] of newMap) {
    if (!oldMap.has(name)) added.push(name);
    else if (oldMap.get(name) !== description) changed.push(name);
  }
  for (const name of oldMap.keys()) {
    if (!newMap.has(name)) removed.push(name);
  }

  return { added, removed, changed };
}

/**
 * @param {object} draft
 * @param {{ name: string; description?: string }[]} tools
 */
function applyTools(draft, tools) {
  if (tools.length) draft.tools = tools;
}

/**
 * @param {object} server
 * @param {object} draft
 * @param {boolean} mutate
 */
async function fetchSmitheryRegistryTools(server, draft, mutate) {
  const detail = await fetchSmitheryDetail(server);
  if (!detail) return { ok: false, reason: 'Smithery detail unavailable' };
  if (mutate) applySmitheryDetail(draft, detail);
  else applyTools(draft, normalizeTools(detail.tools));
  return { ok: true, source: 'smithery_registry' };
}

/**
 * @param {string} endpoint
 */
async function probeMcpEndpoint(endpoint) {
  if (!endpoint || !/^https?:\/\//i.test(endpoint)) {
    return { status: 'skipped', reason: 'no_http_endpoint' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ENDPOINT_PROBE_TIMEOUT_MS);
  try {
    let res = await fetch(endpoint, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
        headers: { Accept: 'application/json, text/event-stream, */*' },
      });
    }
    if (res.ok || res.status === 401 || res.status === 403 || res.status === 405) {
      return { status: 'reachable', httpStatus: res.status };
    }
    return { status: 'unreachable', httpStatus: res.status };
  } catch (err) {
    return { status: 'error', reason: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} server
 * @param {{ mutate?: boolean; registryFallback?: boolean }} [opts]
 */
async function validateServer(server, opts = {}) {
  const mutate = opts.mutate !== false;
  const registryFallback = opts.registryFallback !== false;
  const beforeTools = server.tools || [];
  const beforeFingerprint = toolFingerprint(beforeTools);
  const endpoint = getHttpMcpEndpoint(server);
  const result = {
    slug: server.slug,
    name: server.name,
    source: server.source,
    status: 'unchanged',
    validationMethod: null,
    beforeToolCount: beforeTools.length,
    afterToolCount: beforeTools.length,
    endpoint,
    liveProbe: null,
    diff: null,
    error: null,
  };

  if (server.source === 'manual') {
    result.status = 'skipped_manual';
    return result;
  }

  const draft = mutate ? server : { ...server, tools: [...beforeTools] };

  if (endpoint) {
    result.validationMethod = 'live_mcp';
    const live = await fetchLiveMcpTools(endpoint);
    result.liveProbe = {
      status: live.status,
      reason: live.reason || null,
      httpStatus: live.httpStatus || null,
      serverInfo: live.serverInfo || null,
    };

    if (live.status === 'ok' || live.status === 'ok_empty') {
      applyTools(draft, live.tools);
      result.endpointStatus = 'ok';
    } else if (live.status === 'auth_required') {
      result.endpointStatus = 'auth_required';
      if (registryFallback && canUseSmitheryRegistry(server)) {
        result.validationMethod = 'live_mcp+smithery_fallback';
        const fb = await fetchSmitheryRegistryTools(server, draft, mutate);
        if (!fb.ok) {
          result.status = beforeTools.length ? 'auth_required_kept' : 'auth_required_no_tools';
          result.error = live.reason || 'Authentication required for live probe';
          return finalizeResult(result, beforeTools, draft, mutate);
        }
      } else {
        result.status = beforeTools.length ? 'auth_required_kept' : 'auth_required_no_tools';
        result.error = live.reason || 'Authentication required';
        return finalizeResult(result, beforeTools, draft, mutate);
      }
    } else if (registryFallback && canUseSmitheryRegistry(server)) {
      result.validationMethod = 'live_failed+smithery_fallback';
      const fb = await fetchSmitheryRegistryTools(server, draft, mutate);
      if (!fb.ok) {
        result.status = beforeTools.length ? 'live_failed_kept' : 'live_failed';
        result.error = live.reason || fb.reason;
        return finalizeResult(result, beforeTools, draft, mutate);
      }
    } else {
      result.status = beforeTools.length ? 'live_failed_kept' : 'live_failed';
      result.error = live.reason || live.status;
      result.endpointStatus = live.status === 'unreachable' ? 'failed' : 'error';
      return finalizeResult(result, beforeTools, draft, mutate);
    }
  } else if (registryFallback && canUseSmitheryRegistry(server)) {
    result.validationMethod = 'smithery_registry';
    const fb = await fetchSmitheryRegistryTools(server, draft, mutate);
    if (!fb.ok) {
      result.status = beforeTools.length ? 'registry_missing_kept' : 'skipped_no_endpoint';
      result.error = fb.reason;
      return finalizeResult(result, beforeTools, draft, mutate);
    }
  } else {
    result.status = server.transport === 'stdio' ? 'skipped_stdio' : 'skipped_no_endpoint';
    return result;
  }

  return finalizeResult(result, beforeTools, draft, mutate);
}

/**
 * @param {object} result
 * @param {object[]} beforeTools
 * @param {object} draft
 * @param {boolean} mutate
 */
function finalizeResult(result, beforeTools, draft, mutate) {
  const afterTools = draft.tools || [];
  const beforeFingerprint = toolFingerprint(beforeTools);
  const afterFingerprint = toolFingerprint(afterTools);
  result.afterToolCount = afterTools.length;
  result.diff = diffTools(beforeTools, afterTools);

  if (result.status === 'unchanged' || !result.status.startsWith('skipped')) {
    if (beforeFingerprint !== afterFingerprint) {
      if (!beforeTools.length && afterTools.length) result.status = 'newly_indexed';
      else if (beforeTools.length && !afterTools.length) result.status = 'tools_lost';
      else result.status = 'tools_changed';
    } else if (!result.status || result.status === 'unchanged') {
      result.status = 'unchanged';
    }
  }

  if (mutate) {
    draft.tools = afterTools;
    draft.tools_validated_at = new Date().toISOString();
    draft.tools_validation_method = result.validationMethod;
    if (result.liveProbe?.serverInfo?.name && !draft.mcp_live_name) {
      draft.mcp_live_name = result.liveProbe.serverInfo.name;
    }
  }

  return result;
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<void>} fn
 * @param {number} concurrency
 */
async function runPool(items, fn, concurrency = 3) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
    while (index < items.length) {
      const i = index++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

module.exports = {
  toolFingerprint,
  diffTools,
  getHttpMcpEndpoint,
  probeMcpEndpoint,
  validateServer,
  runPool,
  sleep,
  smitheryQualifiedName,
};
