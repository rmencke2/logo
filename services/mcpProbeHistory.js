/**
 * Stored probe samples: timestamp, status, latency.
 * Uptime is shown only after samples exist on two different UTC days.
 */

const fs = require('fs');
const path = require('path');

const HISTORY_PATH = process.env.MCP_PROBE_HISTORY_PATH
  || path.join(__dirname, '..', 'data', 'mcp-probe-history.json');
const MAX_SAMPLES = 30;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const RESPONDED = new Set(['live_ok', 'auth_required', 'ok', 'ok_empty']);

function emptyHistory() {
  return { samples: {} };
}

function readHistory() {
  try {
    if (!fs.existsSync(HISTORY_PATH)) return emptyHistory();
    const data = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
    if (!data || typeof data.samples !== 'object' || data.samples == null) return emptyHistory();
    return data;
  } catch {
    return emptyHistory();
  }
}

function writeHistory(data) {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

function normalizeSample(sample) {
  const slug = String(sample?.slug || '').trim().toLowerCase();
  const at = sample?.at ? new Date(sample.at).toISOString() : '';
  if (!slug || !at || Number.isNaN(Date.parse(at))) return null;
  const status = String(sample.status || '').trim().toLowerCase();
  if (!status) return null;
  const latency = Number(sample.latency_ms);
  return {
    slug,
    at,
    status,
    latency_ms: Number.isFinite(latency) && latency >= 0 ? Math.round(latency) : null,
  };
}

function appendProbeSamples(samples) {
  const incoming = (Array.isArray(samples) ? samples : []).map(normalizeSample).filter(Boolean);
  if (!incoming.length) return 0;
  const data = readHistory();
  data.samples = data.samples || {};
  for (const sample of incoming) {
    const list = Array.isArray(data.samples[sample.slug]) ? data.samples[sample.slug] : [];
    list.push({ at: sample.at, status: sample.status, latency_ms: sample.latency_ms });
    list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    data.samples[sample.slug] = list.slice(-MAX_SAMPLES);
  }
  writeHistory(data);
  return incoming.length;
}

function samplesForSlug(slug) {
  const key = String(slug || '').trim().toLowerCase();
  if (!key) return [];
  const list = readHistory().samples[key];
  return Array.isArray(list) ? list : [];
}

/**
 * Share of samples in the last 30 days whose status shows the server responded.
 * Null until those samples fall on at least two different UTC days.
 */
function uptimeFromSamples(samples, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) return null;
  const recent = (Array.isArray(samples) ? samples : []).filter((sample) => {
    const at = Date.parse(sample?.at || '');
    return Number.isFinite(at) && nowMs - at >= 0 && nowMs - at <= WINDOW_MS;
  });
  const days = new Set(recent.map((sample) => String(sample.at).slice(0, 10)));
  if (days.size < 2) return null;
  const responded = recent.filter((sample) => RESPONDED.has(String(sample.status || '').toLowerCase())).length;
  return {
    days: days.size,
    samples: recent.length,
    responded,
    ratio: recent.length ? responded / recent.length : 0,
  };
}

function buildVerificationSummary(server, now = new Date()) {
  const quality = server?.quality || {};
  const samples = samplesForSlug(server?.slug);
  const uptime = uptimeFromSamples(samples, now);
  const latency = latestLatencyMs(samples);
  const endpoint = String(
    server?.mcp_endpoint || server?.deployment_url || server?.connection_url || server?.primary_url || '',
  );
  const https = /^https:\/\//i.test(endpoint);
  const transportBits = [server?.transport || 'unknown'];
  if (https) transportBits.push('HTTPS');
  else if (/^http:\/\//i.test(endpoint)) transportBits.push('HTTP');
  let probedLabel = null;
  if (quality.probed_at && !Number.isNaN(Date.parse(quality.probed_at))) {
    probedLabel = `${new Date(quality.probed_at).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  }
  const toolCount = Number.isFinite(Number(quality.tool_count))
    ? Number(quality.tool_count)
    : (Array.isArray(server?.tools) ? server.tools.length : 0);
  return {
    grade: quality.verification_grade,
    grade_letter: quality.verification_grade_letter || null,
    probed_at: quality.probed_at || null,
    probed_at_label: probedLabel,
    status: quality.live_status_label || '',
    latency_ms: latency,
    auth: quality.auth_gate_label || '',
    transport: transportBits.join(', '),
    tool_count: toolCount,
    uptime_label: uptime
      ? `${Math.round(uptime.ratio * 100)}% of ${uptime.samples} samples over ${uptime.days} days`
      : null,
  };
}

function latestLatencyMs(samples) {
  const withLatency = (Array.isArray(samples) ? samples : []).filter(
    (sample) => Number.isFinite(Number(sample?.latency_ms)),
  );
  if (!withLatency.length) return null;
  withLatency.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return Math.round(Number(withLatency[0].latency_ms));
}

module.exports = {
  HISTORY_PATH,
  appendProbeSamples,
  samplesForSlug,
  uptimeFromSamples,
  latestLatencyMs,
  buildVerificationSummary,
  readHistory,
};
