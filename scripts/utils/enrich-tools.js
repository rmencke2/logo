/**
 * Enrich catalog entries with tool lists from Smithery detail API.
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

/**
 * @param {object} server
 */
async function fetchSmitheryTools(server) {
  const qn = smitheryQualifiedName(server);
  const url = `${SMITHERY_BASE}/${encodeURIComponent(qn).replace(/%2F/g, '/')}`;
  // encodeURIComponent encodes / in namespace paths — use path segments
  const pathUrl = `${SMITHERY_BASE}/${qn.split('/').map(encodeURIComponent).join('/')}`;
  try {
    const detail = await fetchJson(pathUrl);
    return normalizeTools(detail.tools);
  } catch {
    try {
      const detail = await fetchJson(url);
      return normalizeTools(detail.tools);
    } catch {
      return [];
    }
  }
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
 * @param {{ delayMs?: number; logEvery?: number }} [opts]
 */
async function enrichSmitheryTools(servers, opts = {}) {
  const delayMs = opts.delayMs ?? 80;
  const logEvery = opts.logEvery ?? 25;
  const targets = servers.filter(
    (s) => s.source === 'smithery' && (!s.tools || s.tools.length === 0),
  );

  if (!targets.length) {
    console.log('Smithery tool enrichment: nothing to fetch');
    return { enriched: 0, failed: 0 };
  }

  console.log(`Smithery tool enrichment: ${targets.length} servers…`);
  let enriched = 0;
  let failed = 0;

  await runPool(
    targets,
    async (server, idx) => {
      const tools = await fetchSmitheryTools(server);
      if (tools.length) {
        server.tools = tools;
        enriched += 1;
      } else {
        failed += 1;
      }
      if ((idx + 1) % logEvery === 0) {
        console.log(`   … ${idx + 1}/${targets.length} (${enriched} with tools)`);
      }
      await sleep(delayMs);
    },
    6,
  );

  console.log(`✅ Smithery tools: ${enriched} enriched, ${failed} still empty`);
  return { enriched, failed };
}

module.exports = {
  enrichSmitheryTools,
  smitheryQualifiedName,
  fetchSmitheryTools,
};
