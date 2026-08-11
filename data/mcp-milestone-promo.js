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
  eyebrow: 'We hit it',
  headline: '6,000 MCP servers. This is huge.',
  blurb:
    'From 1,500 in June to six thousand now — the MCP registry just crossed a line you cannot unsee. Browse the catalog, or submit the next one.',
  primaryCta: 'Read the story',
  primaryHref: '/news/mcp-directory-passes-6000-servers',
  secondaryCta: 'Browse all 6,000+',
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
    secondaryCta: `Browse all ${n.toLocaleString()}`,
  };
}

module.exports = {
  getMilestonePromo,
  MILESTONE,
};
