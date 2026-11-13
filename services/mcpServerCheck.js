'use strict';

/**
 * Reviewer check for any public MCP URL, including servers that are not in
 * the catalog.
 *
 * Uses the existing SSRF helper and the same HTTP client as the handshake
 * probe (initialize + tools/list). The score is computeQualitySignals — the
 * verification grade and demoware tier — not a second rubric. Tool
 * description, schema, and annotation gaps are called out beside that grade.
 * WebMCP readiness levels (R0–R5) stay on website scans.
 *
 * A bearer token is sent only on the hop that matches the host the user
 * named. It is never stored, logged, or placed on the result URL.
 *
 * A saved check can also try one listed tool. Read-only tools return their
 * content. Any other tool is called only after the caller confirms the
 * target is disposable and names the record. The verdict is the before/after
 * read-back, not the tool payload. That call's bearer token is not stored.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { inspectLiveMcpServer } = require('../scripts/utils/mcp-live-client');
const { computeQualitySignals } = require('../scripts/utils/mcp-quality');
const { stripHiddenUnicode } = require('./mcpSourceSafety');
const { assertSafePublicUrl } = require('./webmcp/ssrf');
const {
  assignReadBackDefaults,
  decorateCheckTools,
  executeToolTrial,
  trustFlagFor,
} = require('./mcpToolTrial');
const { findMcpServersByEndpoint } = require('./mcpDirectoryService');
const { getOptionalAuthUser } = require('../auth');
const { ensureCsrfToken } = require('../middleware/csrf');
const { getClientIp } = require('../utils/clientIp');
const { getDatabase } = require('../database');

const SITE_BASE = 'https://www.influzer.ai';
const CHECK_PATH = '/mcp/check';
const MAX_REDIRECTS = 3;
const TOOL_DESCRIPTION_MAX = 8000;
const MAX_INPUT_FIELDS = 100;
const HINTS = ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'];

const STATUS_LABELS = {
  completed: 'Checked',
  rejected: 'URL not allowed',
  unreachable: 'Unreachable',
  auth_required: 'Auth required',
  error: 'Handshake failed',
};

function clip(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Keep tool descriptions readable: preserve line breaks, and only stop at a
 * sentence boundary once the text passes the hostile-payload cap.
 */
function clipDescription(value, max = TOOL_DESCRIPTION_MAX) {
  let text = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/[ \t\f\v]+/g, ' ');
  text = text.replace(/ *\n */g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  if (!text || text.length <= max) return text;
  const limited = text.slice(0, max);
  if (/[.!?]/.test(limited[limited.length - 1] || '')) return limited.trimEnd();
  let cut = -1;
  for (const mark of ['. ', '.\n', '! ', '!\n', '? ', '?\n']) {
    cut = Math.max(cut, limited.lastIndexOf(mark));
  }
  if (cut >= Math.floor(max / 2)) return limited.slice(0, cut + 1).trimEnd();
  const line = limited.lastIndexOf('\n');
  if (line >= Math.floor(max / 2)) return limited.slice(0, line).trimEnd();
  const space = limited.lastIndexOf(' ');
  if (space >= Math.floor(max / 2)) return limited.slice(0, space).trimEnd();
  return limited.trimEnd();
}

