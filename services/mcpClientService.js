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

function summarizeServerForAgent(server) {
  return {
    slug: server.slug,
    name: server.name,
    description: String(server.description || '').slice(0, 220),
    category: server.category || null,
    transport: server.transport || null,
    is_remote: Boolean(server.isRemote),
    url: `https://www.influzer.ai/mcp/${server.slug}`,
  };
}

/**
 * Compact client-intent payload for WebMCP / public JSON API.
 */
function getBestClientPayload(slug) {
  const page = getClientPage(slug);
  if (!page.client) {
    return {
      error: `No client guide found for "${slug}"`,
      client: null,
      index_url: 'https://www.influzer.ai/mcp/best',
    };
  }

  const { client, stacks, featuredServers, relatedTopics, relatedComparisons } = page;
  return {
    client: {
      slug: client.slug,
      name: client.name,
      title: client.title,
      short_title: client.shortTitle,
      intro: client.intro,
      meta_description: client.metaDescription,
      url: `https://www.influzer.ai/mcp/best/${client.slug}`,
      setup_url: client.setupHref,
      setup_label: client.setupLabel,
      insights_url: client.insightsHref || null,
      insights_label: client.insightsLabel || null,
      surfaces: (client.surfaces || []).map((s) => ({
        name: s.name,
        transport: s.transport,
        blurb: s.blurb,
      })),
      stacks: stacks.map((stack) => ({
        id: stack.id,
        title: stack.title,
        blurb: stack.blurb,
        servers: stack.servers.map(summarizeServerForAgent),
      })),
      featured_servers: featuredServers.map(summarizeServerForAgent),
      checklist: client.checklist || [],
      choose_tips: client.chooseTips || [],
      faqs: (client.faqs || []).map((f) => ({
        q: f.q,
        a: f.aPlain || f.a,
      })),
      related_topics: relatedTopics.map((t) => ({
        slug: t.slug,
        title: t.shortTitle || t.title,
        url: `https://www.influzer.ai/mcp/topics/${t.slug}`,
      })),
      related_comparisons: relatedComparisons.map((c) => ({
        slug: c.slug,
        title: c.shortTitle || c.title,
        url: `https://www.influzer.ai/mcp/compare/${c.slug}`,
      })),
    },
  };
}

function getBestIndexPayload() {
  return {
    title: 'Best MCP Servers by Client',
    url: 'https://www.influzer.ai/mcp/best',
    clients: getClientSummaries().map((c) => ({
      ...c,
      url: `https://www.influzer.ai/mcp/best/${c.slug}`,
    })),
  };
}

module.exports = {
  getClientSummaries,
  getClientPage,
  getBestClientPayload,
  getBestIndexPayload,
  getMcpBestIndexSeoContent,
  lookupClient,
};
