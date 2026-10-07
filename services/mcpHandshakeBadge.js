'use strict';

/**
 * Shields-style handshake badge. Status colors are indigo / amber / gray.
 * Never green, never a SAFE label.
 */

const SITE_BASE = 'https://www.influzer.ai';

const LEFT_LABEL = 'MCP handshake';

const STATUS_STYLE = {
  live_ok: { right: 'live_ok', color: '#4f46e5' },
  auth_required: { right: 'auth_required', color: '#d97706' },
  unreachable: { right: 'unreachable', color: '#6b7280' },
};

const ERROR_STYLE = {
  url_required: { right: 'url required', color: '#4b5563' },
  url_not_allowed: { right: 'blocked', color: '#4b5563' },
  no_http_endpoint: { right: 'stdio', color: '#6b7280' },
  stdio_only: { right: 'stdio', color: '#6b7280' },
  not_found: { right: 'not found', color: '#6b7280' },
  rate_limited: { right: 'rate limited', color: '#4b5563' },
  probe_failed: { right: 'unreachable', color: '#6b7280' },
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textWidth(str) {
  let w = 0;
  for (const ch of String(str)) {
    if ('il.\'| '.includes(ch)) w += 3.4;
    else if ('mwMW'.includes(ch)) w += 8.8;
    else if (ch === '_') w += 5.4;
    else w += 6.6;
  }
  return Math.ceil(w);
}

function resolveBadgeStyle({ liveStatus, errorCode } = {}) {
  if (errorCode && ERROR_STYLE[errorCode]) return ERROR_STYLE[errorCode];
  if (liveStatus && STATUS_STYLE[liveStatus]) return STATUS_STYLE[liveStatus];
  return STATUS_STYLE.unreachable;
}

/**
 * @param {{ liveStatus?: string; errorCode?: string; leftLabel?: string }} [opts]
 * @returns {string}
 */
function buildHandshakeBadgeSvg(opts = {}) {
  const left = opts.leftLabel || LEFT_LABEL;
  const style = resolveBadgeStyle(opts);
  const right = style.right;
  const leftInner = textWidth(left);
  const rightInner = textWidth(right);
  const leftW = leftInner + 12;
  const rightW = rightInner + 12;
  const width = leftW + rightW;
  const leftX = leftW / 2;
  const rightX = leftW + rightW / 2;
  const label = `${left}: ${right}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeXml(label)}">`,
    `<title>${escapeXml(`${label} — not a SAFE badge`)}</title>`,
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>`,
    `<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>`,
    `<g clip-path="url(#r)">`,
    `<rect width="${leftW}" height="20" fill="#555"/>`,
    `<rect x="${leftW}" width="${rightW}" height="20" fill="${style.color}"/>`,
    `<rect width="${width}" height="20" fill="url(#s)"/>`,
    `</g>`,
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">`,
    `<text x="${leftX}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(left)}</text>`,
    `<text x="${leftX}" y="14">${escapeXml(left)}</text>`,
    `<text x="${rightX}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(right)}</text>`,
    `<text x="${rightX}" y="14">${escapeXml(right)}</text>`,
    `</g>`,
    `</svg>`,
  ].join('');
}

function badgeUrlForRemote(remoteUrl) {
  if (!remoteUrl) return null;
  return `${SITE_BASE}/api/v1/probe/badge?url=${encodeURIComponent(remoteUrl)}`;
}

function badgeUrlForSlug(slug) {
  if (!slug) return null;
  return `${SITE_BASE}/api/v1/probe/badge?slug=${encodeURIComponent(slug)}`;
}

function badgeMarkdown({ badgeUrl, href }) {
  if (!badgeUrl) return null;
  const link = href || `${SITE_BASE}/mcp/probe`;
  return `[![MCP handshake](${badgeUrl})](${link})`;
}

module.exports = {
  LEFT_LABEL,
  STATUS_STYLE,
  ERROR_STYLE,
  buildHandshakeBadgeSvg,
  resolveBadgeStyle,
  badgeUrlForRemote,
  badgeUrlForSlug,
  badgeMarkdown,
};
