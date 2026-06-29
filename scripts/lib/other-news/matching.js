// Match external articles to MCP directory servers for internal links.

const { getAllMcpServers } = require('../../../services/mcpDirectoryService');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildServerIndex() {
  const genericSlugs = new Set(['mcp', 'mcp-server', 'model-context-protocol', 'server']);
  const servers = getAllMcpServers();
  return servers
    .map((server) => ({
      slug: server.slug || server.id,
      name: String(server.name || '').trim(),
      nameLower: String(server.name || '').toLowerCase(),
      slugSpaced: String(server.slug || server.id || '').replace(/-/g, ' ').toLowerCase(),
    }))
    .filter((s) => s.slug && s.name.length > 2 && !genericSlugs.has(s.slug))
    .sort((a, b) => b.name.length - a.name.length);
}

function matchDirectoryServer(article, serverIndex) {
  const haystack = `${article.title} ${article.raw_summary} ${article.editorial_blurb || ''}`.toLowerCase();
  let best = null;

  for (const server of serverIndex) {
    if (server.nameLower.length < 4 && !haystack.includes(server.slugSpaced)) continue;

    const matchedByName =
      server.nameLower.length >= 5 &&
      new RegExp(`\\b${escapeRegExp(server.nameLower)}\\b`, 'i').test(haystack);
    const matchedBySlug =
      server.slugSpaced.length >= 5 &&
      new RegExp(`\\b${escapeRegExp(server.slugSpaced)}\\b`, 'i').test(haystack);

    if (!matchedByName && !matchedBySlug) continue;

    const score = (matchedByName ? server.nameLower.length : 0) + (matchedBySlug ? server.slugSpaced.length : 0);
    if (!best || score > best.score) {
      best = {
        score,
        matched_server_slug: server.slug,
        matched_server_name: server.name,
      };
    }
  }

  return best
    ? {
        matched_server_slug: best.matched_server_slug,
        matched_server_name: best.matched_server_name,
      }
    : {
        matched_server_slug: '',
        matched_server_name: '',
      };
}

function attachDirectoryMatches(articles) {
  const serverIndex = buildServerIndex();
  return articles.map((article) => ({
    ...article,
    ...matchDirectoryServer(article, serverIndex),
  }));
}

module.exports = {
  attachDirectoryMatches,
};
