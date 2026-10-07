#!/usr/bin/env node
'use strict';

/**
 * Handshake every HTTPS MCP URL in a Cursor/VS Code mcp.json (or ACP array).
 * live_ok and auth_required pass. unreachable fails.
 * Not a safe-to-install badge.
 *
 *   node scripts/probe-mcp-json.js --file .cursor/mcp.json
 *   node scripts/probe-mcp-json.js --file mcp.json --base https://www.influzer.ai
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_BASE = 'https://www.influzer.ai';

function parseArgs(argv) {
  const args = { file: '', base: DEFAULT_BASE, failOnAuth: false };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--file' || token === '-f') {
      args.file = String(argv[++i] || '').trim();
    } else if (token === '--base') {
      args.base = String(argv[++i] || '').replace(/\/+$/, '');
    } else if (token === '--fail-on-auth') {
      args.failOnAuth = true;
    } else if (token === '--help' || token === '-h') {
      args.help = true;
    }
  }
  return args;
}

function extractRemoteUrls(config) {
  const rows = [];
  const seen = new Set();

  function add(name, url) {
    const href = String(url || '').trim();
    if (!/^https:\/\//i.test(href)) return;
    if (seen.has(href)) return;
    seen.add(href);
    rows.push({ name: String(name || href), url: href });
  }

  if (Array.isArray(config)) {
    config.forEach((row, i) => {
      if (!row || typeof row !== 'object') return;
      if (String(row.type || '').toLowerCase() === 'stdio') return;
      add(row.name || `mcp-${i + 1}`, row.url);
    });
    return rows;
  }

  if (!config || typeof config !== 'object') return rows;

  const maps = [config.mcpServers, config.servers];
  maps.forEach((map) => {
    if (!map || typeof map !== 'object' || Array.isArray(map)) return;
    Object.entries(map).forEach(([name, spec]) => {
      if (!spec || typeof spec !== 'object') return;
      if (spec.command && !spec.url && !spec.serverUrl) return;
      add(name, spec.url || spec.serverUrl);
    });
  });

  return rows;
}

function loadConfig(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`mcp.json not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${abs}: ${err.message}`);
  }
}

async function probeUrl(base, url, fetchImpl) {
  const endpoint = `${base}/api/v1/probe?url=${encodeURIComponent(url)}`;
  const res = await fetchImpl(endpoint, { headers: { Accept: 'application/json' } });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = { ok: false, error: 'invalid_json', live_status: 'unreachable' };
  }
  return { http: res.status, body };
}

function verdict(body, failOnAuth) {
  const status = body && body.live_status;
  if (status === 'live_ok') return 'pass';
  if (status === 'auth_required') return failOnAuth ? 'fail' : 'pass';
  return 'fail';
}

async function run(opts) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is not available');
  }
  const remotes = extractRemoteUrls(opts.config);
  if (!remotes.length) {
    return {
      ok: true,
      probed: 0,
      results: [],
      note: 'No HTTPS MCP URLs in this file (stdio-only is skipped). Not a SAFE badge.',
      safety_badge: null,
    };
  }

  const results = [];
  for (const row of remotes) {
    const { http, body } = await probeUrl(opts.base, row.url, fetchImpl);
    const gate = verdict(body, opts.failOnAuth);
    results.push({
      name: row.name,
      url: row.url,
      http,
      live_status: body.live_status || body.error || 'unreachable',
      tool_count: body.tool_count ?? null,
      verdict: gate,
      safety_badge: null,
    });
  }

  const failed = results.filter((r) => r.verdict === 'fail');
  return {
    ok: failed.length === 0,
    probed: results.length,
    failed: failed.length,
    results,
    safety_badge: null,
    note: 'live_ok and auth_required are handshakes. unreachable fails. Probe is not a SAFE badge.',
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.file) {
    console.log(`Usage: node scripts/probe-mcp-json.js --file .cursor/mcp.json [--base ${DEFAULT_BASE}]`);
    process.exit(args.help ? 0 : 2);
  }
  const config = loadConfig(args.file);
  const report = await run({
    config,
    base: args.base,
    failOnAuth: args.failOnAuth,
  });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  extractRemoteUrls,
  loadConfig,
  run,
  parseArgs,
  verdict,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
