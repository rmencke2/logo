/**
 * MCP category hub definitions — browse-intent SEO pages aligned with STANDARD_CATEGORIES.
 */

const { slugify } = require('../scripts/utils/normalize');

const MCP_CATEGORIES = [
  {
    slug: 'dev-tools',
    name: 'Dev Tools',
    title: 'Dev Tools MCP Servers',
    shortTitle: 'Dev Tools',
    metaDescription:
      'Browse MCP servers for developers — GitHub, IDE integrations, code search, testing, build tools, and agent-ready dev workflows.',
    intro:
      'Extend coding agents with repositories, terminals, test runners, and IDE hooks. Compare popular dev-tool MCP servers with indexed tool lists and setup steps.',
    chooseTips: [
      'Start with GitHub or filesystem servers when agents need repo context and local files.',
      'Prefer servers with indexed tool lists so you can search capabilities like “create PR” or “run test”.',
      'Match transport to your client — remote HTTPS for hosted SaaS, stdio for local CLI wrappers.',
    ],
    faqs: [
      {
        q: 'What are Dev Tools MCP servers?',
        a: 'Dev Tools MCP servers connect AI clients to developer workflows — code hosting, local files, build systems, test runners, and IDE integrations — through standardized MCP tools.',
        aPlain:
          'Dev Tools MCP servers connect AI clients to code hosting, files, builds, tests, and IDE workflows.',
      },
      {
        q: 'Which Dev Tools MCP servers are most popular?',
        a: 'Teams commonly start with <a href="/mcp/github">GitHub</a>, <a href="/mcp/filesystem">Filesystem</a>, and <a href="/mcp/context7">Context7</a>. Browse this category for the full ranked list from our catalog.',
        aPlain:
          'Popular Dev Tools MCP servers include GitHub, Filesystem, and Context7.',
      },
    ],
    relatedTopicSlugs: ['coding-agent-mcp', 'openapi-mcp'],
  },
  {
    slug: 'search-web',
    name: 'Search & Web',
    title: 'Search & Web MCP Servers',
    shortTitle: 'Search & Web',
    metaDescription:
      'Find MCP servers for web search, scraping, crawling, and live page retrieval — Firecrawl, Exa, Jina, browser tools, and more.',
    intro:
      'Ground agents in the live web. Compare search APIs, scrapers, crawlers, and browser-backed retrieval servers with tool indexes and connection URLs.',
    chooseTips: [
      'Use search-first servers (Exa, Brave) for research agents; scraping servers (Firecrawl) for URL → markdown pipelines.',
      'Check rate limits and whether JavaScript rendering is required for your target sites.',
      'Combine with our <a href="/mcp/topics/web-scraping-mcp">web scraping topic guide</a> for workflow-specific picks.',
    ],
    faqs: [
      {
        q: 'Search MCP vs web scraping MCP?',
        a: 'Search MCP returns ranked results and snippets for a query. Scraping MCP fetches and structures content from specific URLs. Many production stacks use both.',
        aPlain:
          'Search MCP answers queries with ranked results; scraping MCP extracts content from specific URLs.',
      },
    ],
    relatedTopicSlugs: ['web-scraping-mcp', 'browser-automation-mcp'],
  },
  {
    slug: 'databases',
    name: 'Databases',
    title: 'Database MCP Servers',
    shortTitle: 'Databases',
    metaDescription:
      'Compare MCP servers for databases — PostgreSQL, SQLite, Neon, Supabase, Redis, and SQL/NoSQL agents can query safely.',
    intro:
      'Let agents read and write structured data with guardrails. Browse database MCP servers by engine, transport, and indexed query tools.',
    chooseTips: [
      'Prefer read-only or scoped credentials for agent access to production data.',
      'Check whether the server exposes schema introspection tools agents need before writing SQL.',
      'Hosted database vendors (Neon, Supabase) often ship remote MCP endpoints — easier for cloud-first teams.',
    ],
    faqs: [
      {
        q: 'Are database MCP servers safe for production?',
        a: 'Treat agent database access like any automation: use least-privilege credentials, read-only roles where possible, and audit tool calls. Our pages list transport and setup so you can sandbox before prod.',
        aPlain:
          'Use least-privilege credentials and read-only roles; sandbox agent database access before production.',
      },
    ],
    relatedTopicSlugs: ['rag-mcp', 'coding-agent-mcp'],
  },
  {
    slug: 'design',
    name: 'Design',
    title: 'Design MCP Servers',
    shortTitle: 'Design',
    metaDescription:
      'MCP servers for design workflows — Figma, image generation, asset libraries, and creative tooling for AI agents.',
    intro:
      'Connect agents to design systems, mockups, and creative APIs. Compare design-category MCP servers with tool lists and install steps.',
    chooseTips: [
      'Figma and similar integrations excel when agents need component libraries or design tokens.',
      'Image-generation servers differ by model provider — check output format and rate limits.',
      'Pair design MCP with dev-tool servers when agents hand off specs to code.',
    ],
    faqs: [
      {
        q: 'What can design MCP servers do?',
        a: 'Design MCP servers expose tools for reading design files, exporting assets, generating images, or querying brand libraries — depending on the integration.',
        aPlain:
          'Design MCP servers expose tools for design files, assets, image generation, and brand libraries.',
      },
    ],
    relatedTopicSlugs: ['coding-agent-mcp'],
  },
  {
    slug: 'cloud-infra',
    name: 'Cloud & Infra',
    title: 'Cloud & Infrastructure MCP Servers',
    shortTitle: 'Cloud & Infra',
    metaDescription:
      'MCP servers for cloud and infrastructure — AWS, Kubernetes, Terraform, deployment, and observability hooks for AI agents.',
    intro:
      'Operate cloud resources from agent workflows. Browse infra MCP servers for provisioning, deploy pipelines, and platform APIs.',
    chooseTips: [
      'Infra MCP often needs cloud IAM roles — document which tools mutate vs read-only resources.',
      'Prefer official vendor servers when available for clearer auth and support.',
      'Combine with Security & Monitoring category servers for incident response agents.',
    ],
    faqs: [
      {
        q: 'Why use MCP for cloud infrastructure?',
        a: 'MCP gives agents a consistent tool interface for cloud APIs — list resources, trigger deploys, or fetch logs — without custom plugins per AI client.',
        aPlain:
          'MCP standardizes how agents call cloud APIs for listing resources, deploys, and logs.',
      },
    ],
    relatedTopicSlugs: ['coding-agent-mcp'],
  },
  {
    slug: 'communication',
    name: 'Communication',
    title: 'Communication MCP Servers',
    shortTitle: 'Communication',
    metaDescription:
      'MCP servers for team communication — Slack, email, chat, notifications, and messaging integrations for AI agents.',
    intro:
      'Let agents post updates, read channels, and trigger notifications. Compare communication MCP servers with indexed tools and setup guides.',
    chooseTips: [
      'Slack and similar servers usually require OAuth — plan workspace install before agent rollout.',
      'Check whether tools are read-only (search messages) vs write (post, react).',
      'Use separate bot tokens per environment to limit blast radius.',
    ],
    faqs: [
      {
        q: 'Can MCP servers send messages on my behalf?',
        a: 'Many communication MCP servers expose write tools (post message, create channel). Scope OAuth and tool permissions carefully — same as any chat bot integration.',
        aPlain:
          'Many communication MCP servers can post messages; scope OAuth and permissions like any chat bot.',
      },
    ],
    relatedTopicSlugs: ['coding-agent-mcp'],
  },
  {
    slug: 'data-analytics',
    name: 'Data & Analytics',
    title: 'Data & Analytics MCP Servers',
    shortTitle: 'Data & Analytics',
    metaDescription:
      'MCP servers for analytics, BI, spreadsheets, and data pipelines — query metrics and datasets from AI agents.',
    intro:
      'Query dashboards, warehouses, and spreadsheets through MCP. Browse analytics integrations with searchable tool indexes.',
    chooseTips: [
      'Spreadsheet MCP (Google Sheets, Airtable) is a common starting point for ops agents.',
      'Warehouse connectors differ by SQL dialect and auth — match your stack.',
      'Prefer servers that expose schema or column metadata tools for reliable agent queries.',
    ],
    faqs: [
      {
        q: 'Analytics MCP vs database MCP?',
        a: 'Overlap exists, but analytics servers often target BI products, spreadsheets, or metrics APIs rather than raw SQL engines. Pick based on where your data lives.',
        aPlain:
          'Analytics MCP targets BI and spreadsheets; database MCP targets SQL engines — choose by data source.',
      },
    ],
    relatedTopicSlugs: ['rag-mcp'],
  },
  {
    slug: 'security-monitoring',
    name: 'Security & Monitoring',
    title: 'Security & Monitoring MCP Servers',
    shortTitle: 'Security & Monitoring',
    metaDescription:
      'MCP servers for security, logging, and monitoring — Sentry, observability, alerts, and incident tooling for AI agents.',
    intro:
      'Investigate errors and monitor systems from agent workflows. Compare security and observability MCP servers with tool lists.',
    chooseTips: [
      'Sentry-style servers help agents triage stack traces and issue metadata.',
      'Separate read (search logs) from write (create incident, mute alert) permissions.',
      'Pair with Cloud & Infra servers for full incident-response stacks.',
    ],
    faqs: [
      {
        q: 'What monitoring data can agents access via MCP?',
        a: 'Depends on the server — common tools include search issues, fetch error details, list alerts, and query time-series metrics. Each server page lists indexed tools.',
        aPlain:
          'Monitoring MCP tools vary by server — issues, errors, alerts, and metrics are common.',
      },
    ],
    relatedTopicSlugs: ['coding-agent-mcp'],
  },
  {
    slug: 'payments-commerce',
    name: 'Payments & Commerce',
    title: 'Payments & Commerce MCP Servers',
    shortTitle: 'Payments & Commerce',
    metaDescription:
      'MCP servers for payments and commerce — Stripe, billing, orders, and e-commerce APIs agents can call safely.',
    intro:
      'Automate billing and commerce workflows through MCP. Browse payment integrations with setup steps and tool indexes.',
    chooseTips: [
      'Use test-mode API keys during agent development.',
      'Stripe and similar servers expose many tools — restrict which tools your client can call.',
      'Never pass live payment credentials into untrusted agent prompts.',
    ],
    faqs: [
      {
        q: 'Is it safe to connect Stripe via MCP?',
        a: 'Use restricted API keys, test mode, and client-side tool allowlists — same hygiene as any Stripe automation. Our <a href="/mcp/stripe">Stripe MCP page</a> lists indexed tools and setup.',
        aPlain:
          'Use restricted API keys and test mode when connecting Stripe via MCP.',
      },
    ],
    relatedTopicSlugs: [],
  },
  {
    slug: 'ai-memory',
    name: 'AI & Memory',
    title: 'AI & Memory MCP Servers',
    shortTitle: 'AI & Memory',
    metaDescription:
      'MCP servers for AI memory, embeddings, and model tooling — persistent context, vector stores, and agent memory layers.',
    intro:
      'Give agents long-term memory and model utilities. Compare memory, embedding, and AI-platform MCP servers from our catalog.',
    chooseTips: [
      'Session memory vs persistent knowledge bases serve different agent patterns.',
      'Vector-store servers pair well with RAG topic guides for retrieval stacks.',
      'Check embedding model and dimension requirements before connecting.',
    ],
    faqs: [
      {
        q: 'What is memory MCP?',
        a: 'Memory MCP servers store and retrieve context across conversations — facts, embeddings, or graph nodes — so agents do not lose state between sessions.',
        aPlain:
          'Memory MCP stores and retrieves context across conversations for persistent agent state.',
      },
    ],
    relatedTopicSlugs: ['rag-mcp'],
  },
  {
    slug: 'files-docs',
    name: 'Files & Docs',
    title: 'Files & Docs MCP Servers',
    shortTitle: 'Files & Docs',
    metaDescription:
      'MCP servers for files and documents — PDF, Notion, Google Drive, filesystem, and doc extraction for AI agents.',
    intro:
      'Read, search, and transform documents through MCP. Browse filesystem, PDF, and knowledge-base servers with indexed tools.',
    chooseTips: [
      'Filesystem MCP is the default for local code and markdown workflows.',
      'PDF servers differ on OCR, table extraction, and page limits.',
      'Notion and Drive integrations need OAuth — plan workspace access up front.',
    ],
    faqs: [
      {
        q: 'Filesystem MCP vs cloud doc MCP?',
        a: 'Filesystem servers read local paths (great for dev machines). Cloud doc servers (Notion, Drive) target shared team knowledge. Many agents use both.',
        aPlain:
          'Filesystem MCP reads local files; cloud doc MCP targets shared team knowledge bases.',
      },
    ],
    relatedTopicSlugs: ['pdf-mcp', 'rag-mcp'],
  },
  {
    slug: 'automation',
    name: 'Automation',
    title: 'Automation MCP Servers',
    shortTitle: 'Automation',
    metaDescription:
      'MCP servers for workflow automation — Zapier-style hooks, schedulers, RPA, and multi-step agent orchestration.',
    intro:
      'Chain tools and trigger workflows from agents. Compare automation MCP servers for integrations, triggers, and orchestration.',
    chooseTips: [
      'Automation servers vary widely — verify whether tools call external APIs or run local scripts.',
      'Prefer idempotent tools when agents may retry failed steps.',
      'Combine with Communication servers when workflows need human-in-the-loop alerts.',
    ],
    faqs: [
      {
        q: 'How is automation MCP different from dev tools MCP?',
        a: 'Automation MCP focuses on cross-system workflows (CRM updates, scheduled jobs, multi-app triggers). Dev tools MCP focuses on code and repos. Categories overlap at the edges.',
        aPlain:
          'Automation MCP targets cross-system workflows; dev tools MCP targets code and repositories.',
      },
    ],
    relatedTopicSlugs: ['browser-automation-mcp'],
  },
];

