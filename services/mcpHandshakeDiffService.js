'use strict';

/**
 * Handshake diff — what changed between probes.
 * Committed log is written by the daily validator. Runtime probes append a
 * gitignored local log so a deploy does not wipe the last few hours.
 * Not a SAFE badge.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const COMMITTED_PATH =
  process.env.MCP_HANDSHAKE_DIFF_PATH || path.join(DATA_DIR, 'mcp-handshake-diff.json');
const LOCAL_PATH =
  process.env.MCP_HANDSHAKE_DIFF_LOCAL_PATH || path.join(DATA_DIR, 'mcp-handshake-diff.local.json');
const MAX_EVENTS = 1500;
const DEFAULT_DAYS = 14;
const MAX_DAYS = 30;
const DEFAULT_LIMIT = 200;
const NAME_CAP = 8;

const LIVE_LABELS = {
  live_ok: 'Live OK',
  auth_required: 'Auth required',
  unreachable: 'Unreachable',
  not_probed: 'Not probed',
};

const HANDSHAKE_DONE = new Set(['live_ok', 'auth_required', 'unreachable']);

function endpointToLive(endpoint) {
  const value = String(endpoint || '').trim();
  if (value === 'ok' || value === 'ok_empty') return 'live_ok';
  if (value === 'auth_required') return 'auth_required';
  if (value === 'unreachable' || value === 'error' || value === 'failed') return 'unreachable';
  return null;
}

function toolNamesFromFingerprint(fingerprint) {
  if (!fingerprint) return [];
  const names = [];
  for (const part of String(fingerprint).split('|')) {
    const name = part.split(':')[0].trim();
    if (name) names.push(name.slice(0, 80));
  }
  return names;
}

function readLog(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      updated_at: data.updated_at || null,
      events: Array.isArray(data.events) ? data.events : [],
    };
  } catch {
    return { updated_at: null, events: [] };
  }
}

function writeLog(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const payload = {
    updated_at: data.updated_at || new Date().toISOString(),
    note: 'Handshake and tool-list changes between probes. Not a safe-to-install badge.',
    safety_badge: null,
    events: data.events || [],
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function eventKey(event) {
  const day = String(event.at || '').slice(0, 10);
  return [
    event.slug,
    event.kind,
    event.from_status || '',
    event.to_status || '',
    event.tools_before ?? '',
    event.tools_after ?? '',
    day,
  ].join('|');
}

function diffValidationEntry(prev, next, { slug, at, source } = {}) {
  const id = String(slug || '').trim().toLowerCase();
  if (!id || !next) return null;

  const fromStatus = endpointToLive(prev && prev.endpoint_status);
  const toStatus = endpointToLive(next.endpoint_status);
  const hadPriorHandshake = Boolean(prev && prev.endpoint_status);
  const prevNames = toolNamesFromFingerprint(prev && prev.tool_fingerprint);
  const nextNames = toolNamesFromFingerprint(next.tool_fingerprint);
  const prevSet = new Set(prevNames);
  const nextSet = new Set(nextNames);
  const added = prev ? nextNames.filter((name) => !prevSet.has(name)) : [];
  const removed = prev ? prevNames.filter((name) => !nextSet.has(name)) : [];
  const toolsBefore = prev ? Number(prev.tool_count) || prevNames.length : 0;
  const toolsAfter = Number(next.tool_count) || nextNames.length;
  // A row that already existed without endpoint_status is a schema fill, not a flip.
  // A slug that was not in the previous probe at all is a first handshake.
  const handshakeChanged =
    Boolean(toStatus) &&
    ((hadPriorHandshake && fromStatus !== toStatus) || (!prev && Boolean(toStatus)));
  const toolsChanged = Boolean(prev) && (added.length > 0 || removed.length > 0 || toolsBefore !== toolsAfter);
  if (!handshakeChanged && !toolsChanged) return null;

  const observed = next.validated_at || at || new Date().toISOString();
  const event = {
    at: observed,
    slug: id,
    kind: handshakeChanged ? 'handshake' : 'tools',
    from_status: fromStatus,
    to_status: handshakeChanged ? toStatus : fromStatus || toStatus,
    tools_before: toolsBefore,
    tools_after: toolsAfter,
    tools_added: added.slice(0, NAME_CAP),
    tools_removed: removed.slice(0, NAME_CAP),
    tools_added_count: added.length,
    tools_removed_count: removed.length,
    source: String(source || 'validation').slice(0, 40),
  };
  event.key = eventKey(event);
  return event;
}

function handshakeFlipEvent({ slug, from_status, to_status, at, source } = {}) {
  const id = String(slug || '').trim().toLowerCase();
  const to = String(to_status || '');
  const from = from_status && HANDSHAKE_DONE.has(from_status) ? from_status : null;
  if (!id || !HANDSHAKE_DONE.has(to) || from === to) return null;
  const event = {
    at: at || new Date().toISOString(),
    slug: id,
    kind: 'handshake',
    from_status: from,
    to_status: to,
    tools_before: null,
    tools_after: null,
    tools_added: [],
    tools_removed: [],
    tools_added_count: 0,
    tools_removed_count: 0,
    source: String(source || 'probe').slice(0, 40),
  };
  event.key = eventKey(event);
  return event;
}

function appendHandshakeEvents(events, { local = false, filePath } = {}) {
  const list = (events || []).filter(Boolean);
  if (!list.length) return 0;
  const target = filePath || (local ? LOCAL_PATH : COMMITTED_PATH);
  const data = readLog(target);
  const seen = new Set(data.events.map((event) => event.key || eventKey(event)));
  let added = 0;
  for (const event of list) {
    const key = event.key || eventKey(event);
    if (seen.has(key)) continue;
    data.events.unshift({ ...event, key });
    seen.add(key);
    added += 1;
  }
  if (!added) return 0;
  data.events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  if (data.events.length > MAX_EVENTS) data.events = data.events.slice(0, MAX_EVENTS);
  data.updated_at = new Date().toISOString();
  writeLog(target, data);
  return added;
}

function loadEvents() {
  const merged = [...readLog(LOCAL_PATH).events, ...readLog(COMMITTED_PATH).events];
  const seen = new Set();
  const events = [];
  for (const event of merged) {
    const key = `${event.key || eventKey(event)}|${String(event.at || '').slice(0, 10)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push(event);
  }
  events.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return events;
}

function hasToolDelta(event) {
  return (event.tools_added_count || 0) > 0 || (event.tools_removed_count || 0) > 0 || event.kind === 'tools';
}

function lookupName(slug) {
  try {
    const { findMcpServerBySlug } = require('./mcpDirectoryService');
    const server = findMcpServerBySlug(slug);
    if (server && server.name) return String(server.name);
  } catch {
    /* catalog is optional for the feed */
  }
  return slug;
}

