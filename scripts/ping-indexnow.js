#!/usr/bin/env node
'use strict';

/**
 * Notify IndexNow engines about high-value Influzer URLs.
 *
 * Usage:
 *   node scripts/ping-indexnow.js
 *   node scripts/ping-indexnow.js --dry-run
 */

const { moneyPageUrls, submitIndexNow, readKey } = require('../services/indexNowService');
const { getSitemapMcpServers, getMcpBrowsePaths } = require('../services/mcpDirectoryService');
const { getWebmcpSitemapEntries, getWebmcpBrowsePaths } = require('../services/webmcpDirectoryService');

const DRY_RUN = process.argv.includes('--dry-run');
const CATALOG = process.argv.includes('--catalog');
const SITE_BASE = 'https://www.influzer.ai';

function catalogUrls() {
  const urls = [
    ...getSitemapMcpServers().map((s) => `${SITE_BASE}/mcp/${s.slug}`),
    ...getWebmcpSitemapEntries().map((e) => e.loc),
    ...getMcpBrowsePaths().map((p) => `${SITE_BASE}${p}`),
    ...getWebmcpBrowsePaths().map((p) => `${SITE_BASE}${p}`),
  ];
  return [...new Set(urls)];
}

async function main() {
  const key = readKey();
  if (!key) {
    console.error('No IndexNow key (public/indexnow-key.txt or INDEXNOW_KEY)');
    process.exit(1);
  }
  const urls = CATALOG ? catalogUrls() : moneyPageUrls();
  console.log(`IndexNow key configured`);
  console.log(`Submitting ${urls.length} URL(s)${CATALOG ? ' (catalog)' : ''}${DRY_RUN ? ' (dry-run)' : ''}…`);
  let failed = false;
  for (let i = 0; i < urls.length; i += 10000) {
    const chunk = urls.slice(i, i + 10000);
    const result = await submitIndexNow(chunk, { dryRun: DRY_RUN });
    console.log(JSON.stringify({ ...result, from: i, chunk: chunk.length }));
    if (!result.ok && !result.skipped && !result.dryRun) failed = true;
  }
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
