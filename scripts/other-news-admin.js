#!/usr/bin/env node
/**
 * CLI admin for "In other news..." article overrides.
 *
 * Usage:
 *   node scripts/other-news-admin.js list
 *   node scripts/other-news-admin.js pin <canonical-url>
 *   node scripts/other-news-admin.js hide <canonical-url>
 *   node scripts/other-news-admin.js publish <canonical-url>
 *   node scripts/other-news-admin.js reset <canonical-url>
 */

const {
  listAllArticlesForAdmin,
  setArticleOverride,
  clearArticleOverride,
} = require('../services/otherNewsService');

const [,, command, ...rest] = process.argv;
const url = rest.join(' ').trim();

function printList() {
  const items = listAllArticlesForAdmin();
  if (!items.length) {
    console.log('No articles stored. Run: npm run refresh-other-news');
    return;
  }
  for (const item of items) {
    console.log(
      `[${item.status.padEnd(9)}] ${item.relevance_score?.toFixed(2) || '0.00'} | ${item.source} | ${item.title}`,
    );
    console.log(`           ${item.canonical_url}`);
    if (item.matched_server_slug) {
      console.log(`           → /mcp/${item.matched_server_slug}`);
    }
  }
}

async function main() {
  switch (command) {
    case 'list':
      printList();
      break;
    case 'pin':
    case 'hide':
    case 'publish':
      if (!url) throw new Error('canonical URL required');
      console.log(setArticleOverride(url, command === 'pin' ? 'pinned' : command === 'hide' ? 'hidden' : 'published'));
      break;
    case 'reset':
      if (!url) throw new Error('canonical URL required');
      console.log(clearArticleOverride(url));
      break;
    default:
      console.log(`Usage:
  node scripts/other-news-admin.js list
  node scripts/other-news-admin.js pin|hide|publish <canonical-url>
  node scripts/other-news-admin.js reset <canonical-url>`);
      process.exit(command ? 1 : 0);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
