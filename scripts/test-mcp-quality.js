'use strict';

const assert = require('node:assert/strict');
const {
  computeQualitySignals,
  qualityRankBoost,
  summarizeQuality,
} = require('./utils/mcp-quality');

function main() {
  const ready = computeQualitySignals(
    {
      slug: 'github',
      transport: 'http',
      tools: [
        { name: 'list_issues', description: 'List issues' },
        { name: 'create_issue', description: 'Create issue' },
      ],
      official: true,
      source: 'manual',
      mcp_endpoint: 'https://example.com/mcp',
    },
    {
      endpoint_status: 'ok',
      validation_method: 'live_mcp',
      validated_at: '2026-09-16T00:00:00.000Z',
      tool_count: 2,
    },
  );
  assert.equal(ready.demoware_tier, 'ready');
  assert.equal(ready.live_status, 'live_ok');
  assert.equal(ready.auth_gate, 'none_detected');
  assert.equal(ready.tools_source, 'live');
  assert.equal(ready.safety_badge, null);
  assert.ok(ready.badges.some((b) => b.label === 'Ready surface'));
  assert.ok(ready.badges.some((b) => b.label === 'Live OK'));
  assert.ok(qualityRankBoost(ready) > 0);

  const auth = computeQualitySignals(
    {
      slug: 'sheets',
      transport: 'http',
      tools: [{ name: 'read', description: 'Read sheet' }, { name: 'write', description: 'Write' }],
      mcp_endpoint: 'https://example.com/mcp',
    },
    { endpoint_status: 'auth_required', validation_method: 'live_mcp+smithery_fallback' },
  );
  assert.equal(auth.live_status, 'auth_required');
  assert.equal(auth.auth_gate, 'required');
  assert.equal(auth.demoware_tier, 'ready');
  assert.ok(auth.badges.some((b) => b.kind === 'auth'));

  const thin = computeQualitySignals(
    {
      slug: 'corpusiq-stub',
      transport: 'unknown',
      tools: [],
      docs_url: 'https://example.com/docs',
      mcp_endpoint: 'https://mcp.example.com/mcp',
    },
    null,
  );
  assert.equal(thin.demoware_tier, 'thin');
  assert.equal(thin.live_status, 'not_probed');
  assert.equal(thin.tools_source, 'none');
  assert.ok(qualityRankBoost(thin) < 0);

  const local = computeQualitySignals(
    { slug: 'fs', transport: 'stdio', tools: [{ name: 'read_file', description: 'Read' }] },
    null,
  );
  assert.equal(local.live_status, 'local_unprobed');
  assert.equal(local.demoware_tier, 'indexed');

  const unverified = computeQualitySignals(
    { slug: 'mystery', transport: 'unknown', tools: [] },
    null,
  );
  assert.equal(unverified.demoware_tier, 'unverified');

  const summary = summarizeQuality(ready);
  assert.equal(summary.safety_badge, null);
  assert.equal(summary.demoware_tier, 'ready');

  // Join against real validation state for a known probed slug when present
  const {
    clearMcpCache,
    findMcpServerBySlug,
    getMcpCatalogPayload,
  } = require('../services/mcpDirectoryService');
  clearMcpCache();
  const payload = getMcpCatalogPayload('top');
  assert.ok(payload.servers.length > 0);
  assert.ok(payload.servers[0].quality);
  assert.equal(payload.servers[0].quality.safety_badge, null);
  assert.ok(payload.quality_counts);
  assert.ok(typeof payload.quality_counts.tools_indexed === 'number');

  const filtered = getMcpCatalogPayload('top', { quality: 'indexed' });
  assert.ok(filtered.servers.every((s) => s.quality.tools_indexed));

  const sample = findMcpServerBySlug(payload.servers[0].slug);
  assert.ok(sample.quality);
  assert.ok(sample.quality.demoware_tier_label);

  console.log('MCP quality layer tests passed');
}

main();
