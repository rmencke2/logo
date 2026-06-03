#!/usr/bin/env node
/**
 * Enrich Smithery tool lists on an existing catalog (no full registry re-fetch).
 * Run: npm run enrich-tools
 */

const fs = require('fs');
const path = require('path');
const { enrichSmitheryTools } = require('./utils/enrich-tools');
const { attachSetupInfo } = require('./utils/setup-info');
const { buildTop100FromCatalog } = require('./build-top100');

const ROOT = path.join(__dirname, '..');
const GENERATED_PATH = path.join(ROOT, 'data', 'servers-generated.json');
const TOP100_PATH = path.join(ROOT, 'data', 'servers-top100.json');

async function main() {
  if (!fs.existsSync(GENERATED_PATH)) {
    console.error('Missing', GENERATED_PATH);
    process.exit(1);
  }

  const catalog = JSON.parse(fs.readFileSync(GENERATED_PATH, 'utf8'));
  const servers = catalog.servers || [];

  await enrichSmitheryTools(servers, { delayMs: 80, logEvery: 20, allSmithery: true });

  for (let i = 0; i < servers.length; i++) {
    servers[i] = attachSetupInfo(servers[i]);
  }

  const withTools = servers.filter((s) => s.tools?.length > 0).length;
  console.log(`Catalog: ${withTools}/${servers.length} servers have indexed tools`);

  const top100Payload = buildTop100FromCatalog({ ...catalog, servers });
  catalog.servers = servers;
  catalog.top100_slugs = top100Payload.top100_slugs;

  fs.writeFileSync(GENERATED_PATH, JSON.stringify(catalog, null, 2) + '\n');
  fs.writeFileSync(TOP100_PATH, JSON.stringify(top100Payload, null, 2) + '\n');
  console.log(`Top 100 rebuilt: ${top100Payload.count} servers`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
