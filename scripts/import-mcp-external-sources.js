#!/usr/bin/env node
'use strict';

/**
 * Import classic MCP servers found in external registries but missing from Influzer.
 *
 * Default is dry-run. Pass --apply to write:
 *   data/mcp-servers-discovered.json
 *
 * The discovered overlay is merged at catalog load time (and at the end of
 * refresh-data) so entries survive until a richer registry fetch covers them.
 *
 * Usage:
 *   node scripts/import-mcp-external-sources.js
 *   node scripts/import-mcp-external-sources.js --apply
 *   node scripts/import-mcp-external-sources.js --apply --source official-mcp-registry
 *   node scripts/import-mcp-external-sources.js --apply --with-github-only --limit 500
 */

const {
  verifyExternalSources,
  importMissingCandidates,
} = require('../services/mcpExternalSources');

function parseArgs(argv) {
  const opts = {
    apply: false,
    withGithubOnly: false,
    withEndpointOnly: false,
    sourceIds: null,
    limit: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--with-github-only') opts.withGithubOnly = true;
    else if (a === '--with-endpoint-only') opts.withEndpointOnly = true;
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
    console.log(
      'Usage: node scripts/import-mcp-external-sources.js [--apply] [--with-github-only] [--with-endpoint-only] [--source id,id] [--limit N]',
    );
    process.exit(0);
  }

  console.log('Collecting external MCP candidates…');
  const report = await verifyExternalSources({ sourceIds: opts.sourceIds });

  let missing = report.missing_servers || [];
  if (opts.withGithubOnly) missing = missing.filter((c) => Boolean(c.github_url));
  if (opts.withEndpointOnly) missing = missing.filter((c) => Boolean(c.mcp_endpoint));
  if (opts.limit) missing = missing.slice(0, opts.limit);

  console.log(
    `Catalog=${report.catalog_server_count}  missing=${report.missing_count}  importing=${missing.length}` +
      (opts.withGithubOnly ? ' (with-github-only)' : '') +
      (opts.withEndpointOnly ? ' (with-endpoint-only)' : ''),
  );

  const result = importMissingCandidates(missing, { dryRun: !opts.apply });
  if (result.dry_run) {
    console.log(`\nDry-run: would import ${result.would_import} servers`);
    console.log(`  with github: ${result.with_github}`);
    console.log(`  with endpoint: ${result.with_endpoint}`);
    console.log(`  stubs (0 tools): ${result.stubs}`);
    console.log('\nSample:');
    for (const slug of result.slugs.slice(0, 20)) console.log(`  - ${slug}`);
    if (result.slugs.length > 20) console.log(`  … +${result.slugs.length - 20} more`);
    console.log('\nRe-run with --apply to write data/mcp-servers-discovered.json.');
    return;
  }

  console.log(`\nImported ${result.imported} servers`);
  console.log(`Discovered overlay now ${result.server_count} servers`);
  console.log('Wrote data/mcp-servers-discovered.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
