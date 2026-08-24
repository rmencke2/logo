/**
 * Client-intent hubs — “best MCP servers for Claude / Cursor / …”
 * Add a new object here to publish another client page (Cursor next).
 */

const MCP_CLIENTS = [
  {
    slug: 'claude',
    name: 'Claude',
    title: 'Best MCP Servers for Claude',
    shortTitle: 'Claude',
    metaDescription:
      'Best MCP servers for Claude Desktop, Claude.ai, and Claude Code — remote connectors vs local stdio, starter stacks, and setup steps.',
    intro:
      'Claude is three MCP clients, not one. Claude.ai (web/mobile) only accepts remote HTTPS connectors. Claude Desktop can mix connectors with local stdio. Claude Code installs servers in the terminal. Pick servers that match the surface you actually use.',
    aliases: ['claude-desktop', 'claude-code', 'anthropic'],
    setupHref: '/mcp/discovery/setup',
    setupLabel: 'Claude Discovery setup',
    insightsHref: '/insights/claude-code-cli-vs-desktop-connectors',
    insightsLabel: 'Claude Code vs Desktop connectors',
    surfaces: [
      {
        name: 'Claude.ai (web & mobile)',
        transport: 'Remote HTTPS only',
        blurb:
          'Settings → Connectors → Custom → Web. Anthropic’s cloud calls your server. Local stdio servers will not load here.',
      },
      {
        name: 'Claude Desktop',
        transport: 'Remote connectors + local stdio',
        blurb:
          'Use connectors for hosted MCP URLs. Use claude_desktop_config.json for npx/stdio servers that must run on your machine.',
      },
      {
        name: 'Claude Code (CLI)',
        transport: 'stdio or --transport http',
        blurb:
          'Best for repo-adjacent work. Add HTTP servers with claude mcp add --transport http, or stdio packages with npx.',
      },
    ],
    stacks: [
      {
        id: 'remote-starter',
        title: 'Remote starter (Claude.ai / connectors)',
        blurb:
          'These four speak HTTPS, so they work as Claude custom connectors without a local process. Start here on web or mobile.',
        slugs: ['influzer-mcp-discovery', 'context7', 'neon', 'sentry'],
      },
      {
        id: 'research',
        title: 'Research & the live web',
        blurb:
          'Give Claude a search tool and a scraper. Exa finds sources; Firecrawl reads the page. Brave Search is the lighter SERP default. These are typically local stdio — use Desktop or Claude Code.',
        slugs: ['exa', 'firecrawl', 'brave-search'],
      },
      {
        id: 'coding',
        title: 'Coding in Claude Code',
        blurb:
          'Docs lookup, browser QA, and issues. Pair with GitLab if that is your host (the official GitHub MCP is merged under other slugs in our catalog).',
        slugs: ['context7', 'playwright', 'chrome-devtools-mcp', 'linear', 'gitlab'],
      },
      {
        id: 'data',
        title: 'Data & knowledge',
        blurb:
          'SQL for agents, Notion for team docs, Memory for a local knowledge graph. Prefer read-only database credentials.',
        slugs: ['postgres', 'neon', 'notion', 'memory'],
      },
    ],
    checklist: [
      'Decide which Claude surface you are installing for — web connectors cannot run stdio servers.',
      'Add <a href="/mcp/influzer-mcp-discovery">Influzer MCP Discovery</a> first so Claude can search the rest of the catalog from chat.',
      'Cap the first stack at 4–6 servers. Overlapping tools confuse tool choice.',
      'Verify with a small prompt (list tools, fetch one URL, run one SQL SELECT) before wider rollout.',
      'Use least-privilege API keys. Treat write tools like production automation.',
    ],
    chooseTips: [
      'If you only use Claude.ai, filter for remote/HTTP servers — Discovery, Context7, Neon, and Sentry are a proven remote set.',
      'If you live in Claude Code, stdio servers (Firecrawl, Playwright, Postgres) are fine and often richer.',
      'Do not install both Exa and Brave Search on day one — pick one search tool, add a scraper if you need full pages.',
      'Read our <a href="/insights/claude-code-cli-vs-desktop-connectors">Claude Code vs Desktop connectors</a> guide before duplicating the same MCP in both clients.',
    ],
    faqs: [
      {
        q: 'What are the best MCP servers for Claude?',
        a: 'Start with <a href="/mcp/influzer-mcp-discovery">Influzer MCP Discovery</a> (search the catalog from chat), <a href="/mcp/context7">Context7</a> (live library docs), and one web tool (<a href="/mcp/exa">Exa</a> or <a href="/mcp/firecrawl">Firecrawl</a>). Add Postgres/Neon and Linear when the workflow needs data or tickets.',
        aPlain:
          'Start with Influzer Discovery, Context7, and one web tool (Exa or Firecrawl). Add Postgres/Neon and Linear when you need data or tickets.',
      },
      {
        q: 'Can Claude.ai use local MCP servers?',
        a: 'No. Claude.ai custom connectors only call <strong>public HTTPS MCP endpoints</strong>. Local stdio servers (npx, Docker) work in <strong>Claude Desktop</strong> and <strong>Claude Code</strong>, not in the claude.ai connector UI.',
        aPlain:
          'Claude.ai connectors only accept public HTTPS MCP URLs. Local stdio servers work in Claude Desktop and Claude Code.',
      },
      {
        q: 'Claude Desktop vs Claude Code — which MCP list should I use?',
        a: 'Same protocol, different install path. Desktop/web: Settings → Connectors. Claude Code: <code>claude mcp add</code> in the terminal. Details: <a href="/insights/claude-code-cli-vs-desktop-connectors">Claude Code vs Desktop connectors</a>.',
        aPlain:
          'Desktop/web uses Settings → Connectors. Claude Code uses claude mcp add in the terminal. Same protocol, different install path.',
      },
      {
        q: 'How many MCP servers should I connect to Claude?',
        a: 'Four to six to start. Claude has to choose among every tool you expose. A bloated list makes the model pick the wrong tool. Add more only when a workflow is blocked.',
        aPlain:
          'Start with four to six servers. Extra overlapping tools make Claude more likely to pick the wrong one.',
      },
      {
        q: 'Firecrawl or Exa for Claude research?',
        a: 'Exa searches; Firecrawl scrapes known URLs. See <a href="/mcp/compare/firecrawl-vs-exa">Firecrawl vs Exa</a>. Many research chats use both — Exa to find, Firecrawl to read.',
        aPlain: 'Exa searches the web; Firecrawl scrapes known URLs. Many research workflows use both.',
      },
    ],
    relatedTopicSlugs: ['coding-agent-mcp', 'web-scraping-mcp', 'rag-mcp'],
    relatedCompareSlugs: ['firecrawl-vs-exa', 'postgres-vs-neon', 'playwright-vs-chrome-devtools-mcp'],
  },
];

