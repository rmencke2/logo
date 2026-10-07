'use strict';

const assert = require('node:assert/strict');
const {
  buildHandshakeBadgeSvg,
  resolveBadgeStyle,
  badgeUrlForSlug,
  badgeMarkdown,
  STATUS_STYLE,
} = require('../services/mcpHandshakeBadge');
const {
  svgForProbeUrl,
  clearHandshakeBadgeCache,
  handleBadgeRequest,
} = require('../services/mcpProbeService');
const { buildInstallSnippets } = require('../services/mcpInstallSnippets');

const GREEN = /#22c55e|#16a34a|#15803d|#10b981|#059669|#4ade80|#86efac/i;

function mockRes() {
  const headers = {};
  return {
    headers,
    statusCode: 200,
    body: null,
    setHeader(k, v) {
      headers[k.toLowerCase()] = v;
    },
    removeHeader(k) {
      delete headers[String(k).toLowerCase()];
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}

async function main() {
  const live = buildHandshakeBadgeSvg({ liveStatus: 'live_ok' });
  assert.match(live, /live_ok/);
  assert.match(live, /MCP handshake/);
  assert.match(live, /#4f46e5/);
  assert.equal(GREEN.test(live), false);
  assert.equal(/safe/i.test(live.replace('not a SAFE badge', '')), false);
  assert.match(live, /not a SAFE badge/);

  const gated = buildHandshakeBadgeSvg({ liveStatus: 'auth_required' });
  assert.match(gated, /auth_required/);
  assert.match(gated, /#d97706/);
  assert.equal(GREEN.test(gated), false);

  const down = buildHandshakeBadgeSvg({ liveStatus: 'unreachable' });
  assert.match(down, /unreachable/);
  assert.match(down, /#6b7280/);

  const stdio = buildHandshakeBadgeSvg({ errorCode: 'stdio_only' });
  assert.match(stdio, />stdio</);
  assert.equal(resolveBadgeStyle({ errorCode: 'url_required' }).right, 'url required');
  assert.equal(STATUS_STYLE.live_ok.color, '#4f46e5');

  const md = badgeMarkdown({
    badgeUrl: badgeUrlForSlug('influzer-mcp-discovery'),
    href: 'https://www.influzer.ai/mcp/probe',
  });
  assert.match(md, /\/api\/v1\/probe\/badge\?slug=influzer-mcp-discovery/);
  assert.match(md, /\[!\[MCP handshake\]/);

  const remote = buildInstallSnippets({
    slug: 'influzer-mcp-discovery',
    name: 'Influzer MCP Discovery',
    mcp_endpoint: 'https://www.influzer.ai/mcp/discovery',
  });
  assert.ok(remote.badge_url.includes('slug=influzer-mcp-discovery'));
  assert.ok(remote.badge_markdown.includes(remote.badge_url));
  assert.ok(remote.markdown.includes('MCP handshake'));

  const local = buildInstallSnippets({
    slug: 'github',
    name: 'GitHub',
    transport: 'stdio',
    install_command: 'claude mcp add github -- npx -y @modelcontextprotocol/server-github',
  });
  assert.equal(local.badge_url, null);
  assert.equal(local.badge_markdown, null);
  assert.equal(local.markdown.includes('/api/v1/probe/badge'), false);

  clearHandshakeBadgeCache();
  let fetches = 0;
  const fetchLiveMcpTools = async () => {
    fetches += 1;
    return {
      status: 'ok',
      tools: [{ name: 'search', description: 'Search' }],
      httpStatus: 200,
      serverInfo: { name: 'example', version: '1' },
    };
  };
  const first = await svgForProbeUrl('https://example.com/mcp', { fetchLiveMcpTools });
  assert.equal(first.status, 200);
  assert.match(first.svg, /live_ok/);
  const second = await svgForProbeUrl('https://example.com/mcp', { fetchLiveMcpTools });
  assert.equal(fetches, 1);
  assert.equal(second.svg, first.svg);

  clearHandshakeBadgeCache();
  const blocked = await svgForProbeUrl('https://127.0.0.1/mcp');
  assert.equal(blocked.status, 400);
  assert.match(blocked.svg, /blocked/);

  const missing = mockRes();
  await handleBadgeRequest({ query: {} }, missing);
  assert.equal(missing.statusCode, 400);
  assert.match(String(missing.body), /url required/);
  assert.match(missing.headers['content-type'], /image\/svg\+xml/);
  assert.equal(missing.headers['access-control-allow-origin'], '*');
  assert.match(missing.headers['cache-control'], /max-age=/);

  const noSlug = mockRes();
  await handleBadgeRequest({ query: { slug: 'this-server-does-not-exist-zzz' } }, noSlug);
  assert.equal(noSlug.statusCode, 404);
  assert.match(String(noSlug.body), /not found/);

  console.log('mcp handshake badge tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
