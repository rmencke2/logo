// ================================
//  MCP Server Directory data
// ================================

const fs = require('fs');
const path = require('path');

const GENERATED_PATH = path.join(__dirname, '..', 'data', 'servers-generated.json');
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

function normalizeLegacyManual(server) {
  return {
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
    last_updated: new Date().toISOString().slice(0, 10),
    icon: server.icon || 'boxes',
  };
}

function loadCatalog() {
  if (cached) return cached;

  const generated = readJsonIfExists(GENERATED_PATH);
  const manualFile = fs.existsSync(MANUAL_PATH)
    ? MANUAL_PATH
    : fs.existsSync(LEGACY_MANUAL_PATH)
      ? LEGACY_MANUAL_PATH
      : null;
  const manualData = manualFile ? readJsonIfExists(manualFile) : null;

  let servers = [];
  let categories = STANDARD_CATEGORIES;
  let generatedAt = null;

  if (generated?.servers?.length) {
    servers = generated.servers.map((s) => ({
      ...s,
      slug: s.slug || s.id,
      icon: s.icon || 'boxes',
    }));
    categories = generated.categories || STANDARD_CATEGORIES;
    generatedAt = generated.generated_at || null;
  }

  if (manualData?.servers?.length) {
    const slugs = new Set(servers.map((s) => s.slug));
    const ghKeys = new Set(
      servers.map((s) => (s.github_url || '').toLowerCase()).filter(Boolean),
    );
    for (const raw of manualData.servers) {
      const m = normalizeLegacyManual(raw);
      const gh = (m.github_url || '').toLowerCase();
      if (slugs.has(m.slug) || (gh && ghKeys.has(gh))) continue;
      servers.push(m);
      slugs.add(m.slug);
      if (gh) ghKeys.add(gh);
    }
  }

  if (!servers.length && manualData?.servers?.length) {
    servers = manualData.servers.map(normalizeLegacyManual);
    categories = manualData.categories || STANDARD_CATEGORIES;
  }

  cached = { servers, categories, generatedAt };
  return cached;
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
  return [...loadCatalog().servers].sort((a, b) => {
    const starDiff = (b.stars || 0) - (a.stars || 0);
    if (starDiff !== 0) return starDiff;
    return a.name.localeCompare(b.name);
  });
}

function getMcpCategories() {
  return loadCatalog().categories;
}

function getMcpCategoryCounts() {
  const servers = getAllMcpServers();
  const counts = {};
  for (const cat of getMcpCategories()) {
    counts[cat] = servers.filter((s) => s.category === cat).length;
  }
  return counts;
}

function findMcpServerBySlug(slug) {
  return getAllMcpServers().find((s) => s.slug === slug || s.id === slug);
}

function getMcpCatalogPayload() {
  const { servers, categories, generatedAt } = loadCatalog();
  const lastUpdated = getMcpLastUpdated();
  return {
    categories,
    servers: servers.map((s) => ({
      ...s,
      iconEmoji: getMcpIconEmoji(s.icon),
    })),
    total: servers.length,
    generated_at: generatedAt,
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

function clearMcpCache() {
  cached = null;
}

module.exports = {
  getAllMcpServers,
  getMcpCategories,
  getMcpCategoryCounts,
  findMcpServerBySlug,
  getMcpIconEmoji,
  transportLabel,
  getMcpLastUpdated,
  getMcpCatalogPayload,
  clearMcpCache,
};
