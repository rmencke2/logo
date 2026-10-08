'use strict';

/**
 * Fresh handshake facts (seed file + in-memory probe cache) merged onto listing quality.
 * Never a SAFE badge.
 */

const fs = require('fs');
const path = require('path');
const { httpsRemoteUrl } = require('./mcpInstallSnippets');
const { buildHandshakeBadgeSvg } = require('./mcpHandshakeBadge');
const { resolveLiveStatus } = require('../scripts/utils/mcp-quality');

const SEED_PATH = path.join(__dirname, '..', 'data', 'mcp-handshake-seed.json');
const WARM_PATH =
  process.env.MCP_HANDSHAKE_WARM_PATH ||
  path.join(__dirname, '..', 'data', 'mcp-handshake-warm.json');
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

function readServersFile(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!raw || typeof raw !== 'object') return {};
    return raw.servers && typeof raw.servers === 'object' ? raw.servers : raw;
  } catch {
    return {};
  }
}

function loadSeed() {
  if (seedCache) return seedCache;
  seedCache = {
    ...readServersFile(SEED_PATH),
    ...readServersFile(WARM_PATH),
  };
  return seedCache;
}

function persistWarmFile() {
  const servers = { ...readServersFile(WARM_PATH) };
  for (const [slug, rec] of bySlug.entries()) {
    if (!rec || !rec.endpoint_status) continue;
    servers[slug] = {
      endpoint_status: rec.endpoint_status,
      validation_method: rec.validation_method || 'live_mcp',
      validated_at: rec.validated_at,
    };
  }
  const payload = {
    updated_at: new Date().toISOString(),
    note: 'Boot warm-probe of featured / Top 100 HTTPS remotes. Not a SAFE badge. Stdio is skipped.',
    servers,
  };
  fs.mkdirSync(path.dirname(WARM_PATH), { recursive: true });
  fs.writeFileSync(WARM_PATH, JSON.stringify(payload, null, 2) + '\n');
  seedCache = null;
}

const HANDSHAKE_DONE = new Set(['live_ok', 'auth_required', 'unreachable']);

function listWarmProbeTargets() {
  const { getTop100McpServers, getAllMcpServers } = require('./mcpDirectoryService');
  const seen = new Set();
  const targets = [];
  const pool = [...getTop100McpServers()];
  for (const server of getAllMcpServers()) {
    if (server.featured) pool.push(server);
  }
  for (const server of pool) {
    const slug = String(server.slug || '').trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const url = httpsRemoteUrl(server);
    if (!url) continue;
    const status = server.quality?.live_status;
    // Retry unreachable: a parser bug (plain 401) used to stick as unreachable in the warm file.
    if (status === 'live_ok' || status === 'auth_required') continue;
    targets.push({ slug, url, name: server.name || slug });
  }
  return targets;
}

/**
 * Handshake featured + Top 100 HTTPS remotes that still say not_probed.
 * Stdio is skipped. Results overlay listings and persist to the warm file.
 */
async function warmProbeHttpsListings(opts = {}) {
  if (opts.enabled === false || process.env.MCP_WARM_PROBE === '0') {
    return { skipped: true, probed: 0, targets: [] };
  }
  const probeMcpUrl = opts.probeMcpUrl || require('./mcpProbeService').probeMcpUrl;
  const targets = opts.targets || listWarmProbeTargets();
  const summary = {
    skipped: false,
    probed: 0,
    live_ok: 0,
    auth_required: 0,
    unreachable: 0,
    targets: targets.map((t) => t.slug),
  };

  for (const target of targets) {
    try {
      const result = await probeMcpUrl(target.url, opts.probeOpts);
      rememberFromProbe(result, target.slug);
      const status = result.live_status || 'unreachable';
      if (summary[status] !== undefined) summary[status] += 1;
    } catch {
      rememberHandshake({
        url: target.url,
        slug: target.slug,
        liveStatus: 'unreachable',
        probedAt: new Date().toISOString(),
      });
      summary.unreachable += 1;
    }
    summary.probed += 1;
  }

  if (opts.persist !== false && summary.probed > 0) persistWarmFile();
  return summary;
}

async function startWarmHandshakeProbe() {
  if (process.env.MCP_WARM_PROBE === '0') return { skipped: true, probed: 0, targets: [] };
  const summary = await warmProbeHttpsListings();
  if (summary.skipped) return summary;
  console.log(
    `MCP warm handshake: ${summary.probed} probed (${summary.live_ok} live_ok, ${summary.auth_required} auth_required, ${summary.unreachable} unreachable) — not a SAFE badge`,
  );
  return summary;
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

/**
 * Shared listing/badge clock. Overlay (warm + seed + in-memory) first,
 * then catalog quality. null means the badge may live-probe.
 */
function handshakeClockStatus({ url, slug } = {}) {
  const rec = peekHandshake({ url, slug });
  if (rec) {
    if (HANDSHAKE_DONE.has(rec.live_status)) return rec.live_status;
    const mapped = resolveLiveStatus({}, rec);
    if (HANDSHAKE_DONE.has(mapped)) return mapped;
  }

  if (slug) {
    const { findMcpServerBySlug } = require('./mcpDirectoryService');
    const status = findMcpServerBySlug(slug)?.quality?.live_status;
    if (HANDSHAKE_DONE.has(status)) return status;
  }

  if (url) {
    const { findMcpServersByEndpoint } = require('./mcpDirectoryService');
    const status = findMcpServersByEndpoint(url, 1)[0]?.quality?.live_status;
    if (HANDSHAKE_DONE.has(status)) return status;
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
  handshakeClockStatus,
  mergeHandshakeEntry,
  listingHandshakeSvg,
  refreshListingHandshake,
  clearHandshakeOverlay,
  liveToEndpoint,
  listWarmProbeTargets,
  warmProbeHttpsListings,
  startWarmHandshakeProbe,
  persistWarmFile,
};
