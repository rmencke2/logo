/**
 * Influzer MCP Discovery — tool handlers (read-only catalog search).
 */

const SITE_BASE = 'https://www.influzer.ai';

const {
  getAllMcpServers,
  getTop100McpServers,
  findMcpServerBySlug,
  isInTop100,
  transportLabel,
} = require('./mcpDirectoryService');
const { getServersForTopic } = require('./mcpTopicService');
const { getAllMcpTopics, getMcpTopicBySlug } = require('../data/mcp-topics');

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 15;

const USE_CASE_ALIASES = {
  browser: 'browser-automation-mcp',
  'browser automation': 'browser-automation-mcp',
  automation: 'browser-automation-mcp',
  scraping: 'web-scraping-mcp',
  scrape: 'web-scraping-mcp',
  crawl: 'web-scraping-mcp',
  rag: 'rag-mcp',
  memory: 'rag-mcp',
  retrieval: 'rag-mcp',
  vector: 'rag-mcp',
  openapi: 'openapi-mcp',
  api: 'openapi-mcp',
  rest: 'openapi-mcp',
  pdf: 'pdf-mcp',
  document: 'pdf-mcp',
  coding: 'coding-agent-mcp',
  'coding agent': 'coding-agent-mcp',
  github: 'coding-agent-mcp',
  developer: 'coding-agent-mcp',
};

