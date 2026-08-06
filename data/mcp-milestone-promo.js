/**
 * Temporary celebration promo for the ~6,000 MCP server milestone.
 * Returns null when inactive so banners disappear cleanly.
 */

const MILESTONE = {
  id: 'mcp-6000',
  /** Show while catalog is in this range (inclusive). */
  minServers: 5900,
  maxServers: 6499,
  /** Hard stop date (UTC), even if still under maxServers. */
  endsOn: '2026-09-15',
  eyebrow: 'Milestone',
  headline: 'Almost 6,000 MCP servers',
  blurb:
    'The Influzer registry is days from six thousand listings — search the full catalog or submit what we are still missing.',
  primaryCta: 'Read the brief',
  primaryHref: '/news/mcp-directory-approaches-6000-servers',
  secondaryCta: 'Browse full directory',
  secondaryHref: '/mcp/all',
  tertiaryCta: 'Submit a server',
  tertiaryHref: '/mcp/submit',
};

/**
 * @param {number} totalServers
 * @param {Date} [now]
 */
function getMilestonePromo(totalServers, now = new Date()) {
  const n = Number(totalServers) || 0;
  if (n < MILESTONE.minServers || n > MILESTONE.maxServers) return null;
  if (now.toISOString().slice(0, 10) > MILESTONE.endsOn) return null;
  return {
    ...MILESTONE,
    serverCount: n,
    serverCountLabel: n.toLocaleString(),
  };
}

module.exports = {
  getMilestonePromo,
  MILESTONE,
};
