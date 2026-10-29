#!/usr/bin/env node
/**
 * Directory filters are AND. Sorts use stored fields only.
 * A missing view count or latency does not become zero.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const query = require('../public/js/mcp-directory-query');
const { LIST_ORDER, DIRECTORY_SORT_CAPTIONS } = require('../services/mcpListOrder');

const NOW = new Date('2026-10-29T12:00:00.000Z');

function server(partial) {
  return Object.assign(
    {
      slug: 's',
      name: 'Server',
      description: '',
      category: 'Dev Tools',
      transport: 'stdio',
      isRemote: false,
      tools: [],
      stars: 0,
      official: false,
      last_updated: '2026-01-01',
      quality: {
        live_status: 'not_probed',
        auth_gate: 'unknown',
        demoware_tier: 'unverified',
        tools_indexed: false,
        probed_at: null,
        verification_grade: 10,
      },
    },
    partial,
  );
}

const live = server({
  slug: 'live',
  name: 'Live',
  isRemote: true,
  transport: 'http',
  tools: [{ name: 'search' }],
  stars: 10,
  last_updated: '2026-10-01',
  quality: {
    live_status: 'live_ok',
    auth_gate: 'none_detected',
    demoware_tier: 'ready',
    tools_indexed: true,
    probed_at: '2026-10-28T00:00:00.000Z',
    verification_grade: 90,
  },
});
const auth = server({
  slug: 'auth',
  name: 'Auth',
  category: 'Databases',
  isRemote: true,
  transport: 'http',
  tools: [{ name: 'query' }],
  stars: 50,
  last_updated: '2026-10-20',
  quality: {
    live_status: 'auth_required',
    auth_gate: 'required',
    demoware_tier: 'indexed',
    tools_indexed: true,
    probed_at: '2026-09-01T00:00:00.000Z',
    verification_grade: 60,
  },
});
const local = server({
  slug: 'local',
  name: 'Local',
  category: 'Dev Tools',
  isRemote: false,
  transport: 'stdio',
  tools: [{ name: 'files' }],
  stars: 5,
  last_updated: '2026-10-27',
  quality: {
    live_status: 'local_unprobed',
    auth_gate: 'unknown',
    demoware_tier: 'indexed',
    tools_indexed: true,
    probed_at: null,
    verification_grade: 30,
  },
});

const all = [live, auth, local];

const anded = query.applyDirectoryQuery(
  all,
  { status: 'live_ok', auth: 'no', transport: 'remote', category: 'Dev Tools', verified: '7' },
  { now: NOW },
);
assert.deepStrictEqual(anded.servers.map((s) => s.slug), ['live']);

const contradiction = query.applyDirectoryQuery(all, { status: 'live_ok', auth: 'yes' }, { now: NOW });
assert.strictEqual(contradiction.total, 0);

const authYesRemote = query.applyDirectoryQuery(
  all,
  { status: 'auth_required', auth: 'yes', transport: 'remote', verified: '30' },
  { now: NOW },
);
assert.strictEqual(authYesRemote.total, 0, 'September probe is outside 30 days');

const authOnly = query.applyDirectoryQuery(all, { auth: 'yes', category: 'Databases' }, { now: NOW });
assert.deepStrictEqual(authOnly.servers.map((s) => s.slug), ['auth']);

const localOnly = query.applyDirectoryQuery(all, { transport: 'local', status: 'local_unprobed' }, { now: NOW });
assert.deepStrictEqual(localOnly.servers.map((s) => s.slug), ['local']);

const recent = query.applyDirectoryQuery(all, { verified: '30' }, { now: NOW });
assert.deepStrictEqual(recent.servers.map((s) => s.slug), ['live']);

const searchAndCategory = query.applyDirectoryQuery(all, { q: 'query', category: 'Dev Tools' }, { now: NOW });
assert.strictEqual(searchAndCategory.total, 0);
const searchHit = query.applyDirectoryQuery(all, { q: 'query', category: 'Databases', transport: 'remote' }, { now: NOW });
assert.deepStrictEqual(searchHit.servers.map((s) => s.slug), ['auth']);

assert.strictEqual(query.directoryQueryIsFiltered({}), false);
assert.strictEqual(query.directoryQueryIsFiltered({ sort: 'stars' }), false);
assert.strictEqual(query.directoryQueryIsFiltered({ status: 'live_ok', auth: 'no' }), true);
assert.strictEqual(query.toQueryString({ q: 'pg', category: 'Databases', status: 'auth_required', verified: '7', auth: 'yes', transport: 'remote', quality: 'indexed', sort: 'grade', toolsOnly: false }, { includeTools: true }),
  'q=pg&category=Databases&status=auth_required&verified=7&auth=yes&transport=remote&quality=indexed&sort=grade&tools=0');

const roundTrip = query.parseDirectoryQuery(Object.fromEntries(new URLSearchParams(
  query.toQueryString({ q: 'pg', category: 'Databases', status: 'live_ok', verified: '30', auth: 'no', transport: 'local', quality: 'ready', sort: 'added', toolsOnly: false }, { includeTools: true }),
)));
assert.strictEqual(roundTrip.q, 'pg');
assert.strictEqual(roundTrip.category, 'Databases');
assert.strictEqual(roundTrip.status, 'live_ok');
assert.strictEqual(roundTrip.verified, '30');
assert.strictEqual(roundTrip.auth, 'no');
assert.strictEqual(roundTrip.transport, 'local');
assert.strictEqual(roundTrip.quality, 'ready');
assert.strictEqual(roundTrip.sort, 'added');
assert.strictEqual(roundTrip.toolsOnly, false);
assert.strictEqual(query.parseDirectoryQuery({ status: 'bogus', verified: '2', auth: 'maybe' }).status, '');

const byGrade = query.sortDirectory(all, 'grade');
assert.deepStrictEqual(byGrade.map((s) => s.slug), ['live', 'auth', 'local']);

const byAdded = query.sortDirectory(all, 'added');
assert.deepStrictEqual(byAdded.map((s) => s.slug), ['local', 'auth', 'live']);

const byVerified = query.sortDirectory(all, 'verified');
assert.strictEqual(byVerified[0].slug, 'live');
assert.strictEqual(byVerified[byVerified.length - 1].slug, 'local');

const noLatency = query.sortDirectory(all, 'latency');
assert.deepStrictEqual(noLatency.map((s) => s.slug), ['live', 'auth', 'local']);
assert.strictEqual(query.captionKey('latency', { latencyAvailable: false }), 'latencyNone');

const withLatency = all.map((s) => Object.assign({}, s));
withLatency[1].latency_ms = 40;
withLatency[0].latency_ms = 120;
const fastest = query.sortDirectory(withLatency, 'latency');
assert.deepStrictEqual(fastest.map((s) => s.slug), ['auth', 'live', 'local']);

const noViews = query.sortDirectory(all, 'views');
assert.deepStrictEqual(noViews.map((s) => s.slug), ['live', 'auth', 'local']);
assert.strictEqual(query.captionKey('views', { viewsAvailable: false }), 'viewsUnavailable');

const stamped = query.applyViewCounts(all, { live: 3, auth: 9 });
assert.strictEqual(stamped.viewsAvailable, true);
assert.strictEqual(stamped.servers.find((s) => s.slug === 'local').views_7d, 0);
const byViews = query.sortDirectory(stamped.servers, 'views', { viewsAvailable: true });
assert.deepStrictEqual(byViews.map((s) => s.slug), ['auth', 'live', 'local']);
assert.strictEqual(query.applyViewCounts(all, null).viewsAvailable, false);
assert.strictEqual(query.applyViewCounts(all, null).servers[0].views_7d, undefined);

const empty = query.emptyDirectoryMessage({ q: '' }, 'top');
assert.match(empty.message, /No servers match these filters/);
assert.match(empty.hint, /full directory/);
assert.strictEqual(empty.submitHref, '/mcp/submit');
const searched = query.emptyDirectoryMessage({ q: 'scrape' }, 'all');
assert.match(searched.message, /scrape/);
assert.doesNotMatch(searched.hint, /full directory/);

assert.strictEqual(DIRECTORY_SORT_CAPTIONS.views, LIST_ORDER.directoryViews);
assert.strictEqual(DIRECTORY_SORT_CAPTIONS.viewsUnavailable, LIST_ORDER.directoryViewsUnavailable);
assert.strictEqual(DIRECTORY_SORT_CAPTIONS.verified, LIST_ORDER.directoryVerified);
assert.strictEqual(DIRECTORY_SORT_CAPTIONS.latency, LIST_ORDER.directoryLatency);
assert.strictEqual(DIRECTORY_SORT_CAPTIONS.latencyNone, LIST_ORDER.directoryLatencyNone);
assert.strictEqual(DIRECTORY_SORT_CAPTIONS.added, LIST_ORDER.directoryAdded);
assert.strictEqual(DIRECTORY_SORT_CAPTIONS.grade, LIST_ORDER.directoryGrade);

const page = fs.readFileSync(path.join(__dirname, '..', 'views', 'mcp-index.ejs'), 'utf8');
assert.match(page, /id="mcpStatus"/);
assert.match(page, /id="mcpVerified"/);
assert.match(page, /id="mcpAuth"/);
assert.match(page, /id="mcpTransport"/);
assert.match(page, /value="views"/);
assert.match(page, /value="grade"/);
assert.match(page, /data-empty-hint/);
assert.match(page, /mcpEmptyBrowse/);
assert.match(page, /noindex/);

const synthetic = [];
for (let i = 0; i < 14000; i += 1) {
  synthetic.push(server({
    slug: 's' + i,
    name: 'Server ' + i,
    category: i % 3 === 0 ? 'Databases' : 'Dev Tools',
    isRemote: i % 2 === 0,
    transport: i % 2 === 0 ? 'http' : 'stdio',
    stars: i % 100,
    tools: i % 5 === 0 ? [{ name: 'tool' }] : [],
    last_updated: '2026-10-' + String((i % 28) + 1).padStart(2, '0'),
    quality: {
      live_status: i % 4 === 0 ? 'auth_required' : 'not_probed',
      auth_gate: i % 4 === 0 ? 'required' : 'unknown',
      demoware_tier: 'thin',
      tools_indexed: i % 5 === 0,
      probed_at: i % 4 === 0 ? '2026-10-20T00:00:00.000Z' : null,
      verification_grade: i % 100,
    },
    latency_ms: i % 10 === 0 ? i % 500 : undefined,
    views_7d: i % 7,
  }));
}
const started = Date.now();
const filtered = query.applyDirectoryQuery(
  synthetic,
  { status: 'auth_required', auth: 'yes', transport: 'remote', category: 'Databases', verified: '30', sort: 'grade' },
  { now: NOW, viewsAvailable: true },
);
const filterMs = Date.now() - started;
assert.ok(filtered.total > 0);
assert.ok(filtered.servers.every((s) => s.quality.live_status === 'auth_required' && s.isRemote && s.category === 'Databases'));
for (let i = 1; i < Math.min(filtered.servers.length, 20); i += 1) {
  assert.ok(filtered.servers[i - 1].quality.verification_grade >= filtered.servers[i].quality.verification_grade);
}
assert.ok(filterMs < 500, 'filter+sort of 14000 took ' + filterMs + 'ms');

let catalogMs = null;
let catalogFilterMs = null;
let catalogCount = null;
try {
  const { getMcpCatalogPayload } = require('../services/mcpDirectoryService');
  const loadStarted = Date.now();
  const payload = getMcpCatalogPayload('all', { toolsOnly: false });
  catalogMs = Date.now() - loadStarted;
  catalogCount = payload.servers.length;
  const filterStarted = Date.now();
  const slice = query.applyDirectoryQuery(payload.servers, { transport: 'remote', sort: 'grade' }, { now: new Date() });
  catalogFilterMs = Date.now() - filterStarted;
  assert.ok(slice.total <= catalogCount);
  assert.ok(catalogFilterMs < 500, 'catalog filter took ' + catalogFilterMs + 'ms');
} catch (err) {
  console.log('catalog timing skipped:', err.message);
}

console.log('directory query OK');
console.log('synthetic 14000 filter+sort ms', filterMs, 'matches', filtered.total);
if (catalogMs != null) {
  console.log('catalog payload ms', catalogMs, 'servers', catalogCount, 'filter+sort ms', catalogFilterMs);
}
