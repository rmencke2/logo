/**
 * Honest MCP listing quality signals — facts from catalog + live probe state.
 * Never produces a "SAFE" / install-approved verdict.
 */

/** @typedef {'live_ok' | 'auth_required' | 'unreachable' | 'not_probed' | 'local_unprobed'} LiveStatus */
/** @typedef {'required' | 'none_detected' | 'unknown'} AuthGate */
/** @typedef {'live' | 'registry' | 'catalog' | 'none'} ToolsSource */
/** @typedef {'ready' | 'indexed' | 'thin' | 'unverified'} DemowareTier */

const LIVE_STATUS_LABELS = {
  live_ok: 'Live OK',
  auth_required: 'Auth required',
  unreachable: 'Unreachable',
  not_probed: 'Not probed',
  local_unprobed: 'Local only',
};

const AUTH_GATE_LABELS = {
  required: 'Auth gate',
  none_detected: 'No auth gate seen',
  unknown: 'Auth unknown',
};

const TOOLS_SOURCE_LABELS = {
  live: 'tools/list (live)',
  registry: 'Registry fallback',
  catalog: 'Catalog tools',
  none: 'No tools indexed',
};

const DEMOWARE_TIER_LABELS = {
  ready: 'Ready surface',
  indexed: 'Tools indexed',
  thin: 'Thin listing',
  unverified: 'Unverified',
};

/**
 * @param {object} server
 * @returns {boolean}
 */
function hasHttpEndpoint(server) {
  const url = server.mcp_endpoint || server.deployment_url || server.primary_url || server.connection_url || '';
  return /^https?:\/\//i.test(String(url));
}

/**
 * @param {object} server
 * @returns {boolean}
 */
function isLocalTransport(server) {
  const t = String(server.transport || '').toLowerCase();
  return t === 'stdio' || t === 'local';
}

/**
 * @param {object|null|undefined} entry - row from mcp-validation-state.json
 * @param {object} server
 * @returns {LiveStatus}
 */
function resolveLiveStatus(server, entry) {
  const endpointStatus = entry?.endpoint_status ? String(entry.endpoint_status) : '';
  if (endpointStatus === 'ok') return 'live_ok';
  if (endpointStatus === 'auth_required') return 'auth_required';
  if (endpointStatus === 'unreachable' || endpointStatus === 'error') return 'unreachable';

  const method = String(entry?.validation_method || '');
  if (method.startsWith('live_mcp') && !endpointStatus) {
    // Live path without endpoint_status — treat as probed but inconclusive
    return 'not_probed';
  }

  if (!hasHttpEndpoint(server) && isLocalTransport(server)) return 'local_unprobed';
  return 'not_probed';
}

/**
 * @param {LiveStatus} liveStatus
 * @returns {AuthGate}
 */
function resolveAuthGate(liveStatus) {
  if (liveStatus === 'auth_required') return 'required';
  if (liveStatus === 'live_ok') return 'none_detected';
  return 'unknown';
}

/**
 * @param {object} server
 * @param {object|null|undefined} entry
 * @returns {ToolsSource}
 */
function resolveToolsSource(server, entry) {
  const toolCount = Array.isArray(server.tools) ? server.tools.length : 0;
  if (toolCount <= 0) return 'none';

  const method = String(entry?.validation_method || server.tools_validation_method || '');
  if (method.includes('live_mcp')) return 'live';
  if (method.includes('smithery') || method.includes('registry')) return 'registry';
  return 'catalog';
}

/**
 * Demoware-style tier from observable facts (not a safety score).
 * @param {object} server
 * @param {LiveStatus} liveStatus
 * @param {number} toolCount
 * @returns {DemowareTier}
 */
function resolveDemowareTier(server, liveStatus, toolCount) {
  const transport = String(server.transport || 'unknown').toLowerCase();
  const knownTransport = transport === 'http' || transport === 'sse' || transport === 'stdio';
  const liveEvidence = liveStatus === 'live_ok' || liveStatus === 'auth_required';
  const curated = server.source === 'manual' || Boolean(server.official);

  if (toolCount >= 2 && knownTransport && (liveEvidence || curated)) return 'ready';
  if (toolCount >= 1 && knownTransport) return 'indexed';
  if (toolCount === 1 || (toolCount === 0 && (hasHttpEndpoint(server) || server.docs_url || server.github_url))) {
    return 'thin';
  }
  return 'unverified';
}

