// ================================
//  MCP Server Directory data
// ================================

const fs = require('fs');
const path = require('path');
const { pickTop100, TOP100_SIZE } = require('../scripts/utils/normalize');
const { attachSetupInfo } = require('../scripts/utils/setup-info');
const { attachBranding } = require('../utils/mcpBranding');
const { computeQualitySignals } = require('../scripts/utils/mcp-quality');

const GENERATED_PATH = path.join(__dirname, '..', 'data', 'servers-generated.json');
const TOP100_PATH = path.join(__dirname, '..', 'data', 'servers-top100.json');
const PINNED_PATH = path.join(__dirname, '..', 'data', 'mcp-top100-pinned.json');
const MANUAL_PATH = path.join(__dirname, '..', 'data', 'mcp-servers-manual.json');
const LEGACY_MANUAL_PATH = path.join(__dirname, '..', 'data', 'mcp-servers.json');
const DISCOVERED_PATH = path.join(__dirname, '..', 'data', 'mcp-servers-discovered.json');
const LAST_UPDATED_PATH = path.join(__dirname, '..', 'data', 'last-updated.json');
const VALIDATION_STATE_PATH = path.join(__dirname, '..', 'data', 'mcp-validation-state.json');

const ICON_EMOJI = {
  folder: '📁',
  github: '⎇',
  gitlab: '🦊',
  terminal: '⌨',
  sandbox: '🧪',
  code: '⟨⟩',
  'cloud-code': '☁',
  browser: '🌐',
  search: '🔍',
  globe: '🌍',
  flame: '🔥',
  database: '🗄',
  figma: '🎨',
  cloud: '☁',
  boxes: '▦',
  'message-square': '💬',
  mail: '✉',
  calendar: '📅',
  'hard-drive': '💾',
  'file-text': '📄',
  'bar-chart': '📊',
  'shield-alert': '🛡',
  activity: '📈',
  'credit-card': '💳',
  brain: '🧠',
  monitor: '🖥',
  'monitor-play': '▶',
  'layout-list': '☰',
  'book-open': '📖',
  image: '🖼',
};

const STANDARD_CATEGORIES = [
  'Dev Tools',
  'Search & Web',
  'Databases',
  'Design',
  'Cloud & Infra',
  'Communication',
  'Data & Analytics',
  'Security & Monitoring',
  'Payments & Commerce',
  'AI & Memory',
  'Files & Docs',
  'Automation',
];

let cached;
let validationStateCache;

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadValidationStateBySlug() {
  if (validationStateCache) return validationStateCache;
  const data = readJsonIfExists(VALIDATION_STATE_PATH);
  validationStateCache = data?.servers && typeof data.servers === 'object' ? data.servers : {};
  return validationStateCache;
}

function attachQuality(server) {
  if (!server) return server;
  if (server.quality) return server;
  const entry = loadValidationStateBySlug()[server.slug] || null;
  return {
    ...server,
    quality: computeQualitySignals(server, entry),
  };
}

function loadPinnedSlugs() {
  const data = readJsonIfExists(PINNED_PATH);
  return Array.isArray(data?.slugs) ? data.slugs : [];
}

function hasIndexedTools(server) {
  return (server.tools?.length || 0) > 0;
}

function normalizeServer(s) {
  return {
    ...s,
    slug: s.slug || s.id,
    icon: s.icon || 'boxes',
    featured: Boolean(s.featured),
  };
}

function normalizeLegacyManual(server) {
  return normalizeServer({
    id: server.slug,
    slug: server.slug,
    name: server.name,
    description: server.description || '',
    category: server.category || 'Dev Tools',
    official: Boolean(server.official),
    transport: server.transport || 'stdio',
    tools: Array.isArray(server.tools) ? server.tools : [],
    github_url: server.github_url,
    docs_url: server.docs_url,
    install_command: server.install_command,
    stars: server.stars || 0,
    source: 'manual',
    featured: server.featured !== false,
    hidden: Boolean(server.hidden),
    last_updated: new Date().toISOString().slice(0, 10),
    icon: server.icon || 'boxes',
    mcp_endpoint: server.mcp_endpoint,
    deployment_url: server.mcp_endpoint || server.deployment_url,
    install_command: server.install_command,
  });
}

function toolCount(server) {
  return server.tools?.length || 0;
}

