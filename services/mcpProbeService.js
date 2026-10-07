'use strict';

/**
 * Public MCP handshake probe — live tools/list facts, never a SAFE badge.
 *
 *   GET  /api/v1/probe?url=https://example.com/mcp
 *   POST /api/v1/probe  { "url": "https://example.com/mcp" }
 */

const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { fetchLiveMcpTools } = require('../scripts/utils/mcp-live-client');
const { computeQualitySignals } = require('../scripts/utils/mcp-quality');
const { sanitizeTools } = require('./mcpSourceSafety');
const { assertSafePublicUrl } = require('./webmcp/ssrf');
const { findMcpServersByEndpoint } = require('./mcpDirectoryService');
const { clientErrorMessage } = require('../utils/safeError');

const SITE_BASE = 'https://www.influzer.ai';
const PROBE_PATH = '/api/v1/probe';
const PROBE_DOCS = `${SITE_BASE}/mcp/probe`;
const DEFAULT_TIMEOUT_MS = Number(process.env.MCP_PROBE_TIMEOUT_MS) || 10000;
const MAX_TOOLS = 25;
const MAX_TOOL_DESC = 160;

const LIVE_STATUS_FROM_PROBE = {
  ok: 'live_ok',
  ok_empty: 'live_ok',
  auth_required: 'auth_required',
  unreachable: 'unreachable',
  error: 'unreachable',
  skipped: 'not_probed',
};

function getProbeAssetVersion() {
  try {
    const files = ['home.css', 'mcp-setup-page.css'];
    let latest = 0;
    for (const file of files) {
      latest = Math.max(
        latest,
        fs.statSync(path.join(__dirname, '..', 'public', 'css', file)).mtimeMs,
      );
    }
    return String(Math.floor(latest));
  } catch {
    return String(Date.now());
  }
}

function setProbeCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

const probeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.MCP_PROBE_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: 'rate_limited',
    note: 'Too many probes from this IP. Wait and retry, or cache the last handshake.',
  },
});

function clipReason(reason) {
  const text = String(reason || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.slice(0, 200);
}

function publicTools(tools) {
  return sanitizeTools(tools || [])
    .slice(0, MAX_TOOLS)
    .map((tool) => ({
      name: tool.name,
      description: String(tool.description || '').slice(0, MAX_TOOL_DESC),
    }));
}

function catalogHits(url) {
  return findMcpServersByEndpoint(url, 5).map((server) => ({
    slug: server.slug,
    name: server.name,
    transport: server.transport || null,
    page_url: `${SITE_BASE}/mcp/${server.slug}`,
    demoware_tier: server.quality?.demoware_tier || null,
  }));
}

/**
 * @param {string} rawUrl
 * @param {{ fetchLiveMcpTools?: typeof fetchLiveMcpTools; timeoutMs?: number }} [opts]
 */
async function probeMcpUrl(rawUrl, opts = {}) {
  const fetchLive = opts.fetchLiveMcpTools || fetchLiveMcpTools;
  const probedAt = new Date().toISOString();

  if (!String(rawUrl || '').trim()) {
    const err = new Error('url is required');
    err.status = 400;
    err.code = 'url_required';
    throw err;
  }

  let safe;
  try {
    safe = await assertSafePublicUrl(rawUrl, { allowHttp: false });
  } catch (cause) {
    const err = new Error(cause.message || 'URL is not allowed');
    err.status = 400;
    err.code = 'url_not_allowed';
    throw err;
  }

  const live = await fetchLive(safe.href, {
    timeoutMs: opts.timeoutMs || DEFAULT_TIMEOUT_MS,
    redirect: 'manual',
    clientInfo: { name: 'influzer-mcp-probe', version: '1.0.0' },
  });

  if (live.status === 'skipped') {
    const err = new Error(live.reason || 'No HTTP MCP endpoint');
    err.status = 400;
    err.code = 'no_http_endpoint';
    throw err;
  }

  const tools = publicTools(live.tools || []);
  const liveStatus = LIVE_STATUS_FROM_PROBE[live.status] || 'unreachable';
  const syntheticServer = {
    transport: 'http',
    tools,
    mcp_endpoint: safe.href,
  };
  const quality = computeQualitySignals(syntheticServer, {
    endpoint_status:
      liveStatus === 'live_ok'
        ? 'ok'
        : liveStatus === 'auth_required'
          ? 'auth_required'
          : liveStatus === 'unreachable'
            ? 'unreachable'
            : '',
    validation_method: 'live_mcp',
    validated_at: probedAt,
    tool_count: tools.length,
  });

  return {
    ok: true,
    probed_at: probedAt,
    url: safe.href,
    live_status: quality.live_status,
    live_status_label: quality.live_status_label,
    auth_gate: quality.auth_gate,
    auth_gate_label: quality.auth_gate_label,
    http_status: live.httpStatus || null,
    tool_count: tools.length,
    tools,
    tools_truncated: (live.tools || []).length > MAX_TOOLS,
    tools_source: tools.length ? 'live' : 'none',
    transport_hint: 'http',
    server_info: live.serverInfo
      ? {
          name: live.serverInfo.name || null,
          version: live.serverInfo.version || null,
        }
      : null,
    catalog: catalogHits(safe.href),
    demoware_tier: quality.demoware_tier,
    demoware_tier_label: quality.demoware_tier_label,
    badges: quality.badges,
    safety_badge: null,
    reason: clipReason(live.reason),
    note: quality.note,
    docs: PROBE_DOCS,
  };
}

function sendProbeError(res, err) {
  const status = Number(err.status) || 400;
  return res.status(status).json({
    ok: false,
    error: err.code || 'probe_failed',
    message: err.message || 'Could not probe URL',
    safety_badge: null,
    docs: PROBE_DOCS,
  });
}

async function handleProbeRequest(req, res) {
  setProbeCors(res);
  res.setHeader('Cache-Control', 'no-store');
  const url = req.method === 'POST' ? req.body?.url || req.body?.endpoint : req.query?.url || req.query?.endpoint;
  try {
    const result = await probeMcpUrl(url);
    return res.status(200).json(result);
  } catch (err) {
    if (err.status && err.status < 500) {
      return sendProbeError(res, err);
    }
    console.error('MCP probe error:', err);
    return res.status(500).json({
      ok: false,
      error: 'probe_failed',
      message: clientErrorMessage(err, 'Failed to probe MCP endpoint'),
      safety_badge: null,
      docs: PROBE_DOCS,
    });
  }
}

function registerMcpProbeRoutes(app) {
  app.get('/mcp/probe', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.render('mcp-probe', {
      canonicalUrl: PROBE_DOCS,
      endpoint: `${SITE_BASE}${PROBE_PATH}`,
      discoveryEndpoint: `${SITE_BASE}/mcp/discovery`,
      assetVersion: getProbeAssetVersion(),
    });
  });

  app.options(PROBE_PATH, (req, res) => {
    setProbeCors(res);
    res.status(204).end();
  });
  app.options('/api/mcp/v1/probe', (req, res) => {
    setProbeCors(res);
    res.status(204).end();
  });

  app.get(PROBE_PATH, probeLimiter, handleProbeRequest);
  app.post(PROBE_PATH, probeLimiter, handleProbeRequest);
  app.get('/api/mcp/v1/probe', probeLimiter, handleProbeRequest);
  app.post('/api/mcp/v1/probe', probeLimiter, handleProbeRequest);
}

module.exports = {
  registerMcpProbeRoutes,
  probeMcpUrl,
  LIVE_STATUS_FROM_PROBE,
};
