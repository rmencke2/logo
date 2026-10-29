/**
 * SEO / GEO copy: FAQs, intro blocks, and cross-links for homepage and MCP directory.
 */

const SITE_BASE = 'https://www.influzer.ai';
const { describeCatalogStats } = require('../services/mcpCatalogStats');

function buildFaqJsonLd(faqs, pageUrl) {
  return {
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.aPlain || f.a.replace(/<[^>]+>/g, ''),
      },
    })),
  };
}

function appendFaqToJsonLd(jsonLd, faqs, pageUrl) {
  if (!faqs?.length) return jsonLd;
  return {
    ...jsonLd,
    '@graph': [...(jsonLd['@graph'] || []), buildFaqJsonLd(faqs, pageUrl)],
  };
}

function featuredServerLinks() {
  return [
    { href: '/mcp/influzer-mcp-discovery', label: 'Influzer MCP Discovery', note: 'Search the directory from Claude or Cursor' },
    { href: '/mcp/discovery/setup', label: 'Connect setup guide', note: 'Claude, ChatGPT, Cursor in 2 minutes' },
    { href: '/mcp/firecrawl', label: 'Firecrawl', note: 'Web scraping for agents' },
    { href: '/mcp/github', label: 'GitHub', note: 'Repos, PRs, and code search' },
    { href: '/mcp/slack', label: 'Slack', note: 'Team messaging' },
    { href: '/mcp/filesystem', label: 'Filesystem', note: 'Local file access' },
    { href: '/mcp/postgres', label: 'PostgreSQL', note: 'SQL for agents' },
    { href: '/mcp/context7', label: 'Context7', note: 'Live library docs' },
  ];
}

function getHomeSeoContent(heroStats) {
  const copy = heroStats?.copy || describeCatalogStats(heroStats || {});
  const sentence = copy.countSentence;

  const faqs = [
    {
      q: 'What is the Model Context Protocol (MCP)?',
      a: 'The <strong>Model Context Protocol (MCP)</strong> is an open standard (introduced by Anthropic in November 2024) that lets AI assistants connect to external tools and data through a consistent protocol. Read our full guide: <a href="/insights/what-is-model-context-protocol">What is MCP?</a> — or browse the <a href="/mcp">server directory</a>.',
      aPlain:
        'MCP is an open standard that lets AI assistants connect to external tools and data. See our What is MCP guide and server directory on Influzer.ai.',
    },
    {
      q: 'What is Influzer.ai?',
      a: sentence
        ? `Influzer.ai is an MCP server directory and insights site. Right now: <strong>${sentence}</strong>. We publish setup steps and connection URLs, and write executive guides on <a href="/insights">AI agents and operating systems</a>.`
        : 'Influzer.ai is an MCP server directory and insights site. We publish setup steps and connection URLs, and write executive guides on <a href="/insights">AI agents and operating systems</a>.',
      aPlain: sentence
        ? `Influzer.ai is an MCP server directory and insights site. Right now: ${sentence}.`
        : 'Influzer.ai is an MCP server directory and insights site.',
    },
    {
      q: 'How do I find the right MCP server?',
      a: 'Start with the <a href="/mcp">Top 100 MCP servers</a> for curated picks with tool lists, or search the <a href="/mcp/all">full directory</a> by name, category, or tool. Each server page lists install commands, remote endpoints, and indexed tools where available.',
      aPlain:
        'Start with the Top 100 MCP servers for curated picks, or search the full directory by name, category, or tool.',
    },
    {
      q: 'What does “indexed tools” mean?',
      a: copy.withTools
        ? `We store the tool names and descriptions exposed by each MCP server (${copy.withTools} servers with at least one indexed tool${copy.tools ? `, ${copy.tools} tools indexed` : ''}). That lets you search for capabilities like “search the web”, “create issue”, or “read spreadsheet” across the catalog — not just server names.`
        : 'We store the tool names and descriptions exposed by each MCP server. That lets you search for capabilities like “search the web”, “create issue”, or “read spreadsheet” across the catalog — not just server names.',
      aPlain:
        'Indexed tools are the callable tool names and descriptions we store for each MCP server so you can search by capability.',
    },
    {
      q: 'How often is the directory updated?',
      a: `${copy.updated ? `The catalog file was last updated <strong>${copy.updated}</strong>. ` : ''}The registry refresh workflow runs weekly from Glama, Smithery, and community sources. Tool lists are re-validated daily against live MCP endpoints and registry APIs. New submissions are reviewed via <a href="/mcp/submit">Submit an MCP server</a>.`,
      aPlain: `${copy.updated ? `The catalog file was last updated ${copy.updated}. ` : ''}The registry refresh workflow runs weekly; tool lists are re-validated daily. New submissions are reviewed manually.`,
    },
  ];

  return {
    introTitle: 'What is Influzer.ai?',
    introParagraphs: [
      sentence
        ? `Influzer.ai helps developers and teams choose MCP servers for production AI workflows. Our directory currently has <strong>${sentence}</strong>, plus setup instructions and connection URLs.`
        : 'Influzer.ai helps developers and teams choose MCP servers for production AI workflows. Listings include setup instructions and connection URLs when we have them.',
      'Use our <a href="/mcp/discovery/setup">official MCP Discovery server</a> in Claude, ChatGPT, or Cursor to search the catalog by tool capability — or browse the <a href="/mcp">Top 100</a> on the web.',
    ],
    faqs,
    crossLinkGroups: [
      {
        title: 'Explore the directory',
        links: [
          { href: '/mcp', label: 'Top 100 MCP servers', desc: 'Curated leaders with indexed tools' },
          { href: '/mcp/all', label: copy.listed ? `Full directory (${copy.listed})` : 'Full directory', desc: 'Search every listed server' },
          { href: '/mcp/topics', label: 'MCP topic guides', desc: 'Browser automation, RAG, PDF, and more' },
          { href: '/mcp/submit', label: 'Submit a server', desc: 'Suggest a listing we are missing' },
        ],
      },
      {
        title: 'Learn MCP',
        links: [
          { href: '/insights/what-is-model-context-protocol', label: 'What is MCP?', desc: 'Architecture, examples, MCP vs RAG' },
          { href: '/insights/how-to-set-up-your-first-mcp-servers-in-cursor', label: 'First MCP setup', desc: 'Practical Cursor starter guide' },
        ],
      },
      {
        title: 'Popular MCP servers',
        links: featuredServerLinks(),
      },
      {
        title: 'More from Influzer.ai',
        links: [
          { href: '/insights', label: 'Insights blog', desc: 'AI strategy and execution guides' },
          { href: '/insights/rss.xml', label: 'RSS feed', desc: 'Subscribe in your reader' },
          { href: '/logo-generator', label: 'Logo generator', desc: 'Free AI brand tools' },
        ],
      },
    ],
  };
}