function preferRicherServer(existing, incoming) {
  if (incoming.source === 'manual') return incoming;
  if (existing.source === 'manual') return existing;
  const existingTools = toolCount(existing);
  const incomingTools = toolCount(incoming);
  if (incomingTools > existingTools) return incoming;
  if (incomingTools < existingTools) return existing;
  // Prefer non-discovered overlays when tool counts tie
  if (existing.source === 'discovered' && incoming.source !== 'discovered') return incoming;
  if (incoming.source === 'discovered' && existing.source !== 'discovered') return existing;
  return existing;
}

function mergeOverlayInto(servers, overlayServers, { treatAsManual = false } = {}) {
  if (!overlayServers?.length) return servers;
  const bySlug = new Map(servers.map((s) => [s.slug, s]));
  const ghKeys = new Set(servers.map((s) => (s.github_url || '').toLowerCase()).filter(Boolean));

  for (const raw of overlayServers) {
    const m = treatAsManual
      ? normalizeLegacyManual(raw)
      : normalizeServer({
          ...raw,
          slug: raw.slug || raw.id,
          source: raw.source || 'discovered',
        });
    const gh = (m.github_url || '').toLowerCase();
    const existing = bySlug.get(m.slug);
    if (existing) {
      bySlug.set(m.slug, preferRicherServer(existing, m));
      continue;
    }
    if (gh && ghKeys.has(gh)) {
      const existingByGh = [...bySlug.values()].find(
        (s) => (s.github_url || '').toLowerCase() === gh,
      );
      if (existingByGh) {
        bySlug.set(existingByGh.slug, preferRicherServer(existingByGh, m));
        continue;
      }
    }
    bySlug.set(m.slug, m);
    if (gh) ghKeys.add(gh);
  }
  return [...bySlug.values()];
}

function mergeManualInto(servers, manualData) {
  if (!manualData?.servers?.length) return servers;
  return mergeOverlayInto(servers, manualData.servers, { treatAsManual: true });
}

function mergeDiscoveredInto(servers, discoveredData) {
  if (!discoveredData?.servers?.length) return servers;
  return mergeOverlayInto(servers, discoveredData.servers, { treatAsManual: false });
}

function computeTop100FromAll(allServers) {
  const prepared = allServers.map((s) => attachSetupInfo(normalizeServer(s)));
  return pickTop100(prepared, loadPinnedSlugs(), TOP100_SIZE).filter(
    (s) => hasIndexedTools(s) || s.source === 'manual',
  );
}

function loadCatalog() {
  if (cached) return cached;

  const generated = readJsonIfExists(GENERATED_PATH);
  const top100File = readJsonIfExists(TOP100_PATH);
  const manualFile = fs.existsSync(MANUAL_PATH)
    ? MANUAL_PATH
    : fs.existsSync(LEGACY_MANUAL_PATH)
      ? LEGACY_MANUAL_PATH
      : null;
  const manualData = manualFile ? readJsonIfExists(manualFile) : null;

  let allServers = [];
  let top100Servers = [];
  let categories = STANDARD_CATEGORIES;
  let generatedAt = null;

  if (generated?.servers?.length) {
    allServers = generated.servers.map(normalizeServer);
    categories = generated.categories || STANDARD_CATEGORIES;
    generatedAt = generated.generated_at || null;
  }

  const discoveredData = readJsonIfExists(DISCOVERED_PATH);
  // Discovered overlay first (stubs), then manual wins on conflicts.
  allServers = mergeDiscoveredInto(allServers, discoveredData);
  allServers = mergeManualInto(allServers, manualData);
  top100Servers = computeTop100FromAll(allServers);

  if (!allServers.length && manualData?.servers?.length) {
    allServers = manualData.servers.map(normalizeLegacyManual);
    allServers = mergeDiscoveredInto(allServers, discoveredData);
    top100Servers = computeTop100FromAll(allServers);
    categories = manualData.categories || STANDARD_CATEGORIES;
  }

  cached = {
    allServers,
    top100Servers,
    categories,
    generatedAt,
  };
  return cached;
}

function sortServers(servers) {
  return [...servers].sort((a, b) => {
    const starDiff = (b.stars || 0) - (a.stars || 0);
    if (starDiff !== 0) return starDiff;
    return a.name.localeCompare(b.name);
  });
}

