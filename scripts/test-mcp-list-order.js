#!/usr/bin/env node
/**
 * List captions must match the sort in code. Sponsor figures come from
 * page_views and are omitted when that query cannot run.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  LIST_ORDER,
  DIRECTORY_SORT_CAPTIONS,
  homeListCaption,
  presentSponsorAudience,
} = require('../services/mcpListOrder');

const ROOT = path.join(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

assert.strictEqual(homeListCaption([{ source: 'traffic' }], true), LIST_ORDER.homeTraffic);
assert.strictEqual(
  homeListCaption([{ source: 'traffic' }, { source: 'catalog' }], true),
  LIST_ORDER.homeTrafficFill,
);
assert.strictEqual(homeListCaption([], false), LIST_ORDER.homeCatalog);
assert.match(LIST_ORDER.homeTraffic, /listing page views, last 7 days/);
assert.match(LIST_ORDER.directoryStars, /GitHub stars, then name/);
assert.match(LIST_ORDER.top100Membership, /Not ordered by last handshake/);
assert.match(LIST_ORDER.scoreboard, /Not ordered by last handshake/);
assert.match(LIST_ORDER.scoreboard, /labeled Sponsored/);
assert.strictEqual(DIRECTORY_SORT_CAPTIONS.stars, LIST_ORDER.directoryStars);
assert.strictEqual(DIRECTORY_SORT_CAPTIONS.popular, LIST_ORDER.directoryStars);
assert.strictEqual(DIRECTORY_SORT_CAPTIONS.tools, LIST_ORDER.directoryTools);
assert.strictEqual(DIRECTORY_SORT_CAPTIONS.quality, LIST_ORDER.directoryQuality);

const hidden = presentSponsorAudience({ available: false, visitors: 99, listingViews: 99, slotsRemaining: 2 });
assert.strictEqual(hidden.available, false);
assert.strictEqual(hidden.visitorsLabel, null);

const shown = presentSponsorAudience({ available: true, visitors: 1200, listingViews: 80, slotsRemaining: 1 });
assert.strictEqual(shown.visitorsLabel, '1,200');
assert.strictEqual(shown.listingViewsLabel, '80');
assert.strictEqual(shown.slotsRemainingLabel, '1');
assert.strictEqual(shown.slotsCaption, 'sponsor slot open');
assert.strictEqual(shown.listingViewsCaption, 'listing page views, last 30 days');

const zero = presentSponsorAudience({ available: true, visitors: 0, listingViews: 0, slotsRemaining: 2 });
assert.strictEqual(zero.visitorsLabel, '0');
assert.strictEqual(zero.slotsCaption, 'sponsor slots open');

const home = read('views/home.ejs');
assert.match(home, /<%= topServersCaption %>/);
assert.match(home, /home-board__audience/);
assert.match(home, /sponsorAudience\.listingViewsCaption/);
assert.doesNotMatch(home, /funded_usd/);
assert.doesNotMatch(home, /Rank stays catalog order/);
assert.match(home, /Paying does not change rank/);

const directory = read('views/mcp-index.ejs');
assert.match(directory, /mcpListOrder/);
assert.match(directory, /mcpSortCaption/);
assert.match(directory, /sortCaptions/);

const scoreboard = read('views/mcp-scoreboard.ejs');
assert.match(scoreboard, /board\.orderCaption/);
assert.doesNotMatch(scoreboard, /Top 100 × last handshake/);

const client = read('public/js/mcp-directory-page.js');
assert.match(client, /sortCaptions\[sort\]/);
assert.match(client, /\(b\.stars \|\| 0\) - \(a\.stars \|\| 0\)/);

const traffic = read('services/mcpListingTrafficService.js');
assert.match(traffic, /ORDER BY views DESC/);
assert.match(traffic, /isSponsoredListing/);
assert.match(traffic, /COUNT\(DISTINCT ip_address\) AS visitors/);

console.log('list order captions OK');
