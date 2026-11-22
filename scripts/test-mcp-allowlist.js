#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { isReservedMcpPath } = require('../services/mcpSubmissionService');
const {
  buildAllowlistPack,
  formatAllowlistCsv,
  formatAllowlistCursorJson,
  formatAllowlistMarkdown,
  DISCLAIMER,
} = require('../services/mcpAllowlistService');

assert.equal(isReservedMcpPath('allowlist'), true);

const pack = buildAllowlistPack({ host: 'fixed' });
assert.equal(pack.ok, true);
assert.equal(pack.kind, 'influzer_mcp_allowlist');
assert.equal(pack.safety_badge, null);
assert.match(pack.note, /Not a safe-to-install badge/);
assert.ok(Array.isArray(pack.servers));
assert.ok(pack.servers.length >= 1, 'default pack should include answering HTTPS remotes');
assert.ok(pack.cursor && pack.cursor.mcpServers);
assert.equal(pack.filters.host, 'fixed');
assert.deepEqual(pack.filters.status, ['live_ok', 'auth_required']);

for (const row of pack.servers) {
  assert.ok(['live_ok', 'auth_required'].includes(row.live_status), row.live_status);
  assert.equal(row.host_kind, 'fixed');
  assert.ok(row.remote_url, `missing remote_url for ${row.slug}`);
  assert.equal(row.safety_badge, null);
  assert.ok(pack.cursor.mcpServers[row.config_key]);
  assert.equal(pack.cursor.mcpServers[row.config_key].url, row.remote_url);
}

const strict = buildAllowlistPack({ status: 'live_ok', host: 'fixed' });
assert.deepEqual(strict.filters.status, ['live_ok']);
for (const row of strict.servers) {
  assert.equal(row.live_status, 'live_ok');
}

const csv = formatAllowlistCsv(pack);
assert.match(csv, /^slug,name,remote_url/);
assert.ok(csv.split('\n').length >= 2);

const cursorJson = formatAllowlistCursorJson(pack);
const parsed = JSON.parse(cursorJson);
assert.ok(parsed.mcpServers);

const md = formatAllowlistMarkdown(pack);
assert.match(md, /^# Influzer MCP allowlist/m);
assert.match(md, /```json/);

const homeTpl = fs.readFileSync(path.join(__dirname, '..', 'views/home.ejs'), 'utf8');
assert.match(homeTpl, /\/mcp\/allowlist/);
assert.match(homeTpl, /Allowlist pack/);

const pageTpl = fs.readFileSync(path.join(__dirname, '..', 'views/mcp-allowlist.ejs'), 'utf8');
assert.match(pageTpl, /Not a safe-to-install badge/);
assert.match(pageTpl, /data-copy="cursor"/);

const llms = fs.readFileSync(path.join(__dirname, '..', 'services/llmsTxt.js'), 'utf8');
assert.match(llms, /mcp\/allowlist/);
assert.match(llms, /api\/v1\/mcp\/allowlist/);

assert.match(DISCLAIMER, /Not a safe-to-install badge/);

console.log(
  `mcp allowlist tests passed (${pack.total} answering fixed HTTPS servers in default pack; ${strict.total} live_ok-only)`,
);
