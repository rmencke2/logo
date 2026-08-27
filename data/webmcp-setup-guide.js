/**
 * WebMCP setup / launch guide + YouTube shot list for Influzer.
 */

const SITE = 'https://www.influzer.ai';

const WEBMCP_SETUP_GUIDE = {
  title: 'Set up and launch WebMCP',
  metaDescription:
    'Step-by-step WebMCP setup: enable the origin trial, register document.modelContext tools, verify in Edge/Chrome, and list your site on Influzer — plus a filmable demo tour.',
  intro:
    'WebMCP lets a website register tools that AI agents can discover and call in the browser — without shipping a separate MCP server. This guide walks from zero to a live launch you can film.',
  endpointLabel: 'LIVE DEMO — OPEN WHILE YOU FOLLOW ALONG',
  demoUrl: `${SITE}/webmcp/demo`,
  setupUrl: `${SITE}/webmcp/setup`,
  standardUrl: 'https://github.com/webmachinelearning/webmcp',
  chromeDocsUrl: 'https://developer.chrome.com/docs/ai/webmcp',
  edgeTrialUrl:
    'https://developer.microsoft.com/en-us/microsoft-edge/origin-trials/trials/0b76fe60-b266-458e-a285-04e375c0c31a',
  steps: [
    {
      id: 'understand',
      title: 'Understand the model',
      body:
        'MCP servers are durable backends your client connects to. WebMCP tools are page-scoped capabilities the website itself registers on document.modelContext. Influzer catalogs both — separately.',
      code: null,
      links: [
        { href: '/webmcp/about', label: 'WebMCP vs MCP' },
        { href: '/insights/what-is-webmcp-agents-navigate-websites', label: 'Explainer article' },
      ],
    },
    {
      id: 'origin-trial',
      title: 'Enable the browser origin trial',
      body:
        'Native document.modelContext is behind an origin trial in Edge/Chrome. Register your production origin, then serve the token as an Origin-Trial HTTP header (preferred) or a meta tag on every page that registers tools.',
      code: `Origin-Trial: <your-token-here>

<!-- or in <head> -->
<meta http-equiv="origin-trial" content="<your-token-here>">`,
      links: [
        { href: 'https://developer.microsoft.com/en-us/microsoft-edge/origin-trials/trials/0b76fe60-b266-458e-a285-04e375c0c31a', label: 'Edge WebMCP origin trial', external: true },
        { href: 'https://developer.chrome.com/docs/ai/webmcp', label: 'Chrome WebMCP docs', external: true },
      ],
    },
    {
      id: 'register',
      title: 'Register tools on the page',
      body:
        'Load a small script that calls document.modelContext.registerTool for each capability. Prefer feature detection and a graceful fallback so the page still works when the API is missing.',
      code: `await document.modelContext.registerTool({
  name: 'search_catalog',
  description: 'Search products on this site',
  inputSchema: {
    type: 'object',
    properties: {
      q: { type: 'string', description: 'Search query' }
    },
    required: ['q']
  },
  async execute({ q }) {
    const data = await fetch('/api/search?q=' + encodeURIComponent(q))
      .then((r) => r.json());
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
    };
  },
});`,
      links: [
        { href: '/api/webmcp/v1/self', label: 'Influzer tool manifest (JSON)' },
        { href: 'https://github.com/webmachinelearning/webmcp', label: 'WebMCP standard', external: true },
      ],
    },
    {
      id: 'verify',
      title: 'Verify in the browser',
      body:
        'Open your page in Edge or Chrome with the trial enabled. In DevTools, list and call tools. Influzer’s demo also works with a local polyfill so you can film the flow before native support is on.',
      code: `const tools = await document.modelContext.getTools();
console.table(tools.map((t) => t.name));

// Native WebMCP: 2nd arg must be a JSON string (not a plain object).
const result = await document.modelContext.executeTool(tools[0], '{}');
console.log(result);`,
      links: [
        { href: '/webmcp/demo', label: 'Open live demo + video tour' },
      ],
    },
    {
      id: 'list',
      title: 'List on Influzer (optional)',
      body:
        'Scan your public URL so agents and humans can find your tools in the WebMCP Directory. Verified listings show tool schemas and capability kinds (answer / act / transact).',
      code: null,
      links: [
        { href: '/webmcp/submit', label: 'Scan & list your site' },
        { href: '/webmcp', label: 'Browse the directory' },
      ],
    },
  ],
  video: {
    title: 'Suggested YouTube outline (~8–10 min)',
    hook:
      'Show an agent discovering tools on a live website — no separate MCP install — then reverse the magic and build it.',
    shots: [
      {
        t: '0:00',
        title: 'Hook',
        say: 'Websites can now expose tools to AI agents in the browser. This is WebMCP — and I’ll show how Influzer ships it.',
        do: 'Open /webmcp/demo in Edge/Chrome. Point at Status = tools ready and Mode = Native or Polyfill.',
      },
      {
        t: '0:45',
        title: 'What WebMCP is (and isn’t)',
        say: 'MCP servers are backends you connect once. WebMCP tools live on the page — agents discover them while browsing.',
        do: 'Cut to /webmcp/about. Highlight “WebMCP is not an MCP server.”',
      },
      {
        t: '1:30',
        title: 'Video tour — discovery',
        say: 'Let’s run the same path an in-page agent uses: getTools, then executeTool.',
        do: 'On /webmcp/demo click Start video tour. Narrate each scene as it runs.',
      },
      {
        t: '4:00',
        title: 'Setup — origin trial',
        say: 'Native support needs an origin trial token on your production host. Influzer serves it as an HTTP header.',
        do: 'Show /webmcp/setup step 2. Optional B-roll: curl -I showing Origin-Trial.',
      },
      {
        t: '5:30',
        title: 'Setup — registerTool',
        say: 'Here’s the minimal registerTool call. Feature-detect, return structured content, degrade gracefully.',
        do: 'Show step 3 code block. Optional: open /api/webmcp/v1/self.',
      },
      {
        t: '7:00',
        title: 'Where it shows up on Influzer',
        say: 'Server detail pages and Best-for-Claude guides also register tools — so agents get context where users already land.',
        do: 'Quick cuts: /mcp/playwright, /mcp/best/claude, DevTools getTools().',
      },
      {
        t: '8:30',
        title: 'CTA',
        say: 'Try the demo, follow the setup guide, and list your site so agents can find you.',
        do: 'End cards: /webmcp/demo · /webmcp/setup · /webmcp/submit',
      },
    ],
  },
  faqs: [
    {
      q: 'Do I need the origin trial to try Influzer’s demo?',
      a: 'No. The demo installs a local polyfill when native WebMCP is missing, so you can film and test tool calls in any modern browser. The trial unlocks native document.modelContext in Edge/Chrome.',
    },
    {
      q: 'Header or meta tag for the origin trial?',
      a: 'Prefer the Origin-Trial HTTP response header so every page is covered from one place. Use a meta tag only if you cannot set headers.',
    },
    {
      q: 'Is WebMCP a replacement for Influzer MCP Discovery?',
      a: 'No. Discovery is a remote MCP server for Claude/Cursor/ChatGPT. WebMCP is for agents that already have your website open. Use both.',
    },
  ],
};

module.exports = { WEBMCP_SETUP_GUIDE };
