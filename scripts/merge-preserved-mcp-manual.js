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
const ownersKept = [];

for (const server of preserved.servers) {
  if (!server?.slug) continue;
  if (!committedSlugs.has(server.slug)) {
    committed.servers.unshift(server);
    committedSlugs.add(server.slug);
    restored.push(server.slug);
    continue;
  }
  // A claim sets owner_user_id on a listing that already exists in git.
  // Keep that owner across reset --hard. Do not copy the rest of the row:
  // a deploy should still pick up committed copy fixes such as a price change.
  if (server.owner_user_id) {
    const row = committed.servers.find((item) => item.slug === server.slug);
    if (row && row.owner_user_id !== server.owner_user_id) {
      row.owner_user_id = server.owner_user_id;
      ownersKept.push(server.slug);
    }
  }
}

if (restored.length || ownersKept.length) {
  fs.writeFileSync(MANUAL_PATH, `${JSON.stringify(committed, null, 2)}\n`, 'utf8');
  if (restored.length) {
    console.log(`Restored ${restored.length} local-only MCP manual listing(s): ${restored.join(', ')}`);
  }
  if (ownersKept.length) {
    console.log(`Kept owner on ${ownersKept.length} listing(s): ${ownersKept.join(', ')}`);
  }
} else {
  console.log('No local-only MCP manual listings to restore');
}
