'use strict';

const assert = require('node:assert/strict');
const { clearMcpCache, findMcpServerBySlug } = require('../services/mcpDirectoryService');
const { httpsRemoteUrl } = require('../services/mcpInstallSnippets');

const EXPECTED = {
  linear: 'https://mcp.linear.app/mcp',
  notion: 'https://mcp.notion.com/mcp',
  stripe: 'https://mcp.stripe.com',
  supabase: 'https://mcp.supabase.com/mcp',
  figma: 'https://mcp.figma.com/mcp',
  firecrawl: 'https://mcp.firecrawl.dev/v2/mcp',
  hubspot: 'https://mcp.hubspot.com',
  netlify: 'https://netlify-mcp.netlify.app/mcp',
  'google-mcp-servers': 'https://cloudcli.googleapis.com/mcp',
  'google-cloud': 'https://cloudcli.googleapis.com/mcp',
  context7: 'https://mcp.context7.com/mcp',
  sentry: 'https://mcp.sentry.dev/mcp',
  neon: 'https://mcp.neon.tech/mcp',
  'atlassian-mcp': 'https://mcp.atlassian.com/v2/mcp',
  'railway-mcp': 'https://mcp.railway.com',
  'granola-mcp': 'https://mcp.granola.ai/mcp',
};

async function main() {
  clearMcpCache();

  for (const [slug, url] of Object.entries(EXPECTED)) {
    const server = findMcpServerBySlug(slug);
    assert.ok(server, slug);
    assert.equal(httpsRemoteUrl(server), url, slug);
    assert.equal(server.transport, 'http', slug);
    assert.equal(server.quality?.safety_badge, null, slug);
  }

  const shopify = findMcpServerBySlug('shopify');
  assert.ok(shopify);
  assert.equal(httpsRemoteUrl(shopify), null);
  assert.match(shopify.description, /myshopify\.com\/api\/mcp/);
  assert.equal(shopify.description.includes('{shop}'), true);
  assert.equal(/safe/i.test(shopify.description.replace(/not a SAFE badge/gi, '')), false);

  console.log('mcp vendor remote URL tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
