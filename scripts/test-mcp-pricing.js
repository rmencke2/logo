#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  normalizePricing,
  pricingFromEditBody,
  attachPricingDisplay,
  PRICING_MODELS,
} = require('../services/mcpPricing');
const { clearMcpCache, findMcpServerBySlug } = require('../services/mcpDirectoryService');

function testNormalize() {
  assert.strictEqual(normalizePricing(null), null);
  assert.strictEqual(normalizePricing({}), null);

  const paid = normalizePricing(
    {
      model: 'paid',
      summary: '  Plans from $9/mo.  ',
      starting_price: '$9/mo',
      url: 'https://www.agentseo.dev/pricing',
    },
    { strict: true },
  );
  assert.deepStrictEqual(paid, {
    model: 'paid',
    summary: 'Plans from $9/mo.',
    starting_price: '$9/mo',
    url: 'https://www.agentseo.dev/pricing',
  });

  assert.throws(() => normalizePricing({ model: 'paid' }, { strict: true }), /summary/);
  assert.throws(() => normalizePricing({ summary: 'x', url: 'not-a-url' }, { strict: true }), /http/);
  assert.ok(PRICING_MODELS.includes('freemium'));
}

function testEditBody() {
  assert.strictEqual(pricingFromEditBody({}), undefined);
  assert.strictEqual(pricingFromEditBody({ clearPricing: true }), null);
  assert.strictEqual(
    pricingFromEditBody({
      pricingModel: '',
      pricingSummary: '',
      pricingStartingPrice: '',
      pricingUrl: '',
    }),
    null,
  );

  const fromFlat = pricingFromEditBody({
    pricingModel: 'freemium',
    pricingSummary: 'Free tier then paid',
    pricingStartingPrice: '$0',
    pricingUrl: 'https://example.com/pricing',
  });
  assert.strictEqual(fromFlat.model, 'freemium');
  assert.strictEqual(fromFlat.starting_price, '$0');
}

function testDisplayAttach() {
  const server = attachPricingDisplay({
    slug: 'demo',
    pricing: { model: 'paid', summary: 'Paid API', starting_price: '$9/mo' },
  });
  assert.strictEqual(server.pricing.model_label, 'Paid');
  assert.strictEqual(server.pricing.glance_value, '$9/mo');
}

function testAgentseoListing() {
  clearMcpCache();
  const server = findMcpServerBySlug('agentseo');
  assert.ok(server, 'agentseo must resolve');
  assert.ok(server.pricing, 'agentseo must expose pricing');
  assert.strictEqual(server.pricing.model, 'paid');
  assert.match(server.pricing.summary, /100 live credits once/i);
  assert.strictEqual(server.pricing.starting_price, '$9/mo');
  assert.match(server.pricing.url, /agentseo\.dev\/pricing/);
  assert.strictEqual(server.pricing.model_label, 'Paid');

  const tpl = fs.readFileSync(path.join(__dirname, '../views/mcp-server.ejs'), 'utf8');
  assert.match(tpl, /server\.pricing/);
  assert.match(tpl, /mcp-pricing/);

  const ownerTpl = fs.readFileSync(path.join(__dirname, '../views/mcp-edit-listing.ejs'), 'utf8');
  assert.match(ownerTpl, /editPricingSummary/);
}

testNormalize();
testEditBody();
testDisplayAttach();
testAgentseoListing();
console.log('mcp pricing ok');
