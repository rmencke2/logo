'use strict';

/**
 * Honest labels for the WebMCP catalog size.
 * site_count is how many websites this catalog lists.
 * upstream_total is what webmcp.com reported at the last import.
 * Tool and live counts are never extrapolated to sites that were not imported.
 */

function finiteCount(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function formatExactCount(value) {
  const n = finiteCount(value);
  if (n == null) return null;
  return n.toLocaleString('en-US');
}

function describeWebmcpCoverage({ siteCount, upstreamTotal } = {}) {
  const listed = finiteCount(siteCount);
  const upstream = finiteCount(upstreamTotal);
  const catalogTruncated = listed != null && upstream != null && upstream > listed;
  const listedLabel = listed == null ? null : listed.toLocaleString('en-US');
  const upstreamLabel = upstream == null ? null : upstream.toLocaleString('en-US');
  const coverageNote = catalogTruncated
    ? `This catalog lists ${listedLabel} websites. webmcp.com reported ${upstreamLabel} when the snapshot was taken. Tool and live counts cover the websites listed here.`
    : null;
  return {
    site_count: listed,
    upstream_total: upstream,
    catalog_truncated: catalogTruncated,
    coverage_note: coverageNote,
  };
}

module.exports = {
  describeWebmcpCoverage,
  formatExactCount,
};
