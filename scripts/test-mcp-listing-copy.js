#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  priceTokens,
  parseServerCard,
  diffListingCopy,
  driftFromCard,
  serverCardUrl,
} = require('../services/mcpListingCopy');
const { remoteManuals } = require('./check-listing-drift');

function testPriceTokens() {
  assert.deepStrictEqual(priceTokens('was $0.005, now $0.002 per page'), ['$0.002', '$0.005']);
  assert.deepStrictEqual(priceTokens('$0.0020 USDC'), ['$0.002']);
  assert.deepStrictEqual(priceTokens('no price here'), []);
}

function testServerCardUrl() {
  assert.strictEqual(
    serverCardUrl('https://nanoparse.app/mcp'),
    'https://nanoparse.app/.well-known/mcp/server-card.json',
  );
}

function testNanoParsePriceDrift() {
  const stored = {
    description: 'Reads pages. $0.005 per page actually read, USDC on Base via x402.',
    tools: [
      {
        name: 'nanoparse_fetch',
        description: 'Price: $0.005 per page actually read.',
      },
      { name: 'nanoparse_status', description: 'Report quota.' },
    ],
  };
  const card = parseServerCard(
    JSON.stringify({
      serverInfo: { description: 'Paid per parse ($0.002 USDC on Base).' },
      tools: [
        { name: 'nanoparse_fetch', description: 'Price: $0.002 per page actually read.' },
        { name: 'nanoparse_status', description: 'Report quota.' },
      ],
    }),
  );
  const diff = diffListingCopy(stored, card);
  assert.strictEqual(diff.price.changed, true);
  assert.deepStrictEqual(diff.price.stored, ['$0.005']);
  assert.deepStrictEqual(diff.price.live, ['$0.002']);
  assert.deepStrictEqual(diff.tools.changed, ['nanoparse_fetch']);
  assert.strictEqual(diff.drifted, true);
  assert.strictEqual(diff.descriptionDiffers, true);
}

function testMatchingCardIsNotDrift() {
  const stored = {
    slug: 'example',
    name: 'Example',
    mcp_endpoint: 'https://example.com/mcp',
    description: 'A long intro that is not the card sentence. $0.002 per page.',
    tools: [{ name: 'fetch', description: 'Read a page for $0.002.' }],
  };
  const row = driftFromCard(stored, {
    ok: true,
    cardUrl: 'https://example.com/.well-known/mcp/server-card.json',
    card: {
      description: 'Short card. $0.002 per page.',
      tools: [{ name: 'fetch', description: 'Read a page for $0.002.' }],
    },
  });
  assert.strictEqual(row.kind, 'ok');
}

function testMissingCard() {
  const row = driftFromCard(
    { slug: 'solo', name: 'Solo', mcp_endpoint: 'https://example.com/mcp' },
    { ok: false, status: 404, error: 'HTTP 404' },
  );
  assert.strictEqual(row.kind, 'no_card');
}

function testRemoteManualFilter() {
  const rows = remoteManuals(
    [
      { slug: 'a', mcp_endpoint: 'https://example.com/mcp' },
      { slug: 'b', mcp_endpoint: 'http://example.com/mcp' },
      { slug: 'c' },
    ],
    0,
  );
  assert.deepStrictEqual(rows.map((row) => row.slug), ['a']);
}

testPriceTokens();
testServerCardUrl();
testNanoParsePriceDrift();
testMatchingCardIsNotDrift();
testMissingCard();
testRemoteManualFilter();
console.log('mcp listing copy ok');
