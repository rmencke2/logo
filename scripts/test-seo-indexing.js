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
  getTop100McpServers,
} = require('../services/mcpDirectoryService');

function main() {
  const robots = fs.readFileSync(path.join(__dirname, '..', 'public', 'robots.txt'), 'utf8');
  assert.match(robots, /Sitemap:\s+https:\/\/www\.influzer\.ai\/sitemap\.xml/);
  assert.match(robots, /Disallow:\s+\/api\//);
  assert.match(robots, /Disallow:\s+\/login/);
  assert.match(robots, /Disallow:\s+\/mcp\/discovery/);
  assert.match(robots, /Allow:\s+\/mcp\/discovery\/setup/);
  assert.match(robots, /Allow:\s+\/mcp\/discovery\/starters/);

  const all = getAllMcpServers();
  const sitemapServers = getSitemapMcpServers();
  const top = getTop100McpServers();

  assert.ok(all.length > 1000, 'expected full catalog loaded');
  assert.ok(
    sitemapServers.length < all.length,
    `sitemap set (${sitemapServers.length}) should be smaller than full catalog (${all.length})`,
  );
  assert.ok(
    sitemapServers.length >= top.length,
    'sitemap should include at least Top 100',
  );
  assert.ok(
    sitemapServers.every(
      (s) =>
        (s.tools || []).length > 0 ||
        s.source === 'manual' ||
        s.featured ||
        top.some((t) => t.slug === s.slug),
    ),
    'every sitemap server should be top100, tooled, manual, or featured',
  );

  // Soft-404 MCP template should pass noindex via seo-social
  const mcpServerTpl = fs.readFileSync(
    path.join(__dirname, '..', 'views', 'mcp-server.ejs'),
    'utf8',
  );
  assert.match(mcpServerTpl, /noindex:\s*typeof noindex/);

  const staticSrc = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'staticService.js'),
    'utf8',
  );
  assert.match(staticSrc, /host === 'influzer\.ai'/);
  assert.match(staticSrc, /app\.get\('\/index\.html'/);
  assert.match(staticSrc, /getSitemapMcpServers\(\)/);
  assert.match(staticSrc, /favicon-generator[\s\S]*redirect\(301/);
  assert.match(staticSrc, /X-Robots-Tag.*noindex/);
  assert.match(staticSrc, /MCP listing render failed/);
  assert.match(
    staticSrc,
    /retro-diffusion-retro-diffusion-mcp['"]:\s*['"]ai-retrodiffusion-pixel-art['"]/,
  );
  assert.match(staticSrc, /app\.get\('\/modelspend'/);
  assert.match(staticSrc, /\/modelspend['"]/);

  const modelspendTpl = fs.readFileSync(
    path.join(__dirname, '..', 'views', 'modelspend.ejs'),
    'utf8',
  );
  assert.match(modelspendTpl, /github\.com\/rmencke2\/modelspend/);
  assert.match(modelspendTpl, /Star on GitHub/);
  assert.match(modelspendTpl, /ModelSpend/);

  const homeTpl = fs.readFileSync(path.join(__dirname, '..', 'views', 'home.ejs'), 'utf8');
  assert.match(homeTpl, /href="\/modelspend"/);
  assert.match(homeTpl, /partner-modelspend/);
  assert.ok(
    findMcpServerBySlug('ai-retrodiffusion-pixel-art'),
    'GSC 5xx alias target should exist in catalog',
  );

  console.log(
    `SEO indexing tests passed (catalog ${all.length} → sitemap MCP ${sitemapServers.length})`,
  );
}

main();
