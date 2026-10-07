'use strict';

const assert = require('node:assert/strict');
const { probeMcpUrl, LIVE_STATUS_FROM_PROBE } = require('../services/mcpProbeService');
const { normalizeMcpEndpoint } = require('../services/mcpDirectoryService');

async function main() {
  assert.equal(LIVE_STATUS_FROM_PROBE.ok, 'live_ok');
  assert.equal(LIVE_STATUS_FROM_PROBE.ok_empty, 'live_ok');
  assert.equal(LIVE_STATUS_FROM_PROBE.auth_required, 'auth_required');

  assert.equal(
    normalizeMcpEndpoint('https://Example.com/mcp/'),
    'https://example.com/mcp',
  );

  await assert.rejects(() => probeMcpUrl(''), /url is required/);
  await assert.rejects(() => probeMcpUrl('http://example.com/mcp'), /https/);
  await assert.rejects(() => probeMcpUrl('https://localhost/mcp'), /Local/);
  await assert.rejects(() => probeMcpUrl('https://127.0.0.1/mcp'), /Private|private|not allowed/i);
  await assert.rejects(
    () => probeMcpUrl('https://user:pass@example.com/mcp'),
    /credentials/i,
  );

  const live = await probeMcpUrl('https://example.com/mcp', {
    fetchLiveMcpTools: async () => ({
      status: 'ok',
      tools: [
        { name: 'search_docs', description: 'Search documentation' },
        { name: 'get_page', description: 'Get a page' },
      ],
      httpStatus: 200,
      serverInfo: { name: 'example-mcp', version: '0.1.0' },
    }),
  });
  assert.equal(live.ok, true);
  assert.equal(live.live_status, 'live_ok');
  assert.equal(live.auth_gate, 'none_detected');
  assert.equal(live.tool_count, 2);
  assert.equal(live.safety_badge, null);
  assert.equal(live.tools[0].name, 'search_docs');
  assert.equal(live.server_info.name, 'example-mcp');
  assert.ok(live.docs.includes('/mcp/probe'));

  const gated = await probeMcpUrl('https://example.com/mcp', {
    fetchLiveMcpTools: async () => ({
      status: 'auth_required',
      tools: [],
      httpStatus: 401,
      reason: 'Authentication required',
    }),
  });
  assert.equal(gated.live_status, 'auth_required');
  assert.equal(gated.auth_gate, 'required');
  assert.equal(gated.tool_count, 0);
  assert.equal(gated.safety_badge, null);

  const down = await probeMcpUrl('https://example.com/mcp', {
    fetchLiveMcpTools: async () => ({
      status: 'unreachable',
      tools: [],
      httpStatus: 0,
      reason: 'timeout',
    }),
  });
  assert.equal(down.live_status, 'unreachable');
  assert.equal(down.reason, 'timeout');

  console.log('mcp probe API tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
