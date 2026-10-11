#!/usr/bin/env node
'use strict';

/**
 * Rank MCP listing traffic and optionally email contactable owners.
 *
 * Usage:
 *   node scripts/send-mcp-weekly-traffic.js --dry-run
 *   node scripts/send-mcp-weekly-traffic.js --send
 *   node scripts/send-mcp-weekly-traffic.js --send --min-views=5 --limit=20
 *   node scripts/send-mcp-weekly-traffic.js --ranking-only
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  getWeeklyListingRanking,
  resolveListingContacts,
  sendWeeklyTrafficCongrats,
} = require('../services/mcpListingTrafficService');

function parseArgs(argv) {
  const options = {
    dryRun: true,
    send: false,
    rankingOnly: false,
    minViews: 3,
    limit: 25,
    days: 7,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--send') {
      options.send = true;
      options.dryRun = false;
    } else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--ranking-only') options.rankingOnly = true;
    else if (arg === '--force') options.force = true;
    else if (arg.startsWith('--min-views=')) options.minViews = Number(arg.split('=')[1]) || 3;
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.split('=')[1]) || 25;
    else if (arg.startsWith('--days=')) options.days = Number(arg.split('=')[1]) || 7;
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(`Usage:
  node scripts/send-mcp-weekly-traffic.js --dry-run
  node scripts/send-mcp-weekly-traffic.js --send
  node scripts/send-mcp-weekly-traffic.js --ranking-only
  Options: --min-views=N --limit=N --days=N --force`);
    process.exit(0);
  }

  const ranked = await getWeeklyListingRanking({
    days: options.days,
    limit: options.limit,
    useCache: false,
  });
  console.log(`Weekly listing traffic (last ${options.days}d): ${ranked.length} servers`);
  ranked.slice(0, 15).forEach((row, i) => {
    console.log(
      `  ${String(i + 1).padStart(2)}. ${row.slug.padEnd(28)} views=${row.views} uniques=${row.unique_visitors}`,
    );
  });

  if (options.rankingOnly) {
    process.exit(0);
  }

  const contacts = await resolveListingContacts(ranked.map((r) => r.slug));
  const withEmail = contacts.filter((c) => c.contact?.email).length;
  console.log(`Contactable owners among ranked: ${withEmail}/${ranked.length}`);

  const result = await sendWeeklyTrafficCongrats({
    days: options.days,
    limit: options.limit,
    minViews: options.minViews,
    dryRun: options.dryRun,
    force: Boolean(options.force),
  });

  console.log(
    JSON.stringify(
      {
        week: result.week,
        dryRun: result.dryRun,
        ranked: result.ranked,
        summary: result.results.reduce((acc, row) => {
          acc[row.status] = (acc[row.status] || 0) + 1;
          return acc;
        }, {}),
        sample: result.results
          .filter((r) => r.status === 'ready' || r.status === 'dry-run' || r.status === 'sent')
          .slice(0, 8)
          .map((r) => ({
            status: r.status,
            slug: r.slug,
            email: r.email,
            views: r.views,
            rank: r.rank,
            subject: r.subject,
          })),
      },
      null,
      2,
    ),
  );

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
