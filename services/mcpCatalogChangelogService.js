// ================================
//  MCP catalog changelog — track servers added for newsletter
// ================================

const fs = require('fs');
const path = require('path');

const CHANGELOG_PATH = path.join(__dirname, '..', 'data', 'mcp-catalog-changelog.json');
const MAX_ENTRIES = 500;
const DEFAULT_NEWSLETTER_LIMIT = 8;
const FALLBACK_DAYS = 14;

function readChangelog() {
  if (!fs.existsSync(CHANGELOG_PATH)) {
    return { entries: [] };
  }
  try {
    const data = JSON.parse(fs.readFileSync(CHANGELOG_PATH, 'utf8'));
    return { entries: Array.isArray(data.entries) ? data.entries : [] };
  } catch {
    return { entries: [] };
  }
}

function writeChangelog(data) {
  fs.mkdirSync(path.dirname(CHANGELOG_PATH), { recursive: true });
  fs.writeFileSync(CHANGELOG_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function normalizeEntry(server, source) {
  const slug = String(server.slug || server.id || '').trim();
  if (!slug) return null;
  return {
    slug,
    name: String(server.name || slug).trim().slice(0, 200),
    description: String(server.description || '').trim().slice(0, 280),
    category: String(server.category || 'Dev Tools').trim().slice(0, 80),
    added_at: new Date().toISOString(),
    source: String(source || 'manual').slice(0, 40),
  };
}

function recordMcpServerAdded(server, source = 'manual') {
  const entry = normalizeEntry(server, source);
  if (!entry) return false;

  const data = readChangelog();
  const exists = data.entries.some((e) => e.slug === entry.slug);
  if (exists) return false;

  data.entries.unshift(entry);
  if (data.entries.length > MAX_ENTRIES) {
    data.entries = data.entries.slice(0, MAX_ENTRIES);
  }
  writeChangelog(data);
  return true;
}

function recordNewMcpServersFromCatalog(servers, source = 'catalog-sync') {
  if (!Array.isArray(servers) || !servers.length) return 0;

  const data = readChangelog();
  const knownSlugs = new Set(data.entries.map((e) => e.slug));
  let added = 0;

  for (const server of servers) {
    const entry = normalizeEntry(server, source);
    if (!entry || knownSlugs.has(entry.slug)) continue;
    data.entries.unshift(entry);
    knownSlugs.add(entry.slug);
    added += 1;
  }

  if (added > 0) {
    if (data.entries.length > MAX_ENTRIES) {
      data.entries = data.entries.slice(0, MAX_ENTRIES);
    }
    writeChangelog(data);
  }

  return added;
}

function getRecentMcpServersForNewsletter({ since, limit = DEFAULT_NEWSLETTER_LIMIT } = {}) {
  const data = readChangelog();
  const sinceMs = since ? new Date(since).getTime() : 0;
  const cappedLimit = Math.max(1, Math.min(20, Number(limit) || DEFAULT_NEWSLETTER_LIMIT));

  return data.entries
    .filter((entry) => {
      if (!sinceMs) return true;
      const addedMs = new Date(entry.added_at).getTime();
      return !Number.isNaN(addedMs) && addedMs >= sinceMs;
    })
    .slice(0, cappedLimit)
    .map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      description: entry.description,
      category: entry.category,
      added_at: entry.added_at,
      pageUrl: `/mcp/${entry.slug}`,
    }));
}

function getMcpServersForNewsletter({ since, limit = DEFAULT_NEWSLETTER_LIMIT } = {}) {
  let servers = getRecentMcpServersForNewsletter({ since, limit });
  if (servers.length) return servers;

  const fallbackSince = new Date(Date.now() - FALLBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  servers = getRecentMcpServersForNewsletter({ since: fallbackSince, limit });
  return servers;
}

function diffNewCatalogSlugs(previousServers, nextServers) {
  const prevSlugs = new Set(
    (previousServers || []).map((s) => s.slug || s.id).filter(Boolean),
  );
  return (nextServers || []).filter((s) => {
    const slug = s.slug || s.id;
    return slug && !prevSlugs.has(slug);
  });
}

module.exports = {
  recordMcpServerAdded,
  recordNewMcpServersFromCatalog,
  getRecentMcpServersForNewsletter,
  getMcpServersForNewsletter,
  diffNewCatalogSlugs,
  CHANGELOG_PATH,
};