function getAllMcpCategories() {
  return MCP_CATEGORIES;
}

function getMcpCategoryBySlug(slug) {
  return MCP_CATEGORIES.find((c) => c.slug === slug) || null;
}

function getMcpCategoryByName(name) {
  return MCP_CATEGORIES.find((c) => c.name === name) || null;
}

function categorySlugFromName(name) {
  const found = getMcpCategoryByName(name);
  if (found) return found.slug;
  return slugify(name);
}

function getMcpCategorySeoContent(category, serverCount) {
  const others = MCP_CATEGORIES.filter((c) => c.slug !== category.slug).slice(0, 5);
  return {
    introTitle: `Browse ${category.shortTitle} MCP servers`,
    introParagraphs: [category.intro],
    faqs: category.faqs,
    crossLinkGroups: [
      {
        title: 'Other categories',
        links: others.map((c) => ({
          href: `/mcp/categories/${c.slug}`,
          label: c.shortTitle,
          desc: c.metaDescription.slice(0, 80) + '…',
        })),
      },
      {
        title: 'Directory',
        links: [
          { href: '/mcp', label: 'Top 100 MCP servers', desc: 'Curated leaders with indexed tools' },
          {
            href: `/mcp/all?category=${encodeURIComponent(category.name)}`,
            label: `All ${category.shortTitle} servers`,
            desc: `${serverCount.toLocaleString()} in this category`,
          },
          { href: '/mcp/topics', label: 'Topic guides', desc: 'Workflow-focused MCP comparisons' },
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
    ],
  };
}

function getMcpCategoriesIndexSeoContent() {
  return {
    introTitle: 'Browse MCP servers by category',
    introParagraphs: [
      'Twelve category hubs for browse-intent search — dev tools, databases, search & web, communication, and more. Each page lists ranked servers from our catalog with indexed tools and setup links.',
      'Looking for workflow guides instead? See <a href="/mcp/topics">MCP topic guides</a> for browser automation, RAG, and coding-agent stacks.',
    ],
    faqs: [
      {
        q: 'How are MCP categories assigned?',
        a: 'We map each server to one of twelve standard categories during catalog refresh — using registry metadata, descriptions, and tool names. Open any server page to see its category.',
        aPlain:
          'Each server is mapped to one of twelve standard categories during catalog refresh.',
      },
      {
        q: 'Categories vs topic guides?',
        a: 'Categories group servers by product type (e.g. Databases). <a href="/mcp/topics">Topic guides</a> curate by workflow (e.g. RAG, browser QA) using capability matching across categories.',
        aPlain:
          'Categories group by product type; topic guides curate by workflow and capability.',
      },
    ],
    crossLinkGroups: [
      {
        title: 'Categories',
        links: MCP_CATEGORIES.map((c) => ({
          href: `/mcp/categories/${c.slug}`,
          label: c.shortTitle,
          desc: c.intro.slice(0, 90) + '…',
        })),
      },
      {
        title: 'Directory',
        links: [
          { href: '/mcp', label: 'Top 100 MCP servers', desc: 'Curated ranking with tool lists' },
          { href: '/mcp/all', label: 'Full directory', desc: 'Search every server by tool or name' },
          { href: '/mcp/topics', label: 'Topic guides', desc: 'Browser automation, RAG, PDF, coding agents' },
          { href: '/mcp/compare', label: 'Comparisons', desc: 'Head-to-head MCP matchups' },
        ],
      },
    ],
  };
}

module.exports = {
  MCP_CATEGORIES,
  getAllMcpCategories,
  getMcpCategoryBySlug,
  getMcpCategoryByName,
  categorySlugFromName,
  getMcpCategorySeoContent,
  getMcpCategoriesIndexSeoContent,
};
