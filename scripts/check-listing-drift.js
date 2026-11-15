#!/usr/bin/env node
'use strict';

/**
 * Weekly copy check for manual listings that have an https MCP endpoint.
 * GETs /.well-known/mcp/server-card.json only. Does not call tools/list,
 * does not call a paid API, and does not rewrite the catalog.
 *
 *   node scripts/check-listing-drift.js
 *   node scripts/check-listing-drift.js --limit 20
 */

const fs = require('fs');
const path = require('path');
const { readServerCard, driftFromCard } = require('../services/mcpListingCopy');

const ROOT = path.join(__dirname, '..');
const MANUAL_PATH = path.join(ROOT, 'data', 'mcp-servers-manual.json');
const OUT_PATH = path.join(ROOT, 'data', 'mcp-listing-drift.json');
const CONCURRENCY = Number(process.env.MCP_DRIFT_CONCURRENCY) || 3;
const DELAY_MS = Number(process.env.MCP_DRIFT_DELAY_MS) || 200;

function parseArgs(argv) {
  const args = { limit: 0 };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--limit') args.limit = Number(argv[++i]) || 0;
  }
  return args;
}

function remoteManuals(servers, limit) {
  const rows = servers.filter((server) => /^https:\/\//i.test(server?.mcp_endpoint || ''));
  return limit > 0 ? rows.slice(0, limit) : rows;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPool(items, fn, concurrency) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await fn(items[current], current);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const args = parseArgs(process.argv);
  const manual = JSON.parse(fs.readFileSync(MANUAL_PATH, 'utf8'));
  const targets = remoteManuals(manual.servers || [], args.limit);
  const drift = [];
  const errors = [];
  let noCard = 0;
  let ok = 0;

  console.log(`Checking ${targets.length} manual listing(s) for server-card drift`);

  await runPool(
    targets,
    async (server) => {
      const card = await readServerCard(server.mcp_endpoint);
      const row = driftFromCard(server, card);
      if (row.kind === 'drift') drift.push(row);
      else if (row.kind === 'error') errors.push(row);
      else if (row.kind === 'no_card') noCard += 1;
      else ok += 1;
      await sleep(DELAY_MS);
    },
    CONCURRENCY,
  );

  const report = {
    generated_at: new Date().toISOString(),
    note: 'Server-card differences for manual remote listings. The catalog was not changed.',
    checked: targets.length,
    ok,
    no_card: noCard,
    drift,
    errors: errors.slice(0, 100),
  };
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `Drift: ${drift.length} · no card: ${noCard} · errors: ${errors.length} · unchanged: ${ok}`,
  );
  console.log(`Wrote ${OUT_PATH}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = { remoteManuals };
