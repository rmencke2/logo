#!/usr/bin/env node
'use strict';

/**
 * Unit checks for Influzer first-party WebMCP tool manifest + site normalize.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { normalizeSite, normalizeTool } = require('../services/webmcp/normalize');
const { searchMcpServers } = require('../services/mcpDirectoryService');

const ROOT = path.join(__dirname, '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'influzer-webmcp-tools.json'), 'utf8'));

assert.equal(MANIFEST.host, 'influzer.ai');
assert.ok(Array.isArray(MANIFEST.tools) && MANIFEST.tools.length >= 6, 'expected several tools');

const names = new Set();
for (const tool of MANIFEST.tools) {
  assert.ok(tool.name, 'tool name required');
  assert.ok(!names.has(tool.name), `duplicate tool ${tool.name}`);
  names.add(tool.name);
  assert.ok(tool.description && tool.description.length > 20, `${tool.name} needs description`);
  assert.ok(['answer', 'act', 'transact'].includes(tool.kind), `${tool.name} kind`);
  assert.equal(tool.implementation_type, 'imperative');
  assert.equal(tool.input_schema?.type, 'object');
  const normalized = normalizeTool(
    {
      name: tool.name,
      description: tool.description,
      kind: tool.kind,
      impl: tool.implementation_type,
      page: tool.page_url,
      inputSchema: tool.input_schema,
    },
    'influzer.ai',
  );
  assert.ok(normalized, `normalizeTool failed for ${tool.name}`);
}

const site = normalizeSite(
  {
    host: MANIFEST.host,
    name: MANIFEST.name,
    url: MANIFEST.canonical_url,
    desc: MANIFEST.description,
    category: MANIFEST.category,
    type: 'live',
    tools: MANIFEST.tools.map((t) => ({
      name: t.name,
      description: t.description,
      kind: t.kind,
      impl: t.implementation_type,
      page: t.page_url,
      inputSchema: t.input_schema,
    })),
  },
  { verification_status: 'verified', published: true },
);

assert.equal(site.host, 'influzer.ai');
assert.equal(site.tool_count, MANIFEST.tools.length);
assert.equal(site.verification_status, 'verified');
assert.ok(site.answer_count >= 1);
assert.ok(site.act_count >= 1);

const mcp = searchMcpServers({ q: 'browser', scope: 'top', limit: 5 });
assert.equal(mcp.ok, true);
assert.ok(mcp.servers.length >= 1, 'expected browser MCP matches in top 100');

const required = [
  'get_influzer_overview',
  'search_webmcp_sites',
  'get_webmcp_site',
  'search_webmcp_tools',
  'search_mcp_servers',
  'get_mcp_server',
  'get_current_mcp_server',
  'copy_mcp_connection',
  'list_best_mcp_clients',
  'get_best_mcp_client',
  'get_current_best_mcp_client',
  'navigate_influzer',
];

const { getBestClientPayload, getBestIndexPayload } = require('../services/mcpClientService');
const bestIndex = getBestIndexPayload();
assert.ok(bestIndex.clients.length >= 1, 'expected at least one best-client guide');
const claude = getBestClientPayload('claude');
assert.ok(claude.client, 'claude client guide missing');
assert.ok(claude.client.stacks.length >= 1, 'claude stacks missing');
assert.ok(claude.client.featured_servers.length >= 1, 'claude featured servers missing');
for (const name of required) {
  assert.ok(names.has(name), `missing required tool ${name}`);
}

console.log('influzer webmcp tests OK');
console.log(`  tools: ${MANIFEST.tools.length}`);
console.log(`  mcp search sample hits: ${mcp.total}`);
