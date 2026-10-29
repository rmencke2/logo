#!/usr/bin/env node
/**
 * Catalog counts have one definition. The homepage meta description and the
 * hero must use that same sentence — this test fails if they diverge.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  HANDSHAKE_WINDOW_DAYS,
  computeCatalogStats,
  describeCatalogStats,
  formatExactCount,
  isSuccessfulHandshake,
} = require('../services/mcpCatalogStats');

const ROOT = path.join(__dirname, '..');
const NOW = new Date('2026-10-29T12:00:00.000Z');
const WINDOW_MS = HANDSHAKE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function hoursBefore(ms) {
  return new Date(NOW.getTime() - ms).toISOString();
}

const servers = [
  { slug: 'live', tools: [{ name: 'a' }, { name: 'b' }] },
  { slug: 'EmptyOk', tools: [] },
  { slug: 'auth', tools: [{ name: 'locked' }] },
  { slug: 'stale', tools: [{ name: 'old' }] },
  { slug: 'hidden-one', hidden: true, tools: [{ name: 'nope' }, { name: 'nope2' }] },
];

const validation = {
  live: { endpoint_status: 'ok', validated_at: hoursBefore(60 * 60 * 1000) },
  emptyok: { endpoint_status: 'ok_empty', validated_at: hoursBefore(WINDOW_MS) },
  auth: { endpoint_status: 'auth_required', validated_at: hoursBefore(60 * 60 * 1000) },
  stale: { endpoint_status: 'ok', validated_at: hoursBefore(WINDOW_MS + 1) },
  future: { endpoint_status: 'ok', validated_at: hoursBefore(-1000) },
  'not-listed': { endpoint_status: 'ok', validated_at: hoursBefore(1000) },
};

const stats = computeCatalogStats({
  servers,
  validationBySlug: validation,
  validationAvailable: true,
  categoryCount: 3,
  catalogUpdatedDisplay: 'October 29, 2026',
  catalogUpdatedIso: NOW.toISOString(),
  now: NOW,
});

assert.strictEqual(stats.serversListed, 4, 'hidden servers are not listed');
assert.strictEqual(stats.serversWithIndexedTools, 3);
assert.strictEqual(stats.toolsIndexed, 4);
assert.strictEqual(stats.serversWithSuccessfulHandshakeLast7Days, 2, 'ok and ok_empty inside 7 days');
assert.strictEqual(stats.categoryCount, 3);
assert.strictEqual(stats.catalogUpdatedDisplay, 'October 29, 2026');

assert.strictEqual(isSuccessfulHandshake(validation.live, NOW.getTime()), true);
assert.strictEqual(isSuccessfulHandshake(validation.emptyok, NOW.getTime()), true);
assert.strictEqual(isSuccessfulHandshake(validation.auth, NOW.getTime()), false);
assert.strictEqual(isSuccessfulHandshake(validation.stale, NOW.getTime()), false);
assert.strictEqual(isSuccessfulHandshake({ endpoint_status: 'ok' }, NOW.getTime()), false);

const omitted = computeCatalogStats({
  servers,
  validationAvailable: false,
  categoryCount: 3,
  now: NOW,
});
assert.strictEqual(omitted.serversWithSuccessfulHandshakeLast7Days, null);
assert.strictEqual(omitted.serversListed, 4);

const none = computeCatalogStats({
  servers: [],
  validationBySlug: {},
  validationAvailable: true,
  now: NOW,
});
assert.strictEqual(none.serversWithSuccessfulHandshakeLast7Days, 0);

const copy = describeCatalogStats(stats);
assert.strictEqual(copy.listed, '4');
assert.strictEqual(copy.withTools, '3');
assert.strictEqual(copy.tools, '4');
assert.strictEqual(copy.handshake, '2');
assert.strictEqual(
  copy.countSentence,
  '4 servers listed, 3 servers with at least one indexed tool, 4 tools indexed, 2 servers with a successful handshake in the last 7 days',
);

const meta = copy.metaDescription(null);
const featuredMeta = copy.metaDescription('A featured title');
assert.ok(meta.includes(copy.countSentence), 'meta description must contain the hero count sentence');
assert.ok(meta.includes(`${copy.listed} servers listed`));
assert.ok(meta.includes(`${copy.withTools} servers with at least one indexed tool`));
assert.ok(meta.includes(`${copy.tools} tools indexed`));
assert.ok(meta.includes(`${copy.handshake} servers with a successful handshake in the last 7 days`));
assert.ok(featuredMeta.startsWith(copy.countSentence), 'featured meta still leads with the same counts');
assert.ok(featuredMeta.includes('Featured insight: A featured title'));

const bumped = describeCatalogStats({ ...stats, serversListed: stats.serversListed + 1 });
assert.notStrictEqual(bumped.listed, copy.listed);
assert.ok(bumped.metaDescription(null).includes(`${bumped.listed} servers listed`));
assert.ok(!bumped.metaDescription(null).includes(copy.countSentence));

const omittedCopy = describeCatalogStats(omitted);
assert.strictEqual(omittedCopy.handshake, null);
assert.ok(!omittedCopy.countSentence.includes('successful handshake'));
assert.ok(omittedCopy.metaDescription(null).includes(omittedCopy.countSentence));

const classicBug = describeCatalogStats({
  serversListed: 14162,
  serversWithIndexedTools: 392,
  toolsIndexed: 5012,
  serversWithSuccessfulHandshakeLast7Days: 17,
  categoryCount: 12,
  catalogUpdatedDisplay: 'October 29, 2026',
});
const classicMeta = classicBug.metaDescription(null);
assert.match(classicMeta, /14,162 servers listed/);
assert.match(classicMeta, /392 servers with at least one indexed tool/);
assert.match(classicMeta, /5,012 tools indexed/);
assert.match(classicMeta, /17 servers with a successful handshake in the last 7 days/);
assert.ok(
  classicMeta.indexOf('14,162 servers listed') < classicMeta.indexOf('392 servers with at least one indexed tool'),
  'the catalog size must not be replaced by the indexed-tool subset',
);
assert.doesNotMatch(classicMeta, /14100\+|6,000\+|\b5k\b/i);
assert.strictEqual(formatExactCount(14162), '14,162');
assert.strictEqual(formatExactCount(0), '0');
assert.strictEqual(formatExactCount(NaN), null);
assert.strictEqual(formatExactCount(null), null);
assert.strictEqual(formatExactCount(undefined), null);

const home = read('views/home.ejs');
const seoService = read('services/staticService.js');
const discovery = read('data/mcp-discovery-promo.js');
const directory = read('views/mcp-index.ejs');
assert.match(
  home,
  /data-count-sentence="<%= heroStats\.copy\.countSentence %>"/,
  'hero must render the same count sentence the meta description is built from',
);
assert.match(home, /heroStats\.copy\.listed/);
assert.match(home, /heroStats\.copy\.captions\.serversListed/);
assert.match(home, /heroStats\.copy\.withTools/);
assert.match(home, /heroStats\.copy\.tools/);
assert.match(home, /heroStats\.copy\.handshake/);
assert.doesNotMatch(home, /toolCountDisplay|<b>weekly<\/b>/);
assert.match(seoService, /catalogCopy\.metaDescription\(/);
assert.match(seoService, /description: seo\.metaDescription/);
assert.doesNotMatch(seoService, /formatHomeToolCount/);
assert.match(directory, /data-count-sentence="<%= heroStats\.copy\.countSentence %>"/);

const hardcodedCount = /\b(?:14[,.]?162|14[,.]?100\+|14100\+|6,000\+|1,500\+)\b/;
const displayFiles = [
  'views/home.ejs',
  'views/mcp-index.ejs',
  'views/mcp-server.ejs',
  'views/webmcp-challenge.ejs',
  'views/partials/mcp-milestone-banner.ejs',
  'data/mcp-discovery-promo.js',
  'data/mcp-seo-content.js',
  'data/mcp-milestone-promo.js',
  'services/staticService.js',
  'services/newsletterService.js',
  'public/index.html',
];
for (const rel of displayFiles) {
  const text = read(rel);
  assert.doesNotMatch(text, hardcodedCount, `${rel} still hardcodes a catalog count`);
}

const { getDiscoveryPromo } = require('../data/mcp-discovery-promo');
const promo = getDiscoveryPromo({ serverCount: 14162 });
assert.match(promo.blurb, /14,162 servers listed/);
assert.match(promo.promoBlurb, /14,162 servers listed/);
assert.doesNotMatch(`${promo.blurb} ${promo.promoBlurb}`, /14100\+|6,000\+|integrations/);
const zeroPromo = getDiscoveryPromo({ serverCount: 0 });
assert.match(zeroPromo.blurb, /0 servers listed/);
const missingPromo = getDiscoveryPromo({ serverCount: Number.NaN });
assert.doesNotMatch(missingPromo.blurb, /\d/);

const { getHomeSeoContent } = require('../data/mcp-seo-content');
const seo = getHomeSeoContent({ ...stats, copy });
const about = seo.faqs.find((item) => item.q === 'What is Influzer.ai?');
assert.ok(about.a.includes(copy.countSentence));
assert.ok(about.aPlain.includes(copy.countSentence));
assert.ok(seo.introParagraphs[0].includes(copy.countSentence));

const one = describeCatalogStats({
  serversListed: 1,
  serversWithIndexedTools: 1,
  toolsIndexed: 1,
  serversWithSuccessfulHandshakeLast7Days: 1,
  categoryCount: 1,
});
assert.strictEqual(
  one.countSentence,
  '1 server listed, 1 server with at least one indexed tool, 1 tool indexed, 1 server with a successful handshake in the last 7 days',
);
assert.ok(one.metaDescription(null).includes(one.countSentence));

const { getCatalogStats, getMcpHeroStats, getMcpCatalogTotals, getMcpHomepagePreview } = require('../services/mcpDirectoryService');
const live = getCatalogStats();
const hero = getMcpHeroStats();
const totals = getMcpCatalogTotals();
const preview = getMcpHomepagePreview(1);
assert.strictEqual(hero.totalServers, live.serversListed);
assert.strictEqual(hero.totalTools, live.toolsIndexed);
assert.strictEqual(hero.serversWithIndexedTools, live.serversWithIndexedTools);
assert.strictEqual(hero.categoryCount, live.categoryCount);
assert.strictEqual(totals.total, live.serversListed);
assert.strictEqual(totals.countSentence, hero.copy.countSentence);
assert.strictEqual(preview.total_catalog, live.serversListed);
assert.strictEqual(preview.total_with_tools, live.serversWithIndexedTools);
assert.strictEqual(preview.tools_indexed, live.toolsIndexed);
assert.strictEqual(preview.count_sentence, hero.copy.countSentence);
assert.ok(hero.copy.metaDescription(null).includes(hero.copy.countSentence));
assert.ok(hero.copy.metaDescription('Insight').includes(hero.copy.countSentence));
assert.ok(live.serversListed > 0, 'catalog should list servers');
assert.ok(live.categoryCount > 0);
if (live.serversWithSuccessfulHandshakeLast7Days != null) {
  assert.ok(live.serversWithSuccessfulHandshakeLast7Days >= 0);
  assert.ok(live.serversWithSuccessfulHandshakeLast7Days <= live.serversListed);
}

const livePromo = getDiscoveryPromo();
if (hero.copy.listed) {
  assert.match(livePromo.blurb, new RegExp(`${hero.copy.listed} servers listed`));
}

const { spawnSync } = require('child_process');
const loaded = spawnSync(process.execPath, ['-e', "require('./services/mcpDirectoryService').getCatalogStats()"], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert.strictEqual(loaded.status, 0, loaded.stderr);
assert.doesNotMatch(loaded.stderr || '', /circular dependency/);

console.log('catalog stats OK');
console.log(hero.copy.countSentence);
console.log('catalog updated:', hero.copy.updated);
