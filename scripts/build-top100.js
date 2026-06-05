#!/usr/bin/env node
/**
 * Builds Top 100 slice from servers-generated.json (no network).
 * Called automatically at the end of fetch-servers.js.
 */

const fs = require('fs');
const path = require('path');
const { pickTop100, TOP100_SIZE } = require('./utils/normalize');
const { mergeManualInto } = require('../services/mcpDirectoryService');

const ROOT = path.join(__dirname, '..');
const GENERATED_PATH = path.join(ROOT, 'data', 'servers-generated.json');
const MANUAL_PATH = path.join(ROOT, 'data', 'mcp-servers-manual.json');
const LEGACY_MANUAL_PATH = path.join(ROOT, 'data', 'mcp-servers.json');
const PINNED_PATH = path.join(ROOT, 'data', 'mcp-top100-pinned.json');
const TOP100_PATH = path.join(ROOT, 'data', 'servers-top100.json');

function loadManualData() {
  const manualFile = fs.existsSync(MANUAL_PATH)
    ? MANUAL_PATH
    : fs.existsSync(LEGACY_MANUAL_PATH)
      ? LEGACY_MANUAL_PATH
      : null;
  if (!manualFile) return null;
  return JSON.parse(fs.readFileSync(manualFile, 'utf8'));
}

function loadPinnedSlugs() {
  if (!fs.existsSync(PINNED_PATH)) return [];
  const data = JSON.parse(fs.readFileSync(PINNED_PATH, 'utf8'));
  return Array.isArray(data.slugs) ? data.slugs : [];
}

function buildTop100FromCatalog(catalog) {
  const manualData = loadManualData();
  const servers = mergeManualInto(catalog.servers || [], manualData);
  const pinned = loadPinnedSlugs();
  const top100 = pickTop100(servers, pinned, TOP100_SIZE);
  return {
    generated_at: catalog.generated_at || new Date().toISOString(),
    count: top100.length,
    total_catalog: servers.length,
    top100_slugs: top100.map((s) => s.slug),
    servers: top100,
  };
}

function main() {
  if (!fs.existsSync(GENERATED_PATH)) {
    console.error('Missing', GENERATED_PATH, '— run npm run refresh-data first');
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(GENERATED_PATH, 'utf8'));
  const top100Payload = buildTop100FromCatalog(catalog);

  catalog.top100_slugs = top100Payload.top100_slugs;
  fs.writeFileSync(GENERATED_PATH, JSON.stringify(catalog, null, 2) + '\n');
  fs.writeFileSync(TOP100_PATH, JSON.stringify(top100Payload, null, 2) + '\n');

  console.log(`Top 100: ${top100Payload.count} servers (catalog: ${top100Payload.total_catalog})`);
  console.log(`Wrote ${TOP100_PATH}`);
}

if (require.main === module) {
  main();
}

module.exports = { buildTop100FromCatalog, loadPinnedSlugs };
