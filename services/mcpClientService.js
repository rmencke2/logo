/**
 * Resolve client-intent hubs against the live MCP catalog.
 */

const { findMcpServerBySlug } = require('./mcpDirectoryService');
const { attachBranding } = require('../utils/mcpBranding');
const { getMcpTopicBySlug } = require('../data/mcp-topics');
const { getComparisonSummaries } = require('./mcpComparisonService');
const {
  getAllMcpClients,
  getMcpClientBySlug,
  getMcpClientSeoContent,
  getMcpBestIndexSeoContent,
} = require('../data/mcp-clients');

function brand(server) {
  return attachBranding(server);
}

function resolveSlug(slug) {
  const server = findMcpServerBySlug(slug);
  return server ? brand(server) : null;
}

function uniqueServers(slugs) {
  const seen = new Set();
  const servers = [];
  for (const slug of slugs) {
    if (seen.has(slug)) continue;
    const server = resolveSlug(slug);
    if (!server) continue;
    seen.add(slug);
    servers.push(server);
  }
  return servers;
}

function getClientSummaries() {
  return getAllMcpClients().map((client) => {
    const featuredCount = uniqueServers(client.stacks.flatMap((s) => s.slugs)).length;
    return {
      slug: client.slug,
      title: client.title,
      shortTitle: client.shortTitle,
      metaDescription: client.metaDescription,
      featuredCount,
    };
  });
}

function lookupClient(slug) {
  const client = getMcpClientBySlug(slug);
  if (!client) return { client: null, isCanonical: true };
  const isCanonical = client.slug === String(slug || '').toLowerCase();
  return { client, isCanonical };
}

function getClientPage(slug) {
  const { client, isCanonical } = lookupClient(slug);
  if (!client) return { client: null, isCanonical: true };

  const stacks = client.stacks
    .map((stack) => ({
      ...stack,
      servers: uniqueServers(stack.slugs),
    }))
    .filter((stack) => stack.servers.length > 0);

  const featuredServers = uniqueServers(client.stacks.flatMap((s) => s.slugs));
  const relatedTopics = (client.relatedTopicSlugs || []).map(getMcpTopicBySlug).filter(Boolean);
  const compareSet = new Set(client.relatedCompareSlugs || []);
  const relatedComparisons = getComparisonSummaries().filter((c) => compareSet.has(c.slug));

  return {
    client,
    isCanonical,
    stacks,
    featuredServers,
    relatedTopics,
    relatedComparisons,
    seoContent: getMcpClientSeoContent(client),
  };
}

module.exports = {
  getClientSummaries,
  getClientPage,
  getMcpBestIndexSeoContent,
  lookupClient,
};