function presentEvent(event) {
  const from = event.from_status || null;
  const to = event.to_status || null;
  return {
    at: event.at,
    slug: event.slug,
    name: lookupName(event.slug),
    page_url: `/mcp/${event.slug}`,
    kind: event.kind,
    from_status: from,
    to_status: to,
    from_label: from ? LIVE_LABELS[from] || from : 'Not probed',
    to_label: to ? LIVE_LABELS[to] || to : '',
    tools_before: event.tools_before,
    tools_after: event.tools_after,
    tools_added: event.tools_added || [],
    tools_removed: event.tools_removed || [],
    tools_added_count: event.tools_added_count || 0,
    tools_removed_count: event.tools_removed_count || 0,
    source: event.source || null,
    safety_badge: null,
  };
}

function getHandshakeChanges({ since, days, status, kind, limit } = {}) {
  const cappedDays = Math.min(MAX_DAYS, Math.max(1, Number(days) || DEFAULT_DAYS));
  const sinceMs = since ? Date.parse(since) : Date.now() - cappedDays * 24 * 60 * 60 * 1000;
  const floor = Number.isNaN(sinceMs) ? Date.now() - cappedDays * 24 * 60 * 60 * 1000 : sinceMs;
  const wantStatus = String(status || '').trim();
  const wantKind = String(kind || '').trim();
  const cappedLimit = Math.min(500, Math.max(1, Number(limit) || DEFAULT_LIMIT));

  const inWindow = loadEvents().filter((event) => {
    const at = Date.parse(event.at);
    return !Number.isNaN(at) && at >= floor;
  });

  const counts = {
    live_ok: 0,
    auth_required: 0,
    unreachable: 0,
    tools: 0,
    total: inWindow.length,
  };
  for (const event of inWindow) {
    if (event.kind === 'handshake' && counts[event.to_status] != null && event.from_status !== event.to_status) {
      counts[event.to_status] += 1;
    }
    if (hasToolDelta(event)) counts.tools += 1;
  }

  const filtered = inWindow.filter((event) => {
    if (wantKind === 'tools') return hasToolDelta(event);
    if (wantStatus) return event.kind === 'handshake' && event.to_status === wantStatus;
    return true;
  });

  const events = filtered.slice(0, cappedLimit).map(presentEvent);
  const groups = [];
  for (const event of events) {
    const day = String(event.at).slice(0, 10);
    let group = groups.find((item) => item.date === day);
    if (!group) {
      group = { date: day, events: [] };
      groups.push(group);
    }
    group.events.push(event);
  }

  const newest = inWindow[0]?.at || loadEvents()[0]?.at || null;
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    since: new Date(floor).toISOString(),
    days: cappedDays,
    status: wantStatus,
    kind: wantKind,
    counts,
    shown: events.length,
    truncated: filtered.length > events.length,
    newest_at: newest,
    groups,
    events,
    note: 'Changes between probes: handshake status and tool names. Not a safe-to-install badge.',
    safety_badge: null,
  };
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHandshakeDiffRss({ days = 14, limit = 80 } = {}) {
  const feed = getHandshakeChanges({ days, limit });
  const site = 'https://www.influzer.ai';
  const items = feed.events
    .map((event) => {
      const title = `${event.name}: ${event.from_label} → ${event.to_label}`;
      const toolNote =
        event.tools_added_count || event.tools_removed_count
          ? ` Tools +${event.tools_added_count} / −${event.tools_removed_count}.`
          : '';
      const pub = new Date(event.at);
      const pubDate = Number.isNaN(pub.getTime()) ? new Date().toUTCString() : pub.toUTCString();
      return `  <item>
    <title>${escapeXml(title)}</title>
    <link>${site}${event.page_url}</link>
    <guid isPermaLink="false">${escapeXml(`${event.slug}-${event.at}-${event.kind}`)}</guid>
    <pubDate>${pubDate}</pubDate>
    <description>${escapeXml(`${event.from_label} → ${event.to_label}.${toolNote} Not a SAFE badge.`)}</description>
  </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Influzer MCP handshake diff</title>
  <link>${site}/mcp/changes</link>
  <description>Handshake and tool-list changes between Influzer probes. Not a safe-to-install badge.</description>
  <language>en-us</language>
${items}
</channel>
</rss>
`;
}

function changesAssetVersion() {
  try {
    return String(
      Math.floor(
        Math.max(
          fs.statSync(path.join(__dirname, '..', 'public/css/mcp-scoreboard.css')).mtimeMs,
          fs.statSync(COMMITTED_PATH).mtimeMs,
        ),
      ),
    );
  } catch {
    return String(Date.now());
  }
}

function registerMcpHandshakeDiffRoutes(app) {
  app.get('/mcp/changes', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const days = req.query.days;
    const status = String(req.query.status || '').trim();
    const kind = String(req.query.kind || '').trim();
    const diff = getHandshakeChanges({ days, status, kind });
    res.render('mcp-changes', {
      pageTitle: 'MCP handshake diff',
      metaDescription:
        'What changed since the last Influzer probe: servers that became live, hit an auth gate, went unreachable, or changed their tool list. Not a safe-to-install badge.',
      canonicalUrl: 'https://www.influzer.ai/mcp/changes',
      diff,
      assetVersion: changesAssetVersion(),
      navPath: req.path,
    });
  });

  app.get('/mcp/changes/rss.xml', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('application/rss+xml');
    res.send(buildHandshakeDiffRss());
  });

  app.get('/api/mcp/changes', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=120');
    const diff = getHandshakeChanges({
      since: req.query.since,
      days: req.query.days,
      status: req.query.status,
      kind: req.query.kind,
      limit: req.query.limit,
    });
    res.json(diff);
  });
}

module.exports = {
  COMMITTED_PATH,
  LOCAL_PATH,
  LIVE_LABELS,
  endpointToLive,
  toolNamesFromFingerprint,
  diffValidationEntry,
  handshakeFlipEvent,
  appendHandshakeEvents,
  loadEvents,
  getHandshakeChanges,
  buildHandshakeDiffRss,
  registerMcpHandshakeDiffRoutes,
};
