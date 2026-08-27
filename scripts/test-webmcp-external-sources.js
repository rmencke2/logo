#!/usr/bin/env node
'use strict';

/**
 * Unit tests for external WebMCP source helpers (no network).
 */

const assert = require('assert');
const {
  directoryToolSlugToHost,
  extractMarkdownUrls,
  makeCandidate,
  candidateToSite,
} = require('../services/webmcp/externalSources');
const { normalizeHost } = require('../services/webmcp/normalize');

assert.equal(directoryToolSlugToHost('monday-com'), 'monday.com');
assert.equal(directoryToolSlugToHost('worldmonitor-app'), 'worldmonitor.app');
assert.equal(directoryToolSlugToHost('birmakine-com'), 'birmakine.com');
assert.equal(directoryToolSlugToHost('tool/monday-com'), 'monday.com');
assert.equal(directoryToolSlugToHost(''), null);
const { directoryToolSlugToHosts } = require('../services/webmcp/externalSources');
assert.ok(directoryToolSlugToHosts('persona-chat-dev').includes('persona-chat.dev'));
assert.ok(directoryToolSlugToHosts('docs-mcp-b-ai').includes('docs.mcp-b.ai'));

assert.equal(normalizeHost('coffee-shop'), 'coffee-shop');
assert.equal(normalizeHost('https://googlechromelabs.github.io/webmcp-tools/demos/coffee-shop/'), 'googlechromelabs.github.io');
assert.equal(normalizeHost('monday.com'), 'monday.com');

const urls = extractMarkdownUrls(`
- [Demo](https://example-demo.test/app/) - cool
- https://other.test/path
- [Repo](https://github.com/foo/bar) should be filtered by caller
`);
assert.ok(urls.includes('https://example-demo.test/app/'));
assert.ok(urls.includes('https://other.test/path'));

const c = makeCandidate({
  host: 'monday.com',
  url: 'https://monday.com/',
  name: 'Monday',
  source_id: 'webmcpdirectory',
  source_name: 'webmcpdirectory.com',
  tools: [{ name: 'search', description: 'Search', kind: 'answer', impl: 'imperative' }],
});
assert.equal(c.host, 'monday.com');
const site = candidateToSite(c, null);
assert.equal(site.host, 'monday.com');
assert.equal(site.tool_count, 1);
assert.equal(site.verification_status, 'unverified');
assert.equal(site.provenance.source_name, 'webmcpdirectory.com');

console.log('webmcp external sources tests OK');
