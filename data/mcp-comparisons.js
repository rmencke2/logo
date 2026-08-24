/**
 * Curated MCP head-to-head comparison pages — editorial copy plus catalog stats.
 * Only pairs whose both slugs resolve in the live directory are published.
 */

const MCP_COMPARISONS = [
  {
    slug: 'firecrawl-vs-exa',
    leftSlug: 'firecrawl',
    rightSlug: 'exa',
    title: 'Firecrawl vs Exa MCP',
    shortTitle: 'Firecrawl vs Exa',
    metaDescription:
      'Compare Firecrawl and Exa MCP servers — scrape-to-markdown vs neural web search for AI agents, with tools, transport, and setup.',
    intro:
      'Both servers put the live web in an agent’s tool belt, but they solve different jobs. Firecrawl turns URLs into clean markdown. Exa searches the web and returns ranked, LLM-ready results.',
    verdict:
      'Choose Firecrawl when you already have URLs and need page content. Choose Exa when the agent must find sources first. Many production research agents run both: Exa to discover, Firecrawl to extract.',
    chooseLeft: [
      'You have known URLs or sitemaps and need markdown, HTML, or crawl maps.',
      'The workflow is scrape → chunk → embed, not “search the internet.”',
      'You care about site mapping and multi-page crawls more than ranking.',
    ],
    chooseRight: [
      'The agent starts from a question, not a URL.',
      'You want semantic / neural search instead of a generic SERP dump.',
      'You need fewer hops: query in, cited snippets out.',
    ],
    rows: [
      { label: 'Primary job', left: 'URL → clean page content', right: 'Query → ranked web results' },
      { label: 'Typical workflow', left: 'Scrape, crawl, map a domain', right: 'Research, cite, discover sources' },
      { label: 'Best paired with', left: 'A search server (Exa, Brave)', right: 'A scraper (Firecrawl) for full pages' },
    ],
    faqs: [
      {
        q: 'Is Firecrawl MCP the same as Exa MCP?',
        a: 'No. <a href="/mcp/firecrawl">Firecrawl</a> extracts content from URLs. <a href="/mcp/exa">Exa</a> searches the web. Use Firecrawl when you know the page; use Exa when you need to find it.',
        aPlain: 'Firecrawl extracts content from URLs. Exa searches the web. They complement rather than replace each other.',
      },
      {
        q: 'Can I use Firecrawl and Exa together?',
        a: 'Yes. A common pattern is Exa for discovery, then Firecrawl to pull full markdown from the top results. Our <a href="/mcp/topics/web-scraping-mcp">web scraping topic guide</a> covers that stack.',
        aPlain: 'Yes — Exa for discovery, Firecrawl for full-page extraction is a common agent stack.',
      },
    ],
    relatedSlugs: ['firecrawl-vs-brave-search', 'playwright-vs-chrome-devtools-mcp'],
    relatedTopicSlugs: ['web-scraping-mcp', 'browser-automation-mcp'],
  },
  {
    slug: 'firecrawl-vs-brave-search',
    leftSlug: 'firecrawl',
    rightSlug: 'brave-search',
    title: 'Firecrawl vs Brave Search MCP',
    shortTitle: 'Firecrawl vs Brave Search',
    metaDescription:
      'Compare Firecrawl and Brave Search MCP — crawling and page extraction vs privacy-oriented web search for AI agents.',
    intro:
      'Brave Search answers “what is out there?” Firecrawl answers “what is on this page?” Pick based on whether the agent needs a search index or a scraper.',
    verdict:
      'Brave Search is the lighter default for current-events questions. Firecrawl is the right tool when you must read a specific site thoroughly. They are not substitutes.',
    chooseLeft: [
      'You need crawl depth, site maps, or LLM-ready markdown from known URLs.',
      'Search snippets are not enough — you need the full page.',
      'You are building a documentation or competitive-intel pipeline.',
    ],
    chooseRight: [
      'You want a general web search tool with a simple API.',
      'Privacy / independent index matters more than crawl control.',
      'The agent only needs titles, URLs, and snippets.',
    ],
    rows: [
      { label: 'Primary job', left: 'Scrape and crawl pages', right: 'Web and local search' },
      { label: 'Input', left: 'URL or domain', right: 'Search query' },
      { label: 'Output', left: 'Markdown / crawl graph', right: 'Ranked results and snippets' },
    ],
    faqs: [
      {
        q: 'Brave Search MCP vs Firecrawl MCP — which for research agents?',
        a: 'Start with <a href="/mcp/brave-search">Brave Search</a> to find sources, then <a href="/mcp/firecrawl">Firecrawl</a> if you need the full page. For semantic search, compare <a href="/mcp/compare/firecrawl-vs-exa">Firecrawl vs Exa</a>.',
        aPlain: 'Use Brave Search to find sources and Firecrawl when you need the full page.',
      },
    ],
    relatedSlugs: ['firecrawl-vs-exa'],
    relatedTopicSlugs: ['web-scraping-mcp'],
  },
  {
    slug: 'playwright-vs-chrome-devtools-mcp',
    leftSlug: 'playwright',
    rightSlug: 'chrome-devtools-mcp',
    title: 'Playwright vs Chrome DevTools MCP',
    shortTitle: 'Playwright vs Chrome DevTools',
    metaDescription:
      'Compare Playwright MCP and Chrome DevTools MCP — browser automation, screenshots, and debugging tools for coding agents.',
    intro:
      'Both give agents a real browser. Playwright MCP is built for repeatable automation (navigate, click, snapshot). Chrome DevTools MCP exposes debugging surfaces — performance, console, network — closer to what a developer uses in DevTools.',
    verdict:
      'Use Playwright for QA, scraping JS-heavy pages, and multi-step UI flows. Use Chrome DevTools MCP when the agent is diagnosing a web app, not just driving it. Overlap exists on screenshots and navigation.',
    chooseLeft: [
      'You need stable, scriptable browser actions across Chromium/Firefox/WebKit.',
      'The job is E2E testing, form filling, or visual snapshots.',
      'You already think in Playwright locators and test-style flows.',
    ],
    chooseRight: [
      'The agent is debugging an existing Chrome session.',
      'You care about console, network, or performance traces.',
      'You want DevTools-native APIs rather than a test runner.',
    ],
    rows: [
      { label: 'Mental model', left: 'Test / automation runner', right: 'In-browser DevTools' },
      { label: 'Strength', left: 'Multi-step UI flows', right: 'Diagnostics and traces' },
      { label: 'Typical user', left: 'QA and scraping agents', right: 'Coding agents fixing web apps' },
    ],
    faqs: [
      {
        q: 'Should I install Playwright MCP or Chrome DevTools MCP?',
        a: 'Install <a href="/mcp/playwright">Playwright</a> for driving pages. Install <a href="/mcp/chrome-devtools-mcp">Chrome DevTools MCP</a> for inspecting a page the way a developer would. See our <a href="/mcp/topics/browser-automation-mcp">browser automation guide</a>.',
        aPlain: 'Playwright is for driving pages; Chrome DevTools MCP is for inspecting and debugging them.',
      },
    ],
    relatedSlugs: ['firecrawl-vs-exa', 'e2b-vs-replit'],
    relatedTopicSlugs: ['browser-automation-mcp', 'coding-agent-mcp'],
  },
  {
    slug: 'postgres-vs-neon',
    leftSlug: 'postgres',
    rightSlug: 'neon',
    title: 'PostgreSQL vs Neon MCP',
    shortTitle: 'Postgres vs Neon',
    metaDescription:
      'Compare PostgreSQL MCP and Neon MCP — self-hosted SQL access vs serverless Postgres for AI agents.',
    intro:
      'Both speak SQL against Postgres. The Postgres MCP server is the generic driver for any cluster you already run. Neon MCP targets Neon’s serverless Postgres (branches, connection strings, cloud project APIs).',
    verdict:
      'If you have a DATABASE_URL to an existing Postgres, the generic Postgres MCP is enough. If you live in Neon (branching, preview DBs, autosuspend), the Neon server exposes product-specific tools the generic driver will not.',
    chooseLeft: [
      'You connect to RDS, Cloud SQL, self-hosted, or any Postgres URL.',
      'You only need query + schema inspection.',
      'You want one MCP server that is not vendor-specific.',
    ],
    chooseRight: [
      'Your database is on Neon and you use branches or preview environments.',
      'Agents should create/list projects or connection details, not only run SQL.',
      'You want Neon’s auth and cloud workflow in the tool list.',
    ],
    rows: [
      { label: 'Scope', left: 'Any PostgreSQL instance', right: 'Neon serverless Postgres' },
      { label: 'SQL queries', left: 'Yes', right: 'Yes (plus Neon APIs)' },
      { label: 'Vendor lock-in', left: 'None', right: 'Neon-specific tools' },
    ],
    faqs: [
      {
        q: 'Can Neon MCP replace PostgreSQL MCP?',
        a: 'For query-only agents on a Neon database, either works. Use <a href="/mcp/neon">Neon MCP</a> when you need Neon platform tools; use <a href="/mcp/postgres">PostgreSQL MCP</a> for any Postgres URL, including Neon’s.',
        aPlain: 'Query-only agents can use either. Neon MCP adds Neon platform tools; PostgreSQL MCP works with any Postgres URL.',
      },
    ],
    relatedSlugs: ['postgres-vs-supabase', 'postgres-vs-sqlite'],
    relatedTopicSlugs: ['rag-mcp', 'coding-agent-mcp'],
  },
  {
    slug: 'postgres-vs-supabase',
    leftSlug: 'postgres',
    rightSlug: 'supabase',
    title: 'PostgreSQL vs Supabase MCP',
    shortTitle: 'Postgres vs Supabase',
    metaDescription:
      'Compare PostgreSQL MCP and Supabase MCP — raw SQL vs Supabase platform tools (auth, storage, projects) for agents.',
    intro:
      'Supabase is Postgres plus a platform. The generic PostgreSQL MCP talks SQL. Supabase MCP reaches project APIs — tables, yes, but also the surrounding product surface.',
    verdict:
      'Stay on PostgreSQL MCP for warehouse-style SQL against any host. Switch to Supabase MCP when the agent should manage a Supabase project, not just query a database.',
    chooseLeft: [
      'You already have a Postgres connection string (including Supabase’s).',
      'The agent should only run SQL with least-privilege credentials.',
      'You do not need Auth, Storage, or project admin tools.',
    ],
    chooseRight: [
      'The workflow is “operate this Supabase project,” not “run SQL.”',
      'You want platform tools alongside table access.',
      'Your team standardizes on Supabase locally and in prod.',
    ],
    rows: [
      { label: 'Core capability', left: 'SQL against Postgres', right: 'Supabase platform + data' },
      { label: 'Works with non-Supabase DBs', left: 'Yes', right: 'No' },
      { label: 'Project admin tools', left: 'No', right: 'Yes (vendor APIs)' },
    ],
    faqs: [
      {
        q: 'Should I point PostgreSQL MCP at Supabase?',
        a: 'You can — Supabase exposes a Postgres URL. Use <a href="/mcp/supabase">Supabase MCP</a> when agents need platform actions beyond SQL. Compare also <a href="/mcp/compare/postgres-vs-neon">Postgres vs Neon</a>.',
        aPlain: 'Yes for SQL-only access. Use Supabase MCP when agents need platform actions beyond SQL.',
      },
    ],
    relatedSlugs: ['postgres-vs-neon', 'postgres-vs-sqlite'],
    relatedTopicSlugs: ['rag-mcp'],
  },
  {
    slug: 'postgres-vs-sqlite',
    leftSlug: 'postgres',
    rightSlug: 'sqlite',
    title: 'PostgreSQL vs SQLite MCP',
    shortTitle: 'Postgres vs SQLite',
    metaDescription:
      'Compare PostgreSQL MCP and SQLite MCP — server databases vs local files for agent SQL workflows.',
    intro:
      'SQLite MCP is a file on disk. PostgreSQL MCP is a network service. Choose based on where the data lives and whether multiple agents need concurrent writes.',
    verdict:
      'SQLite is the right default for local coding agents, notebooks, and single-user tools. PostgreSQL is the right default for shared app data, production analytics, and anything that already runs in the cloud.',
    chooseLeft: [
      'Data is shared, hosted, or already in Postgres.',
      'You need roles, extensions, or concurrent writers.',
      'The agent is operating a product database, not a scratch file.',
    ],
    chooseRight: [
      'The database is a local .sqlite file next to the repo.',
      'You want zero ops and no connection string.',
      'The agent is exploring a dataset, not serving users.',
    ],
    rows: [
      { label: 'Deployment', left: 'Server / managed Postgres', right: 'Local file' },
      { label: 'Concurrency', left: 'Multi-writer, networked', right: 'Single-file, local' },
      { label: 'Ops overhead', left: 'Credentials and network', right: 'A filesystem path' },
    ],
    faqs: [
      {
        q: 'Which SQL MCP should a Cursor agent use first?',
        a: 'If the repo has a SQLite file, use <a href="/mcp/sqlite">SQLite MCP</a>. If the app already uses Postgres, use <a href="/mcp/postgres">PostgreSQL MCP</a> with a read-only user.',
        aPlain: 'Use SQLite MCP for local files; PostgreSQL MCP for hosted app databases with a read-only user.',
      },
    ],
    relatedSlugs: ['postgres-vs-neon', 'postgres-vs-supabase'],
    relatedTopicSlugs: ['coding-agent-mcp'],
  },
  {
    slug: 'linear-vs-jira',
    leftSlug: 'linear',
    rightSlug: 'jira',
    title: 'Linear vs Jira MCP',
    shortTitle: 'Linear vs Jira',
    metaDescription:
      'Compare Linear MCP and Jira MCP — issue tracking tools for coding agents, including tickets, projects, and workflow APIs.',
    intro:
      'Both servers let agents read and write work items. Linear MCP fits product teams on Linear. Jira MCP fits organizations whose source of truth is Jira (often with Confluence and Atlassian cloud).',
    verdict:
      'Match the MCP to the tracker you already use. Migrating issue systems for the sake of MCP is backwards. If you run both, install both and scope tool access per agent.',
    chooseLeft: [
      'Your team already plans in Linear.',
      'You want a lighter issue model (issues, projects, cycles).',
      'Agents triage bugs from Cursor/Claude into Linear.',
    ],
    chooseRight: [
      'Jira is the company standard (enterprise workflows, custom fields).',
      'You need Jira-specific issue types, boards, or JQL-style search.',
      'You also use other Atlassian MCP servers (Confluence).',
    ],
    rows: [
      { label: 'Home turf', left: 'Linear workspaces', right: 'Jira Cloud / Data Center' },
      { label: 'Issue model', left: 'Issues, projects, cycles', right: 'Issues, projects, boards, custom fields' },
      { label: 'Common stack', left: 'Linear + GitHub/GitLab', right: 'Jira + Confluence + Bitbucket' },
    ],
    faqs: [
      {
        q: 'Linear MCP or Jira MCP for coding agents?',
        a: 'Use the tracker your team already files bugs in. See <a href="/mcp/linear">Linear</a> and <a href="/mcp/jira">Jira</a> server pages for indexed tools, and <a href="/mcp/topics/coding-agent-mcp">coding-agent MCP</a> for starter stacks.',
        aPlain: 'Use whichever issue tracker your team already files bugs in.',
      },
    ],
    relatedSlugs: ['notion-vs-confluence', 'sentry-vs-datadog'],
    relatedTopicSlugs: ['coding-agent-mcp'],
  },
  {
    slug: 'notion-vs-confluence',
    leftSlug: 'notion',
    rightSlug: 'confluence',
    title: 'Notion vs Confluence MCP',
    shortTitle: 'Notion vs Confluence',
    metaDescription:
      'Compare Notion MCP and Confluence MCP — knowledge-base tools for AI agents that read and write team docs.',
    intro:
      'Notion MCP connects agents to Notion pages and databases. Confluence MCP connects them to Atlassian spaces. The protocol is the same; the permission model and information architecture are not.',
    verdict:
      'Pick the wiki you already search on Monday morning. Notion wins for startups with databases-as-docs. Confluence wins where Jira and Atlassian Cloud are already the system of record.',
    chooseLeft: [
      'Team knowledge lives in Notion (wikis, specs, lightweight databases).',
      'You want agents to query Notion databases, not only pages.',
      'You are not standardized on Atlassian.',
    ],
    chooseRight: [
      'Confluence is the official internal docs home.',
      'You already use Jira MCP and want the same vendor cloud.',
      'Spaces, labels, and Atlassian permissions are non-negotiable.',
    ],
    rows: [
      { label: 'Docs model', left: 'Pages + Notion databases', right: 'Spaces + pages' },
      { label: 'Typical org', left: 'Startups, product teams', right: 'Atlassian-standardized companies' },
      { label: 'Pairs well with', left: 'Linear, Slack, GitHub', right: 'Jira MCP, Atlassian cloud' },
    ],
    faqs: [
      {
        q: 'Can an agent use Notion MCP and Confluence MCP together?',
        a: 'Yes, if knowledge is split. Scope each server’s write tools tightly. Browse <a href="/mcp/categories/communication">communication MCP servers</a> for related connectors.',
        aPlain: 'Yes, if docs are split across both. Restrict write tools on each server.',
      },
    ],
    relatedSlugs: ['linear-vs-jira', 'google-drive-vs-dropbox'],
    relatedTopicSlugs: ['rag-mcp'],
  },
  {
    slug: 'sentry-vs-datadog',
    leftSlug: 'sentry',
    rightSlug: 'datadog',
    title: 'Sentry vs Datadog MCP',
    shortTitle: 'Sentry vs Datadog',
    metaDescription:
      'Compare Sentry MCP and Datadog MCP — error tracking vs full-stack observability tools for incident-response agents.',
    intro:
      'Sentry MCP is issue-centric: stack traces, releases, suspect commits. Datadog MCP is telemetry-centric: metrics, logs, monitors. Agents can use both during an incident — they are not the same layer.',
    verdict:
      'Reach for Sentry when the question is “what exception, which release, which user.” Reach for Datadog when the question is “is the service red, what did latency do, which monitor fired.”',
    chooseLeft: [
      'You triage application errors and regressions.',
      'You care about stack traces, breadcrumbs, and release tracking.',
      'The agent’s job is “open the Sentry issue and explain the crash.”',
    ],
    chooseRight: [
      'You operate infrastructure and SLOs, not only app exceptions.',
      'You need metrics, logs, and monitors in one vendor.',
      'The agent’s job is “why is p95 up and which monitor is alerting.”',
    ],
    rows: [
      { label: 'Center of gravity', left: 'Application errors', right: 'Metrics, logs, monitors' },
      { label: 'Typical question', left: 'What threw, in which release?', right: 'Is the system healthy right now?' },
      { label: 'Also consider', left: 'Pair with GitHub/GitLab for PRs', right: 'Pair with cloud infra MCP servers' },
    ],
    faqs: [
      {
        q: 'Sentry MCP vs Datadog MCP for on-call agents?',
        a: 'Use <a href="/mcp/sentry">Sentry</a> for exception forensics and <a href="/mcp/datadog">Datadog</a> for live telemetry. See <a href="/mcp/categories/security-monitoring">Security & Monitoring MCP servers</a>.',
        aPlain: 'Sentry for exception forensics; Datadog for live metrics, logs, and monitors.',
      },
    ],
    relatedSlugs: ['linear-vs-jira', 'docker-vs-kubernetes'],
    relatedTopicSlugs: ['coding-agent-mcp'],
  },
  {
    slug: 'memory-vs-mem0',
    leftSlug: 'memory',
    rightSlug: 'mem0',
    title: 'Memory vs Mem0 MCP',
    shortTitle: 'Memory vs Mem0',
    metaDescription:
      'Compare Memory MCP and Mem0 MCP — local knowledge graphs vs hosted long-term memory for AI agents.',
    intro:
      'The reference Memory MCP stores entities and relations locally (a knowledge graph the agent maintains). Mem0 MCP is a productized memory layer — hosted recall across sessions and users.',
    verdict:
      'Use Memory MCP when you want a simple, local, inspectable graph with no vendor. Use Mem0 when you need durable, multi-session memory as a service with their APIs and data model.',
    chooseLeft: [
      'You want the official-style knowledge graph on disk.',
      'Memory should stay in your environment (stdio, local file).',
      'The agent’s memory needs are small and inspectable.',
    ],
    chooseRight: [
      'You need hosted, cross-session memory for users or agents.',
      'You want Mem0’s retrieval APIs rather than a DIY graph.',
      'Multiple clients should share the same memory backend.',
    ],
    rows: [
      { label: 'Deployment', left: 'Local knowledge graph', right: 'Hosted memory service' },
      { label: 'Best for', left: 'Single-agent, inspectable state', right: 'Productized long-term memory' },
      { label: 'Ops', left: 'A local store', right: 'Mem0 account and API' },
    ],
    faqs: [
      {
        q: 'Is Mem0 a drop-in replacement for Memory MCP?',
        a: 'No. Tool names and data models differ. Read <a href="/mcp/memory">Memory</a> and <a href="/mcp/mem0">Mem0</a> tool lists before swapping. See the <a href="/mcp/topics/rag-mcp">RAG MCP guide</a>.',
        aPlain: 'No — tool names and data models differ. Compare the indexed tools before swapping.',
      },
    ],
    relatedSlugs: ['postgres-vs-sqlite', 'e2b-vs-replit'],
    relatedTopicSlugs: ['rag-mcp'],
  },
  {
    slug: 'figma-vs-canva',
    leftSlug: 'figma',
    rightSlug: 'canva',
    title: 'Figma vs Canva MCP',
    shortTitle: 'Figma vs Canva',
    metaDescription:
      'Compare Figma MCP and Canva MCP — design-file and brand-asset tools for AI agents in product vs marketing workflows.',
    intro:
      'Figma MCP is for product design files — components, frames, design systems. Canva MCP is for marketing and brand kits — templates, exports, campaign assets. Both are “design,” different users.',
    verdict:
      'Coding agents that implement UI should talk to Figma. Content and growth agents that produce social/docs assets should talk to Canva. Installing both is reasonable on mixed teams.',
    chooseLeft: [
      'The source of truth is a Figma file or design system.',
      'Agents need component/frame context to write UI.',
      'You are in a product/engineering workflow.',
    ],
    chooseRight: [
      'The source of truth is Canva brand kits and templates.',
      'The output is marketing creatives, not production UI.',
      'Non-designers are the primary users of the files.',
    ],
    rows: [
      { label: 'Home user', left: 'Product designers + engineers', right: 'Marketers + brand teams' },
      { label: 'Typical artifact', left: 'UI frames and components', right: 'Templates and exports' },
      { label: 'Pairs with', left: 'GitHub, Playwright', right: 'Drive, Notion, Slack' },
    ],
    faqs: [
      {
        q: 'Figma MCP or Canva MCP for a coding agent?',
        a: 'Usually <a href="/mcp/figma">Figma</a>. Use <a href="/mcp/canva">Canva</a> when the agent is producing campaign assets. Browse <a href="/mcp/categories/design">Design MCP servers</a>.',
        aPlain: 'Coding agents usually want Figma. Canva is for campaign and brand-kit assets.',
      },
    ],
    relatedSlugs: ['playwright-vs-chrome-devtools-mcp', 'notion-vs-confluence'],
    relatedTopicSlugs: ['coding-agent-mcp'],
  },
  {
    slug: 'docker-vs-kubernetes',
    leftSlug: 'docker',
    rightSlug: 'kubernetes',
    title: 'Docker vs Kubernetes MCP',
    shortTitle: 'Docker vs Kubernetes',
    metaDescription:
      'Compare Docker MCP and Kubernetes MCP — local containers vs cluster orchestration tools for AI ops agents.',
    intro:
      'Docker MCP operates the local engine (images, containers, compose). Kubernetes MCP operates a cluster (workloads, pods, deployments). Agents that “just run the app locally” do not need Kubernetes tools.',
    verdict:
      'Start with Docker MCP on developer machines. Add Kubernetes MCP when the agent’s job is cluster state — rollouts, pods, logs in a namespace — not docker compose up.',
    chooseLeft: [
      'The agent builds/runs containers on a laptop or CI runner.',
      'You use Docker Compose, not a cluster, for this workflow.',
      'You need image and container lifecycle tools.',
    ],
    chooseRight: [
      'The agent must inspect or change cluster resources.',
      'On-call workflows need kubectl-shaped tools via MCP.',
      'You already have kubeconfig and RBAC to scope the agent.',
    ],
    rows: [
      { label: 'Control plane', left: 'Docker Engine', right: 'Kubernetes API' },
      { label: 'Typical commands', left: 'build, run, compose', right: 'get, logs, rollout' },
      { label: 'Risk if over-permissioned', left: 'Local containers', right: 'Cluster mutations' },
    ],
    faqs: [
      {
        q: 'Do I need both Docker MCP and Kubernetes MCP?',
        a: 'Only if the agent works locally and in-cluster. Otherwise install one. See <a href="/mcp/docker">Docker</a>, <a href="/mcp/kubernetes">Kubernetes</a>, and <a href="/mcp/categories/cloud-infra">Cloud & Infra MCP servers</a>.',
        aPlain: 'Only if the agent works both locally and in-cluster. Otherwise install one.',
      },
    ],
    relatedSlugs: ['aws-vs-azure', 'e2b-vs-replit'],
    relatedTopicSlugs: ['coding-agent-mcp'],
  },
  {
    slug: 'google-drive-vs-dropbox',
    leftSlug: 'google-drive',
    rightSlug: 'dropbox',
    title: 'Google Drive vs Dropbox MCP',
    shortTitle: 'Drive vs Dropbox',
    metaDescription:
      'Compare Google Drive MCP and Dropbox MCP — cloud file tools for agents that search, read, and organize documents.',
    intro:
      'Both servers expose cloud files to agents. Drive MCP sits in Google Workspace (Docs, Sheets adjacency). Dropbox MCP sits in Dropbox’s file tree and sharing model. Pick the drive your company already uses.',
    verdict:
      'There is little reason to dual-install unless files are truly split. Match MCP to the identity provider and share links employees already click.',
    chooseLeft: [
      'Files live in Google Workspace.',
      'You also use Gmail / Calendar / Sheets MCP servers.',
      'Sharing and permissions follow Google accounts.',
    ],
    chooseRight: [
      'The company standard is Dropbox.',
      'You need Dropbox-specific sharing and folder tools.',
      'You are not on Google Workspace for files.',
    ],
    rows: [
      { label: 'Ecosystem', left: 'Google Workspace', right: 'Dropbox' },
      { label: 'Identity', left: 'Google accounts', right: 'Dropbox accounts' },
      { label: 'Pairs with', left: 'Gmail, Calendar, Sheets', right: 'Other file/docs MCP servers' },
    ],
    faqs: [
      {
        q: 'Which file MCP should I add to Claude or Cursor?',
        a: 'Add the provider where the files already are. See <a href="/mcp/google-drive">Google Drive</a>, <a href="/mcp/dropbox">Dropbox</a>, and <a href="/mcp/categories/files-docs">Files & Docs MCP servers</a>.',
        aPlain: 'Add the cloud drive where your files already live.',
      },
    ],
    relatedSlugs: ['notion-vs-confluence', 'figma-vs-canva'],
    relatedTopicSlugs: ['rag-mcp', 'pdf-mcp'],
  },
  {
    slug: 'e2b-vs-replit',
    leftSlug: 'e2b',
    rightSlug: 'replit',
    title: 'E2B vs Replit MCP',
    shortTitle: 'E2B vs Replit',
    metaDescription:
      'Compare E2B MCP and Replit MCP — cloud sandboxes vs Replit projects for agents that run code outside your laptop.',
    intro:
      'E2B MCP gives agents ephemeral sandboxes for executing untrusted or heavy code. Replit MCP talks to Replit projects and the Replit environment. Both move compute off localhost; the product surfaces differ.',
    verdict:
      'Use E2B when the agent must run code in a disposable sandbox (eval, tools, untrusted snippets). Use Replit when the work is a Replit app — files, deploys, and that platform’s workflow.',
    chooseLeft: [
      'You need short-lived, isolated code execution.',
      'The agent generates code that should not run on the developer machine.',
      'You want sandbox primitives, not an IDE project.',
    ],
    chooseRight: [
      'The artifact is a Replit project you already use.',
      'You want Replit-specific project and deploy tools.',
      'The team’s runtime is Replit, not a generic sandbox.',
    ],
    rows: [
      { label: 'Unit of work', left: 'Ephemeral sandbox', right: 'Replit project' },
      { label: 'Best for', left: 'Untrusted / generated code exec', right: 'Building and shipping on Replit' },
      { label: 'Vendor', left: 'E2B', right: 'Replit' },
    ],
    faqs: [
      {
        q: 'E2B MCP vs Replit MCP for coding agents?',
        a: 'Pick <a href="/mcp/e2b">E2B</a> for sandboxed execution and <a href="/mcp/replit">Replit</a> for Replit-hosted apps. See the <a href="/mcp/topics/coding-agent-mcp">coding-agent topic guide</a>.',
        aPlain: 'E2B is for sandboxed execution; Replit MCP is for Replit-hosted projects.',
      },
    ],
    relatedSlugs: ['playwright-vs-chrome-devtools-mcp', 'docker-vs-kubernetes'],
    relatedTopicSlugs: ['coding-agent-mcp'],
  },
  {
    slug: 'aws-vs-azure',
    leftSlug: 'aws',
    rightSlug: 'azure',
    title: 'AWS vs Azure MCP',
    shortTitle: 'AWS vs Azure',
    metaDescription:
      'Compare AWS MCP and Azure MCP — cloud-provider tools for agents that list resources, inspect accounts, and operate infrastructure.',
    intro:
      'These servers wrap cloud control planes. They are only interchangeable if you are multi-cloud. Otherwise install the vendor you actually run — and lock tools down to read-only wherever possible.',
    verdict:
      'Do not pick a cloud MCP for SEO reasons. Pick the cloud your IAM already covers. If you are multi-cloud, install both and use separate agents or tool allowlists so a prompt cannot mutate the wrong account.',
    chooseLeft: [
      'Workloads and IAM live in AWS.',
      'The agent should list or describe AWS resources.',
      'Your runbooks are already AWS-shaped.',
    ],
    chooseRight: [
      'Workloads and identity live in Azure.',
      'The agent should operate Azure resource graph / ARM-shaped APIs.',
      'Your org is standardized on Microsoft cloud.',
    ],
    rows: [
      { label: 'Control plane', left: 'AWS APIs', right: 'Azure APIs' },
      { label: 'Identity', left: 'IAM / roles', right: 'Entra / Azure RBAC' },
      { label: 'Safety default', left: 'Read-only keys', right: 'Read-only principals' },
    ],
    faqs: [
      {
        q: 'Is it safe to give an agent AWS or Azure MCP?',
        a: 'Treat it like any automation: least privilege, read-only where possible, no long-lived admin keys. See <a href="/mcp/aws">AWS</a>, <a href="/mcp/azure">Azure</a>, and <a href="/mcp/categories/cloud-infra">Cloud & Infra</a>.',
        aPlain: 'Use least-privilege, preferably read-only credentials — same as any cloud automation.',
      },
    ],
    relatedSlugs: ['docker-vs-kubernetes', 'sentry-vs-datadog'],
    relatedTopicSlugs: ['coding-agent-mcp'],
  },
];

