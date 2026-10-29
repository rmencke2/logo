/**
 * Public methodology copy. Status labels are the same strings the UI renders.
 */

const {
  LIVE_STATUS_LABELS,
  AUTH_GATE_LABELS,
  TOOLS_SOURCE_LABELS,
  DEMOWARE_TIER_LABELS,
} = require('../scripts/utils/mcp-quality');

function statusRows(map, extra) {
  return Object.entries(map).map(([key, label]) => ({
    key,
    label,
    meaning: extra[key] || '',
  }));
}

function getMethodology() {
  return {
    title: 'How Influzer verifies an MCP server',
    summary:
      'A handshake is a timed HTTPS request that speaks MCP initialize and, when that succeeds, tools/list. The verification grade adds that result to other stored facts. It is not a safety score.',
    tested: [
      'The URL is an HTTP or HTTPS address. Anything else is skipped and not probed.',
      'initialize is sent as JSON-RPC with protocol version 2024-11-05 and client name influzer-mcp-validator.',
      'A notifications/initialized message is sent after initialize returns a result.',
      'tools/list is sent on the same session. Tool names and descriptions from that reply are what “live” tools means.',
      'The round trip is timed. The default timeout is MCP_LIVE_TIMEOUT_MS, or 20 seconds when that is unset.',
    ],
    cadence: [
      'The catalog file is refreshed by the weekly registry workflow.',
      'The validation workflow re-checks live endpoints daily and writes data/mcp-validation-state.json.',
      'A public probe at /api/v1/probe and the badge at /api/v1/probe/badge can run the same client on demand.',
      'Each stored probe can append a sample (time, status, latency) to data/mcp-probe-history.json. 30-day uptime is hidden until a server has samples on two different UTC days.',
    ],
    probeStatuses: [
      { key: 'skipped', meaning: 'No HTTP endpoint, so the client did not connect.' },
      { key: 'unreachable', meaning: 'The initialize request failed on the network.' },
      { key: 'auth_required', meaning: 'The server answered and asked for authentication before tools/list could finish.' },
      { key: 'error', meaning: 'The server answered, but initialize or tools/list failed.' },
      { key: 'ok', meaning: 'tools/list returned at least one tool.' },
      { key: 'ok_empty', meaning: 'tools/list returned an empty list. The directory status map does not currently treat ok_empty as Live OK, so the listing can still say Not probed.' },
    ],
    liveStatuses: statusRows(LIVE_STATUS_LABELS, {
      live_ok: 'The stored probe endpoint_status is ok. ok_empty is not mapped to this label.',
      auth_required: 'The stored probe endpoint_status is auth_required.',
      unreachable: 'The stored probe endpoint_status is unreachable, error, or failed.',
      not_probed: 'No mapped probe result. This includes listings we have not probed and ok_empty results.',
      local_unprobed: 'Transport is stdio or local and there is no HTTPS endpoint to probe.',
    }),
    authGates: statusRows(AUTH_GATE_LABELS, {
      required: 'Shown when the live status is Auth required.',
      none_detected: 'Shown when the live status is Live OK. We did not see an auth challenge on that probe. It does not prove the server will stay open.',
      unknown: 'Shown for every other live status.',
    }),
    toolSources: statusRows(TOOLS_SOURCE_LABELS, {
      live: 'The stored validation method includes live_mcp and the catalog has at least one tool.',
      registry: 'The stored validation method mentions smithery or registry and the catalog has at least one tool.',
      catalog: 'The catalog has tools, and the validation method is neither live nor registry.',
      none: 'The catalog tools array is empty.',
    }),
    tiers: statusRows(DEMOWARE_TIER_LABELS, {
      ready: 'At least two indexed tools, a known transport (http, sse, or stdio), and either a live or auth response or a manual/official listing.',
      indexed: 'At least one indexed tool and a known transport, without the ready rule.',
      thin: 'One indexed tool, or no tools but an HTTP endpoint, docs URL, or GitHub URL.',
      unverified: 'None of the rules above.',
    }),
    grade: [
      'The verification grade is 0–100. It is not a safety score.',
      'Live OK adds 40. Auth required adds 25. Other live statuses add nothing.',
      'At least one indexed tool adds 20. Five or more indexed tools add another 10.',
      'An HTTPS endpoint adds 15. If there is no HTTPS endpoint and the transport is stdio or local, that adds 10 instead.',
      'A stored probe timestamp within the last 7 days adds 15.',
      'The score is capped at 100. A is 80–100, B is 60–79, C is 40–59, D is 0–39.',
      'Latency is measured and stored when a probe runs. It is not part of the grade.',
      '30-day uptime is the share of stored samples in that window whose status shows the server responded (live_ok, auth_required, ok, or ok_empty). It is omitted until samples exist on two different UTC days.',
    ],
    notProven: [
      'That the server is safe to install or that its tools do what they claim.',
      'That a tool call succeeds. We do not call the tools.',
      'That resources/list, prompts/list, or sampling work.',
      'That authentication will keep working, or that an open initialize stays open.',
      'That a stdio server runs on your machine. Those are marked local and are not probed over the network.',
    ],
  };
}

function methodologyPlainText() {
  const page = getMethodology();
  const chunks = [
    page.title,
    page.summary,
    ...page.tested,
    ...page.cadence,
    ...page.probeStatuses.flatMap((row) => [row.key, row.meaning]),
    ...page.liveStatuses.flatMap((row) => [row.key, row.label, row.meaning]),
    ...page.authGates.flatMap((row) => [row.key, row.label, row.meaning]),
    ...page.toolSources.flatMap((row) => [row.key, row.label, row.meaning]),
    ...page.tiers.flatMap((row) => [row.key, row.label, row.meaning]),
    ...page.grade,
    ...page.notProven,
  ];
  return chunks.join('\n');
}

module.exports = {
  getMethodology,
  methodologyPlainText,
};
