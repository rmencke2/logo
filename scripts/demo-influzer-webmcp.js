#!/usr/bin/env node
'use strict';

/**
 * Demo / smoke script for Influzer.ai WebMCP-backed APIs.
 * Exercises the same HTTP endpoints the browser tools call.
 *
 * Usage:
 *   node scripts/demo-influzer-webmcp.js
 *   BASE_URL=https://www.influzer.ai node scripts/demo-influzer-webmcp.js
 *   BASE_URL=http://127.0.0.1:4000 node scripts/demo-influzer-webmcp.js
 */

const BASE = (process.env.BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');

async function getJson(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${url}: ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body)}`);
  }
  return body;
}

function section(title) {
  console.log(`\n==> ${title}`);
}

async function main() {
  console.log(`Influzer WebMCP demo against ${BASE}`);

  section('Tool manifest (/api/webmcp/v1/self)');
  const self = await getJson('/api/webmcp/v1/self');
  console.log(`  host=${self.host} tools=${self.tool_count}`);
  console.log(`  demo=${self.demo_url}`);
  for (const t of self.tools || []) {
    console.log(`  - ${t.name} [${t.kind}]`);
  }

  section('Directory stats');
  const stats = await getJson('/api/webmcp/v1/stats');
  console.log(`  sites=${stats.site_count} tools=${stats.tool_count} live=${stats.live_count}`);

  section('search_webmcp_sites(q=chat)');
  const sites = await getJson('/api/webmcp/v1/sites?q=chat&limit=5');
  console.log(`  total=${sites.total}`);
  for (const s of sites.sites || []) {
    console.log(`  - ${s.host} (${s.tool_count} tools)`);
  }

  section('get_webmcp_site(influzer.ai)');
  const site = await getJson('/api/webmcp/v1/sites/influzer.ai');
  console.log(`  name=${site.site?.name} tools=${site.site?.tool_count} verified=${site.site?.verification_status}`);

  section('search_mcp_servers(q=browser)');
  const mcp = await getJson('/api/mcp/search?q=browser&scope=top&limit=5');
  console.log(`  hits=${mcp.total}`);
  for (const s of mcp.servers || []) {
    console.log(`  - ${s.name} → ${s.url}`);
  }

  section('get_mcp_server(slug=playwright)');
  try {
    const detail = await getJson('/api/mcp/servers/playwright');
    console.log(`  name=${detail.server?.name} tools=${detail.server?.tools?.length || 0}`);
  } catch (err) {
    console.log(`  (skipped: ${err.message})`);
  }

  section('list_latest_insights');
  const insights = await getJson('/api/insights/recent?limit=3');
  for (const p of insights.posts || []) {
    console.log(`  - ${p.title}`);
  }

  console.log('\nBrowser interactive demo:');
  console.log(`  ${BASE}/webmcp/demo`);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nDemo failed:', err.message);
  console.error('Tip: start the app with `npm start`, or set BASE_URL to a running host.');
  process.exit(1);
});
