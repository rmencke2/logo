/**
 * Temporary celebration promo for the 6,000+ MCP server milestone.
 * Returns null when inactive so banners disappear cleanly.
 */

const MILESTONE = {
  id: 'mcp-6000-crossed',
  /** Show while catalog is in this range (inclusive). */
  minServers: 6000,
  maxServers: 6999,
  /** Hard stop date (UTC), even if still under maxServers. */
  endsOn: '2026-09-30',
  eyebrow: 'Milestone',
  headline: '6,000+ MCP servers',
  blurb:
    'We just crossed six thousand listings in the Influzer registry — browse the full catalog or submit the next one.',
  primaryCta: 'Read the brief',
  primaryHref: '/news/mcp-directory-passes-6000-servers',
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