function normalizeCheckUrl(value) {
  let raw = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) return '';
  while (/^https?:\/\/https?:\/\//i.test(raw)) {
    raw = raw.replace(/^https?:\/\//i, '');
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, '')}`;
  }
  return raw;
}

function redact(text, secret) {
  let out = String(text || '');
  const hidden = String(secret || '');
  if (hidden) out = out.split(hidden).join('[redacted]');
  return out.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}

function displayUrl(raw, secret) {
  try {
    const url = new URL(String(raw || ''));
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of ['token', 'access_token', 'api_key', 'apikey', 'key', 'secret', 'authorization']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '[redacted]');
    }
    return clip(redact(url.toString(), secret), 500);
  } catch {
    return clip(redact(raw, secret), 500);
  }
}

function fieldType(schema, depth) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return 'any';
  if (Array.isArray(schema.enum) && schema.enum.length) {
    const values = schema.enum.slice(0, 6).map((item) => {
      try {
        return JSON.stringify(item);
      } catch {
        return '?';
      }
    });
    const more = schema.enum.length > 6 ? ', …' : '';
    return `enum(${values.join(', ')}${more})`;
  }
  if (Array.isArray(schema.type)) return schema.type.map((item) => String(item)).join('|').slice(0, 80);
  if (schema.type === 'array') {
    return depth > 2 ? 'array' : `array<${fieldType(schema.items, (depth || 0) + 1)}>`;
  }
  if (schema.type) return String(schema.type).slice(0, 40);
  if (schema.anyOf || schema.oneOf) return 'union';
  if (schema.properties) return 'object';
  return 'any';
}

function reviewTool(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = clip(stripHiddenUnicode(raw.name || raw.toolName || ''), 120);
  if (!name) return null;
  const annotations = raw.annotations && typeof raw.annotations === 'object' && !Array.isArray(raw.annotations)
    ? raw.annotations
    : {};
  const title = clip(raw.title || annotations.title || '', 160);
  const description = clipDescription(stripHiddenUnicode(redact(raw.description || '', '')));
  const schema = raw.inputSchema || raw.input_schema;
  const schemaObject = schema && typeof schema === 'object' && !Array.isArray(schema) ? schema : null;
  const properties = schemaObject?.properties && typeof schemaObject.properties === 'object'
    ? schemaObject.properties
    : {};
  const required = new Set(
    (Array.isArray(schemaObject?.required) ? schemaObject.required : []).map((item) => String(item)),
  );
  const names = Object.keys(properties);
  for (const requiredName of required) {
    if (!names.includes(requiredName)) names.push(requiredName);
  }
  const fields = names.slice(0, MAX_INPUT_FIELDS).map((fieldName) => {
    const property = properties[fieldName] || {};
    return {
      name: clip(fieldName, 80),
      type: fieldType(property, 0),
      required: required.has(fieldName),
      description: clip(property.description || '', 180),
    };
  });
  fields.sort((a, b) => Number(b.required) - Number(a.required) || a.name.localeCompare(b.name));

  const hints = HINTS.map((key) => {
    if (!Object.prototype.hasOwnProperty.call(annotations, key)) {
      return { key, set: false, value: '' };
    }
    return { key, set: true, value: annotations[key] ? 'true' : 'false' };
  });
  const other = [];
  for (const [key, value] of Object.entries(annotations)) {
    if (HINTS.includes(key) || key === 'title') continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      other.push({ key: clip(key, 60), value: clip(value, 120) });
    }
  }

  const destructive = annotations.destructiveHint === true;
  const idempotent = annotations.idempotentHint === true;
  const readOnly = annotations.readOnlyHint === true && !destructive;
  const missingDescription = !description;
  const missingSchema = !schemaObject || names.length === 0;
  const missingAnnotations = hints.every((hint) => !hint.set);
  const gaps = [];
  if (missingDescription) gaps.push('Missing description');
  if (!schemaObject) gaps.push('Missing input schema');
  else if (names.length === 0) gaps.push('Input schema has no fields');
  if (missingAnnotations) gaps.push('Missing annotations');

  let inputNote = 'No input schema';
  if (schemaObject && names.length === 0) inputNote = 'Input schema has no fields';
  else if (schemaObject) {
    const requiredCount = names.filter((fieldName) => required.has(fieldName)).length;
    inputNote = `${names.length} field${names.length === 1 ? '' : 's'} · ${requiredCount} required`;
  }

  return {
    name,
    title,
    description,
    missing_description: missingDescription,
    missing_input_schema: missingSchema,
    input_note: inputNote,
    fields,
    field_overflow: Math.max(0, names.length - fields.length),
    hints,
    other_annotations: other.slice(0, 12),
    missing_annotations: missingAnnotations,
    destructive,
    read_only: readOnly,
    trust_flag: trustFlagFor(destructive, idempotent),
    output_schema: raw.outputSchema || raw.output_schema ? 'present' : 'absent',
    gaps,
  };
}

function reviewTools(tools) {
  if (!Array.isArray(tools)) return [];
  const seen = new Set();
  const reviewed = [];
  for (const tool of tools) {
    const row = reviewTool(tool);
    if (!row || seen.has(row.name)) continue;
    seen.add(row.name);
    reviewed.push(row);
    if (reviewed.length >= 80) break;
  }
  return reviewed;
}

function rubricMissing(parts) {
  const have = new Set(parts || []);
  const missing = [];
  if (!have.has('live_ok +40') && !have.has('auth_required +25')) {
    missing.push('Live handshake points (live_ok +40 or auth_required +25)');
  } else if (!have.has('live_ok +40')) {
    missing.push('live_ok +40 — the handshake was an auth gate, not an open tools/list');
  }
  if (!have.has('indexed_tool +20')) missing.push('indexed_tool +20');
  if (!have.has('five_tools +10')) missing.push('five_tools +10');
  if (!have.has('https +15') && !have.has('local_transport +10')) missing.push('https +15');
  if (!have.has('probed_within_7d +15')) missing.push('probed_within_7d +15');
  return missing;
}

function toolGaps(tools) {
  const description = tools.filter((tool) => tool.missing_description).length;
  const schema = tools.filter((tool) => tool.missing_input_schema).length;
  const annotations = tools.filter((tool) => tool.missing_annotations).length;
  const gaps = [];
  if (description) gaps.push(`${description} tool${description === 1 ? '' : 's'} missing a description`);
  if (schema) gaps.push(`${schema} tool${schema === 1 ? '' : 's'} missing an input schema`);
  if (annotations) gaps.push(`${annotations} tool${annotations === 1 ? '' : 's'} missing annotations`);
  return { description, schema, annotations, gaps };
}

function responseType(contentType) {
  const value = String(contentType || '').toLowerCase();
  if (value.includes('text/event-stream')) return 'event-stream';
  if (value.includes('json')) return 'json';
  return null;
}

function catalogHits(url) {
  try {
    return findMcpServersByEndpoint(url, 5).map((server) => ({
      slug: server.slug,
      name: server.name,
      transport: server.transport || null,
      page_path: `/mcp/${encodeURIComponent(server.slug)}`,
    }));
  } catch (err) {
    console.warn('MCP check catalog lookup failed:', err.message || err);
    return [];
  }
}

function liveToQualityStatus(status) {
  if (status === 'ok' || status === 'ok_empty') return 'live_ok';
  if (status === 'auth_required') return 'auth_required';
  return 'unreachable';
}

function bannerMessage({ status, reason, toolCount, tokenSent }) {
  if (status === 'rejected') {
    return reason || 'That URL is not a public HTTPS address. Private, link-local, metadata, and localhost targets are rejected.';
  }
  if (status === 'unreachable') return reason || 'The server did not respond.';
  if (status === 'auth_required') {
    return tokenSent
      ? 'The server still asked for authentication. The bearer token was not stored.'
      : 'The server asked for authentication before it would list tools. You can run the check again with a bearer token. The token is not stored.';
  }
  if (status === 'error') return reason || 'The handshake did not complete.';
  if (!toolCount) return 'The server completed initialize and tools/list, and returned no tools.';
  return 'Live tools/list captured. The grade is the catalog verification rubric, not a safe-to-install badge.';
}

/**
 * @param {{ url: string, transport?: string, live?: object, catalog?: object[], secret?: string, tokenSent?: boolean, redirectBlocked?: string }} input
 */
function buildCheckReport(input) {
  const secret = input.secret || '';
  const transport = input.transport === 'sse' ? 'sse' : 'http';
  const live = input.live || {};
  const status = live.status === 'ok' || live.status === 'ok_empty'
    ? 'completed'
    : live.status === 'auth_required'
      ? 'auth_required'
      : live.status === 'unreachable'
        ? 'unreachable'
        : live.status === 'rejected'
          ? 'rejected'
          : 'error';
  const tools = reviewTools(live.tools || []).map((tool) => ({
    ...tool,
    description: clipDescription(redact(tool.description, secret)),
    title: clip(redact(tool.title, secret), 160),
    input_note: redact(tool.input_note, secret),
    fields: tool.fields.map((field) => ({
      ...field,
      description: clip(redact(field.description, secret), 180),
    })),
    other_annotations: tool.other_annotations.map((item) => ({
      ...item,
      value: clip(redact(item.value, secret), 120),
    })),
  }));
  assignReadBackDefaults(tools);
  const counts = toolGaps(tools);
  const catalog = Array.isArray(input.catalog) ? input.catalog : [];
  const url = displayUrl(input.url, secret);
  const reason = clip(redact(live.reason || input.reason || '', secret), 300);
  const qualityStatus = liveToQualityStatus(live.status);
  // The grade parses "now" at whole-second resolution. A fractional timestamp
  // from this same second would miss probed_within_7d.
  const probedAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  let quality = null;
  if (status !== 'rejected') {
    const signals = computeQualitySignals(
      {
        transport,
        tools: tools.map((tool) => ({ name: tool.name, description: tool.description })),
        mcp_endpoint: url,
      },
      {
        endpoint_status: qualityStatus === 'live_ok' ? 'ok' : qualityStatus === 'auth_required' ? 'auth_required' : 'unreachable',
        validation_method: 'live_mcp',
        validated_at: probedAt,
        tool_count: tools.length,
      },
    );
    quality = {
      score: signals.verification_grade,
      letter: signals.verification_grade_letter,
      tier: signals.demoware_tier,
      tier_label: signals.demoware_tier_label,
      live_status: signals.live_status,
      live_status_label: signals.live_status_label,
      auth_gate: signals.auth_gate,
      auth_gate_label: signals.auth_gate_label,
      parts: signals.verification_grade_parts,
      missing: rubricMissing(signals.verification_grade_parts),
      tool_gaps: counts.gaps,
      note: signals.note,
      safety_badge: null,
    };
  }

  const capabilities = live.capabilities && typeof live.capabilities === 'object' ? live.capabilities : null;
  const instructions = clip(redact(live.instructions || '', secret), 4000);
  const serverInfo = live.serverInfo && typeof live.serverInfo === 'object' ? live.serverInfo : {};

  return {
    id: null,
    ok: status === 'completed',
    url,
    transport,
    transport_label: transport === 'sse' ? 'SSE' : 'Streamable HTTP',
    response_type: responseType(live.contentType),
    status,
    status_label: STATUS_LABELS[status] || status,
    message: bannerMessage({ status, reason, toolCount: tools.length, tokenSent: Boolean(input.tokenSent) }),
    code: input.code || null,
    probed_at: probedAt,
    http_status: Number.isFinite(Number(live.httpStatus)) ? Number(live.httpStatus) : null,
    latency_ms: Number.isFinite(Number(live.latency_ms)) ? Math.round(Number(live.latency_ms)) : null,
    reason: reason || null,
    token_sent: Boolean(input.tokenSent),
    redirect_blocked: input.redirectBlocked ? displayUrl(input.redirectBlocked, secret) : null,
    server: {
      name: clip(redact(serverInfo.name || '', secret), 120) || null,
      version: clip(redact(serverInfo.version || '', secret), 80) || null,
      protocol_version: clip(live.protocolVersion || '', 40) || null,
      instructions: instructions || null,
      capability_keys: capabilities ? Object.keys(capabilities).slice(0, 20) : [],
    },
    resource_count: Number.isFinite(Number(live.resource_count)) ? Number(live.resource_count) : null,
    resource_truncated: Boolean(live.resource_truncated),
    resources_advertised: Boolean(live.resources_advertised) || Number.isFinite(Number(live.resource_count)),
    prompt_count: Number.isFinite(Number(live.prompt_count)) ? Number(live.prompt_count) : null,
    prompt_truncated: Boolean(live.prompt_truncated),
    prompts_advertised: Boolean(live.prompts_advertised) || Number.isFinite(Number(live.prompt_count)),
    in_catalog: catalog.length > 0,
    catalog,
    quality,
    summary: {
      tool_count: tools.length,
      annotated_count: tools.filter((tool) => !tool.missing_annotations).length,
      missing_description_count: counts.description,
      missing_input_schema_count: counts.schema,
      missing_annotations_count: counts.annotations,
      tools_truncated: Boolean(live.tools_truncated),
    },
    tools,
  };
}

function classifyUrlError(message) {
  if (/could not be resolved/i.test(String(message || ''))) {
    return { status: 'unreachable', code: 'dns_failed' };
  }
  return { status: 'rejected', code: 'url_not_allowed' };
}

function readBearerToken(value) {
  if (value == null || String(value).trim() === '') return { token: '' };
  const token = String(value).trim();
  if (token.length > 2048 || /[\r\n\0]/.test(token)) {
    return { error: 'Bearer token must be a single line under 2048 characters.' };
  }
  return { token };
}

function readTransport(value) {
  return String(value || '').toLowerCase() === 'sse' ? 'sse' : 'http';
}

function sameHost(left, right) {
  try {
    return new URL(left).host === new URL(right).host;
  } catch {
    return false;
  }
}

/**
 * @param {{ url: string, transport?: string, bearerToken?: string, userId?: number, persist?: boolean, inspectLiveMcpServer?: Function }} opts
 */
async function checkMcpServer(opts) {
  const transport = readTransport(opts.transport);
  const tokenRead = readBearerToken(opts.bearerToken);
  if (tokenRead.error) {
    const err = new Error(tokenRead.error);
    err.status = 400;
    err.code = 'token_invalid';
    throw err;
  }
  const secret = tokenRead.token;
  const tokenSent = Boolean(secret);
  const inspect = opts.inspectLiveMcpServer || inspectLiveMcpServer;
  const rawUrl = normalizeCheckUrl(opts.url);

  if (!rawUrl) {
    const err = new Error('URL is required');
    err.status = 400;
    err.code = 'url_required';
    throw err;
  }
  if (rawUrl.length > 2000) {
    const err = new Error('URL is too long');
    err.status = 400;
    err.code = 'url_invalid';
    throw err;
  }

  let current;
  try {
    current = (await assertSafePublicUrl(rawUrl, { allowHttp: false })).href;
  } catch (cause) {
    const classified = classifyUrlError(cause.message);
    const report = buildCheckReport({
      url: rawUrl,
      transport,
      secret,
      tokenSent,
      code: classified.code,
      reason: cause.message,
      live: { status: classified.status, reason: cause.message, tools: [] },
    });
    if (opts.persist) return saveCheck(opts.userId, report);
    return report;
  }

  let tokenForHop = secret || undefined;
  const seen = new Set();
  let live = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (seen.has(current)) {
      live = { status: 'error', reason: 'Redirect loop', tools: [] };
      break;
    }
    seen.add(current);
    try {
      live = await inspect(current, {
        timeoutMs: opts.timeoutMs || 12000,
        redirect: 'manual',
        bearerToken: tokenForHop,
        clientInfo: { name: 'influzer-mcp-check', version: '1.0.0' },
      });
    } catch (cause) {
      live = { status: 'error', reason: redact(cause.message || 'Handshake failed', secret), tools: [] };
      break;
    }
    if (!live || live.status !== 'redirect') break;
    let next;
    try {
      next = new URL(live.location || '', current);
    } catch {
      live = { status: 'error', reason: 'Redirect Location was not a URL', tools: [] };
      break;
    }
    try {
      const safeNext = await assertSafePublicUrl(next.toString(), { allowHttp: false });
      if (!sameHost(current, safeNext.href)) tokenForHop = undefined;
      current = safeNext.href;
      live = null;
    } catch (cause) {
      const report = buildCheckReport({
        url: opts.url,
        transport,
        secret,
        tokenSent,
        code: 'url_not_allowed',
        reason: `Redirect was not followed: ${cause.message}`,
        redirectBlocked: next.toString(),
        live: { status: 'rejected', reason: `Redirect was not followed: ${cause.message}`, tools: [] },
      });
      if (opts.persist) return saveCheck(opts.userId, report);
      return report;
    }
  }

  if (!live) {
    live = { status: 'error', reason: 'Too many redirects', tools: [] };
  }

  if (live.location && live.status !== 'redirect') {
    try {
      await assertSafePublicUrl(new URL(live.location, current).toString(), { allowHttp: false });
    } catch (cause) {
      const report = buildCheckReport({
        url: current,
        transport,
        secret,
        tokenSent,
        code: 'url_not_allowed',
        reason: `Redirect was not followed: ${cause.message}`,
        redirectBlocked: live.location,
        live: { status: 'rejected', reason: `Redirect was not followed: ${cause.message}`, tools: [] },
      });
      if (opts.persist) return saveCheck(opts.userId, report);
      return report;
    }
    live = {
      ...live,
      location: undefined,
      reason: live.reason || 'A follow-up call was redirected and was not followed',
    };
  }

  const report = buildCheckReport({
    url: current,
    transport,
    secret,
    tokenSent,
    catalog: catalogHits(current),
    live,
  });
  if (opts.persist) return saveCheck(opts.userId, report);
  return report;
}

function runDb(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getDbRow(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

let tablesReady = false;

async function ensureCheckTables() {
  if (tablesReady) return;
  const db = await getDatabase();
  await runDb(
    db,
    `CREATE TABLE IF NOT EXISTS mcp_server_checks (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      url TEXT NOT NULL,
      transport TEXT,
      status TEXT NOT NULL,
      result_json TEXT,
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
  );
  await runDb(db, 'CREATE INDEX IF NOT EXISTS idx_mcp_server_checks_user ON mcp_server_checks(user_id)');
  tablesReady = true;
}

function safeJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function saveCheck(userId, report) {
  if (!userId) {
    const err = new Error('Authentication required');
    err.status = 401;
    err.code = 'auth_required';
    throw err;
  }
  await ensureCheckTables();
  const id = crypto.randomBytes(12).toString('hex');
  const stored = { ...report, id };
  delete stored.secret;
  const db = await getDatabase();
  await runDb(
    db,
    `INSERT INTO mcp_server_checks (id, user_id, url, transport, status, result_json, error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      stored.url,
      stored.transport,
      stored.status,
      JSON.stringify(stored),
      stored.reason || stored.message || null,
    ],
  );
  return stored;
}

async function getStoredCheck(id) {
  if (!/^[a-f0-9]{24}$/.test(String(id || ''))) return null;
  await ensureCheckTables();
  const db = await getDatabase();
  const row = await getDbRow(db, 'SELECT user_id, result_json, url, status, error FROM mcp_server_checks WHERE id = ?', [id]);
  if (!row) return null;
  const report = safeJson(row.result_json) || {
    id,
    ok: false,
    url: row.url,
    status: row.status || 'error',
    status_label: STATUS_LABELS[row.status] || 'Handshake failed',
    message: row.error || 'This check could not be read back.',
    tools: [],
    summary: { tool_count: 0 },
    catalog: [],
    server: {},
    quality: null,
  };
  decorateCheckTools(report.tools);
  if (!Array.isArray(report.trials)) report.trials = [];
  return { user_id: row.user_id, report };
}

function userMayCheck(user) {
  if (!user || user.is_blocked || !user.id) return false;
  if (!user.email_verified && user.provider === 'local') return false;
  return true;
}

function getCheckAssetVersion() {
  try {
    const files = [
      ['css', 'home.css'],
      ['css', 'mcp-setup-page.css'],
      ['js', 'mcp-check-page.js'],
    ];
    let latest = 0;
    for (const [dir, file] of files) {
      latest = Math.max(latest, fs.statSync(path.join(__dirname, '..', 'public', dir, file)).mtimeMs);
    }
    return String(Math.floor(latest));
  } catch {
    return String(Date.now());
  }
}

function formLocals(req, extras) {
  return {
    title: 'Check an MCP server — Influzer.ai',
    description: 'Enter any public MCP server URL to list its tools, annotations, and verification grade. Verified account required.',
    canonicalUrl: `${SITE_BASE}${CHECK_PATH}`,
    assetVersion: getCheckAssetVersion(),
    navPath: req.path,
    canCheck: false,
    csrfToken: '',
    formError: null,
    check: null,
    noindex: false,
    prefillUrl: '',
    prefillTransport: 'http',
    ...extras,
  };
}

function ownsCheck(user, stored) {
  if (!user || !stored) return false;
  if (user.is_admin) return true;
  return Number(stored.user_id) === Number(user.id);
}

const CALL_LIMIT = Number(process.env.MCP_CHECK_CALL_RATE_LIMIT) || 10;
const CALL_WINDOW_MS = 60 * 60 * 1000;

const checkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.MCP_CHECK_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator(req) {
    return `mcp-check:${req.session?.userId || getClientIp(req)}`;
  },
  handler(req, res) {
    const message = 'Too many server checks from this account. Wait a few minutes and try again.';
    if (String(req.path || '').startsWith('/api/')) {
      return res.status(429).json({ ok: false, error: 'rate_limited', message });
    }
    return res.status(429).render('mcp-check', formLocals(req, { canCheck: true, formError: message, noindex: true }));
  },
});

const callLimiter = rateLimit({
  windowMs: CALL_WINDOW_MS,
  max: CALL_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator(req) {
    return `mcp-check-call:${req.session?.userId || getClientIp(req)}`;
  },
  handler(req, res) {
    const message = `Too many tool trials from this account. You can try ${CALL_LIMIT} tools an hour.`;
    if (wantsJson(req)) return res.status(429).json({ ok: false, error: 'rate_limited', message });
    return res.status(429).render('mcp-check', formLocals(req, {
      canCheck: true,
      formError: message,
      noindex: true,
    }));
  },
});

let trialClientForTests = null;

function setTrialClientForTests(fn) {
  trialClientForTests = typeof fn === 'function' ? fn : null;
}

function wantsJson(req) {
  return String(req.path || '').startsWith('/api/');
}

function csrfOk(req) {
  const expected = req.session?.csrfToken;
  const provided = req.get('x-csrf-token') || req.body?._csrf;
  return Boolean(expected && provided && expected === provided);
}

function takeToken(body) {
  const token = body?.token ?? body?.bearer_token ?? '';
  if (body && typeof body === 'object') {
    delete body.token;
    delete body.bearer_token;
    delete body.authorization;
  }
  return token;
}

async function handleCheckPost(req, res) {
  const user = await getOptionalAuthUser(req);
  if (!user) {
    if (wantsJson(req)) {
      return res.status(401).json({
        ok: false,
        error: 'auth_required',
        message: 'Sign in with a verified account to check a server.',
      });
    }
    return res.redirect(302, `/login?redirect=${encodeURIComponent(CHECK_PATH)}`);
  }
  req.user = user;
  if (!userMayCheck(user)) {
    const message = user.is_blocked
      ? 'This account cannot run server checks.'
      : 'Verify your email before checking a server. The check connects to the URL you enter.';
    if (wantsJson(req)) return res.status(403).json({ ok: false, error: 'verification_required', message });
    return res.status(403).render('mcp-check', formLocals(req, { formError: message }));
  }
  if (!csrfOk(req)) {
    const message = 'The form expired. Refresh the page and submit it again.';
    if (wantsJson(req)) return res.status(403).json({ ok: false, error: 'csrf', message });
    return res.status(403).render('mcp-check', formLocals(req, {
      canCheck: true,
      csrfToken: ensureCsrfToken(req),
      formError: message,
    }));
  }

  const token = takeToken(req.body);
  try {
    const report = await checkMcpServer({
      url: req.body?.url,
      transport: req.body?.transport,
      bearerToken: token,
      userId: user.id,
      persist: true,
    });
    if (wantsJson(req)) {
      const httpStatus = report.status === 'rejected' ? 400 : 200;
      return res.status(httpStatus).json({
        ok: report.ok,
        check: report,
        page_path: `${CHECK_PATH}/${report.id}`,
      });
    }
    return res.redirect(303, `${CHECK_PATH}/${report.id}`);
  } catch (err) {
    const message = err.code === 'token_invalid' || err.code === 'url_required' || err.code === 'url_invalid'
      ? err.message
      : 'The check could not be saved. Try again.';
    console.error('MCP server check failed:', err.code || 'check_failed');
    if (wantsJson(req)) return res.status(err.status || 400).json({ ok: false, error: err.code || 'check_failed', message });
    return res.status(err.status || 400).render('mcp-check', formLocals(req, {
      canCheck: true,
      csrfToken: ensureCsrfToken(req),
      formError: message,
      prefillUrl: clip(normalizeCheckUrl(req.body?.url || ''), 500),
      prefillTransport: readTransport(req.body?.transport),
    }));
  }
}

async function handleCheckGet(req, res) {
  const id = String(req.params.id || '');
  const user = await getOptionalAuthUser(req);
  if (!user) {
    return res.redirect(302, `/login?redirect=${encodeURIComponent(`${CHECK_PATH}/${id}`)}`);
  }
  const stored = await getStoredCheck(id);
  if (!stored || !ownsCheck(user, stored)) {
    return res.status(404).render('404', { title: 'Check not found' });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const host = (() => {
    try {
      return new URL(stored.report.url).host;
    } catch {
      return 'MCP server';
    }
  })();
  const canTry = userMayCheck(user) || Boolean(user.is_admin);
  return res.render('mcp-check', formLocals(req, {
    title: `MCP check: ${host} — Influzer.ai`,
    description: 'Tools, annotations, and verification grade for a checked MCP server.',
    canonicalUrl: `${SITE_BASE}${CHECK_PATH}/${id}`,
    canCheck: userMayCheck(user),
    csrfToken: canTry ? ensureCsrfToken(req) : '',
    check: stored.report,
    noindex: true,
  }));
}

function mayTryTool(user) {
  return Boolean(user && (userMayCheck(user) || user.is_admin));
}

async function saveTrial(id, trial, secret) {
  await ensureCheckTables();
  const db = await getDatabase();
  const row = await getDbRow(db, 'SELECT result_json FROM mcp_server_checks WHERE id = ?', [id]);
  const report = safeJson(row?.result_json);
  if (!report) {
    const err = new Error('This check could not be read back.');
    err.status = 404;
    err.code = 'not_found';
    throw err;
  }
  const hidden = String(secret || '');
  let clean = trial;
  if (hidden) {
    let text = '';
    try {
      text = JSON.stringify(trial);
    } catch {
      text = '';
    }
    if (text.includes(hidden)) clean = JSON.parse(text.split(hidden).join('[redacted]'));
  }
  delete clean.secret;
  delete clean.bearerToken;
  delete clean.token;
  report.trials = Array.isArray(report.trials) ? report.trials : [];
  report.trials.push(clean);
  if (report.trials.length > 40) report.trials = report.trials.slice(-40);
  decorateCheckTools(report.tools);
  let serialized = JSON.stringify(report);
  if (hidden && serialized.includes(hidden)) serialized = serialized.split(hidden).join('[redacted]');
  await runDb(db, 'UPDATE mcp_server_checks SET result_json = ? WHERE id = ?', [serialized, id]);
  return safeJson(serialized);
}

function checkHost(report) {
  try {
    return new URL(report.url).host;
  } catch {
    return 'MCP server';
  }
}

function trialPageLocals(req, user, stored, extras) {
  const canTry = mayTryTool(user);
  return formLocals(req, {
    title: `MCP check: ${checkHost(stored.report)} — Influzer.ai`,
    description: 'Tools, annotations, and verification grade for a checked MCP server.',
    canonicalUrl: `${SITE_BASE}${CHECK_PATH}/${stored.report.id}`,
    canCheck: userMayCheck(user),
    csrfToken: canTry ? ensureCsrfToken(req) : '',
    check: stored.report,
    noindex: true,
    ...extras,
  });
}

async function handleTrialPost(req, res) {
  const id = String(req.params.id || '');
  const user = await getOptionalAuthUser(req);
  if (!user) {
    if (wantsJson(req)) {
      return res.status(401).json({
        ok: false,
        error: 'auth_required',
        message: 'Sign in with a verified account to try a tool.',
      });
    }
    return res.redirect(302, `/login?redirect=${encodeURIComponent(`${CHECK_PATH}/${id}`)}`);
  }
  if (!mayTryTool(user)) {
    const message = user.is_blocked
      ? 'This account cannot try tools.'
      : 'Verify your email before trying a tool. The trial connects to the checked server.';
    if (wantsJson(req)) return res.status(403).json({ ok: false, error: 'verification_required', message });
    return res.status(403).render('mcp-check', formLocals(req, { formError: message, noindex: true }));
  }
  const stored = await getStoredCheck(id);
  if (!stored || !ownsCheck(user, stored)) {
    if (wantsJson(req)) return res.status(404).json({ ok: false, error: 'not_found' });
    return res.status(404).render('404', { title: 'Check not found' });
  }
  if (!csrfOk(req)) {
    const message = 'The form expired. Refresh the page and submit it again.';
    if (wantsJson(req)) return res.status(403).json({ ok: false, error: 'csrf', message });
    return res.status(403).render('mcp-check', trialPageLocals(req, user, stored, { formError: message }));
  }

  const token = takeToken(req.body);
  const tokenRead = readBearerToken(token);
  if (tokenRead.error) {
    if (wantsJson(req)) return res.status(400).json({ ok: false, error: 'token_invalid', message: tokenRead.error });
    return res.status(400).render('mcp-check', trialPageLocals(req, user, stored, { formError: tokenRead.error }));
  }

  try {
    const trial = await executeToolTrial({
      report: stored.report,
      toolName: req.body?.tool ?? req.body?.tool_name,
      args: req.body?.arguments ?? req.body?.args ?? {},
      recordId: req.body?.record_id ?? req.body?.recordId ?? '',
      disposable: req.body?.disposable,
      readBackName: req.body?.read_back ?? req.body?.readBack ?? '',
      bearerToken: tokenRead.token,
      callLiveMcpTools: trialClientForTests || undefined,
    });
    const report = await saveTrial(id, trial, tokenRead.token);
    res.setHeader('Cache-Control', 'private, no-store');
    if (wantsJson(req)) {
      return res.status(200).json({
        ok: true,
        trial,
        check: report,
        page_path: `${CHECK_PATH}/${id}`,
      });
    }
    return res.redirect(303, `${CHECK_PATH}/${id}`);
  } catch (err) {
    const message = err.status === 400 || err.status === 404
      ? err.message
      : 'The tool trial could not be saved. Try again.';
    if (!err.status || err.status >= 500) console.error('MCP tool trial failed:', err.code || 'trial_failed');
    if (wantsJson(req)) {
      return res.status(err.status || 400).json({ ok: false, error: err.code || 'trial_failed', message });
    }
    return res.status(err.status || 400).render('mcp-check', trialPageLocals(req, user, stored, { formError: message }));
  }
}

function registerMcpServerCheckRoutes(app) {
  app.get(CHECK_PATH, async (req, res, next) => {
    try {
      const user = await getOptionalAuthUser(req);
      const canCheck = userMayCheck(user);
      res.setHeader('Cache-Control', 'private, no-store');
      res.render('mcp-check', formLocals(req, {
        canCheck,
        csrfToken: canCheck ? ensureCsrfToken(req) : '',
      }));
    } catch (err) {
      next(err);
    }
  });

  app.post(CHECK_PATH, checkLimiter, handleCheckPost);
  app.post('/api/mcp/v1/checks', checkLimiter, handleCheckPost);
  app.post(`${CHECK_PATH}/:id/call`, callLimiter, handleTrialPost);
  app.post('/api/mcp/v1/checks/:id/calls', callLimiter, handleTrialPost);

  app.get(`${CHECK_PATH}/:id`, handleCheckGet);
  app.get('/api/mcp/v1/checks/:id', async (req, res) => {
    const user = await getOptionalAuthUser(req);
    if (!user) return res.status(401).json({ ok: false, error: 'auth_required' });
    if (!userMayCheck(user) && !user.is_admin) {
      return res.status(403).json({ ok: false, error: 'verification_required' });
    }
    const stored = await getStoredCheck(req.params.id);
    if (!stored || !ownsCheck(user, stored)) return res.status(404).json({ ok: false, error: 'not_found' });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ ok: true, check: stored.report });
  });
}

module.exports = {
  registerMcpServerCheckRoutes,
  checkMcpServer,
  buildCheckReport,
  reviewTools,
  reviewTool,
  userMayCheck,
  setTrialClientForTests,
  CALL_LIMIT,
  CALL_WINDOW_MS,
};