const TOOL_DEFINITIONS = [
  {
    name: 'search_mcp_servers',
    description:
      'Search the Influzer.ai MCP server directory by name, category, or tool capability (e.g. "postgres", "scrape", "create_issue"). Returns ranked summaries with links to full setup pages.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search text — server name, category, or tool capability',
        },
        category: {
          type: 'string',
          description: 'Optional category filter (e.g. "Dev Tools", "Search & Web")',
        },
        limit: {
          type: 'number',
          description: `Max results (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_mcp_server',
    description:
      'Get full details for one MCP server by slug: tools, transport, install command, remote URL, and Influzer page link.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Server slug from Influzer directory (e.g. "github", "playwright")',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'recommend_mcp_servers',
    description:
      'Recommend MCP servers for a workflow or topic (e.g. "browser automation", "coding agent", "rag"). Uses curated topic guides and Top 100 signals.',
    inputSchema: {
      type: 'object',
      properties: {
        use_case: {
          type: 'string',
          description: 'Workflow description or topic name (browser automation, rag, coding agent, pdf, openapi, scraping)',
        },
        topic_slug: {
          type: 'string',
          description: 'Optional topic hub slug (browser-automation-mcp, rag-mcp, coding-agent-mcp, etc.)',
        },
        limit: {
          type: 'number',
          description: `Max results (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`,
        },
      },
    },
  },
  {
    name: 'list_mcp_topics',
    description:
      'List Influzer MCP topic guides (browser automation, web scraping, RAG, PDF, OpenAPI, coding agents) with match counts and hub URLs.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function haystack(server) {
  const toolText = (server.tools || [])
    .map((t) => `${t.name} ${t.description || ''}`)
    .join(' ');
  return `${server.name} ${server.description || ''} ${server.category || ''} ${toolText}`.toLowerCase();
}

function findServerFlexible(id) {
  const q = String(id || '').trim().toLowerCase();
  if (!q) return null;

  const direct = findMcpServerBySlug(q);
  if (direct) return direct;

  const all = getAllMcpServers();
  const byName = all.filter((s) => s.name.toLowerCase() === q);
  if (byName.length) {
    return byName.sort(
      (a, b) => (Number(b.official) - Number(a.official)) || (b.stars || 0) - (a.stars || 0),
    )[0];
  }

  const bySlugContains = all.filter((s) => s.slug === q || s.slug.startsWith(`${q}-`) || s.slug.endsWith(`-${q}`));
  if (bySlugContains.length === 1) return bySlugContains[0];

  const ranked = all
    .map((s) => ({ server: s, score: scoreSearch(s, q) }))
    .filter((row) => row.score >= 20)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.server || null;
}

function scoreSearch(server, query) {
  const q = String(query || '')
    .toLowerCase()
    .trim();
  if (!q) return 0;

  const text = haystack(server);
  let score = 0;

  if (server.slug === q || server.name.toLowerCase() === q) score += 100;
  if (server.slug.split('-').includes(q)) score += 40;
  if (text.includes(q)) score += 20;

  const words = q.split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (text.includes(word)) score += 4;
    for (const tool of server.tools || []) {
      if (tool.name.toLowerCase().includes(word)) score += 10;
    }
  }

  if (server.official) score += 8;
  score += Math.min(server.stars || 0, 5000) / 500;
  score += Math.min((server.tools?.length || 0), 20) * 0.5;
  if (isInTop100(server.slug)) score += 6;

  return score;
}

function summarizeServer(server, { includeTools = true } = {}) {
  const tools = server.tools || [];
  const summary = {
    slug: server.slug,
    name: server.name,
    description: String(server.description || '').slice(0, 280),
    category: server.category,
    official: Boolean(server.official),
    transport: server.transport,
    transport_label: transportLabel(server.transport),
    tool_count: tools.length,
    in_top_100: isInTop100(server.slug),
    page_url: `${SITE_BASE}/mcp/${server.slug}`,
    directory: 'https://www.influzer.ai/mcp',
  };

  if (includeTools && tools.length) {
    summary.top_tools = tools.slice(0, 8).map((t) => ({
      name: t.name,
      description: String(t.description || '').slice(0, 160),
    }));
  }

  return summary;
}

function detailServer(server) {
  const tools = server.tools || [];
  return {
    ...summarizeServer(server, { includeTools: false }),
    description: server.description,
    stars: server.stars || 0,
    github_url: server.github_url || null,
    docs_url: server.docs_url || null,
    install_command: server.install_command || server.setup_steps?.[0]?.command || null,
    mcp_endpoint: server.mcp_endpoint || server.primary_url || server.deployment_url || null,
    setup_steps: (server.setup_steps || []).slice(0, 4),
    tools: tools.slice(0, 20).map((t) => ({
      name: t.name,
      description: t.description || '',
    })),
    submit_url: 'https://www.influzer.ai/mcp/submit',
    topics_url: 'https://www.influzer.ai/mcp/topics',
  };
}

function searchMcpServers({ query, category, limit }) {
  const q = String(query || '').trim();
  if (!q) {
    return { error: 'query is required', servers: [] };
  }

  const max = clampLimit(limit);
  const ranked = getAllMcpServers()
    .filter((s) => !category || s.category === category)
    .map((s) => ({ server: s, score: scoreSearch(s, q) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || (b.server.stars || 0) - (a.server.stars || 0));

  return {
    query: q,
    category: category || null,
    total_matches: ranked.length,
    servers: ranked.slice(0, max).map((r) => summarizeServer(r.server)),
    more: ranked.length > max ? `${SITE_BASE}/mcp/all?q=${encodeURIComponent(q)}` : null,
  };
}

function getMcpServer({ slug }) {
  const id = String(slug || '').trim().toLowerCase();
  if (!id) return { error: 'slug is required', server: null };

  const server = findServerFlexible(id);
  if (!server) {
    return {
      error: `No server found for slug "${id}"`,
      server: null,
      search_url: `${SITE_BASE}/mcp/all?q=${encodeURIComponent(id)}`,
      submit_url: `${SITE_BASE}/mcp/submit`,
    };
  }

  return { server: detailServer(server) };
}

function resolveTopicSlug({ use_case, topic_slug }) {
  if (topic_slug) {
    const slug = String(topic_slug).trim().toLowerCase();
    return getMcpTopicBySlug(slug) ? slug : null;
  }
  const text = String(use_case || '')
    .toLowerCase()
    .trim();
  if (!text) return null;

  const direct = getMcpTopicBySlug(text);
  if (direct) return direct.slug;

  for (const topic of getAllMcpTopics()) {
    if (topic.slug.includes(text) || topic.shortTitle.toLowerCase().includes(text)) {
      return topic.slug;
    }
  }

  for (const [alias, slug] of Object.entries(USE_CASE_ALIASES)) {
    if (text.includes(alias)) return slug;
  }

  return null;
}

function recommendMcpServers({ use_case, topic_slug, limit }) {
  const max = clampLimit(limit);
  const resolvedSlug = resolveTopicSlug({ use_case, topic_slug });

  if (resolvedSlug) {
    const { topic, servers, total } = getServersForTopic(resolvedSlug, { limit: max });
    return {
      use_case: use_case || null,
      topic_slug: resolvedSlug,
      topic_title: topic.title,
      topic_url: `${SITE_BASE}/mcp/topics/${resolvedSlug}`,
      total_matches: total,
      servers: servers.map((s) => summarizeServer(s)),
      more: total > max ? `${SITE_BASE}/mcp/topics/${resolvedSlug}` : null,
    };
  }

  const q = String(use_case || '').trim();
  if (!q) {
    return {
      error: 'Provide use_case or topic_slug (e.g. "browser automation", "coding-agent-mcp")',
      topics_url: `${SITE_BASE}/mcp/topics`,
      servers: [],
    };
  }

  const top100Slugs = new Set(getTop100McpServers().map((s) => s.slug));
  const ranked = getAllMcpServers()
    .map((s) => {
      let score = scoreSearch(s, q);
      if (top100Slugs.has(s.slug)) score += 12;
      return { server: s, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    use_case: q,
    topic_slug: null,
    topic_url: `${SITE_BASE}/mcp/topics`,
    total_matches: ranked.length,
    servers: ranked.slice(0, max).map((r) => summarizeServer(r.server)),
    hint: 'For curated guides, call list_mcp_topics then recommend with topic_slug',
  };
}

function listMcpTopics() {
  const topics = getAllMcpTopics().map((topic) => {
    const { total } = getServersForTopic(topic.slug, { limit: 0 });
    return {
      slug: topic.slug,
      title: topic.title,
      short_title: topic.shortTitle,
      description: topic.metaDescription,
      match_count: total,
      hub_url: `${SITE_BASE}/mcp/topics/${topic.slug}`,
    };
  });

  return {
    topics,
    index_url: `${SITE_BASE}/mcp/topics`,
    directory_url: `${SITE_BASE}/mcp`,
  };
}

function toolResult(data, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

async function handleToolCall(name, args) {
  switch (name) {
    case 'search_mcp_servers':
      return toolResult(searchMcpServers(args || {}));
    case 'get_mcp_server':
      return toolResult(getMcpServer(args || {}));
    case 'recommend_mcp_servers':
      return toolResult(recommendMcpServers(args || {}));
    case 'list_mcp_topics':
      return toolResult(listMcpTopics());
    default:
      return toolResult({ error: `Unknown tool: ${name}` }, true);
  }
}

module.exports = {
  TOOL_DEFINITIONS,
  handleToolCall,
  searchMcpServers,
  getMcpServer,
  recommendMcpServers,
  listMcpTopics,
  SITE_BASE,
};
