#!/usr/bin/env node
'use strict';

/**
 * Compare external MCP server registries against Influzer's /mcp catalog.
 *
 * Usage:
 *   node scripts/verify-mcp-external-sources.js
 *   node scripts/verify-mcp-external-sources.js --source official-mcp-registry,awesome-mcp
 *   node scripts/verify-mcp-external-sources.js --json > /tmp/mcp-gap.json
 *
 * Note: These sources list classic MCP *servers*, not WebMCP websites.
 */

const path = require('path');
const fs = require('fs');
const { verifyExternalSources } = require('../services/mcpExternalSources');

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
    console.log(
      'Usage: node scripts/verify-mcp-external-sources.js [--json] [--source id,id] [--out file]',
    );
    process.exit(0);
  }

  console.error('Verifying external MCP registries against Influzer catalog…');
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

  console.log(`\nInfluzer catalog: ${report.catalog_server_count} servers`);
  console.log(`Missing across sources (unique): ${report.missing_count}`);
  console.log(`Present overlap keys: ${report.present_overlap}\n`);

  for (const s of report.sources) {
    const status = s.ok ? 'ok' : `FAIL ${s.error}`;
    console.log(
      `• ${s.name} [${s.id}]  fetched=${s.fetched}  present=${s.present}  missing=${s.missing}  (${status})`,
    );
    if (s.missing_sample?.length) {
      for (const row of s.missing_sample) {
        const ref = row.registry_name || row.github_url || row.slug;
        console.log(`    - ${row.name}  ${ref}`);
      }
      if (s.missing > s.missing_sample.length) {
        console.log(`    … +${s.missing - s.missing_sample.length} more`);
      }
    }
  }

  console.log('\nNext:');
  console.log('  # Dry-run import of missing servers into data/mcp-servers-discovered.json');
  console.log('  node scripts/import-mcp-external-sources.js');
  console.log('  # Apply import');
  console.log('  node scripts/import-mcp-external-sources.js --apply');
  console.log('  # Full refresh still recommended for tool schemas:');
  console.log('  npm run refresh-data');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
