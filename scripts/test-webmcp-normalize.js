#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  normalizeHost,
  normalizeSite,
  normalizeKind,
  normalizeImpl,
  sanitizeText,
} = require('../services/webmcp/normalize');

assert.strictEqual(normalizeHost('https://www.Example.com/path'), 'example.com');
assert.strictEqual(normalizeHost('EXAMPLE.COM.'), 'example.com');
assert.strictEqual(normalizeKind('read'), 'answer');
assert.strictEqual(normalizeKind('action'), 'transact');
assert.strictEqual(normalizeImpl('imperative'), 'imperative');
assert.ok(!sanitizeText('<script>x</script>hello').includes('script'));

const site = normalizeSite({
  host: 'demo.example.com',
  url: 'https://demo.example.com/',
  type: 'live',
  category: 'Developer Tools',
  desc: 'A <b>demo</b> site',
  tools: [
    {
      name: 'search',
      kind: 'answer',
      impl: 'imperative',
      description: 'Search things',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
      page: '/',
    },
  ],
});

assert.strictEqual(site.host, 'demo.example.com');
assert.strictEqual(site.category_slug, 'developer-tools');
assert.strictEqual(site.tool_count, 1);
assert.strictEqual(site.tools[0].required[0], 'q');
assert.ok(!site.description.includes('<'));

console.log('webmcp normalize tests OK');
