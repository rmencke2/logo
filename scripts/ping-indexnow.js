#!/usr/bin/env node
'use strict';

/**
 * Notify IndexNow engines about high-value Influzer URLs.
 *
 * Usage:
 *   node scripts/ping-indexnow.js
 *   node scripts/ping-indexnow.js --dry-run
 */

const { moneyPageUrls, submitIndexNow, readKey, keyLocation } = require('../services/indexNowService');

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const key = readKey();
  if (!key) {
    console.error('No IndexNow key (public/indexnow-key.txt or INDEXNOW_KEY)');
    process.exit(1);
  }
  const urls = moneyPageUrls();
  console.log(`IndexNow keyLocation=${keyLocation(key)}`);
  console.log(`Submitting ${urls.length} money-page URL(s)${DRY_RUN ? ' (dry-run)' : ''}…`);
  const result = await submitIndexNow(urls, { dryRun: DRY_RUN });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok && !result.skipped && !result.dryRun) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