function getMcpLastUpdated() {
  const last = readJsonIfExists(LAST_UPDATED_PATH);
  if (last?.display) return last;
  const catalog = loadCatalog();
  if (catalog.generatedAt) {
    return {
      iso: catalog.generatedAt,
      display: new Date(catalog.generatedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    };
  }
  return { iso: null, display: null };
}

function getAllMcpServers() {
  return sortServers(
    loadCatalog()
      .allServers.filter((s) => !s.hidden)
      .map((s) => attachQuality(attachSetupInfo(s))),
  );
}

function getTop100McpServers() {
  const { top100Servers } = loadCatalog();
  return top100Servers.map((s) => attachQuality(attachSetupInfo(s)));
}

/**
 * Servers worth putting in sitemap.xml.
 * Full catalog (~13k) floods crawl budget and drives "Crawled - currently not indexed".
 * Prefer Top 100, indexed-tool listings, curated manual entries, and featured servers.
 */
function getSitemapMcpServers() {
  const topSlugs = new Set(getTop100McpServers().map((s) => s.slug));
  return getAllMcpServers().filter(
    (s) =>
      topSlugs.has(s.slug) ||
      hasIndexedTools(s) ||
      s.source === 'manual' ||
      Boolean(s.featured),
  );
}

function getMcpCatalogTotals() {
  const { allServers, top100Servers } = loadCatalog();
  return {
    total: allServers.length,
    top100: top100Servers.length,
  };
}

function getMcpCategories() {
  return loadCatalog().categories;
}

function findMcpServerBySlug(slug) {
  const server = getAllMcpServers().find((s) => s.slug === slug || s.id === slug);
  return server ? attachBranding(attachQuality(server)) : null;
}

function withDisplay(servers) {
  return servers.map((s) =>
    attachBranding(
      attachQuality({
        ...s,
        iconEmoji: getMcpIconEmoji(s.icon),
      }),
    ),
  );
}

function getMcpHeroStats() {
  const all = getAllMcpServers();
  const totalTools = all.reduce((sum, s) => sum + (s.tools?.length || 0), 0);
  const serversWithIndexedTools = all.filter((s) => hasIndexedTools(s)).length;
  return {
    totalServers: all.length,
    totalTools,
    serversWithIndexedTools,
    categoryCount: getMcpCategories().length,
  };
}

/**
 * @param {'top' | 'all'} scope
 * @param {{ toolsOnly?: boolean, quality?: string }} [opts]
 */
function getMcpCatalogPayload(scope = 'all', opts = {}) {
  const catalog = loadCatalog();
  const lastUpdated = getMcpLastUpdated();
  const toolsOnly = opts.toolsOnly ?? scope === 'top';
  const qualityFilter = String(opts.quality || '').trim().toLowerCase();
  let servers = scope === 'top' ? getTop100McpServers() : getAllMcpServers();

  if (scope === 'top') {
    servers = servers.filter((s) => hasIndexedTools(s) || (s.setup_steps?.length && s.primary_url));
  } else if (toolsOnly) {
    servers = servers.filter((s) => hasIndexedTools(s));
  }

  if (qualityFilter && qualityFilter !== 'all') {
    servers = servers.filter((s) => matchesQualityFilter(attachQuality(s), qualityFilter));
  }

  const withToolsCount = getAllMcpServers().filter((s) => hasIndexedTools(s)).length;
  const displayed = withDisplay(servers);

  return {
    scope,
    tools_only: toolsOnly,
    quality_filter: qualityFilter || 'all',
    categories: catalog.categories,
    servers: displayed,
    total: displayed.length,
    total_catalog: catalog.allServers.length,
    total_with_tools: withToolsCount,
    quality_counts: countQualityBuckets(scope === 'top' ? getTop100McpServers() : getAllMcpServers()),
    generated_at: catalog.generatedAt,
    last_updated: lastUpdated.display,
  };
}

/**
 * @param {object} server
 * @param {string} filter
 */
function matchesQualityFilter(server, filter) {
  const q = server.quality || computeQualitySignals(server, null);
  switch (filter) {
    case 'indexed':
    case 'tools_indexed':
      return Boolean(q.tools_indexed);
    case 'ready':
      return q.demoware_tier === 'ready';
    case 'thin':
      return q.demoware_tier === 'thin';
    case 'unverified':
      return q.demoware_tier === 'unverified';
    case 'live_ok':
    case 'live':
      return q.live_status === 'live_ok';
    case 'auth_required':
    case 'auth':
      return q.live_status === 'auth_required' || q.auth_gate === 'required';
    case 'probed':
      return q.live_status === 'live_ok' || q.live_status === 'auth_required' || q.live_status === 'unreachable';
    case 'not_probed':
      return q.live_status === 'not_probed' || q.live_status === 'local_unprobed';
    default:
      return true;
  }
}

function countQualityBuckets(servers) {
  const counts = {
    ready: 0,
    indexed: 0,
    thin: 0,
    unverified: 0,
    live_ok: 0,
    auth_required: 0,
    probed: 0,
    tools_indexed: 0,
  };
  for (const s of servers) {
    const q = s.quality || computeQualitySignals(s, null);
    if (q.demoware_tier === 'ready') counts.ready += 1;
    if (q.demoware_tier === 'indexed') counts.indexed += 1;
    if (q.demoware_tier === 'thin') counts.thin += 1;
    if (q.demoware_tier === 'unverified') counts.unverified += 1;
    if (q.live_status === 'live_ok') counts.live_ok += 1;
    if (q.live_status === 'auth_required') counts.auth_required += 1;
    if (q.live_status === 'live_ok' || q.live_status === 'auth_required' || q.live_status === 'unreachable') {
      counts.probed += 1;
    }
    if (q.tools_indexed) counts.tools_indexed += 1;
  }
  return counts;
}

function getMcpHomepagePreview(limit = 6) {
  const servers = getTop100McpServers()
    .filter((s) => hasIndexedTools(s))
    .slice(0, limit);
  const totals = getMcpCatalogTotals();
  const lastUpdated = getMcpLastUpdated();
  return {
    servers: withDisplay(servers),
    total_top100: totals.top100,
    total_catalog: totals.total,
    last_updated: lastUpdated.display,
  };
}

function getMcpIconEmoji(iconKey) {
  return ICON_EMOJI[iconKey] || '⚡';
}

function transportLabel(transport) {
  if (transport === 'sse') return 'SSE (deprecated)';
  if (transport === 'unknown') return 'Unknown';
  return String(transport).toUpperCase();
}

function isInTop100(slug) {
  return getTop100McpServers().some((s) => s.slug === slug);
}

function clearMcpCache() {
  cached = null;
  validationStateCache = null;
}

function searchMcpServers({ q = '', scope = 'top', limit = 10 } = {}) {
  const query = String(q || '').trim().toLowerCase();
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25);
  if (!query) {
    return { ok: true, q: '', scope: scope === 'all' ? 'all' : 'top', total: 0, servers: [] };
  }

  const pool = scope === 'all' ? getAllMcpServers() : getTop100McpServers();
  const matches = [];
  for (const server of pool) {
    const hay = [
      server.name,
      server.slug,
      server.description,
      server.category,
      ...(server.tools || []).map((t) => (typeof t === 'string' ? t : t.name)),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const nameHit = String(server.name || '').toLowerCase().includes(query);
    const slugHit = String(server.slug || '').toLowerCase().includes(query);
    const tokens = query.split(/\s+/).filter(Boolean);
    const tokenHit = tokens.length > 0 && tokens.every((part) => hay.includes(part));
    if (!hay.includes(query) && !nameHit && !slugHit && !tokenHit) continue;

    const withQ = attachQuality(server);
    matches.push({
      slug: server.slug,
      name: server.name,
      description: String(server.description || '').slice(0, 280),
      category: server.category || null,
      tool_count: Array.isArray(server.tools) ? server.tools.length : 0,
      tools: (server.tools || [])
        .slice(0, 8)
        .map((t) => (typeof t === 'string' ? t : t.name))
        .filter(Boolean),
      quality: withQ.quality
        ? {
            live_status: withQ.quality.live_status,
            auth_gate: withQ.quality.auth_gate,
            demoware_tier: withQ.quality.demoware_tier,
            tools_indexed: withQ.quality.tools_indexed,
            demoware_tier_label: withQ.quality.demoware_tier_label,
            live_status_label: withQ.quality.live_status_label,
            safety_badge: null,
          }
        : null,
      url: `https://www.influzer.ai/mcp/${server.slug}`,
    });
    if (matches.length >= safeLimit) break;
  }

  return {
    ok: true,
    q: String(q).trim(),
    scope: scope === 'all' ? 'all' : 'top',
    total: matches.length,
    note:
      scope === 'all'
        ? 'Results are capped; refine q for narrower matches.'
        : 'Searched Top 100 MCP servers. Pass scope=all for the full catalog.',
    servers: matches,
  };
}

module.exports = {
  getAllMcpServers,
  getTop100McpServers,
  getSitemapMcpServers,
  getMcpCatalogTotals,
  getMcpCategories,
  findMcpServerBySlug,
  getMcpIconEmoji,
  transportLabel,
  getMcpLastUpdated,
  getMcpCatalogPayload,
  getMcpHomepagePreview,
  getMcpHeroStats,
  searchMcpServers,
  isInTop100,
  hasIndexedTools,
  clearMcpCache,
  mergeManualInto,
  attachQuality,
  matchesQualityFilter,
};
