#!/usr/bin/env node
'use strict';

/**
 * Compare external WebMCP directories against Influzer's catalog.
 *
 * Usage:
 *   node scripts/verify-webmcp-external-sources.js
 *   node scripts/verify-webmcp-external-sources.js --source webmcpdirectory,awesome-chromelabs
 *   node scripts/verify-webmcp-external-sources.js --json > /tmp/webmcp-gap.json
 *
 * Note: These sources list WebMCP *websites* (browser tools), not classic MCP servers.
 */

const path = require('path');
const fs = require('fs');
const { verifyExternalSources } = require('../services/webmcp/externalSources');

function parseArgs(argv) {
  const opts = { json: false, sourceIds: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--source' || a === '--sources') {
      opts.sourceIds = String(argv[++i] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === '--out') {
      opts.out = argv[++i];
    } else if (a === '--help' || a === '-h') {
      opts.help = true;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/verify-webmcp-external-sources.js [--json] [--source id,id] [--out file]`);
    process.exit(0);
  }

  console.error('Verifying external WebMCP directories against Influzer catalog…');
  const report = await verifyExternalSources({ sourceIds: opts.sourceIds });

  if (opts.out) {
    const outPath = path.resolve(opts.out);
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.error(`Wrote ${outPath}`);
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  console.log(`\nInfluzer catalog: ${report.catalog_site_count} sites`);
  console.log(`Missing across sources (unique hosts): ${report.missing_count}`);
  console.log(`Present overlap hosts: ${report.present_overlap}\n`);

  for (const s of report.sources) {
    const status = s.ok ? 'ok' : `FAIL ${s.error}`;
    console.log(
      `• ${s.name} [${s.id}]  fetched=${s.fetched}  present=${s.present}  missing=${s.missing}  (${status})`,
    );
    if (s.missing_sample?.length) {
      for (const row of s.missing_sample) {
        console.log(`    - ${row.host}  ${row.url}`);
      }
      if (s.missing > s.missing_sample.length) {
        console.log(`    … +${s.missing - s.missing_sample.length} more`);
      }
    }
  }

  console.log('\nNext:');
  console.log('  # Dry-run import of missing hosts into data/webmcp-sites.json');
  console.log('  node scripts/import-webmcp-external-sources.js');
  console.log('  # Apply import');
  console.log('  node scripts/import-webmcp-external-sources.js --apply');
  console.log('  # Prefer full schemas from primary API');
  console.log('  npm run refresh-webmcp');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
