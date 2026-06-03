/**
 * Enrich catalog entries with tool lists and connection URLs from Smithery detail API.
 */

const { normalizeTools } = require('./normalize');

const SMITHERY_BASE = 'https://api.smithery.ai/servers';
const FETCH_TIMEOUT_MS = 25000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} url
 */
async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ slug?: string; docs_url?: string; smithery_qualified_name?: string }} server
 */
function smitheryQualifiedName(server) {
  if (server.smithery_qualified_name) return server.smithery_qualified_name;
  const m = String(server.docs_url || '').match(/smithery\.ai\/servers\/([^?#]+)/i);
  if (m) return decodeURIComponent(m[1].replace(/\/$/, ''));
  return server.slug;
}

function smitheryDetailUrl(qn) {
  return `${SMITHERY_BASE}/${qn.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * @param {object} server
 * @returns {Promise<object|null>}
 */
async function fetchSmitheryDetail(server) {
  const qn = smitheryQualifiedName(server);
  const urls = [smitheryDetailUrl(qn)];
  for (const url of urls) {
    try {
      return await fetchJson(url);
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * @param {object} server
 * @param {object} detail
 */
function applySmitheryDetail(server, detail) {
  const tools = normalizeTools(detail.tools);
  if (tools.length) server.tools = tools;

  server.smithery_qualified_name = detail.qualifiedName || smitheryQualifiedName(server);
  server.smithery_page_url = `https://smithery.ai/servers/${server.smithery_qualified_name}`;
  if (detail.homepage && !String(detail.homepage).includes('smithery.ai/servers')) {
    server.docs_url = detail.homepage;
  } else {
    server.docs_url = server.smithery_page_url;
  }

  const endpoint =
    detail.deploymentUrl ||
    (Array.isArray(detail.connections) && detail.connections[0]?.deploymentUrl) ||
    null;
  if (endpoint) {
    server.mcp_endpoint = endpoint;
    server.deployment_url = endpoint;
  }
  if (detail.remote !== undefined) {
    server.transport = detail.remote ? 'http' : 'stdio';
  }
}

/**
 * @param {object} server
 */
async function fetchSmitheryTools(server) {
  const detail = await fetchSmitheryDetail(server);
  return detail ? normalizeTools(detail.tools) : [];
}

/**
 * @template T
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<void>} fn
 * @param {number} concurrency
 */
async function runPool(items, fn, concurrency = 6) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

/**
 * @param {object[]} servers
 * @param {{ delayMs?: number; logEvery?: number; allSmithery?: boolean }} [opts]
 */
async function enrichSmitheryTools(servers, opts = {}) {
  const delayMs = opts.delayMs ?? 80;
  const logEvery = opts.logEvery ?? 25;
  const allSmithery = opts.allSmithery ?? false;

  const targets = servers.filter((s) => {
    if (s.source !== 'smithery') return false;
    if (allSmithery) return true;
    return !s.tools || s.tools.length === 0 || !s.mcp_endpoint;
  });

  if (!targets.length) {
    console.log('Smithery enrichment: nothing to fetch');
    return { enriched: 0, failed: 0 };
  }

  console.log(`Smithery enrichment: ${targets.length} servers…`);
  let enriched = 0;
  let failed = 0;

  await runPool(
    targets,
    async (server, idx) => {
      const detail = await fetchSmitheryDetail(server);
      if (detail) {
        applySmitheryDetail(server, detail);
        if (server.tools?.length || server.mcp_endpoint) enriched += 1;
        else failed += 1;
      } else {
        failed += 1;
      }
      if ((idx + 1) % logEvery === 0) {
        console.log(`   … ${idx + 1}/${targets.length} (${enriched} enriched)`);
      }
      await sleep(delayMs);
    },
    6,
  );

  console.log(`✅ Smithery: ${enriched} enriched, ${failed} failed`);
  return { enriched, failed };
}

module.exports = {
  enrichSmitheryTools,
  smitheryQualifiedName,
  fetchSmitheryTools,
  fetchSmitheryDetail,
  applySmitheryDetail,
};
