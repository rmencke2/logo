'use strict';

const assert = require('node:assert/strict');
const {
  buildInstallSnippets,
  configKey,
  httpsRemoteUrl,
  parseStdioFromInstall,
} = require('../services/mcpInstallSnippets');

function main() {
  assert.equal(configKey('Influzer MCP Discovery'), 'influzer-mcp-discovery');
  assert.equal(
    httpsRemoteUrl({ mcp_endpoint: 'https://www.influzer.ai/mcp/discovery' }),
    'https://www.influzer.ai/mcp/discovery',
  );
  assert.equal(httpsRemoteUrl({ mcp_endpoint: 'http://insecure.example/mcp' }), null);

  const stdio = parseStdioFromInstall(
    'claude mcp add github -- npx -y @modelcontextprotocol/server-github',
  );
  assert.deepEqual(stdio, { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] });

  const remote = buildInstallSnippets({
    slug: 'influzer-mcp-discovery',
    name: 'Influzer MCP Discovery',
    mcp_endpoint: 'https://www.influzer.ai/mcp/discovery',
    quality: {
      demoware_tier: 'ready',
      demoware_tier_label: 'Ready surface',
      live_status: 'live_ok',
      live_status_label: 'Live OK',
      auth_gate: 'none_detected',
      note: 'Observable catalog + probe facts — not a safe-to-install badge.',
    },
  });
  assert.equal(remote.ok, true);
  assert.equal(remote.safety_badge, null);
  assert.equal(remote.has_remote, true);
  assert.ok(remote.clients.cursor.code.includes('https://www.influzer.ai/mcp/discovery'));
  assert.ok(remote.clients['claude-code'].code.includes('--transport http'));
  assert.ok(remote.clients.acp.code.includes('"type": "http"'));
  assert.equal(remote.clients.claude.available, true);
  assert.ok(remote.markdown.includes('Connect Influzer MCP Discovery'));
  assert.ok(remote.embed_html.includes('data-influzer-install="influzer-mcp-discovery"'));

  const local = buildInstallSnippets({
    slug: 'github',
    name: 'GitHub',
    transport: 'stdio',
    install_command: 'claude mcp add github -- npx -y @modelcontextprotocol/server-github',
  });
  assert.equal(local.has_remote, false);
  assert.equal(local.stdio_only, true);
  assert.equal(local.clients.claude.available, false);
  assert.equal(local.clients.chatgpt.available, false);
  assert.equal(local.clients.cursor.available, true);
  assert.ok(local.clients.cursor.code.includes('"command": "npx"'));
  assert.ok(local.clients.acp.code.includes('"type": "stdio"'));

  const { snippetsForSlug } = require('../services/mcpInstallService');
  const live = snippetsForSlug('influzer-mcp-discovery');
  assert.ok(live);
  assert.equal(live.slug, 'influzer-mcp-discovery');
  assert.equal(live.has_remote, true);

  console.log('mcp install snippets tests passed');
}

main();
