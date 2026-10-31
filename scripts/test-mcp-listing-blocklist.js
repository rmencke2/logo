#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pickTop100 } = require('./utils/normalize');
const {
  loadBlockedSlugs,
  applyListingBlocklist,
} = require('./utils/mcp-listing-blocklist');
const { findMcpServerBySlug, getAllMcpServers, getTop100McpServers } = require('../services/mcpDirectoryService');

const BLOCKED = [
  'com-desaira-desaira',
  'com-nuditok-nuditok',
  'ai-fapper-fapperai',
  'ai-spicygen-spicygen',
  'io-github-creator-api-creator-api-mcp',
  'com-listnsfwai-catalog',
];

const KEPT = [
  'app-offendersearch-offendersearch',
  'com-dogslifeapp-dogslife',
  'io-github-ksaklfszf921-skolverket-mcp',
  'com-tantra-authority-catalog',
  'ai-datephotos-datephotos',
  'app-rizza-rizza',
];

const blocked = loadBlockedSlugs();
for (const slug of BLOCKED) {
  assert.ok(blocked.has(slug), `missing blocklist slug ${slug}`);
}
for (const slug of KEPT) {
  assert.ok(!blocked.has(slug), `false positive block ${slug}`);
}

const generated = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'data', 'servers-generated.json'), 'utf8'),
);
const generatedSlugs = new Set((generated.servers || []).map((s) => s.slug));
for (const slug of BLOCKED) {
  assert.ok(generatedSlugs.has(slug), `blocklist slug not in catalog source ${slug}`);
}

const marked = applyListingBlocklist(generated.servers.filter((s) => BLOCKED.includes(s.slug) || KEPT.includes(s.slug)));
for (const server of marked) {
  if (BLOCKED.includes(server.slug)) assert.strictEqual(server.hidden, true, server.slug);
  if (KEPT.includes(server.slug)) assert.ok(!server.hidden, server.slug);
}

const picked = pickTop100(
  [
    {
      slug: 'adult-hidden',
      name: 'Hidden adult',
      source: 'manual',
      hidden: true,
      stars: 999999,
      tools: [{ name: 'search' }],
      description: 'x'.repeat(120),
    },
    {
      slug: 'ok-server',
      name: 'Ok',
      source: 'catalog',
      stars: 1,
      tools: [{ name: 'list' }],
      description: 'A normal developer tool.',
    },
  ],
  ['adult-hidden'],
  10,
);
assert.ok(!picked.some((s) => s.slug === 'adult-hidden'));
assert.ok(picked.some((s) => s.slug === 'ok-server'));

const listed = new Set(getAllMcpServers().map((s) => s.slug));
const top = new Set(getTop100McpServers().map((s) => s.slug));
for (const slug of BLOCKED) {
  assert.ok(!listed.has(slug), `still listed ${slug}`);
  assert.ok(!top.has(slug), `in top 100 ${slug}`);
  assert.strictEqual(findMcpServerBySlug(slug), null, slug);
}
for (const slug of KEPT) {
  assert.ok(listed.has(slug), `expected to keep ${slug}`);
}

console.log('mcp listing blocklist ok');
