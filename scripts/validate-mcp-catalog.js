#!/usr/bin/env node
/**
 * Daily MCP catalog validator — probes live MCP servers (tools/list) for real tool data.
 *
 * Usage:
 *   npm run validate-mcp-catalog              # report only
 *   npm run validate-mcp-catalog -- --apply    # update catalog + top 100
 *   npm run validate-mcp-catalog -- --no-registry-fallback
 *   npm run validate-mcp-catalog -- --limit 20
 */

const fs = require('fs');
const path = require('path');
const { attachSetupInfo } = require('./utils/setup-info');
const { buildTop100FromCatalog } = require('./build-top100');
const {
  validateServer,
  runPool,
  sleep,
  toolFingerprint,
  getHttpMcpEndpoint,
} = require('./utils/mcp-validator');

const ROOT = path.join(__dirname, '..');
const GENERATED_PATH = path.join(ROOT, 'data', 'servers-generated.json');
const TOP100_PATH = path.join(ROOT, 'data', 'servers-top100.json');
const STATE_PATH = path.join(ROOT, 'data', 'mcp-validation-state.json');
const REPORT_PATH = path.join(ROOT, 'data', 'mcp-validation-report.json');
const LAST_UPDATED_PATH = path.join(ROOT, 'data', 'last-updated.json');

const DELAY_MS = Number(process.env.MCP_VALIDATE_DELAY_MS) || 300;
const CONCURRENCY = Number(process.env.MCP_VALIDATE_CONCURRENCY) || 3;
const LOG_EVERY = Number(process.env.MCP_VALIDATE_LOG_EVERY) || 25;

function parseArgs(argv) {
  const args = {
    apply: false,
    registryFallback: true,
    limit: 0,
    liveOnly: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--no-registry-fallback') args.registryFallback = false;
    else if (a === '--live-only') args.liveOnly = true;
    else if (a === '--limit') args.limit = Number(argv[++i]) || 0;
  }
  return args;
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { servers: {} };
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return { servers: {} };
  }
}

function buildSummary(results) {
  const summary = {
    checked: 0,
    skipped_manual: 0,
    skipped_no_endpoint: 0,
    skipped_stdio: 0,
    skipped_other: 0,
    unchanged: 0,
    tools_changed: 0,
    newly_indexed: 0,
    tools_lost: 0,
    auth_required_kept: 0,
    live_failed: 0,
    live_ok: 0,
    smithery_fallback: 0,
    errors: 0,
    tools_added_total: 0,
    tools_removed_total: 0,
  };

  for (const r of results) {
    if (r.status === 'skipped_manual') summary.skipped_manual += 1;
    else if (r.status === 'skipped_no_endpoint') summary.skipped_no_endpoint += 1;
    else if (r.status === 'skipped_stdio') summary.skipped_stdio += 1;
    else if (r.status?.startsWith('skipped')) summary.skipped_other += 1;
    else summary.checked += 1;

    if (r.status === 'unchanged') summary.unchanged += 1;
    if (r.status === 'tools_changed') summary.tools_changed += 1;
    if (r.status === 'newly_indexed') summary.newly_indexed += 1;
    if (r.status === 'tools_lost') summary.tools_lost += 1;
    if (r.status === 'auth_required_kept' || r.status === 'auth_required_no_tools') {
      summary.auth_required_kept += 1;
    }
    if (r.status === 'live_failed' || r.status === 'live_failed_kept') summary.live_failed += 1;
    if (r.liveProbe?.status === 'ok' || r.liveProbe?.status === 'ok_empty') summary.live_ok += 1;
    if (r.validationMethod?.includes('smithery')) summary.smithery_fallback += 1;
    if (r.status === 'error') summary.errors += 1;

    if (r.diff) {
      summary.tools_added_total += r.diff.added.length;
      summary.tools_removed_total += r.diff.removed.length;
    }
  }

  return summary;
}

