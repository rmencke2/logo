// ================================
//  MCP Server Directory data
// ================================

const fs = require('fs');
const path = require('path');

const GENERATED_PATH = path.join(__dirname, '..', 'data', 'servers-generated.json');
const TOP100_PATH = path.join(__dirname, '..', 'data', 'servers-top100.json');
const MANUAL_PATH = path.join(__dirname, '..', 'data', 'mcp-servers-manual.json');
const LEGACY_MANUAL_PATH = path.join(__dirname, '..', 'data', 'mcp-servers.json');
const LAST_UPDATED_PATH = path.join(__dirname, '..', 'data', 'last-updated.json');

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

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
    stars: server.stars || 0,
    source: 'manual',
    featured: true,
    last_updated: new Date().toISOString().slice(0, 10),
    icon: server.icon || 'boxes',
  });
}

function mergeManualInto(servers, manualData) {
  if (!manualData?.servers?.length) return servers;
  const slugs = new Set(servers.map((s) => s.slug));
  const ghKeys = new Set(servers.map((s) => (s.github_url || '').toLowerCase()).filter(Boolean));
  const merged = [...servers];
  for (const raw of manualData.servers) {
    const m = normalizeLegacyManual(raw);
    const gh = (m.github_url || '').toLowerCase();
    if (slugs.has(m.slug) || (gh && ghKeys.has(gh))) continue;
    merged.push(m);
    slugs.add(m.slug);
    if (gh) ghKeys.add(gh);
  }
  return merged;
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
  let top100Slugs = [];

  if (generated?.servers?.length) {
    allServers = generated.servers.map(normalizeServer);
    categories = generated.categories || STANDARD_CATEGORIES;
    generatedAt = generated.generated_at || null;
    top100Slugs = generated.top100_slugs || [];
  }

  allServers = mergeManualInto(allServers, manualData);

  if (top100File?.servers?.length) {
    top100Servers = top100File.servers.map(normalizeServer);
    top100Slugs = top100File.top100_slugs || top100Servers.map((s) => s.slug);
  } else if (top100Slugs.length) {
    const slugSet = new Set(top100Slugs);
    top100Servers = allServers.filter((s) => slugSet.has(s.slug));
  } else {
    top100Servers = allServers.slice(0, 100);
    top100Slugs = top100Servers.map((s) => s.slug);
  }

  if (!allServers.length && manualData?.servers?.length) {
    allServers = manualData.servers.map(normalizeLegacyManual);
    top100Servers = allServers.slice(0, 100);
    top100Slugs = top100Servers.map((s) => s.slug);
    categories = manualData.categories || STANDARD_CATEGORIES;
  }

  cached = {
    allServers,
    top100Servers,
    top100Slugs: new Set(top100Slugs),
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
  return sortServers(loadCatalog().allServers);
}

function getTop100McpServers() {
  return sortServers(loadCatalog().top100Servers);
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

function getMcpCategoryCounts(servers) {
  const counts = {};
  for (const cat of getMcpCategories()) {
    counts[cat] = servers.filter((s) => s.category === cat).length;
  }
  return counts;
}

function findMcpServerBySlug(slug) {
  return getAllMcpServers().find((s) => s.slug === slug || s.id === slug);
}

function withEmoji(servers) {
  return servers.map((s) => ({
    ...s,
    iconEmoji: getMcpIconEmoji(s.icon),
  }));
}

/**
 * @param {'top' | 'all'} scope
 */
function getMcpCatalogPayload(scope = 'all') {
  const catalog = loadCatalog();
  const lastUpdated = getMcpLastUpdated();
  const servers = scope === 'top' ? getTop100McpServers() : getAllMcpServers();

  return {
    scope,
    categories: catalog.categories,
    servers: withEmoji(servers),
    total: servers.length,
    total_catalog: catalog.allServers.length,
    generated_at: catalog.generatedAt,
    last_updated: lastUpdated.display,
  };
}

function getMcpHomepagePreview(limit = 6) {
  const servers = getTop100McpServers().slice(0, limit);
  const totals = getMcpCatalogTotals();
  const lastUpdated = getMcpLastUpdated();
  return {
    servers: withEmoji(servers),
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
  return loadCatalog().top100Slugs.has(slug);
}

function clearMcpCache() {
  cached = null;
}

module.exports = {
  getAllMcpServers,
  getTop100McpServers,
  getMcpCatalogTotals,
  getMcpCategories,
  getMcpCategoryCounts,
  findMcpServerBySlug,
  getMcpIconEmoji,
  transportLabel,
  getMcpLastUpdated,
  getMcpCatalogPayload,
  getMcpHomepagePreview,
  isInTop100,
  clearMcpCache,
};
