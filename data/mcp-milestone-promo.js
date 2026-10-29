/**
 * Temporary celebration promo for the catalog range recorded in MILESTONE.
 * Inactive after endsOn. Displayed counts always use the live total passed in.
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
  headline: 'MCP servers listed. This is huge.',
  blurb: 'Browse the catalog, or submit the next one.',
  primaryCta: 'Read the story',
  primaryHref: '/news/mcp-directory-passes-6000-servers',
  secondaryCta: 'Browse the directory',
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
  const label = n.toLocaleString('en-US');
  return {
    ...MILESTONE,
    serverCount: n,
    serverCountLabel: label,
    headline: `${label} MCP servers listed.`,
    secondaryCta: `Browse all ${label}`,
  };
}

module.exports = {
  getMilestonePromo,
  MILESTONE,
};
