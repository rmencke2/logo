'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const warmPath = path.join(os.tmpdir(), `mcp-handshake-warm-${process.pid}.json`);
process.env.MCP_HANDSHAKE_WARM_PATH = warmPath;
process.env.MCP_WARM_PROBE = '1';

const {
  listWarmProbeTargets,
  warmProbeHttpsListings,
  peekHandshake,
  clearHandshakeOverlay,
} = require('../services/mcpHandshakeOverlay');
const { attachQuality, clearMcpCache, findMcpServerBySlug } = require('../services/mcpDirectoryService');

async function main() {
  clearHandshakeOverlay();
  clearMcpCache();

  const targets = listWarmProbeTargets();
  const slugs = targets.map((t) => t.slug);
  assert.ok(slugs.includes('macaly-cloud'), 'homepage remote Macaly should be warmed');
  assert.equal(slugs.includes('influzer-mcp-discovery'), false);
  assert.ok(slugs.includes('firecrawl'), 'Firecrawl now has a published HTTPS MCP URL');
  assert.ok(targets.every((t) => /^https:\/\//i.test(t.url)));

  const skipped = await warmProbeHttpsListings({
    enabled: false,
    targets,
  });
  assert.equal(skipped.skipped, true);

  let calls = 0;
  const summary = await warmProbeHttpsListings({
    persist: true,
    targets: [
      { slug: 'macaly-cloud', url: 'https://www.macaly.com/api/cloud/mcp' },
      { slug: 'stdio-should-not-be-here', url: 'https://example.com/mcp' },
    ],
    probeMcpUrl: async (url) => {
      calls += 1;
      return {
        ok: true,
        url,
        live_status: url.includes('macaly') ? 'live_ok' : 'auth_required',
        probed_at: '2026-10-07T20:00:00.000Z',
        catalog: [],
      };
    },
  });
  assert.equal(calls, 2);
  assert.equal(summary.probed, 2);
  assert.equal(summary.live_ok, 1);
  assert.equal(summary.auth_required, 1);
  assert.equal(peekHandshake({ slug: 'macaly-cloud' }).endpoint_status, 'ok');
  assert.ok(fs.existsSync(warmPath));
  const disk = JSON.parse(fs.readFileSync(warmPath, 'utf8'));
  assert.equal(disk.servers['macaly-cloud'].endpoint_status, 'ok');
  assert.equal(disk.servers['macaly-cloud'].safety_badge, undefined);

  seedCacheReload();
  clearMcpCache();
  const macaly = findMcpServerBySlug('macaly-cloud');
  assert.ok(macaly);
  assert.equal(macaly.quality.live_status, 'live_ok');
  assert.match(macaly.quality.handshake_svg, /live_ok/);
  assert.equal(macaly.quality.safety_badge, null);

  const firecrawl = attachQuality({
    slug: 'firecrawl-stdio',
    transport: 'stdio',
    tools: [{ name: 'scrape_url' }],
  });
  assert.equal(firecrawl.quality.live_status, 'local_unprobed');

  fs.unlinkSync(warmPath);
  console.log('mcp warm probe tests passed');
}

function seedCacheReload() {
  clearHandshakeOverlay();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
