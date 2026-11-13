'use strict';

/**
 * Try one tool from a saved MCP check against a target the caller controls.
 *
 * Read-only tools (readOnlyHint true, and not destructive) call tools/call
 * and show the returned content. Anything else is treated as a write: the
 * caller must confirm the target is disposable and name the record id.
 * A write reads that record, calls the tool, then reads it again. The
 * verdict comes from that before/after pair. The tool's own payload is
 * kept, and it is not the verdict.
 *
 * Uses the existing MCP HTTP client. The bearer token is passed only to
 * that client and is never returned on the trial record.
 */

const crypto = require('crypto');
const { callLiveMcpTools } = require('../scripts/utils/mcp-live-client');
const { assertSafePublicUrl } = require('./webmcp/ssrf');

const DESTRUCTIVE_FLAG = 'Destructive, with no idempotency note';
const VERDICT = {
  unchanged: 'The record did not change.',
  differentRecord: 'This wrote a different record.',
  fieldsMismatch: 'The written fields do not match what was sent.',
  matched: 'The named record changed to match what was sent.',
  noReadBack: 'No read-back tool, so a success response is not proof the right record changed.',
};
const ID_APPEARS = 'The record id appears in the result.';
const ID_MISSING = 'The record id does not appear in the result.';
const ID_ARGUMENT_PREFERENCE = ['id', 'recordId', 'record_id', 'recordID'];

function trialError(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isIdArgumentName(name) {
  return name === 'id'
    || name === 'recordId'
    || name === 'record_id'
    || name === 'recordID'
    || /Id$/.test(name)
    || /_id$/.test(name);
}

function idArgumentNames(tool) {
  const names = (tool?.fields || []).map((field) => field.name).filter(isIdArgumentName);
  return names.sort((left, right) => {
    const leftRank = ID_ARGUMENT_PREFERENCE.indexOf(left);
    const rightRank = ID_ARGUMENT_PREFERENCE.indexOf(right);
    if (leftRank === -1 && rightRank === -1) return left.localeCompare(right);
    if (leftRank === -1) return 1;
    if (rightRank === -1) return -1;
    return leftRank - rightRank;
  });
}

function hintIsTrue(hints, key) {
  const hint = (hints || []).find((item) => item && item.key === key);
  return Boolean(hint && hint.set && hint.value === 'true');
}

function trustFlagFor(destructive, idempotent) {
  return destructive === true && idempotent !== true ? DESTRUCTIVE_FLAG : null;
}

/**
 * Fill trust and read-back fields on a stored tool list. Safe to run on
 * checks saved before those fields existed.
 */
function decorateCheckTools(tools) {
  if (!Array.isArray(tools)) return [];
  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') continue;
    const destructive = hintIsTrue(tool.hints, 'destructiveHint');
    const idempotent = hintIsTrue(tool.hints, 'idempotentHint');
    const readOnlyHint = hintIsTrue(tool.hints, 'readOnlyHint');
    if (typeof tool.destructive !== 'boolean') tool.destructive = destructive;
    if (typeof tool.read_only !== 'boolean') tool.read_only = readOnlyHint && !destructive;
    if (!Object.prototype.hasOwnProperty.call(tool, 'trust_flag')) {
      tool.trust_flag = trustFlagFor(destructive, idempotent);
    }
  }
  assignReadBackDefaults(tools);
  return tools;
}

function findDefaultReadBack(tools, tool) {
  const ids = idArgumentNames(tool);
  if (!ids.length) return { tool: null, idArgument: null };
  for (const idArgument of ids) {
    const match = (tools || []).find((candidate) => (
      candidate
      && candidate.name !== tool.name
      && candidate.read_only
      && (candidate.fields || []).some((field) => field.name === idArgument)
    ));
    if (match) return { tool: match, idArgument };
  }
  return { tool: null, idArgument: ids[0] };
}

function assignReadBackDefaults(tools) {
  if (!Array.isArray(tools)) return [];
  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') continue;
    if (tool.read_only) {
      tool.default_read_back = null;
      tool.id_argument = idArgumentNames(tool)[0] || null;
      continue;
    }
    const found = findDefaultReadBack(tools, tool);
    tool.default_read_back = found.tool ? found.tool.name : null;
    tool.id_argument = found.idArgument;
  }
  return tools;
}

