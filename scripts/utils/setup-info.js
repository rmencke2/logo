/**
 * Connection URLs and human-readable setup steps per MCP server.
 */

/**
 * @param {object} server
 */
function attachSetupInfo(server) {
  if (server.slug === 'influzer-mcp-discovery') {
    const endpoint = server.mcp_endpoint || 'https://www.influzer.ai/mcp/discovery';
    return {
      ...server,
      connection_url: endpoint,
      primary_url: 'https://www.influzer.ai/mcp/discovery/setup',
      setup_steps: [
        {
          title: 'Claude (Desktop or claude.ai)',
          text:
            'Settings → Connectors → Add custom connector → Web\n' +
            `URL: ${endpoint}\n` +
            'No OAuth required. Enable the connector in a new chat, then ask e.g. "Search Influzer for Postgres MCP servers."',
        },
        {
          title: 'ChatGPT',
          text:
            'Settings → Apps & Connectors → Advanced → Developer mode ON\n' +
            'Create connector → paste URL exactly:\n' +
            `${endpoint}\n` +
            'Auth: None. In a new chat: + → Developer mode → enable Influzer.',
        },
        {
          title: 'Cursor',
          text:
            'Settings → MCP, or .cursor/mcp.json:\n' +
            `{\n  "mcpServers": {\n    "influzer-discovery": {\n      "url": "${endpoint}"\n    }\n  }\n}`,
        },
      ],
      setup_summary: `Remote MCP at ${endpoint} — see /mcp/discovery/setup for full guide`,
    };
  }

  const smitheryPage =
    server.smithery_page_url ||
    (server.smithery_qualified_name
      ? `https://smithery.ai/servers/${server.smithery_qualified_name}`
      : null) ||
    (String(server.docs_url || '').includes('smithery.ai/servers') ? server.docs_url : null);

  const glamaPage =
    server.glama_url ||
    (String(server.docs_url || '').includes('glama.ai/mcp') ? server.docs_url : null);

  const connectionUrl =
    server.mcp_endpoint || server.deployment_url || server.connection_url || null;

  const primaryUrl =
    smitheryPage || glamaPage || server.docs_url || server.github_url || connectionUrl || null;

  const setupSteps = [];

  if (server.install_command) {
    setupSteps.push({
      title: 'Install (Claude Code / CLI)',
      text: `Run this in your terminal, then restart your client:\n${server.install_command}`,
    });
  }

  if (smitheryPage) {
    setupSteps.push({
      title: 'Smithery (hosted)',
      text: connectionUrl
        ? `1. Open ${smitheryPage}\n2. Click Connect and complete OAuth in your MCP client (Claude, Cursor, VS Code, etc.)\n3. MCP endpoint: ${connectionUrl}`
        : `1. Open ${smitheryPage}\n2. Click Connect and follow the prompts for your AI client\n3. Smithery handles auth and remote hosting`,
    });
  }

  if (glamaPage && !smitheryPage) {
    setupSteps.push({
      title: 'Glama registry',
      text: server.github_url
        ? `View ${glamaPage} for deploy options, or install from ${server.github_url} (see README for MCP config).`
        : `View ${glamaPage} for install and deploy instructions.`,
    });
  }

  if (server.github_url && !server.install_command && !smitheryPage) {
    setupSteps.push({
      title: 'GitHub',
      text: `Install from ${server.github_url} and add the server to your MCP client configuration (see repository README).`,
    });
  }

  if (connectionUrl && !smitheryPage) {
    setupSteps.push({
      title: 'MCP endpoint URL',
      text: `Add this URL in your MCP client settings:\n${connectionUrl}`,
    });
  }

  if (!setupSteps.length && primaryUrl) {
    setupSteps.push({
      title: 'Get started',
      text: `Open ${primaryUrl} for documentation and connection details.`,
    });
  }

  const setupSummary = setupSteps[0]
    ? setupSteps[0].text.split('\n')[0].slice(0, 160)
    : primaryUrl
      ? `See ${primaryUrl}`
      : 'Open the detail page for setup links.';

  return {
    ...server,
    smithery_page_url: smitheryPage || undefined,
    glama_url: glamaPage || undefined,
    connection_url: connectionUrl || undefined,
    primary_url: primaryUrl || undefined,
    setup_steps: setupSteps,
    setup_summary: setupSummary,
  };
}

module.exports = { attachSetupInfo };
