/**
 * MCP topic hub definitions — capability-focused guides (browser automation, RAG, PDF, etc.)
 */

const MCP_TOPICS = [
  {
    slug: 'browser-automation-mcp',
    title: 'Browser Automation MCP Servers',
    shortTitle: 'Browser Automation',
    metaDescription:
      'Compare MCP servers for browser automation — Playwright, Puppeteer, Chrome DevTools, screenshots, navigation, and agent-driven web QA.',
    intro:
      'Give AI agents a real browser for QA, research, screenshots, and page inspection. Compare servers by engine, transport, and indexed tools.',
    keywords: [
      'browser', 'playwright', 'puppeteer', 'chrome', 'devtools', 'selenium',
      'screenshot', 'navigate', 'automation', 'skyvern', 'browserbase',
    ],
    toolPatterns: [
      /browser_/i, /screenshot/i, /navigate/i, /click/i, /playwright/i,
      /puppeteer/i, /devtools/i, /page_snapshot/i, /snapshot/i,
    ],
    categories: ['Search & Web', 'Dev Tools', 'Files & Docs'],
    checklist: [
      'Choose a browser automation server based on the actions and browser engine you need.',
      'Install the server package or follow the repository setup instructions.',
      'Add the command or remote endpoint to your MCP client configuration.',
      'Verify a small navigation, screenshot, and page-inspection task before relying on longer workflows.',
    ],
    chooseTips: [
      'Check support for screenshots, DOM or accessibility snapshots, console logs, and JavaScript execution.',
      'Prefer servers with clear sandboxing, browser session, and permission behavior.',
      'Use Playwright or Chrome DevTools specific servers when your workflow depends on those exact APIs.',
    ],
    faqs: [
      {
        q: 'What is Browser Automation MCP?',
        a: 'Browser Automation MCP connects an AI client to a browser automation layer so agents can navigate pages, inspect UI state, capture screenshots, and run browser tasks through MCP.',
        aPlain:
          'Browser Automation MCP connects an AI client to a browser layer so agents can navigate, inspect, and screenshot pages.',
      },
      {
        q: 'Is Browser Automation MCP only for testing?',
        a: 'No. Testing is common, but the same capability is useful for web research, scraping, visual QA, debugging, and workflows where an agent needs to interact with real websites.',
        aPlain:
          'Browser automation MCP is useful for testing, research, scraping, visual QA, and debugging — not just E2E tests.',
      },
      {
        q: 'Should I choose Playwright MCP or a general browser MCP server?',
        a: 'Use <a href="/mcp/playwright">Playwright MCP</a> when you specifically want Playwright actions and repeatable test-style flows. Use a broader browser MCP server when you need discovery, screenshots, or page inspection across a wider workflow.',
        aPlain:
          'Use Playwright MCP for Playwright-specific flows; use broader browser servers for general page inspection.',
      },
    ],
    relatedSlugs: ['web-scraping-mcp', 'coding-agent-mcp'],
    searchQuery: 'browser playwright screenshot',
  },
  {
    slug: 'web-scraping-mcp',
    title: 'Web Scraping MCP Servers',
    shortTitle: 'Web Scraping',
    metaDescription:
      'Compare MCP servers for web scraping — page extraction, crawling, structured data, browser rendering, and agent workflows that need reliable web data.',
    intro:
      'Turn URLs into structured content for agents. Compare scraping, crawling, and search servers with indexed tool lists and setup steps.',
    keywords: [
      'scrape', 'crawl', 'firecrawl', 'extract', 'markdown', 'html', 'web',
      'fetch', 'spider', 'render', 'jina', 'exa',
    ],
    toolPatterns: [
      /scrape/i, /crawl/i, /extract/i, /fetch_url/i, /map_site/i,
      /read_page/i, /web_search/i, /search_web/i,
    ],
    categories: ['Search & Web'],
    checklist: [
      'Decide whether you need raw HTML, clean markdown, or structured JSON from pages.',
      'Check rate limits, auth requirements, and whether the server uses headless browsers.',
      'Add the MCP server to your client and test on a single URL before batch jobs.',
      'Treat scraped content as untrusted input — never pipe it straight into prod config.',
    ],
    chooseTips: [
      'Firecrawl-style servers excel at URL → markdown for LLM consumption.',
      'Search + scrape combos (Exa, Jina) work well for research agents.',
      'Browser-based scrapers handle JavaScript-heavy sites; HTTP-only servers are faster for static pages.',
    ],
    faqs: [
      {
        q: 'What is Web Scraping MCP?',
        a: 'Web Scraping MCP servers expose tools that fetch, parse, and structure web page content so AI agents can research, extract data, or ground responses in live pages.',
        aPlain:
          'Web Scraping MCP servers let agents fetch and structure web page content through standardized tools.',
      },
      {
        q: 'Scraping MCP vs browser automation MCP?',
        a: 'Scraping servers focus on <strong>content extraction</strong> (markdown, JSON, metadata). Browser automation servers focus on <strong>interaction</strong> (clicks, forms, multi-step flows). Many teams use both.',
        aPlain:
          'Scraping MCP focuses on content extraction; browser automation focuses on page interaction.',
      },
    ],
    relatedSlugs: ['browser-automation-mcp', 'rag-mcp'],
    searchQuery: 'scrape crawl firecrawl',
  },
  {
    slug: 'rag-mcp',
    title: 'RAG MCP Servers',
    shortTitle: 'RAG & Memory',
    metaDescription:
      'Find MCP servers for retrieval-augmented generation — vector search, embeddings, knowledge bases, persistent memory, and source-grounded context.',
    intro:
      'Ground agent responses in your data. Compare memory layers, vector stores, and retrieval servers with searchable tool indexes.',
    keywords: [
      'memory', 'rag', 'vector', 'embedding', 'knowledge', 'retrieval',
      'semantic', 'search_nodes', 'chroma', 'pinecone', 'mem0', 'notebook',
    ],
    toolPatterns: [
      /memory/i, /search_nodes/i, /add_memory/i, /retrieve/i, /embed/i,
      /vector/i, /knowledge/i, /recall/i, /query_documents/i,
    ],
    categories: ['AI & Memory', 'Databases', 'Search & Web'],
    checklist: [
      'Decide between session memory (short-term) and persistent knowledge bases (long-term).',
      'Check whether embeddings run locally or require a cloud API key.',
      'Verify citation or source-return behavior before compliance-sensitive workflows.',
      'Pair RAG MCP with action-oriented servers when agents need to do more than retrieve.',
    ],
    chooseTips: [
      'Mem0 and Memory MCP are popular for cross-session agent recall.',
      'Vector DB MCP servers (Pinecone, Chroma) suit large document corpora.',
      'RAG retrieves information; MCP also enables actions — use both when building agents.',
    ],
    faqs: [
      {
        q: 'What is RAG MCP?',
        a: 'RAG MCP servers connect agents to retrieval systems — vector databases, document stores, or memory layers — so responses can be grounded in your authoritative data instead of model training alone.',
        aPlain:
          'RAG MCP servers connect agents to retrieval and memory systems for grounded responses.',
      },
      {
        q: 'MCP vs RAG — are they the same thing?',
        a: 'No. <a href="/insights/what-is-model-context-protocol">MCP</a> is a protocol for tools and actions; RAG is a technique for retrieving text to augment prompts. MCP servers can <em>implement</em> RAG workflows, but MCP also covers databases, browsers, ticketing, and more.',
        aPlain:
          'MCP is a tool protocol; RAG is a retrieval technique. MCP servers can implement RAG workflows.',
      },
    ],
    relatedSlugs: ['pdf-mcp', 'coding-agent-mcp'],
    searchQuery: 'memory vector knowledge rag',
  },
  {
    slug: 'openapi-mcp',
    title: 'OpenAPI MCP Servers',
    shortTitle: 'OpenAPI & APIs',
    metaDescription:
      'Compare MCP servers that turn OpenAPI specs, REST endpoints, and developer docs into agent-usable tools.',
    intro:
      'Expose existing REST APIs as MCP tools without hand-writing every integration. Compare OpenAPI bridges and API gateways in our catalog.',
    keywords: [
      'openapi', 'swagger', 'rest', 'api', 'graphql', 'endpoint', 'http',
      'postman', 'wayforth', 'gateway',
    ],
    toolPatterns: [
      /openapi/i, /swagger/i, /execute_api/i, /call_endpoint/i, /http_request/i,
      /rest_/i, /api_/i,
    ],
    categories: ['Dev Tools', 'Automation', 'Cloud & Infra'],
    checklist: [
      'Start from an OpenAPI spec or a well-documented REST surface you already operate.',
      'Scope tools narrowly — expose high-value actions, not every CRUD endpoint.',
      'Use read-only credentials while testing agent behavior.',
      'Read <a href="/insights/mcp-builders-api-to-mcp-in-one-afternoon">MCP Builders Chapter 1</a> for a producer walkthrough.',
    ],
    chooseTips: [
      'Generic OpenAPI-to-MCP bridges ship fast but need careful tool naming for agents.',
      'Vendor-first-party MCP servers usually have better tool descriptions than auto-generated wrappers.',
      'Pair with OAuth-aware servers when APIs require user-scoped tokens.',
    ],
    faqs: [
      {
        q: 'What is OpenAPI MCP?',
        a: 'OpenAPI MCP servers convert REST API specifications into discoverable MCP tools — letting agents call endpoints with structured inputs instead of bespoke integration code.',
        aPlain:
          'OpenAPI MCP servers convert REST API specs into discoverable MCP tools for agents.',
      },
      {
        q: 'OpenAPI MCP vs hand-built MCP servers?',
        a: 'Auto-generated OpenAPI bridges are fast to deploy; hand-built servers let you curate tool names, descriptions, and permission boundaries for safer agent behavior.',
        aPlain:
          'OpenAPI bridges are fast; hand-built servers offer better curation and safety boundaries.',
      },
    ],
    relatedSlugs: ['coding-agent-mcp', 'web-scraping-mcp'],
    searchQuery: 'openapi rest api',
  },
  {
    slug: 'pdf-mcp',
    title: 'PDF MCP Servers',
    shortTitle: 'PDF & Documents',
    metaDescription:
      'Find MCP servers for PDF parsing, document extraction, OCR, conversion, summarization, and agent workflows around files.',
    intro:
      'Let agents read, extract, and summarize documents. Compare PDF parsers, OCR tools, and file-system bridges with indexed capabilities.',
    keywords: [
      'pdf', 'document', 'ocr', 'extract', 'parse', 'docx', 'markdown',
      'file', 'reader', 'summarize',
    ],
    toolPatterns: [
      /pdf/i, /document/i, /ocr/i, /extract_text/i, /read_file/i,
      /parse_/i, /convert_/i,
    ],
    categories: ['Files & Docs', 'AI & Memory'],
    checklist: [
      'Confirm whether processing runs locally (privacy) or via a cloud API.',
      'Test on a representative PDF — scanned pages need OCR-capable servers.',
      'Check output format (plain text, markdown, structured JSON) matches your agent pipeline.',
      'Scope filesystem access narrowly when combining PDF tools with local file servers.',
    ],
    chooseTips: [
      'Local PDF RAG servers keep documents on-device — good for compliance-sensitive workflows.',
      'Cloud OCR APIs handle scanned documents better than basic text extractors.',
      'Combine PDF MCP with RAG memory servers for searchable document corpora.',
    ],
    faqs: [
      {
        q: 'What is PDF MCP?',
        a: 'PDF MCP servers expose document parsing, extraction, OCR, and summarization as callable tools — so agents can work with PDFs and office files without custom scripts.',
        aPlain:
          'PDF MCP servers expose document parsing and extraction as agent-callable tools.',
      },
    ],
    relatedSlugs: ['rag-mcp', 'coding-agent-mcp'],
    searchQuery: 'pdf document extract ocr',
  },
  {
    slug: 'coding-agent-mcp',
    title: 'Coding Agent MCP Servers',
    shortTitle: 'Coding Agents',
    metaDescription:
      'Build a practical MCP stack for coding agents — repository context, pull requests, documentation lookup, local files, and browser QA.',
    intro:
      'The default toolkit for AI coding assistants: repos, docs, filesystem, issues, and browser verification — with setup steps for Cursor and Claude.',
    keywords: [
      'github', 'gitlab', 'context7', 'filesystem', 'linear', 'jira',
      'code', 'repository', 'pull request', 'docs', 'cursor', 'devtools',
    ],
    toolPatterns: [
      /search_code/i, /create_issue/i, /get_file/i, /read_file/i,
      /pull_request/i, /library/i, /docs/i, /repository/i,
    ],
    categories: ['Dev Tools', 'Communication', 'Files & Docs'],
    checklist: [
      'Start with filesystem + GitHub + live docs (Context7) — covers most daily coding workflows.',
      'Add issue tracking (Linear, Jira) when agents should create tickets from findings.',
      'Use browser MCP for visual QA after UI changes.',
      'Audit permissions quarterly — see our <a href="/insights/mcp-server-audit-seven-questions-before-you-connect-another-tool">seven-question MCP audit</a>.',
    ],
    chooseTips: [
      'Official GitHub and Playwright servers are proven starting points.',
      'Context7 reduces hallucinated API usage for framework-heavy repos.',
      'Keep the stack to 5–8 servers to avoid overlapping tools confusing the model.',
    ],
    faqs: [
      {
        q: 'What MCP servers should coding agents use first?',
        a: 'A practical starter stack: <a href="/mcp/filesystem">Filesystem</a>, <a href="/mcp/github">GitHub</a>, <a href="/mcp/context7">Context7</a>, plus one web research tool. See our <a href="/insights/how-to-set-up-your-first-mcp-servers-in-cursor">Cursor setup guide</a>.',
        aPlain:
          'Start with Filesystem, GitHub, Context7, and one web research tool for coding agents.',
      },
    ],
    relatedSlugs: ['browser-automation-mcp', 'openapi-mcp'],
    searchQuery: 'github context7 filesystem',
  },
];

