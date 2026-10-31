'use strict';

const fs = require('fs');
const path = require('path');

const BLOCKLIST_PATH = path.join(__dirname, '..', '..', 'data', 'mcp-listing-blocklist.json');

function loadBlockedSlugs() {
  try {
    const data = JSON.parse(fs.readFileSync(BLOCKLIST_PATH, 'utf8'));
    const slugs = Array.isArray(data?.slugs) ? data.slugs : [];
    return new Set(slugs.map((slug) => String(slug || '').trim().toLowerCase()).filter(Boolean));
  } catch (err) {
    if (err && err.code === 'ENOENT') return new Set();
    throw err;
  }
}

function isBlockedListing(server, blocked = loadBlockedSlugs()) {
  const slug = String(server?.slug || server?.id || '')
    .trim()
    .toLowerCase();
  return Boolean(slug) && blocked.has(slug);
}

/**
 * Mark blocklisted servers hidden. Does not mutate the input objects.
 * Hidden servers are omitted from public lists and from Top 100.
 */
function applyListingBlocklist(servers, blocked = loadBlockedSlugs()) {
  if (!blocked.size) return servers;
  return servers.map((server) => (isBlockedListing(server, blocked) ? { ...server, hidden: true } : server));
}

module.exports = {
  BLOCKLIST_PATH,
  loadBlockedSlugs,
  isBlockedListing,
  applyListingBlocklist,
};