function getAllMcpClients() {
  return MCP_CLIENTS;
}

function getMcpClientBySlug(slug) {
  const key = String(slug || '').toLowerCase();
  return (
    MCP_CLIENTS.find((c) => c.slug === key) ||
    MCP_CLIENTS.find((c) => (c.aliases || []).includes(key)) ||
    null
  );
}

function getMcpClientSeoContent(client) {
  return {
    introTitle: `How we picked MCP servers for ${client.name}`,
    introParagraphs: [
      client.intro,
      `This is an editorial starter list, not a dump of every server that mentions ${client.name}. Stacks are grouped by job (remote connectors, research, coding, data) so you can install a small set that matches your Claude surface.`,
    ],
    faqs: client.faqs,
    crossLinkGroups: [
      {
        title: 'Directory',
        links: [
          { href: '/mcp', label: 'Top 100 MCP servers', desc: 'Curated ranking with tool lists' },
          { href: '/mcp/best', label: 'Best MCP by client', desc: 'Claude now — Cursor next' },
          { href: '/mcp/compare', label: 'Comparisons', desc: 'Firecrawl vs Exa, Postgres vs Neon' },
          { href: '/mcp/topics', label: 'Topic guides', desc: 'Browser automation, RAG, coding agents' },
        ],
      },
      {
        title: 'Claude setup',
        links: [
          { href: client.setupHref, label: client.setupLabel, desc: 'Connect Influzer Discovery in Claude' },
          { href: client.insightsHref, label: client.insightsLabel, desc: 'Same URL, two install paths' },
          { href: '/mcp/discovery/starters', label: 'Starter kits', desc: 'Copy-paste mcp.json configs' },
        ],
      },
    ],
  };
}

function getMcpBestIndexSeoContent() {
  return {
    introTitle: 'Best MCP servers by AI client',
    introParagraphs: [
      'Client-intent guides for the MCP hosts people actually type into search — starting with Claude (Desktop, claude.ai, and Claude Code). Each page maps servers to that client’s transport limits instead of listing the same Top 100 twice.',
      'Looking for a workflow instead of a client? Use <a href="/mcp/topics">topic guides</a>. Deciding between two products? See <a href="/mcp/compare">comparisons</a>.',
    ],
    faqs: [
      {
        q: 'Why split MCP recommendations by client?',
        a: 'Claude.ai cannot run local stdio servers. Cursor prefers <code>mcp.json</code>. The same catalog looks different depending on the host. Client pages call that out so you do not paste a Desktop config into the wrong product.',
        aPlain:
          'Each AI client has different MCP install paths and transport limits. Client pages match servers to those limits.',
      },
    ],
    crossLinkGroups: [
      {
        title: 'Client guides',
        links: MCP_CLIENTS.map((c) => ({
          href: `/mcp/best/${c.slug}`,
          label: c.title,
          desc: c.metaDescription.slice(0, 90) + '…',
        })),
      },
      {
        title: 'Directory',
        links: [
          { href: '/mcp', label: 'Top 100', desc: 'Curated servers with indexed tools' },
          { href: '/mcp/categories', label: 'Categories', desc: 'Browse by product type' },
          { href: '/mcp/compare', label: 'Comparisons', desc: 'Head-to-head matchups' },
        ],
      },
    ],
  };
}

module.exports = {
  MCP_CLIENTS,
  getAllMcpClients,
  getMcpClientBySlug,
  getMcpClientSeoContent,
  getMcpBestIndexSeoContent,
};