function getAllMcpTopics() {
  return MCP_TOPICS;
}

function getMcpTopicBySlug(slug) {
  return MCP_TOPICS.find((t) => t.slug === slug) || null;
}

function getMcpTopicSeoContent(topic, matchCount) {
  return {
    introTitle: `Where ${topic.shortTitle} MCP fits`,
    introParagraphs: [topic.intro],
    faqs: topic.faqs,
    crossLinkGroups: [
      {
        title: 'MCP topic guides',
        links: MCP_TOPICS.filter((t) => t.slug !== topic.slug)
          .slice(0, 4)
          .map((t) => ({
            href: `/mcp/topics/${t.slug}`,
            label: t.shortTitle,
            desc: t.metaDescription.slice(0, 80) + '…',
          })),
      },
      {
        title: 'Directory',
        links: [
          { href: '/mcp', label: 'Top 100 MCP servers', desc: 'Curated leaders with indexed tools' },
          { href: `/mcp/all?q=${encodeURIComponent(topic.searchQuery)}`, label: 'Search this topic', desc: `${matchCount} matching servers in catalog` },
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

function getMcpTopicsIndexSeoContent() {
  return {
    introTitle: 'MCP topic guides',
    introParagraphs: [
      'Focused guides for high-intent MCP workflows — browser automation, web scraping, RAG, PDF, OpenAPI, and coding-agent stacks. Each hub matches servers from our catalog by capability and indexed tools.',
      'New to MCP? Read <a href="/insights/what-is-model-context-protocol">What is the Model Context Protocol?</a> then browse the <a href="/mcp">Top 100 directory</a>.',
    ],
    faqs: [
      {
        q: 'How are topic servers selected?',
        a: 'We match servers by name, description, category, and <strong>indexed tool names</strong> — the same capability search that powers our full directory. Counts update as the catalog refreshes.',
        aPlain:
          'Topic servers are matched by name, description, category, and indexed tool names from our catalog.',
      },
      {
        q: 'Topic guides vs the full directory?',
        a: 'Topic hubs curate servers for a specific workflow (e.g. browser QA). The <a href="/mcp/all">full directory</a> lists every registered server with filters and tool search.',
        aPlain:
          'Topic hubs curate by workflow; the full directory lists every registered server.',
      },
    ],
    crossLinkGroups: [
      {
        title: 'Topic guides',
        links: MCP_TOPICS.map((t) => ({
          href: `/mcp/topics/${t.slug}`,
          label: t.shortTitle,
          desc: t.intro.slice(0, 90) + '…',
        })),
      },
      {
        title: 'Directory',
        links: [
          { href: '/mcp', label: 'Top 100 MCP servers', desc: 'Curated ranking with tool lists' },
          { href: '/mcp/all', label: 'Full directory', desc: 'Search every server by tool or name' },
        ],
      },
    ],
  };
}

module.exports = {
  MCP_TOPICS,
  getAllMcpTopics,
  getMcpTopicBySlug,
  getMcpTopicSeoContent,
  getMcpTopicsIndexSeoContent,
};