/**
 * @param {object} server
 * @param {object|null|undefined} [validationEntry]
 * @returns {object}
 */
function computeQualitySignals(server, validationEntry = null) {
  const toolCount = Array.isArray(server.tools) ? server.tools.length : 0;
  const liveStatus = resolveLiveStatus(server, validationEntry);
  const authGate = resolveAuthGate(liveStatus);
  const toolsSource = resolveToolsSource(server, validationEntry);
  const demowareTier = resolveDemowareTier(server, liveStatus, toolCount);
  const probedAt = validationEntry?.validated_at || server.tools_validated_at || null;
  const validationMethod = validationEntry?.validation_method || server.tools_validation_method || null;

  const badges = [];
  // Primary: demoware / tools honesty
  if (demowareTier === 'ready' || demowareTier === 'indexed') {
    badges.push({
      key: demowareTier,
      label: DEMOWARE_TIER_LABELS[demowareTier],
      kind: 'tools',
    });
  } else {
    badges.push({
      key: demowareTier,
      label: DEMOWARE_TIER_LABELS[demowareTier],
      kind: 'caution',
    });
  }
  // Secondary: live handshake fact when we have one
  if (liveStatus === 'live_ok' || liveStatus === 'auth_required' || liveStatus === 'unreachable') {
    badges.push({
      key: liveStatus,
      label: LIVE_STATUS_LABELS[liveStatus],
      kind: liveStatus === 'live_ok' ? 'live' : liveStatus === 'auth_required' ? 'auth' : 'caution',
    });
  }

  return {
    live_status: liveStatus,
    live_status_label: LIVE_STATUS_LABELS[liveStatus],
    auth_gate: authGate,
    auth_gate_label: AUTH_GATE_LABELS[authGate],
    tools_source: toolsSource,
    tools_source_label: TOOLS_SOURCE_LABELS[toolsSource],
    tools_indexed: toolCount > 0,
    tool_count: toolCount,
    demoware_tier: demowareTier,
    demoware_tier_label: DEMOWARE_TIER_LABELS[demowareTier],
    probed_at: probedAt,
    validation_method: validationMethod,
    badges: badges.slice(0, 2),
    // Explicit: this is not a safety verdict
    safety_badge: null,
    note:
      demowareTier === 'unverified' || demowareTier === 'thin'
        ? 'Listing facts only — handshake the live tools/list before you connect.'
        : 'Observable catalog + probe facts — not a safe-to-install badge.',
  };
}

/**
 * Ranking nudge for Discovery / search (never a veto).
 * @param {object} quality
 * @returns {number}
 */
function qualityRankBoost(quality) {
  if (!quality) return 0;
  let boost = 0;
  if (quality.demoware_tier === 'ready') boost += 10;
  else if (quality.demoware_tier === 'indexed') boost += 6;
  else if (quality.demoware_tier === 'thin') boost -= 4;
  else if (quality.demoware_tier === 'unverified') boost -= 8;

  if (quality.live_status === 'live_ok') boost += 5;
  else if (quality.live_status === 'auth_required') boost += 3;
  else if (quality.live_status === 'unreachable') boost -= 6;

  if (quality.tools_source === 'live') boost += 3;
  else if (quality.tools_source === 'none') boost -= 2;

  return boost;
}

/**
 * Compact summary fields for Discovery / API responses.
 * @param {object} quality
 */
function summarizeQuality(quality) {
  if (!quality) return null;
  return {
    live_status: quality.live_status,
    live_status_label: quality.live_status_label,
    auth_gate: quality.auth_gate,
    tools_source: quality.tools_source,
    tools_indexed: quality.tools_indexed,
    demoware_tier: quality.demoware_tier,
    demoware_tier_label: quality.demoware_tier_label,
    probed_at: quality.probed_at,
    safety_badge: null,
  };
}

module.exports = {
  computeQualitySignals,
  qualityRankBoost,
  summarizeQuality,
  LIVE_STATUS_LABELS,
  AUTH_GATE_LABELS,
  TOOLS_SOURCE_LABELS,
  DEMOWARE_TIER_LABELS,
};