function selectTargets(servers, args) {
  let targets = servers.filter((s) => s.source !== 'manual');
  if (args.liveOnly) {
    targets = targets.filter((s) => Boolean(getHttpMcpEndpoint(s)));
  }
  if (args.limit > 0) targets = targets.slice(0, args.limit);
  return targets;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!fs.existsSync(GENERATED_PATH)) {
    console.error('Missing', GENERATED_PATH, '— run npm run refresh-data first');
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(GENERATED_PATH, 'utf8'));
  const servers = catalog.servers || [];
  const beforeWithTools = servers.filter((s) => s.tools?.length).length;
  const httpEndpoints = servers.filter((s) => getHttpMcpEndpoint(s)).length;
  const targets = selectTargets(servers, args);
  const validateTargets = targets.filter((s) => s.source !== 'manual');

  console.log(`\n🔍 MCP catalog validation (live tools/list)`);
  console.log(`   Catalog: ${servers.length} servers (${beforeWithTools} with tools)`);
  console.log(`   HTTP MCP endpoints: ${httpEndpoints}`);
  console.log(`   Checking: ${validateTargets.length} servers`);
  console.log(`   Mode: ${args.apply ? 'apply changes' : 'report only'}`);
  console.log(`   Smithery fallback: ${args.registryFallback ? 'on (auth-only servers)' : 'off'}`);

  const results = [];
  const changes = [];
  const errors = [];
  let processed = 0;

  await runPool(
    validateTargets,
    async (server) => {
      const result = await validateServer(server, {
        mutate: args.apply,
        registryFallback: args.registryFallback,
      });
      results.push(result);

      if (
        result.status === 'tools_changed' ||
        result.status === 'newly_indexed' ||
        result.status === 'tools_lost'
      ) {
        changes.push({
          slug: result.slug,
          name: result.name,
          source: result.source,
          validationMethod: result.validationMethod,
          status: result.status,
          beforeToolCount: result.beforeToolCount,
          afterToolCount: result.afterToolCount,
          added: result.diff?.added || [],
          removed: result.diff?.removed || [],
          changed: result.diff?.changed || [],
        });
      }
      if (
        result.status === 'live_failed' ||
        result.status === 'live_failed_kept' ||
        result.status === 'error'
      ) {
        errors.push({
          slug: result.slug,
          source: result.source,
          status: result.status,
          validationMethod: result.validationMethod,
          error: result.error,
          liveProbe: result.liveProbe,
        });
      }

      processed += 1;
      if (processed % LOG_EVERY === 0) {
        console.log(`   … ${processed}/${validateTargets.length}`);
      }
      await sleep(DELAY_MS);
    },
    CONCURRENCY,
  );

  for (const server of servers) {
    if (server.source === 'manual') {
      results.push({ slug: server.slug, source: server.source, status: 'skipped_manual' });
    }
  }

  const summary = buildSummary(results);
  const afterWithTools = servers.filter((s) => s.tools?.length).length;

  const report = {
    generated_at: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'report',
    validation: 'live_mcp_tools_list',
    catalog_generated_at: catalog.generated_at || null,
    summary: {
      ...summary,
      catalog_total: servers.length,
      http_endpoints: httpEndpoints,
      with_tools_before: beforeWithTools,
      with_tools_after: afterWithTools,
    },
    changes: changes.slice(0, 200),
    errors: errors.slice(0, 200),
  };

  const state = loadState();
  state.last_run = report.generated_at;
  state.validation = 'live_mcp_tools_list';
  state.servers = state.servers || {};
  for (const r of results) {
    if (!r.slug || r.status?.startsWith('skipped')) continue;
    const server = servers.find((s) => s.slug === r.slug);
    state.servers[r.slug] = {
      validated_at: server?.tools_validated_at || report.generated_at,
      tool_count: r.afterToolCount ?? server?.tools?.length ?? 0,
      tool_fingerprint: toolFingerprint(server?.tools || []),
      status: r.status,
      validation_method: r.validationMethod,
      endpoint_status: r.endpointStatus || r.liveProbe?.status || null,
    };
  }

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');

  if (args.apply) {
    for (let i = 0; i < servers.length; i += 1) {
      servers[i] = attachSetupInfo(servers[i]);
    }
    const top100Payload = buildTop100FromCatalog({ ...catalog, servers });
    catalog.servers = servers;
    catalog.top100_slugs = top100Payload.top100_slugs;
    catalog.generated_at = new Date().toISOString();

    fs.writeFileSync(GENERATED_PATH, JSON.stringify(catalog, null, 2) + '\n');
    fs.writeFileSync(TOP100_PATH, JSON.stringify(top100Payload, null, 2) + '\n');
    fs.writeFileSync(
      LAST_UPDATED_PATH,
      JSON.stringify(
        {
          iso: catalog.generated_at,
          display: new Date(catalog.generated_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`\n✅ Applied updates → ${afterWithTools}/${servers.length} servers with tools`);
    console.log(`   Top 100 rebuilt: ${top100Payload.count} servers`);
  }

  console.log('\n📊 Validation summary');
  console.log(`   Checked: ${summary.checked}`);
  console.log(`   Live MCP OK: ${summary.live_ok}`);
  console.log(`   Smithery fallback: ${summary.smithery_fallback}`);
  console.log(`   Auth required (kept cached): ${summary.auth_required_kept}`);
  console.log(`   Unchanged: ${summary.unchanged}`);
  console.log(`   Tools changed: ${summary.tools_changed}`);
  console.log(`   Skipped (no HTTP endpoint): ${summary.skipped_no_endpoint}`);
  console.log(`   With tools: ${beforeWithTools} → ${afterWithTools}`);
  console.log(`   Report: ${path.relative(ROOT, REPORT_PATH)}`);

  if (summary.tools_lost > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
