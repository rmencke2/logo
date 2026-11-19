#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { extractUtms, normalizeUtm } = require('../services/utmHelpers');
const { classifyUserAgent } = require('../services/trafficAudience');

assert.strictEqual(normalizeUtm(' LinkedIn '), 'linkedin');
assert.strictEqual(normalizeUtm('My Campaign'), 'my-campaign');
assert.strictEqual(normalizeUtm(''), null);

const utms = extractUtms({
  utm_source: 'Reddit',
  utm_medium: 'Social',
  utm_campaign: 'Box Upgrade',
  utm_content: 'Comment',
  other: 'ignore',
});
assert.deepStrictEqual(utms, {
  utm_source: 'reddit',
  utm_medium: 'social',
  utm_campaign: 'box-upgrade',
  utm_content: 'comment',
  utm_term: null,
});

assert.strictEqual(
  classifyUserAgent('Mozilla/5.0 AppleWebKit/537.36; compatible; ShapBot/0.1.0'),
  'agents',
);
assert.strictEqual(
  classifyUserAgent('Mozilla/5.0 (compatible; SemrushBot/7~bl)'),
  'seo_bots',
);
assert.strictEqual(
  classifyUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
  ),
  'humans',
);
assert.strictEqual(classifyUserAgent(''), 'seo_bots');

console.log('traffic utm helpers ok');
