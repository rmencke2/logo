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
  'loopertask-com': 'https://loopertask.com/mcp',
  'google-drive': 'https://drivemcp.googleapis.com/mcp/v1',
  'desktop-commander': 'https://mcp.desktopcommander.app/mcp',
  gitlab: 'https://gitlab.com/api/v4/mcp',
  replit: 'https://mcp.replit.com/server/mcp',
  gmail: 'https://gmailmcp.googleapis.com/mcp/v1',
  exa: 'https://mcp.exa.ai/mcp',
  bigquery: 'https://bigquery.googleapis.com/mcp',
  airtable: 'https://mcp.airtable.com/mcp',
  asana: 'https://mcp.asana.com/v2/mcp',
  aws: 'https://aws-mcp.us-east-1.api.aws/mcp',
  canva: 'https://mcp.canva.com/mcp',
  dropbox: 'https://mcp.dropbox.com/mcp',
  'google-calendar': 'https://calendarmcp.googleapis.com/mcp/v1',
  'google-sheets': 'https://sheetsmcp.googleapis.com/mcp/v1',
  confluence: 'https://mcp.atlassian.com/v2/mcp',
  jira: 'https://mcp.atlassian.com/v2/mcp',
  keboola: 'https://mcp.keboola.com/mcp',
  mem0: 'https://mcp.mem0.ai/mcp',
  'mercado-pago': 'https://mcp.mercadopago.com/mcp',
  monday: 'https://mcp.monday.com/mcp',
  motherduck: 'https://api.motherduck.com/mcp',
  pagerduty: 'https://mcp.pagerduty.com/mcp',
  slidespeak: 'https://mcp.slidespeak.co/mcp',
  datadog: 'https://mcp.datadoghq.com/v1/mcp',
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

  // Per-instance / unverified / HTML-403 — do not invent a host.
  for (const slug of ['mercado-libre', 'postgres', 'mongodb', 'n8n', 'snowflake']) {
    const server = findMcpServerBySlug(slug);
    assert.ok(server, slug);
    assert.equal(httpsRemoteUrl(server), null, slug);
  }

  console.log('mcp vendor remote URL tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
