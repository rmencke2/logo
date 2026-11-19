#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { extractUtms, normalizeUtm } = require('../services/utmHelpers');

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

console.log('traffic utm helpers ok');
