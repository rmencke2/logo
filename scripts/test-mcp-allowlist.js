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
const { scoreToolDescriptionUsability } = require('./utils/mcp-quality');

assert.equal(isReservedMcpPath('allowlist'), true);

const good = scoreToolDescriptionUsability([
  { name: 'list_issues', description: 'List open issues in a repository' },
  { name: 'create_issue', description: 'Create a new GitHub issue with a title' },
]);
assert.equal(good.tool_desc_usable, true);
assert.ok(good.tool_desc_score >= 70);

const empty = scoreToolDescriptionUsability([
  { name: 'a', description: '' },
  { name: 'b', description: '' },
]);
assert.ok(empty.empty_desc_count === 2);
assert.ok(empty.tool_desc_flags.includes('empty_descriptions'));
assert.equal(empty.tool_desc_usable, false);

const dups = scoreToolDescriptionUsability([
  { name: 'search', description: 'Search documents in the workspace index' },
  { name: 'search', description: 'Find matching files by keyword query' },
]);
assert.ok(dups.duplicate_name_count >= 1);
assert.ok(dups.tool_desc_flags.includes('duplicate_names'));

const near = scoreToolDescriptionUsability([
  { name: 'read_a', description: 'Read the selected document and return text content for the agent' },
  { name: 'read_b', description: 'Read the selected document and return text content for the agent' },
]);
assert.ok(near.near_identical_desc_pairs >= 1);
assert.ok(near.tool_desc_flags.includes('near_identical_descriptions'));

const pack = buildAllowlistPack({ host: 'fixed' });
assert.equal(pack.ok, true);
assert.equal(pack.kind, 'influzer_mcp_allowlist');
assert.equal(pack.version, 2);
assert.equal(pack.safety_badge, null);
assert.match(pack.note, /Not a safe-to-install badge/);
assert.match(pack.note, /Answering/);
assert.ok(Array.isArray(pack.servers));
assert.equal(pack.filters.host, 'fixed');
assert.deepEqual(pack.filters.status, ['live_ok']);
assert.equal(pack.filters.max_tools, null);
assert.equal(pack.filters.usable_only, false);

for (const row of pack.servers) {
  assert.equal(row.live_status, 'live_ok', row.live_status);
  assert.equal(row.host_kind, 'fixed');
  assert.ok(row.remote_url, `missing remote_url for ${row.slug}`);
  assert.equal(row.safety_badge, null);
  assert.ok(typeof row.tool_desc_score === 'number');
  assert.ok(pack.cursor.mcpServers[row.config_key]);
  assert.equal(pack.cursor.mcpServers[row.config_key].url, row.remote_url);
}

const combined = buildAllowlistPack({ status: 'live_ok,auth_required', host: 'fixed' });
assert.deepEqual(combined.filters.status, ['live_ok', 'auth_required']);
for (const row of combined.servers) {
  assert.ok(['live_ok', 'auth_required'].includes(row.live_status), row.live_status);
}

const authOnly = buildAllowlistPack({ status: 'auth_required', host: 'fixed' });
assert.deepEqual(authOnly.filters.status, ['auth_required']);
for (const row of authOnly.servers) {
  assert.equal(row.live_status, 'auth_required');
}

const capped = buildAllowlistPack({ status: 'live_ok,auth_required', host: 'fixed', max_tools: 8 });
assert.equal(capped.filters.max_tools, 8);
for (const row of capped.servers) {
  assert.ok(row.tool_count <= 8, `${row.slug} has ${row.tool_count} tools`);
}

const usable = buildAllowlistPack({
  status: 'live_ok,auth_required',
  host: 'fixed',
  usable_only: '1',
});
assert.equal(usable.filters.usable_only, true);
for (const row of usable.servers) {
  assert.equal(row.tool_desc_usable, true);
}

const csv = formatAllowlistCsv(pack);
assert.match(csv, /^slug,name,remote_url/);
assert.match(csv, /tool_desc_score/);
assert.ok(csv.split('\n').length >= 2);

const cursorJson = formatAllowlistCursorJson(pack);
const parsed = JSON.parse(cursorJson);
assert.ok(parsed.mcpServers);

const md = formatAllowlistMarkdown(pack);
assert.match(md, /^# Influzer MCP allowlist/m);
assert.match(md, /Desc score/);
assert.match(md, /```json/);

const homeTpl = fs.readFileSync(path.join(__dirname, '..', 'views/home.ejs'), 'utf8');
assert.match(homeTpl, /\/mcp\/allowlist/);
assert.match(homeTpl, /Allowlist pack/);

const pageTpl = fs.readFileSync(path.join(__dirname, '..', 'views/mcp-allowlist.ejs'), 'utf8');
assert.match(pageTpl, /Not a safe-to-install badge/);
assert.match(pageTpl, /data-copy="cursor"/);
assert.match(pageTpl, /max_tools/);
assert.match(pageTpl, /usable_only/);
assert.match(pageTpl, /Live OK only/);

const llms = fs.readFileSync(path.join(__dirname, '..', 'services/llmsTxt.js'), 'utf8');
assert.match(llms, /mcp\/allowlist/);
assert.match(llms, /api\/v1\/mcp\/allowlist/);

assert.match(DISCLAIMER, /Not a safe-to-install badge/);

console.log(
  `mcp allowlist tests passed (default live_ok=${pack.total}; combined=${combined.total}; auth_only=${authOnly.total}; max8=${capped.total}; usable=${usable.total})`,
);
