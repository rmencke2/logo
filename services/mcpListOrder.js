/**
 * Captions that match the sort actually used by each public list.
 * Sponsored slots are a separate labeled rail. They are not a rank.
 */

const { formatExactCount } = require('./mcpCatalogStats');

const LIST_ORDER = {
  homeTraffic: 'Ranked by listing page views, last 7 days.',
  homeTrafficFill:
    'Ranked by listing page views, last 7 days. Remaining rows are filled from the Top 100 in catalog order.',
  homeCatalog:
    'Ranked by Top 100 catalog order: editorial pins first, then catalog score (capped stars, official, indexed tools, manual source). Listing-page views were not available.',
  directoryStars: 'Ranked by GitHub stars, then name.',
  directoryTools: 'Ranked by indexed tool count.',
  directoryOfficial: 'Official servers first, then name.',
  directoryQuality:
    'Ranked by listing-quality tier (ready, indexed, thin, unverified), then indexed tool count.',
  directoryName: 'Ranked by name, A to Z.',
  top100Membership:
    'Top 100 membership is editorial pins first, then catalog score (capped stars, official, indexed tools, manual source, longer descriptions). Not ordered by last handshake. Sponsored slots are the labeled row above this list.',
  fullDirectory:
    'This is the full catalog, not the Top 100. Sponsored slots are the labeled row above this list.',
  scoreboard:
    'Organic rows follow Top 100 order: editorial pins first, then catalog score. Not ordered by last handshake. Sponsored pins sit above this table and are labeled Sponsored.',
};

const DIRECTORY_SORT_CAPTIONS = {
  stars: LIST_ORDER.directoryStars,
  popular: LIST_ORDER.directoryStars,
  tools: LIST_ORDER.directoryTools,
  official: LIST_ORDER.directoryOfficial,
  quality: LIST_ORDER.directoryQuality,
  name: LIST_ORDER.directoryName,
};

function homeListCaption(items, dynamic) {
  if (!dynamic) return LIST_ORDER.homeCatalog;
  const filled = (items || []).some((item) => item && item.source === 'catalog');
  return filled ? LIST_ORDER.homeTrafficFill : LIST_ORDER.homeTraffic;
}

/**
 * Sponsor block figures. Null labels are omitted. Never invent a visitor or click count.
 * listing page views are rows in page_views for /mcp/:slug, not outbound clicks.
 */
function presentSponsorAudience({
  available = false,
  visitors = null,
  listingViews = null,
  slotsRemaining = null,
} = {}) {
  if (!available) {
    return { available: false, visitorsLabel: null, listingViewsLabel: null, slotsRemainingLabel: null };
  }
  const slots = Number(slotsRemaining);
  return {
    available: true,
    visitorsLabel: formatExactCount(visitors),
    listingViewsLabel: formatExactCount(listingViews),
    slotsRemainingLabel: formatExactCount(slotsRemaining),
    visitorsCaption: 'visitors, last 30 days',
    listingViewsCaption: 'listing page views, last 30 days',
    slotsCaption: slots === 1 ? 'sponsor slot open' : 'sponsor slots open',
  };
}

module.exports = {
  LIST_ORDER,
  DIRECTORY_SORT_CAPTIONS,
  homeListCaption,
  presentSponsorAudience,
};