function getAllMcpComparisons() {
  return MCP_COMPARISONS;
}

function getMcpComparisonBySlug(slug) {
  return MCP_COMPARISONS.find((c) => c.slug === slug) || null;
}

function getMcpComparisonSeoContent(comparison) {
  const others = MCP_COMPARISONS.filter((c) => c.slug !== comparison.slug).slice(0, 6);
  return {
    introTitle: `${comparison.shortTitle} — how to choose`,
    introParagraphs: [comparison.intro, comparison.verdict],
    faqs: comparison.faqs,
    crossLinkGroups: [
      {
        title: 'More comparisons',
        links: others.map((c) => ({
          href: `/mcp/compare/${c.slug}`,
          label: c.shortTitle,
          desc: c.metaDescription.slice(0, 80) + '…',
        })),
      },
      {
        title: 'Directory',
        links: [
          { href: `/mcp/${comparison.leftSlug}`, label: `${comparison.shortTitle.split(' vs ')[0]} server page`, desc: 'Setup, tools, and install' },
          { href: `/mcp/${comparison.rightSlug}`, label: `${comparison.shortTitle.split(' vs ')[1]} server page`, desc: 'Setup, tools, and install' },
          { href: '/mcp/compare', label: 'All comparisons', desc: 'Head-to-head MCP matchups' },
          { href: '/mcp/categories', label: 'Browse by category', desc: 'Dev tools, databases, search & web' },
        ],
      },
    ],
  };
}

