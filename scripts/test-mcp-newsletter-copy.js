#!/usr/bin/env node
/**
 * Newsletter UI copy must not invent a subscriber count or an unattributed quote.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const files = [
  'views/partials/registry-newsletter.ejs',
  'views/blog-index.ejs',
  'views/home.ejs',
];

for (const rel of files) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.doesNotMatch(text, /4,200/, rel);
  assert.doesNotMatch(text, /Staff engineer/, rel);
  assert.doesNotMatch(text, /only MCP roundup/i, rel);
}

console.log('newsletter copy OK');
