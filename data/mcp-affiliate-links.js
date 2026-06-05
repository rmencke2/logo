/**
 * MCP server slug → affiliate program links.
 * Detail pages use full CTA; homepage/MCP directory use compact promo strip.
 */
const MCP_AFFILIATE_LINKS = {
  webnode: {
    url: 'https://mcp.webnode.com/_mcp',
    headline: 'Build websites with Webnode MCP',
    description:
      'Connect your AI assistant to Webnode and create sites from a prompt. List templates by language, then launch a new project — hosted at mcp.webnode.com.',
    cta: 'Connect Webnode MCP →',
    provider: 'Webnode',
    promoBlurb: 'Create Webnode websites from Claude, Cursor, or any MCP client.',
    promoCta: 'Try Webnode MCP',
    featured: true,
  },
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
const DEFAULT_PROMO_SLUG = 'webnode';

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
    featured: Boolean(entry.featured),
  };
}

module.exports = {
  ...MCP_AFFILIATE_LINKS,
  MCP_AFFILIATE_LINKS,
  getSitePromo,
  DEFAULT_PROMO_SLUG,
};
