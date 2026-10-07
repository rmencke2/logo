'use strict';

const assert = require('node:assert/strict');
const { validateServer } = require('./utils/mcp-validator');
const {
  rememberHandshake,
  peekHandshake,
  handshakeClockStatus,
  mergeHandshakeEntry,
  listingHandshakeSvg,
  refreshListingHandshake,
  clearHandshakeOverlay,
} = require('../services/mcpHandshakeOverlay');
const { computeQualitySignals } = require('./utils/mcp-quality');
const { attachQuality, clearMcpCache, findMcpServerBySlug } = require('../services/mcpDirectoryService');

async function main() {
  const manualOk = await validateServer(
    {
      slug: 'influzer-mcp-discovery',
      name: 'Influzer MCP Discovery',
      source: 'manual',
      mcp_endpoint: 'https://www.influzer.ai/mcp/discovery',
      tools: [{ name: 'search_mcp_servers' }],
    },
    {
      mutate: false,
      fetchLiveMcpTools: async () => ({
        status: 'ok',
        tools: [{ name: 'search_mcp_servers' }],
        httpStatus: 200,
      }),
    },
  );
  assert.equal(manualOk.status, 'handshake_ok');
  assert.equal(manualOk.endpointStatus, 'ok');

  const stdioManual = await validateServer(
    { slug: 'fs', source: 'manual', transport: 'stdio', tools: [{ name: 'read' }] },
    { mutate: false },
  );
  assert.equal(stdioManual.status, 'skipped_manual');

  clearHandshakeOverlay();
  rememberHandshake({
    slug: 'demo-remote',
    url: 'https://example.com/mcp',
    liveStatus: 'live_ok',
    probedAt: '2026-10-07T00:00:00.000Z',
  });
  const peeked = peekHandshake({ slug: 'demo-remote' });
  assert.equal(peeked.endpoint_status, 'ok');
  assert.equal(handshakeClockStatus({ slug: 'demo-remote' }), 'live_ok');
  assert.equal(handshakeClockStatus({ url: 'https://example.com/mcp' }), 'live_ok');

  const merged = mergeHandshakeEntry(
    { slug: 'demo-remote', mcp_endpoint: 'https://example.com/mcp' },
    null,
  );
  assert.equal(merged.endpoint_status, 'ok');

  const svg = listingHandshakeSvg({ live_status: 'live_ok' });
  assert.match(svg, /live_ok/);
  assert.match(svg, /#4f46e5/);
  assert.equal(listingHandshakeSvg({ live_status: 'local_unprobed' }), '');

  const attached = attachQuality({
    slug: 'demo-remote',
    name: 'Demo',
    transport: 'http',
    mcp_endpoint: 'https://example.com/mcp',
    tools: [{ name: 'a' }, { name: 'b' }],
  });
  assert.equal(attached.quality.live_status, 'live_ok');
  assert.match(attached.quality.handshake_svg, /live_ok/);

  const refreshed = await refreshListingHandshake(
    attachQuality({
      slug: 'fresh-remote',
      transport: 'http',
      mcp_endpoint: 'https://gated.example.com/mcp',
      tools: [{ name: 'a' }],
    }),
    async () => ({
      ok: true,
      url: 'https://gated.example.com/mcp',
      live_status: 'auth_required',
      probed_at: '2026-10-07T00:00:00.000Z',
      catalog: [],
    }),
  );
  assert.equal(refreshed.quality.live_status, 'auth_required');
  assert.match(refreshed.quality.handshake_svg, /auth_required/);

  clearMcpCache();
  const discovery = findMcpServerBySlug('influzer-mcp-discovery');
  assert.ok(discovery);
  assert.equal(discovery.quality.live_status, 'live_ok');
  assert.ok(discovery.quality.handshake_svg);
  assert.equal(discovery.quality.safety_badge, null);

  const localListing = attachQuality({
    slug: 'local-stdio-demo',
    transport: 'stdio',
    tools: [{ name: 'read_file' }],
  });
  assert.equal(localListing.quality.live_status, 'local_unprobed');
  assert.equal(localListing.quality.handshake_svg, '');

  const quality = computeQualitySignals(discovery, { endpoint_status: 'ok', validation_method: 'live_mcp' });
  assert.equal(quality.live_status, 'live_ok');

  console.log('mcp listing handshake tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