function getMcpComparisonsIndexSeoContent() {
  return {
    introTitle: 'MCP server comparisons',
    introParagraphs: [
      'Head-to-head pages for high-intent queries like “Firecrawl vs Exa MCP” and “Postgres vs Neon MCP.” Each comparison mixes catalog facts (tools, transport, category) with an editorial verdict so you can pick a server without opening ten tabs.',
      'Still exploring? Browse <a href="/mcp/categories">categories</a> or <a href="/mcp/topics">topic guides</a>, then come back when you are deciding between two named products.',
    ],
    faqs: [
      {
        q: 'How are these MCP comparisons written?',
        a: 'We curate pairs that people actually search for, then fill the table from our live catalog (indexed tools, transport, category). The verdict is editorial — not a star-rating algorithm.',
        aPlain:
          'Pairs are curated. Tables use live catalog data; verdicts are editorial, not an automated score.',
      },
      {
        q: 'Why isn’t every server compared?',
        a: 'Thin auto-generated matchups hurt search quality. We add pairs when two servers compete for the same job. Request a matchup via <a href="/mcp/submit">Submit a server</a>.',
        aPlain: 'We only publish curated pairs that compete for the same job, to avoid thin pages.',
      },
    ],
    crossLinkGroups: [
      {
        title: 'Comparisons',
        links: MCP_COMPARISONS.map((c) => ({
          href: `/mcp/compare/${c.slug}`,
          label: c.shortTitle,
          desc: c.intro.slice(0, 90) + '…',
        })),
      },
      {
        title: 'Directory',
        links: [
          { href: '/mcp', label: 'Top 100 MCP servers', desc: 'Curated ranking with tool lists' },
          { href: '/mcp/categories', label: 'Categories', desc: 'Browse by product type' },
          { href: '/mcp/topics', label: 'Topic guides', desc: 'Browse by workflow' },
        ],
      },
    ],
  };
}

module.exports = {
  MCP_COMPARISONS,
  getAllMcpComparisons,
  getMcpComparisonBySlug,
  getMcpComparisonSeoContent,
  getMcpComparisonsIndexSeoContent,
};
