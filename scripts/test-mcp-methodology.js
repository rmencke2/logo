#!/usr/bin/env node
/**
 * Verification grade is reproducible from stored signals.
 * Every status label shown in the UI is defined on the methodology page.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  LIVE_STATUS_LABELS,
  AUTH_GATE_LABELS,
  TOOLS_SOURCE_LABELS,
  DEMOWARE_TIER_LABELS,
  computeVerificationGrade,
  computeQualitySignals,
} = require('../scripts/utils/mcp-quality');
const { getMethodology, methodologyPlainText } = require('../data/mcp-methodology');

const ROOT = path.join(__dirname, '..');
const text = methodologyPlainText();
for (const label of Object.values({
  ...LIVE_STATUS_LABELS,
  ...AUTH_GATE_LABELS,
  ...TOOLS_SOURCE_LABELS,
  ...DEMOWARE_TIER_LABELS,
})) {
  assert.ok(text.includes(label), `methodology missing UI label: ${label}`);
}
assert.match(text, /not a safety score/i);
assert.match(text, /ok_empty/);
assert.match(text, /does not currently treat ok_empty as Live OK/);
assert.match(text, /We do not call the tools/);
assert.ok(getMethodology().grade.some((line) => line.includes('Live OK adds 40')));

const now = new Date('2026-10-29T12:00:00.000Z');
const remote = {
  transport: 'http',
  mcp_endpoint: 'https://example.com/mcp',
  tools: [{ name: 'a' }, { name: 'b' }, { name: 'c' }, { name: 'd' }, { name: 'e' }],
};
const grade = computeVerificationGrade(remote, {
  liveStatus: 'live_ok',
  toolCount: 5,
  probedAt: '2026-10-28T12:00:00.000Z',
  now,
});
assert.deepStrictEqual(
  [...grade.parts].sort(),
  ['five_tools +10', 'https +15', 'indexed_tool +20', 'live_ok +40', 'probed_within_7d +15'].sort(),
);
assert.strictEqual(grade.score, 100);
assert.strictEqual(grade.letter, 'A');

const again = computeVerificationGrade(remote, {
  liveStatus: 'live_ok',
  toolCount: 5,
  probedAt: '2026-10-28T12:00:00.000Z',
  now,
});
assert.deepStrictEqual(again, grade);

const auth = computeVerificationGrade(remote, {
  liveStatus: 'auth_required',
  toolCount: 1,
  probedAt: '2026-10-01T00:00:00.000Z',
  now,
});
assert.strictEqual(auth.score, 60);
assert.strictEqual(auth.letter, 'B');

const local = computeVerificationGrade(
  { transport: 'stdio', tools: [{ name: 'read' }] },
  { liveStatus: 'local_unprobed', toolCount: 1, probedAt: null, now },
);
assert.strictEqual(local.score, 30);
assert.strictEqual(local.letter, 'D');

const signals = computeQualitySignals(remote, {
  endpoint_status: 'ok',
  validated_at: '2026-10-28T12:00:00.000Z',
  validation_method: 'live_mcp',
});
assert.strictEqual(signals.safety_badge, null);
assert.strictEqual(
  signals.verification_grade,
  computeVerificationGrade(remote, {
    liveStatus: 'live_ok',
    toolCount: 5,
    probedAt: '2026-10-28T12:00:00.000Z',
  }).score,
);
assert.ok(['A', 'B', 'C', 'D'].includes(signals.verification_grade_letter));
assert.match(signals.verification_grade_label, /Verification grade/);

process.env.MCP_PROBE_HISTORY_PATH = path.join(os.tmpdir(), `mcp-probe-history-${process.pid}.json`);
const history = require('../services/mcpProbeHistory');
assert.strictEqual(history.uptimeFromSamples([
  { at: '2026-10-28T00:00:00.000Z', status: 'live_ok' },
], now), null);
const uptime = history.uptimeFromSamples([
  { at: '2026-10-20T00:00:00.000Z', status: 'live_ok' },
  { at: '2026-10-21T00:00:00.000Z', status: 'unreachable' },
], now);
assert.strictEqual(uptime.days, 2);
assert.strictEqual(uptime.responded, 1);
assert.strictEqual(uptime.ratio, 0.5);

history.appendProbeSamples([
  { slug: 'Demo', at: '2026-10-20T00:00:00.000Z', status: 'ok', latency_ms: 120 },
  { slug: 'demo', at: '2026-10-21T00:00:00.000Z', status: 'auth_required', latency_ms: 80 },
]);
const summary = history.buildVerificationSummary({
  slug: 'demo',
  transport: 'http',
  mcp_endpoint: 'https://example.com/mcp',
  quality: signals,
}, now);
assert.strictEqual(summary.grade_letter, signals.verification_grade_letter);
assert.strictEqual(summary.latency_ms, 80);
assert.strictEqual(summary.history.length, 2);
assert.strictEqual(summary.history[0].status, 'auth_required');
assert.strictEqual(summary.history[0].latency_ms, 80);
assert.strictEqual(summary.uptime_label, '100% of 2 samples over 2 days');
assert.match(summary.transport, /HTTPS/);
fs.unlinkSync(process.env.MCP_PROBE_HISTORY_PATH);

const footer = fs.readFileSync(path.join(ROOT, 'views/partials/registry-footer.ejs'), 'utf8');
const badge = fs.readFileSync(path.join(ROOT, 'views/partials/mcp-handshake-badge.ejs'), 'utf8');
const listing = fs.readFileSync(path.join(ROOT, 'views/mcp-server.ejs'), 'utf8');
const route = fs.readFileSync(path.join(ROOT, 'services/staticService.js'), 'utf8');
assert.match(footer, /href="\/methodology"/);
assert.match(badge, /href="\/methodology"/);
assert.match(listing, /verification\.grade_letter/);
assert.match(route, /app\.get\('\/methodology'/);
assert.match(route, /\/methodology'/);

console.log('methodology and verification grade OK');
