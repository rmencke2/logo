/**
 * Match MCP catalog servers to category hub definitions.
 */

const { getAllMcpServers } = require('./mcpDirectoryService');
const { getMcpCategoryBySlug, getAllMcpCategories } = require('../data/mcp-categories');

function sortCategoryServers(servers) {
  return [...servers].sort((a, b) => {
    const starDiff = (b.stars || 0) - (a.stars || 0);
    if (starDiff !== 0) return starDiff;
    const toolDiff = (b.tools?.length || 0) - (a.tools?.length || 0);
    if (toolDiff !== 0) return toolDiff;
    return a.name.localeCompare(b.name);
  });
}

/**
 * @param {string} categorySlug
 * @param {{ limit?: number }} [opts]
 */
function getServersForCategory(categorySlug, opts = {}) {
  const category = getMcpCategoryBySlug(categorySlug);
  if (!category) return { category: null, servers: [], total: 0 };

  const limit = opts.limit ?? 60;
  const ranked = sortCategoryServers(
    getAllMcpServers().filter((server) => server.category === category.name),
  );

  return {
    category,
    servers: limit > 0 ? ranked.slice(0, limit) : [],
    total: ranked.length,
  };
}

function getCategorySummaries() {
  return getAllMcpCategories().map((category) => {
    const { total } = getServersForCategory(category.slug, { limit: 0 });
    return {
      slug: category.slug,
      title: category.title,
      shortTitle: category.shortTitle,
      metaDescription: category.metaDescription,
      serverCount: total,
    };
  });
}

module.exports = {
  getServersForCategory,
  getCategorySummaries,
};
