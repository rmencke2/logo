// ================================
//  MCP Server Directory data
// ================================

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'mcp-servers.json');

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

let cached;

function loadData() {
  if (!cached) {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    cached = JSON.parse(raw);
  }
  return cached;
}

function getAllMcpServers() {
  const { servers } = loadData();
  return [...servers].sort((a, b) => a.name.localeCompare(b.name));
}

function getMcpCategories() {
  return loadData().categories;
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
  return getAllMcpServers().find((s) => s.slug === slug);
}

function getMcpIconEmoji(iconKey) {
  return ICON_EMOJI[iconKey] || '⚡';
}

function transportLabel(transport) {
  if (transport === 'sse') return 'SSE (deprecated)';
  return String(transport).toUpperCase();
}

module.exports = {
  getAllMcpServers,
  getMcpCategories,
  getMcpCategoryCounts,
  findMcpServerBySlug,
  getMcpIconEmoji,
  transportLabel,
};