function chooseIdArgument(writeTool, readTool, args, recordId) {
  if (args && recordId) {
    for (const [key, value] of Object.entries(args)) {
      if (String(value) === String(recordId) && isIdArgumentName(key)) return key;
    }
  }
  const writeIds = idArgumentNames(writeTool);
  const readIds = readTool ? idArgumentNames(readTool) : [];
  const shared = writeIds.find((name) => readIds.includes(name));
  if (shared) return shared;
  if (readIds.length) return readIds[0];
  if (writeIds.length) return writeIds[0];
  return 'id';
}

function canon(value) {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `[${value.map((item) => canon(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canon(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function recordsEqual(left, right) {
  return canon(left) === canon(right);
}

function recordIdValue(record, idArgument) {
  if (!isPlainObject(record)) return undefined;
  const keys = [idArgument, 'id', 'record_id', 'recordId'].filter(Boolean);
  const seen = new Set();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (Object.prototype.hasOwnProperty.call(record, key) && record[key] != null && record[key] !== '') {
      return record[key];
    }
  }
  return undefined;
}

function fieldMatches(record, key, expected) {
  if (!isPlainObject(record) || !Object.prototype.hasOwnProperty.call(record, key)) return false;
  return canon(record[key]) === canon(expected);
}

/**
 * Verdict order is fixed:
 * identical records, then a different id, then sent fields that are
 * missing or unequal, then a match.
 */
function verdictForWrite({ before, after, recordId, args, idArgument }) {
  if (recordsEqual(before, after)) return VERDICT.unchanged;
  const afterId = recordIdValue(after, idArgument);
  if (afterId == null || String(afterId) !== String(recordId)) return VERDICT.differentRecord;
  const fields = isPlainObject(args) ? args : {};
  for (const [key, value] of Object.entries(fields)) {
    if (key === idArgument) continue;
    if (!fieldMatches(after, key, value)) return VERDICT.fieldsMismatch;
  }
  return VERDICT.matched;
}

function fieldDiff(before, after, prefix = '') {
  if (!isPlainObject(before) || !isPlainObject(after)) {
    if (recordsEqual(before, after)) return [];
    return [{ field: prefix || '(record)', before: before ?? null, after: after ?? null }];
  }
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changes = [];
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const left = before[key];
    const right = after[key];
    if (isPlainObject(left) && isPlainObject(right)) {
      changes.push(...fieldDiff(left, right, path));
    } else if (!recordsEqual(left, right)) {
      changes.push({
        field: path,
        before: left === undefined ? null : left,
        after: right === undefined ? null : right,
      });
    }
  }
  return changes;
}

function isChecked(value) {
  return value === true || value === 1 || value === '1' || value === 'true' || value === 'on' || value === 'yes';
}

function readRecordId(value) {
  if (value == null || String(value).trim() === '') return '';
  const id = String(value).trim();
  if (id.length > 200 || /[\r\n\0]/.test(id)) {
    throw trialError(400, 'record_id_invalid', 'The record id must be a single line under 200 characters.');
  }
  return id;
}

function parseArgs(value) {
  if (value == null || value === '') return {};
  let parsed = value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return {};
    if (text.length > 20000) {
      throw trialError(400, 'arguments_invalid', 'Arguments must be a JSON object under 20000 characters.');
    }
    try {
      parsed = JSON.parse(text);
    } catch {
      throw trialError(400, 'arguments_invalid', 'Arguments must be a JSON object.');
    }
  }
  if (!isPlainObject(parsed)) {
    throw trialError(400, 'arguments_invalid', 'Arguments must be a JSON object.');
  }
  const clean = {};
  for (const key of Object.keys(parsed)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    clean[key] = parsed[key];
  }
  return clean;
}

function redactSecret(text, secret) {
  let out = String(text ?? '');
  const hidden = String(secret || '');
  if (hidden) out = out.split(hidden).join('[redacted]');
  return out.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}

function redactDeep(value, secret, depth = 0) {
  if (depth > 8) return null;
  if (typeof value === 'string') return redactSecret(value, secret);
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => redactDeep(item, secret, depth + 1));
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value).slice(0, 80)) {
      out[key] = redactDeep(value[key], secret, depth + 1);
    }
    return out;
  }
  return null;
}

function fitValue(value, secret) {
  const redacted = redactDeep(value, secret);
  let text;
  try {
    text = JSON.stringify(redacted);
  } catch {
    return null;
  }
  if (!text || text.length <= 12000) return redacted;
  return `${text.slice(0, 4000)}…`;
}

function extractCall(step) {
  const result = step?.result && typeof step.result === 'object' ? step.result : null;
  const content = Array.isArray(result?.content) ? result.content : [];
  const text = content
    .filter((item) => item && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n');
  let record = null;
  if (isPlainObject(result?.structuredContent)) {
    record = result.structuredContent;
  } else if (text) {
    try {
      const parsed = JSON.parse(text);
      if (isPlainObject(parsed)) record = parsed;
      else if (Array.isArray(parsed)) record = { items: parsed };
      else record = { text };
    } catch {
      record = { text };
    }
  }
  return {
    record,
    content,
    text,
    isError: Boolean(step?.isError || result?.isError),
    error: step?.error || null,
    ok: Boolean(step && step.ok !== false && result),
  };
}

function valueHasExact(value, needle, depth = 0) {
  if (depth > 8 || value == null) return false;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value) === needle;
  }
  if (Array.isArray(value)) return value.some((item) => valueHasExact(item, needle, depth + 1));
  if (isPlainObject(value)) return Object.values(value).some((item) => valueHasExact(item, needle, depth + 1));
  return false;
}

function idAppearsInResult(payload, recordId) {
  const needle = String(recordId);
  if (!needle) return false;
  if (valueHasExact(payload, needle)) return true;
  const texts = [];
  const walk = (value, depth) => {
    if (depth > 8 || value == null) return;
    if (typeof value === 'string') texts.push(value);
    else if (Array.isArray(value)) value.forEach((item) => walk(item, depth + 1));
    else if (isPlainObject(value)) Object.values(value).forEach((item) => walk(item, depth + 1));
  };
  walk(payload, 0);
  return texts.some((text) => text.includes(needle));
}

function liveFailure(live) {
  if (!live || live.status === 'ok') return null;
  if (live.status === 'redirect') return 'The server redirected the call. The redirect was not followed.';
  if (live.status === 'auth_required') return 'The server asked for authentication. The bearer token was not stored.';
  if (live.status === 'unreachable') return live.reason || 'The server did not respond.';
  return live.reason || 'The tool call did not complete.';
}

function stepByRole(calls, role, index) {
  return (calls || []).find((call) => call && call.role === role) || (calls || [])[index] || null;
}

function payloadOf(extracted, secret) {
  if (!extracted) return null;
  return fitValue({
    text: extracted.text ? redactSecret(extracted.text, secret).slice(0, 4000) : '',
    is_error: extracted.isError,
    content: extracted.content.slice(0, 12),
  }, secret);
}

function baseTrial({ tool, kind, args, recordId, disposable, readBack, idArgument, secret }) {
  return {
    id: crypto.randomBytes(8).toString('hex'),
    tool_name: tool.name,
    kind,
    arguments: fitValue(args, secret) || {},
    record_id: recordId || null,
    disposable: Boolean(disposable),
    read_back_tool: readBack ? readBack.name : null,
    id_argument: idArgument || null,
    before: null,
    after: null,
    diff: [],
    payload: null,
    content_text: null,
    id_note: null,
    verdict: null,
    error: null,
    created_at: new Date().toISOString(),
  };
}

function scrubTrial(trial, secret) {
  const hidden = String(secret || '');
  if (!hidden) return trial;
  let text;
  try {
    text = JSON.stringify(trial);
  } catch {
    return trial;
  }
  if (!text.includes(hidden)) return trial;
  return JSON.parse(text.split(hidden).join('[redacted]'));
}

/**
 * @param {{ report: object, toolName: string, args?: object|string, recordId?: string, disposable?: boolean|string, readBackName?: string, bearerToken?: string, callLiveMcpTools?: Function, timeoutMs?: number }} opts
 */
async function executeToolTrial(opts) {
  const report = opts.report || {};
  const tools = Array.isArray(report.tools) ? report.tools : [];
  const toolName = String(opts.toolName || '').trim();
  const tool = tools.find((item) => item && item.name === toolName);
  if (!tool) throw trialError(400, 'tool_not_found', 'That tool is not on this check.');

  const args = parseArgs(opts.args);
  const recordId = readRecordId(opts.recordId);
  const disposable = isChecked(opts.disposable);
  const secret = String(opts.bearerToken || '');

  if (!tool.read_only) {
    if (!disposable || !recordId) {
      throw trialError(
        400,
        'disposable_required',
        'This tool is not called until you check "This target is disposable" and supply the record id.',
      );
    }
  }

  const readBackName = String(opts.readBackName || '').trim();
  let readBack = null;
  if (!tool.read_only) {
    if (readBackName) {
      readBack = tools.find((item) => item && item.name === readBackName && item.read_only) || null;
      if (!readBack) {
        throw trialError(400, 'read_back_invalid', 'Pick a read-only tool from this server for the read-back.');
      }
    } else if (tool.default_read_back) {
      readBack = tools.find((item) => item && item.name === tool.default_read_back && item.read_only) || null;
    }
  }

  let safeUrl;
  try {
    safeUrl = (await assertSafePublicUrl(report.url, { allowHttp: false })).href;
  } catch (cause) {
    throw trialError(400, 'url_not_allowed', cause.message || 'That URL is not allowed.');
  }

  const idArgument = tool.read_only ? (idArgumentNames(tool)[0] || null) : chooseIdArgument(tool, readBack, args, recordId);
  const plan = tool.read_only
    ? { kind: 'read', calls: [{ role: 'read', name: tool.name, arguments: args }] }
    : readBack
      ? {
        kind: 'write',
        calls: [
          { role: 'before', name: readBack.name, arguments: { [idArgument || 'id']: recordId } },
          { role: 'write', name: tool.name, arguments: args },
          { role: 'after', name: readBack.name, arguments: { [idArgument || 'id']: recordId } },
        ],
      }
      : { kind: 'write', calls: [{ role: 'write', name: tool.name, arguments: args }] };

  const client = opts.callLiveMcpTools || callLiveMcpTools;
  let live;
  try {
    live = await client(safeUrl, plan.calls, {
      bearerToken: secret || undefined,
      timeoutMs: opts.timeoutMs || 12000,
      redirect: 'manual',
      clientInfo: { name: 'influzer-mcp-check', version: '1.0.0' },
    });
  } catch (cause) {
    live = { status: 'error', reason: 'The tool call did not complete.', calls: [] };
    if (cause && cause.message) live.reason = String(cause.message).slice(0, 300);
  }

  const failure = liveFailure(live);
  const trial = baseTrial({
    tool,
    kind: plan.kind,
    args,
    recordId,
    disposable,
    readBack,
    idArgument,
    secret,
  });
  if (failure) trial.error = redactSecret(failure, secret).slice(0, 300);

  if (plan.kind === 'read') {
    const step = stepByRole(live.calls, 'read', 0);
    const extracted = extractCall(step);
    trial.payload = payloadOf(extracted, secret);
    trial.content_text = extracted.text
      ? redactSecret(extracted.text, secret).slice(0, 4000)
      : (extracted.record ? JSON.stringify(redactDeep(extracted.record, secret), null, 2) : '');
    if (recordId && (extracted.record || extracted.text || extracted.content.length)) {
      const appears = idAppearsInResult({ result: step?.result, record: extracted.record, text: extracted.text }, recordId);
      trial.id_note = appears ? ID_APPEARS : ID_MISSING;
    }
    if (!failure && extracted.error && !extracted.text && !extracted.record) {
      trial.error = redactSecret(extracted.error, secret).slice(0, 300);
    }
    return scrubTrial(trial, secret);
  }

  const writeStep = stepByRole(live.calls, 'write', readBack ? 1 : 0);
  const writeExtracted = extractCall(writeStep);
  trial.payload = payloadOf(writeExtracted, secret);

  if (!readBack) {
    trial.verdict = VERDICT.noReadBack;
    return scrubTrial(trial, secret);
  }

  const beforeExtracted = extractCall(stepByRole(live.calls, 'before', 0));
  const afterExtracted = extractCall(stepByRole(live.calls, 'after', 2));
  if (!beforeExtracted.record || !afterExtracted.record) {
    trial.error = trial.error || 'The read-back did not return a record to compare.';
    return scrubTrial(trial, secret);
  }

  trial.before = fitValue(beforeExtracted.record, secret);
  trial.after = fitValue(afterExtracted.record, secret);
  const comparedBefore = isPlainObject(trial.before) ? trial.before : beforeExtracted.record;
  const comparedAfter = isPlainObject(trial.after) ? trial.after : afterExtracted.record;
  trial.diff = fieldDiff(comparedBefore, comparedAfter).slice(0, 40).map((row) => ({
    field: row.field,
    before: fitValue(row.before, secret),
    after: fitValue(row.after, secret),
  }));
  trial.verdict = verdictForWrite({
    before: comparedBefore,
    after: comparedAfter,
    recordId,
    args,
    idArgument,
  });
  return scrubTrial(trial, secret);
}

module.exports = {
  DESTRUCTIVE_FLAG,
  VERDICT,
  ID_APPEARS,
  ID_MISSING,
  decorateCheckTools,
  assignReadBackDefaults,
  findDefaultReadBack,
  trustFlagFor,
  verdictForWrite,
  fieldDiff,
  executeToolTrial,
  parseArgs,
};
