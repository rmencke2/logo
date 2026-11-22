'use strict';

/**
 * MCP allowlist / policy pack export.
 * Observable handshake facts for a filtered Top 100 subset — never a SAFE badge.
 */

const fs = require('fs');
const path = require('path');
const { getTop100McpServers } = require('./mcpDirectoryService');
const {
  httpsRemoteUrl,
  remoteHostPresentation,
  configKey,
} = require('./mcpInstallSnippets');
const { badgeUrlForSlug, badgeMarkdown } = require('./mcpHandshakeBadge');
const { LIVE_STATUS_LABELS } = require('../scripts/utils/mcp-quality');
const { LIST_ORDER } = require('./mcpListOrder');

const SITE_BASE = 'https://www.influzer.ai';
/** Practical starter pack: remotes that answered the handshake (live or auth). */
const DEFAULT_STATUSES = ['live_ok', 'auth_required'];
const ALLOWED_STATUSES = new Set([
  'live_ok',
  'auth_required',
  'unreachable',
  'not_probed',
  'local_unprobed',
]);

const DISCLAIMER =
  'Policy pack from Influzer handshake facts (initialize + tools/list). ' +
  'Not a safe-to-install badge. Review auth, tools, and blast radius before enabling.';

function parseStatusFilter(raw) {
  const parts = String(raw == null || raw === '' ? DEFAULT_STATUSES.join(',') : raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const picked = parts.filter((s) => ALLOWED_STATUSES.has(s));
  return picked.length ? [...new Set(picked)] : DEFAULT_STATUSES.slice();
}

function parseHostFilter(raw) {
  const value = String(raw || 'fixed').trim().toLowerCase();
  if (value === 'any' || value === 'all') return 'any';
  if (value === 'template') return 'template';
  return 'fixed';
}

function parseTier(raw) {
  const parts = String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parts.length ? [...new Set(parts)] : null;
}

function allowlistRow(server) {
  const quality = server.quality || {};
  const host = remoteHostPresentation(server);
  const remoteUrl = httpsRemoteUrl(server);
  const key = configKey(server.slug);
  const liveStatus = quality.live_status || 'not_probed';
  const pageUrl = `${SITE_BASE}/mcp/${encodeURIComponent(server.slug)}`;
  const installApi = `${SITE_BASE}/api/v1/install/${encodeURIComponent(server.slug)}`;
  const badgeUrl = badgeUrlForSlug(server.slug);

  return {
    slug: server.slug,
    name: server.name,
    category: server.category || '',
    config_key: key,
    remote_url: remoteUrl,
    host_kind: host.kind,
    host_label: host.label,
    live_status: liveStatus,
    live_status_label: quality.live_status_label || LIVE_STATUS_LABELS[liveStatus] || liveStatus,
    auth_gate: quality.auth_gate || 'unknown',
    demoware_tier: quality.demoware_tier || 'unverified',
    demoware_tier_label: quality.demoware_tier_label || '',
    verification_grade: quality.verification_grade ?? null,
    verification_grade_letter: quality.verification_grade_letter || null,
    tool_count: quality.tool_count || (server.tools || []).length || 0,
    probed_at: quality.probed_at || null,
    page_url: pageUrl,
    install_api: installApi,
    badge_url: badgeUrl,
    badge_markdown: badgeMarkdown({ badgeUrl, href: pageUrl }),
    cursor_entry: remoteUrl ? { url: remoteUrl } : null,
    safety_badge: null,
  };
}

function buildAllowlistPack(options = {}) {
  const statuses = parseStatusFilter(options.status);
  const host = parseHostFilter(options.host);
  const tiers = parseTier(options.tier);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 100));

  const servers = getTop100McpServers();
  const rows = [];
  for (const server of servers) {
    if (rows.length >= limit) break;
    const row = allowlistRow(server);
    if (!statuses.includes(row.live_status)) continue;
    if (host !== 'any' && row.host_kind !== host) continue;
    if (tiers && !tiers.includes(String(row.demoware_tier || '').toLowerCase())) continue;
    // Cursor merge only makes sense for fixed HTTPS remotes by default.
    if (host === 'fixed' && !row.remote_url) continue;
    rows.push(row);
  }

  const mcpServers = {};
  for (const row of rows) {
    if (row.cursor_entry && row.config_key) {
      mcpServers[row.config_key] = row.cursor_entry;
    }
  }

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    version: 1,
    kind: 'influzer_mcp_allowlist',
    filters: {
      scope: 'top100',
      status: statuses,
      host,
      tier: tiers,
      limit,
    },
    total: rows.length,
    note: DISCLAIMER,
    order_caption: LIST_ORDER.scoreboard,
    safety_badge: null,
    page_url: `${SITE_BASE}/mcp/allowlist`,
    api_url: `${SITE_BASE}/api/v1/mcp/allowlist`,
    methodology_url: `${SITE_BASE}/methodology`,
    servers: rows,
    cursor: { mcpServers },
  };
}

