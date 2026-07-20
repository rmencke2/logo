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

const CLAUDE_CODE_COMMAND =
  'claude mcp add --transport http influzer-discovery \\\n  https://www.influzer.ai/mcp/discovery';

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
    claudeCodeCommand: CLAUDE_CODE_COMMAND,
    clients: [
      {
        id: 'claude',
        tab: 'Claude',
        name: 'Claude (Desktop, web, mobile)',
        summary:
          'Add a custom Web connector — Anthropic connects from their cloud to our public HTTPS endpoint. No local install.',
        steps: [
          'Open Claude → Settings → Connectors (or visit claude.ai/customize/connectors).',
          'Click Add connector → choose Custom → Web.',
          'Name it “Influzer MCP Discovery”.',
          'URL: https://www.influzer.ai/mcp/discovery',
          'Leave OAuth blank — this server is read-only and needs no auth.',
          'Save, start a new chat, and enable the connector for that conversation.',
        ],
        note: 'Remote connectors require a public HTTPS URL. Free plans can add one custom connector; Pro/Max/Team get more.',
        docsUrl: 'https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp',
      },
      {
        id: 'chatgpt',
        tab: 'ChatGPT',
        name: 'ChatGPT',
        summary:
          'Enable Developer Mode, create a custom connector pointing at our /mcp/discovery endpoint, then turn it on per chat.',
        steps: [
          'Settings → Apps & Connectors → Advanced → enable Developer mode (beta).',
          'Connectors → Create (custom connector).',
          'Name: Influzer MCP Discovery · Description: Search the Influzer MCP directory by capability.',
          'MCP server URL: https://www.influzer.ai/mcp/discovery (include /discovery).',
          'Authentication: None — our server is public read-only.',
          'Create, approve access, then enable it per chat via + → More → Developer mode.',
        ],
        note: 'ChatGPT connects from OpenAI infrastructure — localhost will not work. Our production URL is already public HTTPS.',
        docsUrl: 'https://platform.openai.com/docs/mcp',
      },
      {
        id: 'cursor',
        tab: 'Cursor',
        name: 'Cursor',
        summary: 'Paste one URL into MCP settings — the fastest path for developers.',
        steps: [
          'Open Cursor → Settings → MCP (or edit .cursor/mcp.json in your project).',
          'Add a remote server entry with the discovery URL.',
          'Reload MCP / restart Cursor.',
          'In Agent mode, ask it to search Influzer for a server.',
        ],
        note: 'Project-level config lives in .cursor/mcp.json so you can share discovery with your team.',
        configLabel: 'Cursor / VS Code MCP config (.cursor/mcp.json)',
        codeKey: 'cursor',
        docsUrl: 'https://docs.cursor.com/context/mcp',
      },
      {
        id: 'claude-code',
        tab: 'Claude Code',
        name: 'Claude Code (CLI)',
        summary: 'Register the remote URL via the Claude Code MCP command.',
        steps: [
          'Add the server via the CLI (command below).',
          'Verify with: claude mcp list',
          'Use in session: ask Claude Code to search or recommend MCP servers from Influzer.',
        ],
        note: 'If the HTTP transport flag differs in your CLI version, use Settings → Connectors on claude.ai instead.',
        configLabel: 'Terminal',
        codeKey: 'claude-code',
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
