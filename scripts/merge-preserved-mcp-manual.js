#!/usr/bin/env node
'use strict';

/**
 * Re-apply local-only MCP manual listings after `git reset --hard` on deploy.
 * Preserved file path is argv[1]. Slugs already present in the committed manual
 * are left alone; slugs that only existed on the server are restored so an
 * admin approve is not wiped by the next deploy before it is committed.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MANUAL_PATH = path.join(ROOT, 'data', 'mcp-servers-manual.json');
const preservedPath = process.argv[2];

if (!preservedPath || !fs.existsSync(preservedPath)) {
  console.log('No preserved MCP manual to merge');
  process.exit(0);
}

function readManual(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(data.servers)) data.servers = [];
  return data;
}

const committed = fs.existsSync(MANUAL_PATH)
  ? readManual(MANUAL_PATH)
  : { categories: [], servers: [] };
const preserved = readManual(preservedPath);
const committedSlugs = new Set(committed.servers.map((s) => s.slug).filter(Boolean));
const restored = [];

for (const server of preserved.servers) {
  if (!server?.slug || committedSlugs.has(server.slug)) continue;
  committed.servers.unshift(server);
  committedSlugs.add(server.slug);
  restored.push(server.slug);
}

if (restored.length) {
  fs.writeFileSync(MANUAL_PATH, `${JSON.stringify(committed, null, 2)}\n`, 'utf8');
  console.log(`Restored ${restored.length} local-only MCP manual listing(s): ${restored.join(', ')}`);
} else {
  console.log('No local-only MCP manual listings to restore');
}
