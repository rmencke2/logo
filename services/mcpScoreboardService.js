'use strict';

/**
 * Top 100 × last handshake. Organic rank is catalog order.
 * Sponsored pins sit above the table and never rewrite live_status.
 */

const fs = require('fs');
const path = require('path');
const { getTop100McpServers, findMcpServerBySlug } = require('./mcpDirectoryService');
const { httpsRemoteUrl } = require('./mcpInstallSnippets');
const { LIVE_STATUS_LABELS } = require('../scripts/utils/mcp-quality');
const { getActivePins, getPromoteOffer, presentSponsorRail, submitPromoteRequest } = require('./mcpPromoteService');

const STATUS_ORDER = ['live_ok', 'auth_required', 'unreachable', 'not_probed', 'local_unprobed'];

function emptyCounts() {
  return {
    live_ok: 0,
    auth_required: 0,
    unreachable: 0,
    not_probed: 0,
    local_unprobed: 0,
  };
}

function formatProbedAt(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return {
    iso: d.toISOString(),
    display: d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
  };
}

function scoreboardRow(server, rank) {
  const quality = server.quality || {};
  const liveStatus = quality.live_status || 'not_probed';
  const remoteUrl = httpsRemoteUrl(server);
  const probed = formatProbedAt(quality.probed_at);
  return {
    rank,
    slug: server.slug,
    name: server.name,
    category: server.category || '',
    official: Boolean(server.official),
    transport: server.transport || 'unknown',
    remote_url: remoteUrl,
    live_status: liveStatus,
    live_status_label: quality.live_status_label || LIVE_STATUS_LABELS[liveStatus] || liveStatus,
    handshake_svg: quality.handshake_svg || '',
    probed_at: probed?.iso || null,
    probed_at_label: probed?.display || '—',
    tool_count: quality.tool_count || (server.tools || []).length,
    page_url: `/mcp/${server.slug}`,
    safety_badge: null,
    sponsored: false,
  };
}

function pinRow(slot) {
  const server = slot.slug ? findMcpServerBySlug(slot.slug) : null;
  const base = server
    ? scoreboardRow(server, null)
    : {
        rank: null,
        slug: slot.slug || null,
        name: slot.name || 'Sponsored listing',
        category: '',
        official: false,
        transport: '',
        remote_url: slot.url || null,
        live_status: 'not_probed',
        live_status_label: 'Sponsored — handshake unchanged',
        handshake_svg: '',
        probed_at: null,
        probed_at_label: '—',
        tool_count: 0,
        page_url: slot.href || '/mcp/promote',
        safety_badge: null,
      };
  return {
    ...base,
    sponsored: true,
    sponsor_label: 'Sponsored',
    sponsor_blurb: slot.blurb || 'Paid placement. Handshake facts are not for sale.',
    href: slot.href || base.page_url,
  };
}

function buildScoreboard() {
  const servers = getTop100McpServers();
  const counts = emptyCounts();
  const rows = servers.map((server, i) => {
    const row = scoreboardRow(server, i + 1);
    if (counts[row.live_status] != null) counts[row.live_status] += 1;
    else counts.not_probed += 1;
    return row;
  });

  const httpsHosts = rows.filter((r) => r.remote_url).length;
  const pins = getActivePins().map(pinRow);

  return {
    generated_at: new Date().toISOString(),
    total: rows.length,
    https_hosts: httpsHosts,
    missing_hosts: rows.length - httpsHosts,
    counts,
    status_order: STATUS_ORDER,
    labels: LIVE_STATUS_LABELS,
    rows,
    pins,
    note: 'Observable initialize + tools/list facts — not a safe-to-install badge. Sponsored pins are ads.',
    safety_badge: null,
  };
}

function scoreboardAssetVersion() {
  try {
    return String(
      Math.floor(
        Math.max(
          fs.statSync(path.join(__dirname, '..', 'public/css/mcp-scoreboard.css')).mtimeMs,
          fs.statSync(path.join(__dirname, '..', 'public/css/mcp-sponsor.css')).mtimeMs,
        ),
      ),
    );
  } catch {
    return String(Date.now());
  }
}

function registerMcpScoreboardRoutes(app) {
  const rateLimit = require('express-rate-limit');
  const promoteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Too many promote requests. Wait and retry.' },
  });

  app.get('/mcp/scoreboard', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const board = buildScoreboard();
    const offer = getPromoteOffer();
    res.render('mcp-scoreboard', {
      pageTitle: 'MCP handshake scoreboard',
      metaDescription:
        'Top 100 MCP servers by last handshake: live, auth gate, unreachable, or stdio-only. Not a safe-to-install badge. Sponsored placements are ads at the top.',
      canonicalUrl: 'https://www.influzer.ai/mcp/scoreboard',
      board,
      offer,
      sponsorRail: presentSponsorRail(),
      filter: String(req.query.status || '').trim(),
      assetVersion: scoreboardAssetVersion(),
      navPath: req.path,
    });
  });

  app.get('/mcp/promote', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const offer = getPromoteOffer();
    res.render('mcp-promote', {
      pageTitle: 'Promote an MCP server',
      metaDescription:
        'Labeled Sponsored placement on the Influzer homepage, directory, and handshake scoreboard for $249 / month. Not a SAFE badge. Two slots cover hosting.',
      canonicalUrl: 'https://www.influzer.ai/mcp/promote',
      offer,
      sponsorRail: presentSponsorRail(),
      paid: String(req.query.paid || '') === '1',
      canceled: String(req.query.canceled || '') === '1',
      assetVersion: scoreboardAssetVersion(),
      navPath: req.path,
    });
  });

  app.get('/api/v1/mcp/scoreboard', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(buildScoreboard());
  });

  app.post('/api/v1/promote', promoteLimiter, async (req, res) => {
    try {
      if (String(req.body?.website || '').trim()) {
        return res.status(400).json({ ok: false, error: 'Rejected.' });
      }
      const result = await submitPromoteRequest(req.body || {});
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({
        ok: false,
        error: err.message || 'Promote request failed',
        safety_badge: null,
      });
    }
  });
}

module.exports = {
  buildScoreboard,
  scoreboardRow,
  STATUS_ORDER,
  registerMcpScoreboardRoutes,
};