function formatAllowlistCsv(pack) {
  const header = [
    'slug',
    'name',
    'remote_url',
    'live_status',
    'auth_gate',
    'demoware_tier',
    'verification_grade_letter',
    'tool_count',
    'page_url',
    'install_api',
    'badge_url',
  ];
  const escape = (value) => {
    const text = value == null ? '' : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [header.join(',')];
  for (const row of pack.servers || []) {
    lines.push(
      [
        row.slug,
        row.name,
        row.remote_url || '',
        row.live_status,
        row.auth_gate,
        row.demoware_tier,
        row.verification_grade_letter || '',
        row.tool_count,
        row.page_url,
        row.install_api,
        row.badge_url,
      ]
        .map(escape)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

function formatAllowlistCursorJson(pack) {
  return `${JSON.stringify(pack.cursor || { mcpServers: {} }, null, 2)}\n`;
}

function formatAllowlistMarkdown(pack) {
  const lines = [
    `# Influzer MCP allowlist`,
    '',
    `> ${DISCLAIMER}`,
    '',
    `- Generated: ${pack.generated_at}`,
    `- Filters: status=${(pack.filters.status || []).join(',')}; host=${pack.filters.host}`,
    `- Servers: ${pack.total}`,
    `- Source: ${pack.page_url}`,
    '',
    '| Server | Status | Grade | Tools | Remote |',
    '| --- | --- | --- | ---: | --- |',
  ];
  for (const row of pack.servers || []) {
    const name = `[${row.name}](${row.page_url})`;
    const remote = row.remote_url ? `\`${row.remote_url}\`` : '—';
    lines.push(
      `| ${name} | ${row.live_status_label} | ${row.verification_grade_letter || '—'} | ${row.tool_count} | ${remote} |`,
    );
  }
  lines.push(
    '',
    '## Cursor merge',
    '',
    'Paste under `mcpServers` in `.cursor/mcp.json` (or merge carefully with your existing keys):',
    '',
    '```json',
    JSON.stringify(pack.cursor || { mcpServers: {} }, null, 2).trim(),
    '```',
    '',
  );
  return `${lines.join('\n')}\n`;
}

function allowlistAssetVersion() {
  try {
    const cssPath = path.join(__dirname, '..', 'public/css/mcp-allowlist.css');
    const scoreboardCss = path.join(__dirname, '..', 'public/css/mcp-scoreboard.css');
    return String(
      Math.floor(
        Math.max(fs.statSync(cssPath).mtimeMs, fs.statSync(scoreboardCss).mtimeMs),
      ),
    );
  } catch {
    return String(Date.now());
  }
}

function registerMcpAllowlistRoutes(app) {
  app.get('/mcp/allowlist', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    const pack = buildAllowlistPack({
      status: req.query.status,
      host: req.query.host,
      tier: req.query.tier,
      limit: req.query.limit,
    });
    res.render('mcp-allowlist', {
      pageTitle: 'MCP allowlist / policy pack',
      metaDescription:
        'Export a Top 100 MCP allowlist from Influzer handshake facts — Cursor mcpServers JSON, CSV, or Markdown. Not a safe-to-install badge.',
      canonicalUrl: `${SITE_BASE}/mcp/allowlist`,
      pack,
      statusFilter: (pack.filters.status || []).join(','),
      hostFilter: pack.filters.host,
      assetVersion: allowlistAssetVersion(),
      navPath: req.path,
    });
  });

  app.get('/api/v1/mcp/allowlist', (req, res) => {
    const pack = buildAllowlistPack({
      status: req.query.status,
      host: req.query.host,
      tier: req.query.tier,
      limit: req.query.limit,
    });
    const format = String(req.query.format || 'json').trim().toLowerCase();
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="influzer-mcp-allowlist.csv"');
      return res.send(formatAllowlistCsv(pack));
    }
    if (format === 'cursor' || format === 'mcp.json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="mcp.allowlist.json"');
      return res.send(formatAllowlistCursorJson(pack));
    }
    if (format === 'md' || format === 'markdown') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="influzer-mcp-allowlist.md"');
      return res.send(formatAllowlistMarkdown(pack));
    }
    res.json(pack);
  });

  // Alias used in docs / home tools grid
  app.get('/api/mcp/v1/allowlist', (req, res) => {
    const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(302, `/api/v1/mcp/allowlist${q}`);
  });
}

module.exports = {
  buildAllowlistPack,
  formatAllowlistCsv,
  formatAllowlistCursorJson,
  formatAllowlistMarkdown,
  registerMcpAllowlistRoutes,
  DISCLAIMER,
};
