#!/usr/bin/env node
'use strict';

/**
 * Import WebMCP websites found in external directories but missing from Influzer.
 *
 * Default is dry-run. Pass --apply to write:
 *   data/webmcp-sites.json
 *   data/webmcp-meta.json
 *   data/webmcp-categories.json
 *
 * Usage:
 *   node scripts/import-webmcp-external-sources.js
 *   node scripts/import-webmcp-external-sources.js --apply
 *   node scripts/import-webmcp-external-sources.js --apply --source webmcp-com,awesome-chromelabs
 *   node scripts/import-webmcp-external-sources.js --apply --with-tools-only
 *
 * Prefer running `npm run refresh-webmcp` first so webmcp.com full schemas land,
 * then import stubs from other directories for anything still missing.
 */

const {
  verifyExternalSources,
  importMissingCandidates,
} = require('../services/webmcp/externalSources');

function parseArgs(argv) {
  const opts = {
    apply: false,
    withToolsOnly: false,
    sourceIds: null,
    limit: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--with-tools-only') opts.withToolsOnly = true;
    else if (a === '--source' || a === '--sources') {
      opts.sourceIds = String(argv[++i] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === '--limit') {
      opts.limit = Math.max(1, parseInt(argv[++i], 10) || 0) || null;
    } else if (a === '--help' || a === '-h') {
      opts.help = true;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Usage: node scripts/import-webmcp-external-sources.js [--apply] [--with-tools-only] [--source id,id] [--limit N]`);
    process.exit(0);
  }

  console.log('Collecting external WebMCP candidates…');
  const report = await verifyExternalSources({ sourceIds: opts.sourceIds });

  let missing = report.missing_hosts || [];
  if (opts.withToolsOnly) {
    missing = missing.filter((c) => Array.isArray(c.tools) && c.tools.length > 0);
  }
  // Prefer candidates that already carry tool schemas (API sources) when merging duplicates
  missing = missing.map((c) => {
    // If any source provided tools on this host, verifyExternalSources stores the first;
    // re-rank is not needed because API adapters push full tools onto the candidate.
    return c;
  });
  if (opts.limit) missing = missing.slice(0, opts.limit);

  console.log(
    `Catalog=${report.catalog_site_count}  missing=${report.missing_count}  importing=${missing.length}` +
      (opts.withToolsOnly ? ' (with-tools-only)' : ''),
  );

  const result = importMissingCandidates(missing, { dryRun: !opts.apply });
  if (result.dry_run) {
    console.log(`\nDry-run: would import ${result.would_import} hosts`);
    console.log(`  with tools: ${result.with_tools}`);
    console.log(`  stubs (0 tools): ${result.stubs}`);
    console.log('\nSample:');
    for (const host of result.hosts.slice(0, 20)) console.log(`  - ${host}`);
    if (result.hosts.length > 20) console.log(`  … +${result.hosts.length - 20} more`);
    console.log('\nRe-run with --apply to write catalog JSON.');
    return;
  }

  console.log(`\nImported ${result.imported} hosts`);
  console.log(`Catalog now ${result.site_count} published sites / ${result.tool_count} tools`);
  console.log('Wrote data/webmcp-sites.json, webmcp-meta.json, webmcp-categories.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
