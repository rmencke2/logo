#!/usr/bin/env node
/**
 * Refresh "In other news..." articles from external sources.
 *
 * Usage:
 *   node scripts/refresh-other-news.js
 *   node scripts/refresh-other-news.js --dry-run
 */

const { runOtherNewsPipeline } = require('./lib/other-news/pipeline');

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`==> Other news refresh${dryRun ? ' (dry run)' : ''}`);

  const payload = await runOtherNewsPipeline({ dryRun });

  console.log(`    fetched:   ${payload.stats.fetched}`);
  console.log(`    stored:    ${payload.stats.deduped}`);
  console.log(`    published: ${payload.stats.published}`);
  if (payload.sourceErrors?.length) {
    console.log('    source errors:');
    for (const err of payload.sourceErrors) {
      console.log(`      - ${err.source}: ${err.error}`);
    }
  }
  if (!dryRun) {
    console.log(`    wrote: data/other-news-articles.json`);
  }
}

main().catch((error) => {
  console.error('Other news refresh failed:', error.message);
  process.exit(1);
});
