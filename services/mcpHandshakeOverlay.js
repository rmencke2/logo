'use strict';

/**
 * Fresh handshake facts (seed file + in-memory probe cache) merged onto listing quality.
 * Never a SAFE badge.
 */

const fs = require('fs');
const path = require('path');
const { httpsRemoteUrl } = require('./mcpInstallSnippets');
const { buildHandshakeBadgeSvg } = require('./mcpHandshakeBadge');

const SEED_PATH = path.join(__dirname, '..', 'data', 'mcp-handshake-seed.json');
const OVERLAY_TTL_MS = Number(process.env.MCP_HANDSHAKE_OVERLAY_TTL_MS) || 10 * 60 * 1000;

const byUrl = new Map();
const bySlug = new Map();
let seedCache;

const LIVE_TO_ENDPOINT = {
  live_ok: 'ok',
  auth_required: 'auth_required',
  unreachable: 'unreachable',
};

function liveToEndpoint(liveStatus) {
  return LIVE_TO_ENDPOINT[liveStatus] || null;
}

function loadSeed() {
  if (seedCache) return seedCache;
  try {
    const raw = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
    seedCache = raw && typeof raw === 'object' ? raw.servers || raw : {};
  } catch {
    seedCache = {};
  }
  return seedCache;
}

function overlayRecord({ url, slug, liveStatus, probedAt, expires }) {
  const endpoint_status = liveToEndpoint(liveStatus);
  if (!endpoint_status && liveStatus !== 'not_probed') return null;
  return {
    live_status: liveStatus,
    endpoint_status: endpoint_status || '',
    validated_at: probedAt || new Date().toISOString(),
    validation_method: 'live_mcp',
    expires: expires || 0,
  };
}

function rememberHandshake({ url, slug, slugs, liveStatus, probedAt } = {}) {
  const rec = overlayRecord({
    url,
    slug,
    liveStatus,
    probedAt,
    expires: Date.now() + OVERLAY_TTL_MS,
  });
  if (!rec) return;
  if (url) byUrl.set(String(url).trim().toLowerCase(), rec);
  const ids = [slug, ...(slugs || [])].filter(Boolean);
  for (const id of ids) {
    bySlug.set(String(id).trim().toLowerCase(), rec);
  }
}

function rememberFromProbe(result, extraSlug) {
  if (!result || !result.live_status) return;
  rememberHandshake({
    url: result.url,
    slug: extraSlug,
    slugs: (result.catalog || []).map((hit) => hit.slug),
    liveStatus: result.live_status,
    probedAt: result.probed_at,
  });
}

function isFresh(rec) {
  return rec && (!rec.expires || rec.expires > Date.now());
}

function peekHandshake({ url, slug } = {}) {
  if (slug) {
    const live = bySlug.get(String(slug).trim().toLowerCase());
    if (isFresh(live)) return live;
    const seeded = loadSeed()[String(slug).trim().toLowerCase()];
    if (seeded) return seeded;
  }
  if (url) {
    const live = byUrl.get(String(url).trim().toLowerCase());
    if (isFresh(live)) return live;
  }
  return null;
}

function mergeHandshakeEntry(server, entry) {
  const overlay = peekHandshake({
    slug: server?.slug,
    url: httpsRemoteUrl(server),
  });
  if (!overlay) return entry;
  return {
    ...(entry || {}),
    endpoint_status: overlay.endpoint_status || entry?.endpoint_status || null,
    validated_at: overlay.validated_at || entry?.validated_at || null,
    validation_method: overlay.validation_method || entry?.validation_method || 'live_mcp',
  };
}

function listingHandshakeSvg(quality) {
  const status = quality?.live_status;
  if (!status || status === 'local_unprobed') return '';
  return buildHandshakeBadgeSvg({ liveStatus: status });
}

function reattachQuality(server) {
  const { attachQuality } = require('./mcpDirectoryService');
  const copy = { ...server };
  delete copy.quality;
  return attachQuality(copy);
}

/**
 * Listing page: if the catalog has no handshake yet, probe once and overlay.
 */
async function refreshListingHandshake(server, probeMcpUrl) {
  if (!server) return server;
  const url = httpsRemoteUrl(server);
  if (!url) return reattachQuality(server);

  const current = server.quality?.live_status;
  if (current === 'live_ok' || current === 'auth_required' || current === 'unreachable') {
    return reattachQuality(server);
  }

  const cached = peekHandshake({ url, slug: server.slug });
  if (
    cached &&
    (cached.endpoint_status === 'ok' ||
      cached.endpoint_status === 'auth_required' ||
      cached.endpoint_status === 'unreachable')
  ) {
    return reattachQuality(server);
  }

  if (typeof probeMcpUrl !== 'function') return reattachQuality(server);

  try {
    const result = await probeMcpUrl(url);
    rememberFromProbe(result, server.slug);
  } catch {
    rememberHandshake({
      url,
      slug: server.slug,
      liveStatus: 'unreachable',
      probedAt: new Date().toISOString(),
    });
  }
  return reattachQuality(server);
}

function clearHandshakeOverlay() {
  byUrl.clear();
  bySlug.clear();
  seedCache = null;
}

module.exports = {
  rememberHandshake,
  rememberFromProbe,
  peekHandshake,
  mergeHandshakeEntry,
  listingHandshakeSvg,
  refreshListingHandshake,
  clearHandshakeOverlay,
  liveToEndpoint,
};
