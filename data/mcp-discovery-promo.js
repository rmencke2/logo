/**
 * Influzer MCP Discovery — promotion copy, setup instructions, starter kits.
 */

const MCP_DISCOVERY_ENDPOINT = 'https://www.influzer.ai/mcp/discovery';
const MCP_DISCOVERY_PAGE = 'https://www.influzer.ai/mcp/influzer-mcp-discovery';
const MCP_DISCOVERY_SETUP = 'https://www.influzer.ai/mcp/discovery/setup';
const MCP_DISCOVERY_STARTERS = 'https://www.influzer.ai/mcp/discovery/starters';

const CURSOR_CONFIG = {
  mcpServers: {
    'influzer-discovery': {
      url: MCP_DISCOVERY_ENDPOINT,
    },
  },
};

const CLAUDE_CODE_COMMAND =
  'claude mcp add --transport http influzer-discovery \\\n  https://www.influzer.ai/mcp/discovery';

function formatServerCount(n) {
  if (!Number.isFinite(n) || n <= 0) return '6,000+';
  if (n >= 1000) return `${Math.floor(n / 100) * 100}+`;
  return String(n);
}

function getDiscoveryPromo(options = {}) {
  const countLabel = formatServerCount(options.serverCount ?? 6000);
  const ref = options.ref ? `?ref=${encodeURIComponent(options.ref)}` : '';
  return {
    slug: 'influzer-mcp-discovery',
    endpoint: MCP_DISCOVERY_ENDPOINT,
    pageUrl: MCP_DISCOVERY_PAGE,
    setupUrl: `${MCP_DISCOVERY_SETUP}${ref}`,
    startersUrl: `${MCP_DISCOVERY_STARTERS}${ref}`,
    provider: 'Influzer.ai',
    headline: 'Search MCP servers from inside Claude, Cursor, or ChatGPT',
    blurb: `Before you add another MCP, search Influzer from inside your chat. Our official Discovery server indexes ${countLabel} integrations by tool capability — Postgres, browser automation, scrape-to-markdown, and more.`,
    cta: 'Setup guide',
    promoCta: 'Connect in 2 minutes',
    promoBlurb: `Use Influzer MCP Discovery in Claude, ChatGPT, or Cursor — search ${countLabel} servers by capability without leaving your chat.`,
    directoryHref: MCP_DISCOVERY_PAGE,
    featured: true,
    tools: ['search_mcp_servers', 'get_mcp_server', 'recommend_mcp_servers', 'list_mcp_topics'],
  };
}

function getDiscoverySetupGuide() {
  return {
    endpoint: MCP_DISCOVERY_ENDPOINT,
    pageUrl: MCP_DISCOVERY_PAGE,
    startersUrl: MCP_DISCOVERY_STARTERS,
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

/**
 * Persona starter kits — Discovery + a few complementary servers for Cursor.
 * Secrets stay as ${env:VAR}; Discovery itself needs no auth.
 */
function getDiscoveryStarterKits() {
  return [
    {
      id: 'coding-agent',
      title: 'Coding agent stack',
      audience: 'Developers in Cursor / Claude Code',
      blurb:
        'Discover tools on demand, then keep GitHub + docs lookup in the repo. Discovery stays read-only; secrets stay in env.',
      prompt: 'Search Influzer for MCP servers for a coding agent with GitHub and docs lookup',
      cursorConfig: {
        mcpServers: {
          'influzer-discovery': { url: MCP_DISCOVERY_ENDPOINT },
          github: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${env:GITHUB_TOKEN}' },
          },
          context7: {
            command: 'npx',
            args: ['-y', '@upstash/context7-mcp'],
          },
        },
      },
    },
    {
      id: 'browser-automation',
      title: 'Browser & scrape stack',
      audience: 'Builders automating the web',
      blurb:
        'Find scrape/crawl MCPs via Discovery, then pin a primary browser or scrape server once you shortlist.',
      prompt: 'Search Influzer for MCP servers that can scrape URLs to markdown',
      cursorConfig: {
        mcpServers: {
          'influzer-discovery': { url: MCP_DISCOVERY_ENDPOINT },
          playwright: {
            command: 'npx',
            args: ['-y', '@playwright/mcp@latest'],
          },
        },
      },
    },
    {
      id: 'research-pm',
      title: 'Research & PM stack',
      audience: 'PMs and researchers in Claude / ChatGPT',
      blurb:
        'Start with Discovery in chat connectors (no local install). Ask for topic guides and compare servers before approving writes.',
      prompt: 'List Influzer topic guides for browser automation and recommend a shortlist',
      cursorConfig: {
        mcpServers: {
          'influzer-discovery': { url: MCP_DISCOVERY_ENDPOINT },
        },
      },
      note: 'For Claude Desktop / ChatGPT, use the Setup guide tabs instead of this JSON — same Discovery URL.',
    },
  ].map((kit) => ({
    ...kit,
    cursorConfigJson: JSON.stringify(kit.cursorConfig, null, 2),
  }));
}

module.exports = {
  MCP_DISCOVERY_ENDPOINT,
  MCP_DISCOVERY_PAGE,
  MCP_DISCOVERY_SETUP,
  MCP_DISCOVERY_STARTERS,
  getDiscoveryPromo,
  getDiscoverySetupGuide,
  getDiscoveryStarterKits,
};
