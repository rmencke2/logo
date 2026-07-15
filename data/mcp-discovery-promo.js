/**
 * Influzer MCP Discovery — promotion copy and client setup instructions.
 */

const MCP_DISCOVERY_ENDPOINT = 'https://www.influzer.ai/mcp/discovery';
const MCP_DISCOVERY_PAGE = 'https://www.influzer.ai/mcp/influzer-mcp-discovery';
const MCP_DISCOVERY_SETUP = 'https://www.influzer.ai/mcp/discovery/setup';

const CURSOR_CONFIG = {
  mcpServers: {
    'influzer-discovery': {
      url: MCP_DISCOVERY_ENDPOINT,
    },
  },
};

const CLAUDE_CONNECTOR = {
  name: 'Influzer MCP Discovery',
  url: MCP_DISCOVERY_ENDPOINT,
  type: 'Web (remote MCP)',
  auth: 'None required',
};

const CHATGPT_CONNECTOR = {
  name: 'Influzer MCP Discovery',
  url: MCP_DISCOVERY_ENDPOINT,
  auth: 'None (no OAuth required for this read-only server)',
};

function getDiscoveryPromo() {
  return {
    slug: 'influzer-mcp-discovery',
    endpoint: MCP_DISCOVERY_ENDPOINT,
    pageUrl: MCP_DISCOVERY_PAGE,
    setupUrl: MCP_DISCOVERY_SETUP,
    provider: 'Influzer.ai',
    headline: 'Search MCP servers from inside Claude, Cursor, or ChatGPT',
    blurb:
      'Our official MCP server lets your agent search 795+ integrations by tool name — "find a Postgres MCP", "browser automation", "scrape URLs".',
    cta: 'Setup guide',
    promoCta: 'Connect in 2 minutes',
    promoBlurb:
      'Use Influzer MCP Discovery in Claude, ChatGPT, or Cursor — search the directory by capability without leaving your chat.',
    directoryHref: MCP_DISCOVERY_PAGE,
    featured: true,
    tools: ['search_mcp_servers', 'get_mcp_server', 'recommend_mcp_servers', 'list_mcp_topics'],
  };
}

function getDiscoverySetupGuide() {
  return {
    endpoint: MCP_DISCOVERY_ENDPOINT,
    pageUrl: MCP_DISCOVERY_PAGE,
    cursorConfigJson: JSON.stringify(CURSOR_CONFIG, null, 2),
    clients: [
      {
        id: 'claude',
        name: 'Claude (Desktop, web, mobile)',
        summary:
          'Add a custom Web connector — Anthropic connects from their cloud to our public HTTPS endpoint. No local install.',
        steps: [
          'Open Claude → Settings → Connectors (or visit claude.ai/customize/connectors on the web).',
          'Click Add connector → choose Custom → Web.',
          'Name: Influzer MCP Discovery',
          'URL: https://www.influzer.ai/mcp/discovery',
          'Leave OAuth blank — this server is read-only and needs no auth.',
          'Save, then start a new chat and enable the connector for that conversation.',
          'Try: "Use Influzer to find MCP servers for browser automation" or "Search for Postgres MCP servers."',
        ],
        note: 'Remote connectors require a public HTTPS URL. Free plans can add one custom connector; Pro/Max/Team get more.',
        docsUrl: 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
      },
      {
        id: 'chatgpt',
        name: 'ChatGPT',
        summary:
          'Enable Developer Mode, create a custom connector pointing at our /mcp/discovery endpoint, then turn it on per chat.',
        steps: [
          'Open ChatGPT → Settings → Apps & Connectors → Advanced → enable Developer mode (beta).',
          'Go back to Connectors → Create (or Create app / custom connector).',
          'Name: Influzer MCP Discovery',
          'Description: Search the Influzer MCP server directory by capability',
          'MCP server URL: https://www.influzer.ai/mcp/discovery (exact path — include /discovery)',
          'Authentication: None / off — our server is public read-only.',
          'Create the connector and approve access when prompted.',
          'Start a new chat → + → More → Developer mode → enable Influzer MCP Discovery.',
          'Try: "Recommend MCP servers for coding agents" or "What tools does the Playwright MCP expose?"',
        ],
        note: 'ChatGPT connects from OpenAI infrastructure — localhost will not work. Our production URL is already public HTTPS.',
        docsUrl: 'https://platform.openai.com/docs/mcp',
      },
      {
        id: 'cursor',
        name: 'Cursor',
        summary: 'Paste one URL into MCP settings — the fastest path for developers.',
        steps: [
          'Open Cursor → Settings → MCP (or edit .cursor/mcp.json in your project).',
          'Add a remote server entry with url: https://www.influzer.ai/mcp/discovery',
          'Reload MCP / restart Cursor.',
          'In Agent mode, ask: "Search Influzer for Firecrawl alternatives" or "Get setup details for the Supabase MCP."',
        ],
        note: 'Project-level config lives in .cursor/mcp.json so you can share discovery with your team.',
        configLabel: 'Cursor / VS Code MCP config',
      },
      {
        id: 'claude-code',
        name: 'Claude Code (CLI)',
        summary: 'Register the remote URL via the Claude Code MCP command.',
        steps: [
          'Run: claude mcp add --transport http influzer-discovery https://www.influzer.ai/mcp/discovery',
          'Verify with: claude mcp list',
          'Use in session: ask Claude Code to search or recommend MCP servers from Influzer.',
        ],
        note: 'If the HTTP transport flag differs in your CLI version, use Settings → Connectors on claude.ai instead.',
      },
    ],
    examplePrompts: [
      'Search Influzer for MCP servers that can scrape URLs to markdown',
      'Recommend MCP servers for a coding agent stack with GitHub and docs lookup',
      'Get full setup details for the Playwright MCP from Influzer',
      'List Influzer topic guides for browser automation',
    ],
  };
}

module.exports = {
  MCP_DISCOVERY_ENDPOINT,
  MCP_DISCOVERY_PAGE,
  MCP_DISCOVERY_SETUP,
  getDiscoveryPromo,
  getDiscoverySetupGuide,
};
