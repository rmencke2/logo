'use strict';

/**
 * SEO / Search Console sanity checks for indexing hygiene.
 * Run: node scripts/test-seo-indexing.js
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  findMcpServerBySlug,
  getAllMcpServers,
  getSitemapMcpServers,
  isSitemapEligibleMcpServer,
  getTop100McpServers,
} = require('../services/mcpDirectoryService');
const {
  getWebmcpSitemapEntries,
  getWebmcpSitemapSites,
  isSitemapEligibleWebmcpHost,
  WEBMCP_SITEMAP_SITE_CAP,
  loadCatalog,
} = require('../services/webmcpDirectoryService');
const {
  readKey,
  moneyPageUrls,
  submitIndexNow,
  keyLocation,
} = require('../services/indexNowService');

async function main() {
  const robots = fs.readFileSync(path.join(__dirname, '..', 'public', 'robots.txt'), 'utf8');
  assert.match(robots, /Sitemap:\s+https:\/\/www\.influzer\.ai\/sitemap\.xml/);
  assert.match(robots, /Disallow:\s+\/api\//);
  assert.match(robots, /Disallow:\s+\/login/);
  assert.match(robots, /Disallow:\s+\/mcp\/discovery/);
  assert.match(robots, /Allow:\s+\/mcp\/discovery\/setup/);
  assert.match(robots, /Allow:\s+\/mcp\/discovery\/starters/);
  assert.match(robots, /LLM crawlers/);
  assert.match(robots, /User-agent:\s+GPTBot/);
  assert.match(robots, /User-agent:\s+ClaudeBot/);
  assert.match(robots, /User-agent:\s+PerplexityBot/);
  assert.match(robots, /User-agent:\s+Google-Extended/);
  assert.match(robots, /Disallow:\s+\/api\//);

  const { buildLlmsTxt } = require('../services/llmsTxt');
  const llms = buildLlmsTxt({
    countSentence: '14,159 servers listed',
    updated: 'October 29, 2026',
  });
  assert.match(llms, /14,159 servers listed/);
  assert.match(llms, /^\s*#\s+.+/m); // Lighthouse Agentic: Markdown H1
  assert.match(llms, /\[.+\]\(.+\)/); // Lighthouse Agentic: Markdown link
  assert.ok(llms.length >= 50);
  assert.match(llms, /\[Handshake methodology\]\(https:\/\/www\.influzer\.ai\/methodology\)/);
  assert.match(llms, /\[robots\.txt\]\(https:\/\/www\.influzer\.ai\/robots\.txt\)/);
  assert.match(llms, /every public MCP listing and every public WebMCP site/);
  assert.match(llms, /\/mcp\/browse/);
  assert.match(llms, /\/webmcp\/browse/);
  const bare = buildLlmsTxt({});
  assert.doesNotMatch(bare, /servers listed/);
  assert.doesNotMatch(bare, /\d{4,}/);

  const all = getAllMcpServers();
  const sitemapServers = getSitemapMcpServers();
  const top = getTop100McpServers();

  assert.ok(all.length > 1000, 'expected full catalog loaded');
  assert.equal(
    sitemapServers.length,
    all.length,
    `sitemap set (${sitemapServers.length}) should include every public server (${all.length})`,
  );
  assert.ok(
    sitemapServers.length >= top.length,
    'sitemap should include at least Top 100',
  );
  const topSlugs = new Set(top.map((s) => s.slug));
  const longTail = all.find(
    (s) =>
      !(s.tools || []).length &&
      s.source !== 'manual' &&
      !s.featured &&
      !topSlugs.has(s.slug),
  );
  if (longTail) {
    assert.equal(isSitemapEligibleMcpServer(longTail.slug), true);
  }

  // Soft-404 MCP template should pass noindex via seo-social
  const mcpServerTpl = fs.readFileSync(
    path.join(__dirname, '..', 'views', 'mcp-server.ejs'),
    'utf8',
  );
  assert.match(mcpServerTpl, /noindex:\s*typeof noindex/);
  assert.match(mcpServerTpl, /listingDescription/);
  assert.match(mcpServerTpl, /'vscode'/);
  assert.match(mcpServerTpl, /verification\.history/);

  const staticSrc = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'staticService.js'),
    'utf8',
  );
  assert.match(staticSrc, /app\.get\('\/llms\.txt'/);
  assert.match(staticSrc, /host === 'influzer\.ai'/);
  assert.match(staticSrc, /app\.get\('\/index\.html'/);
  assert.match(staticSrc, /getSitemapMcpServers\(\)/);
  assert.match(staticSrc, /sitemap-core\.xml/);
  assert.match(staticSrc, /sitemap-mcp\.xml/);
  assert.match(staticSrc, /sitemap-webmcp\.xml/);
  assert.match(staticSrc, /sitemapindex/);
  assert.match(staticSrc, /isSitemapEligibleMcpServer/);
  assert.match(staticSrc, /isSearchEngineBot/);
  assert.match(staticSrc, /registerIndexNowRoutes/);
  assert.match(staticSrc, /favicon-generator[\s\S]*redirect\(301/);
  assert.match(staticSrc, /X-Robots-Tag.*noindex/);
  assert.match(staticSrc, /MCP listing render failed/);
  assert.match(
    staticSrc,
    /retro-diffusion-retro-diffusion-mcp['"]:\s*['"]ai-retrodiffusion-pixel-art['"]/,
  );
  assert.match(staticSrc, /app\.get\('\/modelspend'/);
  assert.match(staticSrc, /\/modelspend['"]/);

  // Unknown slugs stay out. Every real public listing stays in.
  assert.equal(isSitemapEligibleMcpServer('___not-a-real-slug___'), false);
  for (const s of getTop100McpServers().slice(0, 5)) {
    assert.equal(isSitemapEligibleMcpServer(s.slug), true);
  }

  // Every public WebMCP site is in the sitemap unless an explicit cap is set.
  const webmcpSites = getWebmcpSitemapSites();
  const webmcpEntries = getWebmcpSitemapEntries();
  const catalogSites = loadCatalog().sites.filter((s) => s && s.host).length;
  if (!Number.isFinite(WEBMCP_SITEMAP_SITE_CAP)) {
    assert.equal(webmcpSites.length, catalogSites);
  } else {
    assert.ok(webmcpSites.length <= WEBMCP_SITEMAP_SITE_CAP);
  }
  assert.ok(webmcpEntries.length > webmcpSites.length);
  assert.ok(webmcpEntries.some((e) => e.loc.endsWith('/webmcp')));
  if (webmcpSites[0]) {
    assert.equal(isSitemapEligibleWebmcpHost(webmcpSites[0].host), true);
  }
  const { getMcpBrowsePage, getMcpBrowsePaths } = require('../services/mcpDirectoryService');
  const { getWebmcpBrowsePage, getWebmcpBrowsePaths } = require('../services/webmcpDirectoryService');
  const mcpBrowse = getMcpBrowsePage(1);
  assert.ok(mcpBrowse && mcpBrowse.servers.length > 0);
  assert.equal(getMcpBrowsePage(mcpBrowse.pages + 1), null);
  assert.equal(getMcpBrowsePaths().length, mcpBrowse.pages);
  assert.ok(getMcpBrowsePaths()[0] === '/mcp/browse');
  const webBrowse = getWebmcpBrowsePage(1);
  assert.ok(webBrowse && webBrowse.sites.length > 0);
  assert.equal(getWebmcpBrowsePaths().length, webBrowse.pages);

  // IndexNow key + money-page ping payload.
  const indexKey = readKey();
  assert.ok(indexKey.length >= 16);
  assert.match(keyLocation(indexKey), new RegExp(`${indexKey}\\.txt$`));
  const money = moneyPageUrls();
  assert.ok(money.includes('https://www.influzer.ai/'));
  assert.ok(money.includes('https://www.influzer.ai/mcp'));
  assert.ok(money.length >= 20);
  const dry = await submitIndexNow(money.slice(0, 3), { dryRun: true });
  assert.equal(dry.ok, true);
  assert.equal(dry.dryRun, true);

  const modelspendTpl = fs.readFileSync(
    path.join(__dirname, '..', 'views', 'modelspend.ejs'),
    'utf8',
  );
  assert.match(modelspendTpl, /github\.com\/rmencke2\/modelspend/);
  assert.match(modelspendTpl, /Star on GitHub/);
  assert.match(modelspendTpl, /ModelSpend/);
  assert.match(modelspendTpl, /shadow/i);
  assert.match(modelspendTpl, /savings/i);
  assert.match(staticSrc, /releaseTag:\s*'v0\.7\.0b1'/);

  const homeTpl = fs.readFileSync(path.join(__dirname, '..', 'views', 'home.ejs'), 'utf8');
  assert.match(homeTpl, /href="\/modelspend"/);
  assert.match(homeTpl, /partner-modelspend/);
  assert.ok(
    findMcpServerBySlug('ai-retrodiffusion-pixel-art'),
    'GSC 5xx alias target should exist in catalog',
  );

  console.log(
    `SEO indexing tests passed (catalog ${all.length} → sitemap MCP ${sitemapServers.length}; webmcp sites ${webmcpSites.length}/${catalogSites})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
