#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describeWebmcpCoverage } = require('../services/webmcp/coverage');
const {
  WebMcpDiscoveryProvider,
  DEFAULT_PAGE_LIMIT,
  DEFAULT_MAX_PAGES,
} = require('../services/webmcp/discoveryProvider');

function stubProvider(total) {
  const provider = new WebMcpDiscoveryProvider({ baseUrl: 'https://example.test' });
  provider.listSitesPage = async ({ offset, limit }) => {
    const n = Math.min(limit, Math.max(0, total - offset));
    return {
      total,
      sites: Array.from({ length: n }, (_, i) => ({ host: `h${offset + i}.example` })),
    };
  };
  return provider;
}

(async () => {
  const capped = describeWebmcpCoverage({ siteCount: 5000, upstreamTotal: 6499 });
  assert.strictEqual(capped.catalog_truncated, true);
  assert.strictEqual(capped.site_count, 5000);
  assert.strictEqual(capped.upstream_total, 6499);
  assert.strictEqual(
    capped.coverage_note,
    'This catalog lists 5,000 websites. webmcp.com reported 6,499 when the snapshot was taken. Tool and live counts cover the websites listed here.'
  );
  assert.ok(!/28,314|4,944/.test(capped.coverage_note));

  const complete = describeWebmcpCoverage({ siteCount: 6499, upstreamTotal: 6499 });
  assert.strictEqual(complete.catalog_truncated, false);
  assert.strictEqual(complete.coverage_note, null);

  const localExtras = describeWebmcpCoverage({ siteCount: 6500, upstreamTotal: 6499 });
  assert.strictEqual(localExtras.catalog_truncated, false);
  assert.strictEqual(localExtras.coverage_note, null);

  const missingUpstream = describeWebmcpCoverage({ siteCount: 5000, upstreamTotal: null });
  assert.strictEqual(missingUpstream.catalog_truncated, false);
  assert.strictEqual(missingUpstream.coverage_note, null);
  assert.strictEqual(missingUpstream.upstream_total, null);

  const missingListed = describeWebmcpCoverage({ siteCount: null, upstreamTotal: 6499 });
  assert.strictEqual(missingListed.site_count, null);
  assert.strictEqual(missingListed.coverage_note, null);

  const zero = describeWebmcpCoverage({ siteCount: 0, upstreamTotal: 10 });
  assert.strictEqual(zero.catalog_truncated, true);
  assert.match(zero.coverage_note, /lists 0 websites/);

  assert.strictEqual(describeWebmcpCoverage({ siteCount: 'nope', upstreamTotal: 1 }).coverage_note, null);

  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'webmcp-meta.json'), 'utf8'));
  const fromFile = describeWebmcpCoverage({
    siteCount: meta.site_count,
    upstreamTotal: meta.upstream_total,
  });
  if (Number(meta.upstream_total) > Number(meta.site_count)) {
    assert.strictEqual(fromFile.catalog_truncated, true);
    assert.match(fromFile.coverage_note, new RegExp(Number(meta.site_count).toLocaleString('en-US')));
    assert.match(fromFile.coverage_note, new RegExp(Number(meta.upstream_total).toLocaleString('en-US')));
  } else {
    assert.strictEqual(fromFile.coverage_note, null);
  }

  const indexTpl = fs.readFileSync(path.join(__dirname, '..', 'views', 'webmcp-index.ejs'), 'utf8');
  assert.match(indexTpl, /websites listed/);
  assert.match(indexTpl, /stats\.coverage_note/);
  assert.match(indexTpl, /stats\.site_count != null && Number\.isFinite/);
  assert.match(indexTpl, /toLocaleString\('en-US'\)/);
  const challengeTpl = fs.readFileSync(path.join(__dirname, '..', 'views', 'webmcp-challenge.ejs'), 'utf8');
  assert.match(challengeTpl, /in this catalog/);
  assert.match(challengeTpl, /stats\.coverage_note/);
  assert.match(challengeTpl, /stats\.site_count != null && Number\.isFinite/);

  assert.strictEqual(DEFAULT_PAGE_LIMIT, 100);
  assert.ok(DEFAULT_MAX_PAGES * DEFAULT_PAGE_LIMIT > 5000, 'page ceiling must clear the old 5,000 cutoff');

  const full = await stubProvider(6499).listAllSites({ pageDelayMs: 0 });
  assert.strictEqual(full.sites.length, 6499);
  assert.strictEqual(full.total, 6499);
  assert.strictEqual(full.truncated, false);
  assert.strictEqual(full.pages, 65);

  const oldCap = await stubProvider(6499).listAllSites({ pageDelayMs: 0, maxPages: 50 });
  assert.strictEqual(oldCap.sites.length, 5000);
  assert.strictEqual(oldCap.total, 6499);
  assert.strictEqual(oldCap.truncated, true);
  assert.strictEqual(oldCap.pages, 50);

  const exact = await stubProvider(200).listAllSites({ pageDelayMs: 0, maxPages: 2 });
  assert.strictEqual(exact.sites.length, 200);
  assert.strictEqual(exact.truncated, false);

  const empty = await stubProvider(0).listAllSites({ pageDelayMs: 0 });
  assert.strictEqual(empty.sites.length, 0);
  assert.strictEqual(empty.truncated, false);
  assert.strictEqual(empty.total, 0);

  console.log('webmcp coverage ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
