#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readHomePreviewSync } = require('../services/webmcp/homePreview');
const { loadSlimCatalog, readSiteRange } = require('../services/webmcp/catalogIndex');

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webmcp-preview-'));
const fixturePath = path.join(fixtureDir, 'sites.json');
fs.writeFileSync(
  fixturePath,
  `{
  "sites": [
    {
      "host": "demo.example",
      "slug": "demo.example",
      "name": "Demo",
      "description": "A demo, with \\"quotes\\".",
      "site_type": "demo",
      "verification_status": "unverified",
      "favicon_url": "https://example/d.png",
      "tool_count": 50,
      "tools": [{ "name": "ignored", "host": "demo.example", "input_schema": { "type": "object", "properties": { "topic": { "description": "Podcast topic" } } } }]
    },
    {
      "host": "live.example",
      "slug": "live.example",
      "name": "Live",
      "description": "Live \\"quoted\\" site",
      "site_type": "live",
      "verification_status": "unverified",
      "favicon_url": "",
      "tool_count": 9,
      "tools": []
    }
  ]
}
`,
);

const preview = readHomePreviewSync(fixturePath, 1);
assert.strictEqual(preview.length, 1);
assert.strictEqual(preview[0].host, 'live.example');
assert.strictEqual(preview[0].tool_count, 9);
assert.strictEqual(preview[0].description, 'Live "quoted" site');

const quoted = readHomePreviewSync(fixturePath, 6);
assert.strictEqual(quoted[0].host, 'live.example');

const slimFixture = loadSlimCatalog(fixturePath);
assert.strictEqual(slimFixture.sites.length, 2);
assert.strictEqual(slimFixture.sites[0].tools[0].name, 'ignored');
assert.strictEqual(slimFixture.sites[0].tools[0].search.includes('ignored'), true);
assert.strictEqual(slimFixture.sites[0].tools[0].search.includes('podcast topic'), true);
const full = readSiteRange(fixturePath, slimFixture.rangeByHost.get('demo.example'));
assert.strictEqual(full.tools[0].name, 'ignored');
assert.strictEqual(Object.prototype.hasOwnProperty.call(slimFixture.sites[0].tools[0], 'input_schema'), false);

const realPath = path.join(__dirname, '..', 'data', 'webmcp-sites.json');
if (fs.existsSync(realPath)) {
  const started = Date.now();
  const home = readHomePreviewSync(realPath, 6);
  const homeMs = Date.now() - started;
  assert.strictEqual(home[0].host, 'reloadium.com');
  assert.strictEqual(home[0].tool_count, 204);
  assert.ok(homeMs < 1500, `home preview took ${homeMs}ms`);

  const before = process.memoryUsage().heapUsed;
  const t0 = Date.now();
  const catalog = loadSlimCatalog(realPath);
  const indexMs = Date.now() - t0;
  global.gc && global.gc();
  const after = process.memoryUsage().heapUsed;
  assert.strictEqual(catalog.sites.length, 9123);
  assert.ok(catalog.byHost.get('reloadium.com'));
  const reloaded = readSiteRange(realPath, catalog.rangeByHost.get('reloadium.com'));
  assert.strictEqual(reloaded.host, 'reloadium.com');
  assert.ok(Array.isArray(reloaded.tools) && reloaded.tools.length > 0);
  assert.ok(reloaded.tools[0].input_schema);
  const heapMb = Math.round((after - before) / 1048576);
  console.log(
    `indexed ${catalog.sites.length} sites in ${indexMs}ms, heap delta ~${heapMb}MB, home preview ${homeMs}ms`,
  );
  assert.ok(indexMs < 20000, `index took ${indexMs}ms`);
}

console.log('webmcp catalog memory tests ok');
