/**
 * SEO / GEO copy: FAQs, intro blocks, and cross-links for homepage and MCP directory.
 */

const SITE_BASE = 'https://www.influzer.ai';

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
    { href: '/mcp/webnode', label: 'Webnode', note: 'Build websites via MCP' },
    { href: '/mcp/github', label: 'GitHub', note: 'Repos, PRs, and code search' },
    { href: '/mcp/slack', label: 'Slack', note: 'Team messaging' },
    { href: '/mcp/filesystem', label: 'Filesystem', note: 'Local file access' },
    { href: '/mcp/firecrawl', label: 'Firecrawl', note: 'Web scraping for agents' },
    { href: '/mcp/context7', label: 'Context7', note: 'Live library docs' },
  ];
}

function getHomeSeoContent(heroStats) {
  const registry = heroStats.totalServers.toLocaleString();
  const indexed = heroStats.serversWithIndexedTools.toLocaleString();

  const faqs = [
    {
      q: 'What is the Model Context Protocol (MCP)?',
      a: 'The <strong>Model Context Protocol (MCP)</strong> is an open standard that lets AI assistants connect to external tools and data sources — databases, APIs, browsers, file systems, and SaaS apps — through a consistent protocol. Clients like <a href="/mcp?q=claude">Claude</a>, <a href="/mcp?q=cursor">Cursor</a>, and VS Code load MCP servers that expose callable tools.',
      aPlain:
        'The Model Context Protocol (MCP) is an open standard that lets AI assistants connect to external tools and data sources through a consistent protocol. Clients like Claude, Cursor, and VS Code load MCP servers that expose callable tools.',
    },
    {
      q: 'What is Influzer.ai?',
      a: `Influzer.ai is an MCP server directory and insights site. We catalog <strong>${registry} integrations</strong> (${indexed} with indexed, searchable tools), publish setup steps and connection URLs, and write executive guides on <a href="/insights">AI agents and operating systems</a>.`,
      aPlain: `Influzer.ai is an MCP server directory and insights site cataloging ${registry} integrations with searchable tools and executive AI guides.`,
    },
    {
      q: 'How do I find the right MCP server?',
      a: 'Start with the <a href="/mcp">Top 100 MCP servers</a> for curated picks with tool lists, or search the <a href="/mcp/all">full directory</a> by name, category, or tool. Each server page lists install commands, remote endpoints, and indexed tools where available.',
      aPlain:
        'Start with the Top 100 MCP servers for curated picks, or search the full directory by name, category, or tool.',
    },
    {
      q: 'What does “indexed tools” mean?',
      a: `We store the tool names and descriptions exposed by each MCP server (${indexed} servers today). That lets you search for capabilities like “search the web”, “create issue”, or “read spreadsheet” across the catalog — not just server names.`,
      aPlain:
        'Indexed tools are the callable tool names and descriptions we store for each MCP server so you can search by capability.',
    },
    {
      q: 'How often is the directory updated?',
      a: 'The registry is refreshed weekly from Glama, Smithery, and community sources. Tool lists are re-validated daily against live MCP endpoints and registry APIs. New submissions are reviewed via <a href="/mcp/submit">Submit an MCP server</a>.',
      aPlain:
        'The registry is refreshed weekly; tool lists are re-validated daily. New submissions are reviewed manually.',
    },
  ];

  return {
    introTitle: 'What is Influzer.ai?',
    introParagraphs: [
      `Influzer.ai helps developers and teams choose MCP servers for production AI workflows. Our directory lists <strong>${registry} Model Context Protocol servers</strong>, with <strong>${indexed}</strong> that include searchable tool indexes, setup instructions, and connection URLs.`,
      'Use the homepage search or browse the <a href="/mcp">Top 100</a> to compare servers for Claude, Cursor, and other MCP clients. Read <a href="/insights">Insights</a> for leadership playbooks on agents, compliance, and ROI.',
    ],
    faqs,
    crossLinkGroups: [
      {
        title: 'Explore the directory',
        links: [
          { href: '/mcp', label: 'Top 100 MCP servers', desc: 'Curated leaders with indexed tools' },
          { href: '/mcp/all', label: `Full directory (${registry})`, desc: 'Search every registered server' },
          { href: '/mcp/submit', label: 'Submit a server', desc: 'Suggest a listing we are missing' },
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
  const registry = heroStats.totalServers.toLocaleString();
  const indexed = heroStats.serversWithIndexedTools.toLocaleString();
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
          a: 'Open any server page (for example <a href="/mcp/webnode">Webnode</a> or <a href="/mcp/github">GitHub</a>) for install commands, remote MCP URLs, or GitHub README links. Local servers typically use <code>npx</code> or Docker; hosted servers provide an HTTPS endpoint to paste into your client settings.',
          aPlain:
            'Open a server detail page for install commands, remote MCP URLs, or GitHub README links.',
        },
        {
          q: 'Top 100 vs full directory — which should I use?',
          a: `Use <strong>Top 100</strong> (this page) to discover proven servers quickly. Use the <a href="/mcp/all">full directory (${registry} servers)</a> when you need a niche integration or want to filter all ${indexed} servers with indexed tools.`,
          aPlain: `Use Top 100 for proven servers; use the full directory (${registry} servers) for niche integrations.`,
        },
        {
          q: 'What are remote vs local MCP servers?',
          a: '<strong>Remote</strong> servers expose an HTTPS MCP endpoint (common on Smithery and hosted SaaS). <strong>Local</strong> servers run on your machine via stdio — typical for filesystem, GitHub CLI wrappers, and dev tools. Our cards label each server’s transport.',
          aPlain:
            'Remote servers use HTTPS endpoints; local servers run on your machine via stdio.',
        },
        {
          q: 'Missing a server?',
          a: 'Use <a href="/mcp/submit">Submit an MCP server</a> and we will review it manually. The registry also syncs weekly from Glama, Smithery, and community lists.',
          aPlain: 'Submit a server via our form; we review every suggestion manually.',
        },
      ]
    : [
        {
          q: 'What is the full MCP server directory?',
          a: `This page lists every MCP server in our registry (${registry} total, ${indexed} with indexed tools by default). Filter by category, sort by popularity or tool count, and open any server for setup steps.`,
          aPlain: `The full directory lists every MCP server in our registry (${registry} total).`,
        },
        {
          q: 'Why do some servers have no tools listed?',
          a: 'Tool indexes come from live MCP endpoints and registry APIs. Servers without indexed tools may be stdio-only, require authentication, or not yet validated. Toggle “Only show servers with indexed tools” to focus on searchable entries, or try the <a href="/mcp">Top 100</a> curated list.',
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
          `Need more than 100? Explore the <a href="/mcp/all">full directory</a> (${registry} servers, ${indexed} with searchable tools) or return to the <a href="/">Influzer.ai homepage</a> for insights and weekly digests.`,
        ]
      : [
          `Search all <strong>${registry} registered MCP servers</strong>. By default we show ${indexed} entries with indexed tool lists; uncheck the filter to see the entire registry.`,
          `New to MCP? Start with the curated <a href="/mcp">Top 100</a> or read our <a href="/insights">AI insights</a> on agents and workflows.`,
        ],
    faqs,
    crossLinkGroups: [
      {
        title: 'Directory pages',
        links: [
          { href: '/', label: 'Homepage', desc: 'Search and weekly digest' },
          { href: isTop ? '/mcp/all' : '/mcp', label: isTop ? `Full directory (${registry})` : 'Top 100 MCP servers', desc: isTop ? 'Every registered server' : 'Curated leaders' },
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
          { href: '/insights', label: 'Insights', desc: 'Executive AI playbooks' },
          { href: '/mcp/webnode', label: 'Webnode MCP', desc: 'Create websites from your agent' },
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
