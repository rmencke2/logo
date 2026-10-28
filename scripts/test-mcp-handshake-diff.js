'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-handshake-diff-'));
process.env.MCP_HANDSHAKE_DIFF_PATH = path.join(dir, 'diff.json');
process.env.MCP_HANDSHAKE_DIFF_LOCAL_PATH = path.join(dir, 'diff.local.json');

const {
  diffValidationEntry,
  handshakeFlipEvent,
  appendHandshakeEvents,
  getHandshakeChanges,
  buildHandshakeDiffRss,
  endpointToLive,
} = require('../services/mcpHandshakeDiffService');
const reserved = fs.readFileSync(path.join(__dirname, '..', 'services', 'mcpSubmissionService.js'), 'utf8');
assert.match(reserved, /'changes'/);

assert.equal(endpointToLive('ok'), 'live_ok');
assert.equal(endpointToLive('auth_required'), 'auth_required');
assert.equal(endpointToLive('failed'), 'unreachable');
assert.equal(endpointToLive(''), null);

const prev = {
  endpoint_status: 'ok',
  tool_count: 2,
  tool_fingerprint: 'alpha:one|beta:two',
  validated_at: '2026-10-20T00:00:00.000Z',
};
const next = {
  endpoint_status: 'unreachable',
  tool_count: 2,
  tool_fingerprint: 'alpha:one|gamma:three',
  validated_at: '2026-10-27T12:00:00.000Z',
};
const change = diffValidationEntry(prev, next, { slug: 'Example', at: '2026-10-27T12:00:00.000Z' });
assert.equal(change.slug, 'example');
assert.equal(change.kind, 'handshake');
assert.equal(change.from_status, 'live_ok');
assert.equal(change.to_status, 'unreachable');
assert.deepEqual(change.tools_added, ['gamma']);
assert.deepEqual(change.tools_removed, ['beta']);

const toolsOnly = diffValidationEntry(
  { endpoint_status: 'ok', tool_count: 1, tool_fingerprint: 'alpha:one', validated_at: '2026-10-01T00:00:00.000Z' },
  { endpoint_status: 'ok', tool_count: 2, tool_fingerprint: 'alpha:one|beta:two', validated_at: '2026-10-27T00:00:00.000Z' },
  { slug: 'tools', at: '2026-10-27T00:00:00.000Z' },
);
assert.equal(toolsOnly.kind, 'tools');
assert.equal(toolsOnly.tools_added_count, 1);

assert.equal(diffValidationEntry(prev, prev, { slug: 'same' }), null);

const firstSeen = diffValidationEntry(
  null,
  {
    endpoint_status: 'auth_required',
    tool_count: 2,
    tool_fingerprint: 'check_url:d|list_sources:d',
  },
  { slug: 'new-host', at: '2026-10-20T00:00:00.000Z', source: 'validation' }
);
assert.equal(firstSeen.kind, 'handshake');
assert.equal(firstSeen.from_status, null);
assert.equal(firstSeen.to_status, 'auth_required');
assert.equal(firstSeen.tools_added_count, 0);
assert.equal(handshakeFlipEvent({ slug: 'x', from_status: 'live_ok', to_status: 'live_ok' }), null);

const flip = handshakeFlipEvent({
  slug: 'probe-demo',
  from_status: 'unreachable',
  to_status: 'live_ok',
  at: '2026-10-28T08:00:00.000Z',
  source: 'probe',
});
assert.equal(appendHandshakeEvents([change, toolsOnly, flip], { local: false }), 3);
assert.equal(appendHandshakeEvents([change], { local: false }), 0);

const feed = getHandshakeChanges({ since: '2026-10-01T00:00:00.000Z' });
assert.equal(feed.safety_badge, null);
assert.equal(feed.counts.unreachable, 1);
assert.equal(feed.counts.live_ok, 1);
assert.equal(feed.counts.tools >= 1, true);
assert.equal(feed.events[0].name, 'probe-demo');

const tools = getHandshakeChanges({ since: '2026-10-01T00:00:00.000Z', kind: 'tools' });
assert.equal(tools.events.some((event) => event.slug === 'example'), true);
assert.equal(tools.events.some((event) => event.slug === 'probe-demo'), false);

const rss = buildHandshakeDiffRss({ days: 30 });
assert.match(rss, /handshake diff/);
assert.match(rss, /probe-demo/);
assert.match(rss, /Not a safe-to-install badge/);

const home = fs.readFileSync(path.join(__dirname, '..', 'views', 'home.ejs'), 'utf8');
assert.match(home, /\/mcp\/changes/);
const index = fs.readFileSync(path.join(__dirname, '..', 'views', 'mcp-index.ejs'), 'utf8');
assert.match(index, /href="\/mcp\/changes"/);
const page = fs.readFileSync(path.join(__dirname, '..', 'views', 'mcp-changes.ejs'), 'utf8');
assert.match(page, /Not a safe-to-install badge/);
assert.match(page, /rss.xml/);

console.log('mcp handshake diff tests passed');
