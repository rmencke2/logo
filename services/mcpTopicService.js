/**
 * Match MCP catalog servers to topic hub definitions.
 */

const { getAllMcpServers } = require('./mcpDirectoryService');
const { getMcpTopicBySlug, getAllMcpTopics } = require('../data/mcp-topics');

function haystack(server) {
  const toolText = (server.tools || [])
    .map((t) => `${t.name} ${t.description || ''}`)
    .join(' ');
  return `${server.name} ${server.description || ''} ${server.category || ''} ${toolText}`.toLowerCase();
}

/**
 * @param {import('../data/mcp-topics').MCP_TOPICS[0]} topic
 * @param {object} server
 */
function scoreServerForTopic(topic, server) {
  const text = haystack(server);
  let score = 0;

  for (const kw of topic.keywords) {
    if (text.includes(kw.toLowerCase())) score += 3;
  }

  if (topic.categories.includes(server.category)) score += 2;

  for (const tool of server.tools || []) {
    const toolStr = `${tool.name} ${tool.description || ''}`;
    for (const pat of topic.toolPatterns) {
      if (pat.test(toolStr)) {
        score += 8;
        break;
      }
    }
  }

  for (const pat of topic.toolPatterns) {
    if (pat.test(server.name) || pat.test(server.description || '')) score += 4;
  }

  if (server.official) score += 5;
  score += Math.min(server.stars || 0, 5000) / 1000;
  score += Math.min((server.tools?.length || 0) * 0.5, 10);

  return score;
}

/**
 * @param {string} topicSlug
 * @param {{ limit?: number, minScore?: number }} [opts]
 */
function getServersForTopic(topicSlug, opts = {}) {
  const topic = getMcpTopicBySlug(topicSlug);
  if (!topic) return { topic: null, servers: [], total: 0 };

  const limit = opts.limit ?? 60;
  const minScore = opts.minScore ?? 6;

  const ranked = getAllMcpServers()
    .map((server) => ({ server, score: scoreServerForTopic(topic, server) }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score || (b.server.stars || 0) - (a.server.stars || 0));

  return {
    topic,
    servers: ranked.slice(0, limit).map((r) => r.server),
    total: ranked.length,
  };
}

function getTopicSummaries() {
  return getAllMcpTopics().map((topic) => {
    const { total } = getServersForTopic(topic.slug, { limit: 0, minScore: 6 });
    return {
      slug: topic.slug,
      title: topic.title,
      shortTitle: topic.shortTitle,
      metaDescription: topic.metaDescription,
      matchCount: total,
    };
  });
}

module.exports = {
  getServersForTopic,
  getTopicSummaries,
  scoreServerForTopic,
};
