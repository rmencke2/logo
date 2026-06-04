/**
 * MCP server slug → affiliate program links.
 * Detail pages use full CTA; homepage/MCP directory use compact promo strip.
 */
const MCP_AFFILIATE_LINKS = {
  firecrawl: {
    url: 'https://firecrawl.link/rasmus-mencke',
    headline: 'Use Firecrawl at scale',
    description:
      'This directory entry covers the Firecrawl MCP server. For hosted scrape, crawl, search, and monitor APIs (1,000 free credits/month), sign up on Firecrawl.',
    cta: 'Try Firecrawl →',
    provider: 'Firecrawl',
    promoBlurb: 'Scrape, crawl, and search the web for your agents — 1,000 free credits/month.',
    promoCta: 'Try Firecrawl free',
  },
};

/** Default promo shown on homepage and MCP directory */
const DEFAULT_PROMO_SLUG = 'firecrawl';

function getSitePromo(slug = DEFAULT_PROMO_SLUG) {
  const entry = MCP_AFFILIATE_LINKS[slug];
  if (!entry) return null;
  return {
    slug,
    url: entry.url,
    provider: entry.provider,
    cta: entry.promoCta || entry.cta.replace(/\s*→\s*$/, ''),
    blurb: entry.promoBlurb || entry.description,
    directoryHref: `/mcp/${slug}`,
  };
}

module.exports = {
  ...MCP_AFFILIATE_LINKS,
  MCP_AFFILIATE_LINKS,
  getSitePromo,
  DEFAULT_PROMO_SLUG,
};
