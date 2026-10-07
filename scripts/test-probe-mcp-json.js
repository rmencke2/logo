'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const { extractRemoteUrls, run, loadConfig } = require('./probe-mcp-json');

async function main() {
  const cursor = extractRemoteUrls({
    mcpServers: {
      discovery: { url: 'https://www.influzer.ai/mcp/discovery' },
      local: { command: 'npx', args: ['-y', 'foo'] },
      insecure: { url: 'http://example.com/mcp' },
    },
  });
  assert.equal(cursor.length, 1);
  assert.equal(cursor[0].url, 'https://www.influzer.ai/mcp/discovery');

  const acp = extractRemoteUrls([
    { type: 'http', name: 'd', url: 'https://www.influzer.ai/mcp/discovery' },
    { type: 'stdio', name: 'g', command: 'npx' },
  ]);
  assert.equal(acp.length, 1);

  const fixture = loadConfig(path.join(__dirname, 'fixtures', 'mcp.ci.json'));
  assert.equal(extractRemoteUrls(fixture).length, 1);

  const empty = await run({ config: { mcpServers: {} }, base: 'https://www.influzer.ai' });
  assert.equal(empty.ok, true);
  assert.equal(empty.probed, 0);
  assert.equal(empty.safety_badge, null);

  const live = await run({
    config: fixture,
    base: 'https://www.influzer.ai',
    fetchImpl: async () => ({
      status: 200,
      json: async () => ({
        ok: true,
        live_status: 'live_ok',
        tool_count: 4,
        safety_badge: null,
      }),
    }),
  });
  assert.equal(live.ok, true);
  assert.equal(live.results[0].verdict, 'pass');

  const down = await run({
    config: fixture,
    base: 'https://www.influzer.ai',
    fetchImpl: async () => ({
      status: 200,
      json: async () => ({ ok: true, live_status: 'unreachable' }),
    }),
  });
  assert.equal(down.ok, false);

  const gated = await run({
    config: fixture,
    base: 'https://www.influzer.ai',
    fetchImpl: async () => ({
      status: 200,
      json: async () => ({ ok: true, live_status: 'auth_required' }),
    }),
  });
  assert.equal(gated.ok, true);

  console.log('probe-mcp-json tests passed');
}

main();
