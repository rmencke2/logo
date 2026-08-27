/**
 * WebMCP setup / launch guide + YouTube shot list for Influzer.
 */

const SITE = 'https://www.influzer.ai';

const WEBMCP_SETUP_GUIDE = {
  title: 'Set up and launch WebMCP',
  metaDescription:
    'Step-by-step WebMCP setup: Chrome Canary flag, Edge origin trial, register document.modelContext tools, verify, and list your site on Influzer — plus a filmable demo tour.',
  intro:
    'WebMCP lets a website register tools that AI agents can discover and call in the browser — without shipping a separate MCP server. This guide walks from zero to a live launch you can film. Native mode needs a preview browser (Chrome flag and/or Edge origin trial); the Influzer demo still works via polyfill without that.',
  endpointLabel: 'LIVE DEMO — OPEN WHILE YOU FOLLOW ALONG',
  demoUrl: `${SITE}/webmcp/demo`,
  setupUrl: `${SITE}/webmcp/setup`,
  standardUrl: 'https://github.com/webmachinelearning/webmcp',
  chromeDocsUrl: 'https://developer.chrome.com/docs/ai/webmcp',
  chromeFlagsUrl: 'chrome://flags/#enable-webmcp-testing',
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
      id: 'chrome-flag',
      title: 'Enable WebMCP in Chrome (Canary / Beta)',
      body:
        'For Google Chrome, use an up-to-date preview build — Chrome Canary or Beta, version 146 or higher. Open chrome://flags/#enable-webmcp-testing, set “WebMCP for testing” to Enabled, and relaunch the browser. Stable Chrome does not expose native document.modelContext yet.',
      code: `1. Install Chrome Canary or Beta (version 146+)
2. Visit chrome://flags/#enable-webmcp-testing
3. Set "WebMCP for testing" → Enabled
4. Relaunch Chrome
5. Open https://www.influzer.ai/webmcp/demo
   → Mode should read: Native WebMCP (document.modelContext)`,
      links: [
        { href: 'https://developer.chrome.com/docs/ai/webmcp', label: 'Chrome WebMCP docs', external: true },
        { href: '/webmcp/demo', label: 'Verify on the live demo' },
      ],
    },
    {
      id: 'origin-trial',
      title: 'Enable the Edge / site origin trial',
      body:
        'Microsoft Edge (and Chromium builds that honor origin trials) unlock native WebMCP when the site serves a registered token. Register your production origin, then prefer an Origin-Trial HTTP response header (one place for every page). Influzer already serves this for www.influzer.ai. Pair with the Chrome flag above when filming in Chrome Canary.',
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
        'Confirm Mode = Native on the demo (Chrome flag and/or Edge trial). In DevTools, list and call tools. Native executeTool requires a JSON string for arguments — not a plain object. Without native support, Influzer’s demo polyfill still runs the same tools for filming.',
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
        do: 'Open /webmcp/demo in Chrome Canary with WebMCP for testing enabled. Point at Mode = Native WebMCP.',
      },
      {
        t: '0:40',
        title: 'Browser prerequisite (Chrome)',
        say: 'Stable Chrome is not enough yet. You need Canary or Beta 146+, then enable the WebMCP for testing flag and relaunch.',
        do: 'Brief cut to chrome://flags/#enable-webmcp-testing set to Enabled, then back to the demo.',
      },
      {
        t: '1:10',
        title: 'What WebMCP is (and isn’t)',
        say: 'MCP servers are backends you connect once. WebMCP tools live on the page — agents discover them while browsing.',
        do: 'Cut to /webmcp/about. Highlight “WebMCP is not an MCP server.”',
      },
      {
        t: '1:50',
        title: 'Video tour — discovery',
        say: 'Let’s run the same path an in-page agent uses: getTools, then executeTool with a JSON string.',
        do: 'On /webmcp/demo click Start video tour. Narrate each scene as it runs.',
      },
      {
        t: '4:15',
        title: 'Setup — Chrome flag + origin trial',
        say: 'For Chrome, flip the testing flag. For Edge and site-wide native unlocks, serve an Origin-Trial header — Influzer already does.',
        do: 'Show /webmcp/setup steps “Enable WebMCP in Chrome” and “Edge / site origin trial”. Optional B-roll: curl -I Origin-Trial.',
      },
      {
        t: '5:45',
        title: 'Setup — registerTool',
        say: 'Here’s the minimal registerTool call. Feature-detect, return structured content, degrade gracefully.',
        do: 'Show the registerTool code block. Optional: open /api/webmcp/v1/self.',
      },
      {
        t: '7:15',
        title: 'Where it shows up on Influzer',
        say: 'Server detail pages and Best-for-Claude guides also register tools — so agents get context where users already land.',
        do: 'Quick cuts: /mcp/playwright, /mcp/best/claude, DevTools getTools().',
      },
      {
        t: '8:45',
        title: 'CTA',
        say: 'Try the demo, follow the setup guide, and list your site so agents can find you.',
        do: 'End cards: /webmcp/demo · /webmcp/setup · /webmcp/submit',
      },
    ],
  },
  faqs: [
    {
      q: 'How do I enable WebMCP in Google Chrome?',
      a: 'Use Chrome Canary or Beta (version 146 or higher). Open chrome://flags/#enable-webmcp-testing, set “WebMCP for testing” to Enabled, and relaunch. Then open the Influzer demo — Mode should say Native WebMCP.',
    },
    {
      q: 'Do I need the origin trial or Chrome flag to try Influzer’s demo?',
      a: 'No. The demo installs a local polyfill when native WebMCP is missing, so you can film and test tool calls in any modern browser. The Chrome flag and/or Edge origin trial unlock real document.modelContext.',
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