function getMcpSeoContent(heroStats, { scope = 'top', pageTitle = 'MCP Server Directory' } = {}) {
  const copy = heroStats?.copy || describeCatalogStats(heroStats || {});
  const sentence = copy.countSentence;
  const isTop = scope === 'top';

  const faqs = isTop
    ? [
        {
          q: 'What is the Top 100 MCP server list?',
          a: 'Our Top 100 is a curated ranking of Model Context Protocol servers with concrete tool lists, popularity signals, and setup details. It is the fastest way to compare integrations for <a href="/mcp?q=claude">Claude</a>, <a href="/mcp?q=cursor">Cursor</a>, and VS Code before diving into the full registry.',
          aPlain:
            'The Top 100 is a curated ranking of MCP servers with tool lists, popularity signals, and setup details for Claude, Cursor, and VS Code.',
        },
        {
          q: 'How do I connect an MCP server to my AI client?',
          a: 'Open any server page (for example <a href="/mcp/firecrawl">Firecrawl</a> or <a href="/mcp/github">GitHub</a>) for install commands, remote MCP URLs, or GitHub README links. Local servers typically use <code>npx</code> or Docker; hosted servers provide an HTTPS endpoint to paste into your client settings.',
          aPlain:
            'Open a server detail page for install commands, remote MCP URLs, or GitHub README links.',
        },
        {
          q: 'Top 100 vs full directory — which should I use?',
          a: sentence
            ? `Use <strong>Top 100</strong> (this page) to discover proven servers quickly. Use the <a href="/mcp/all">full directory</a> for the rest. Right now: ${sentence}.`
            : 'Use <strong>Top 100</strong> (this page) to discover proven servers quickly. Use the <a href="/mcp/all">full directory</a> when you need a niche integration.',
          aPlain: sentence
            ? `Use Top 100 for proven servers; use the full directory for the rest. Right now: ${sentence}.`
            : 'Use Top 100 for proven servers; use the full directory for niche integrations.',
        },
        {
          q: 'What are remote vs local MCP servers?',
          a: '<strong>Remote</strong> servers expose an HTTPS MCP endpoint (common on Smithery and hosted SaaS). <strong>Local</strong> servers run on your machine via stdio — typical for filesystem, GitHub CLI wrappers, and dev tools. Our cards label each server’s transport.',
          aPlain:
            'Remote servers use HTTPS endpoints; local servers run on your machine via stdio.',
        },
        {
          q: 'Missing a server?',
          a: `Use <a href="/mcp/submit">Submit an MCP server</a> and we will review it manually. ${copy.updated ? `The catalog file was last updated ${copy.updated}. ` : ''}The registry refresh workflow also runs weekly from Glama, Smithery, and community lists.`,
          aPlain: `Submit a server via our form; we review every suggestion manually. ${copy.updated ? `Catalog file last updated ${copy.updated}. ` : ''}The registry refresh workflow runs weekly.`,
        },
      ]
    : [
        {
          q: 'What is the full MCP server directory?',
          a: sentence
            ? `This page lists the MCP servers in our registry. Right now: ${sentence}. Filter by category, sort by popularity or tool count, and open any server for setup steps.`
            : 'This page lists the MCP servers in our registry. Filter by category, sort by popularity or tool count, and open any server for setup steps.',
          aPlain: sentence
            ? `The full directory lists the MCP servers in our registry. Right now: ${sentence}.`
            : 'The full directory lists the MCP servers in our registry.',
        },
        {
          q: 'Why do some servers have no tools listed?',
          a: 'Tool indexes come from live MCP endpoints and registry APIs. Servers without indexed tools may be stdio-only, require authentication, or not yet validated. Toggle “Only show servers with at least one indexed tool” to focus on searchable entries, or try the <a href="/mcp">Top 100</a> curated list.',
          aPlain:
            'Some servers lack tool indexes until validated or because they require authentication.',
        },
        {
          q: 'How do I search by tool or capability?',
          a: 'Use the search box above — it matches server names, descriptions, categories, and individual tool names (for example “spreadsheet”, “postgres”, or “scrape”).',
          aPlain: 'The search box matches server names, descriptions, categories, and tool names.',
        },
      ];

  return {
    introTitle: isTop ? 'Compare MCP servers for your AI stack' : 'Search the complete MCP registry',
    introParagraphs: isTop
      ? [
          `Browse the <strong>top MCP servers</strong> teams use with Claude, Cursor, and VS Code. Each card shows indexed tools, transport (remote or local), and links to full setup on the server page.`,
          sentence
            ? `Need more than the Top 100? Explore the <a href="/mcp/all">full directory</a>. Right now: ${sentence}. Or return to the <a href="/">Influzer.ai homepage</a>.`
            : 'Need more than the Top 100? Explore the <a href="/mcp/all">full directory</a> or return to the <a href="/">Influzer.ai homepage</a>.',
        ]
      : [
          sentence
            ? `Search the registry. Right now: <strong>${sentence}</strong>. By default we show servers with at least one indexed tool; uncheck the filter to see every listed server.`
            : 'Search the registry. By default we show servers with at least one indexed tool; uncheck the filter to see every listed server.',
          `New to MCP? Read <a href="/insights/what-is-model-context-protocol">What is the Model Context Protocol?</a> or start with the curated <a href="/mcp">Top 100</a>. Browse <a href="/mcp/topics">topic guides</a> for browser automation, RAG, and coding-agent stacks.`,
        ],
    faqs,
    crossLinkGroups: [
      {
        title: 'Directory pages',
        links: [
          { href: '/', label: 'Homepage', desc: 'Search and weekly digest' },
          { href: isTop ? '/mcp/all' : '/mcp', label: isTop ? (copy.listed ? `Full directory (${copy.listed})` : 'Full directory') : 'Top 100 MCP servers', desc: isTop ? 'Every listed server' : 'Curated leaders' },
          { href: '/mcp/topics', label: 'Topic guides', desc: 'Browser automation, RAG, PDF, coding agents' },
          { href: '/mcp/submit', label: 'Submit a server', desc: 'Add a missing integration' },
        ],
      },
      {
        title: 'Featured MCP servers',
        links: featuredServerLinks(),
      },
      {
        title: 'Related',
        links: [
          { href: '/insights/what-is-model-context-protocol', label: 'What is MCP?', desc: 'Full primer — architecture and MCP vs RAG' },
          { href: '/insights', label: 'Insights', desc: 'Executive AI playbooks' },
          { href: '/mcp/firecrawl', label: 'Firecrawl MCP', desc: 'Scrape and crawl the web for agents' },
        ],
      },
    ],
    pageTitle,
  };
}

module.exports = {
  SITE_BASE,
  buildFaqJsonLd,
  appendFaqToJsonLd,
  getHomeSeoContent,
  getMcpSeoContent,
};
