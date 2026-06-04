/**
 * MCP directory branding: Clearbit logos, category colors, transport badges.
 */

const { SLUG_LOGO_DOMAINS, GITHUB_OWNER_DOMAINS } = require('../data/logo-domains');
const MCP_AFFILIATE_LINKS = require('../data/mcp-affiliate-links');

const CLEARBIT_LOGO_BASE = 'https://logo.clearbit.com';

/** @type {Record<string, { border: string; badgeBg: string; badgeText: string; tileBg: string; tileText: string; borderDark: string; badgeBgDark: string; badgeTextDark: string; tileBgDark: string; tileTextDark: string }>} */
const CATEGORY_STYLES = {
  'Dev Tools': {
    border: '#3B82F6',
    badgeBg: '#EFF6FF',
    badgeText: '#1D4ED8',
    tileBg: '#3B82F6',
    tileText: '#FFFFFF',
    borderDark: '#60A5FA',
    badgeBgDark: '#1E3A5F',
    badgeTextDark: '#93C5FD',
    tileBgDark: '#2563EB',
    tileTextDark: '#EFF6FF',
  },
  'Search & Web': {
    border: '#8B5CF6',
    badgeBg: '#F5F3FF',
    badgeText: '#6D28D9',
    tileBg: '#8B5CF6',
    tileText: '#FFFFFF',
    borderDark: '#A78BFA',
    badgeBgDark: '#2E1065',
    badgeTextDark: '#C4B5FD',
    tileBgDark: '#7C3AED',
    tileTextDark: '#F5F3FF',
  },
  Databases: {
    border: '#10B981',
    badgeBg: '#ECFDF5',
    badgeText: '#047857',
    tileBg: '#10B981',
    tileText: '#FFFFFF',
    borderDark: '#34D399',
    badgeBgDark: '#064E3B',
    badgeTextDark: '#6EE7B7',
    tileBgDark: '#059669',
    tileTextDark: '#ECFDF5',
  },
  Design: {
    border: '#EC4899',
    badgeBg: '#FDF2F8',
    badgeText: '#BE185D',
    tileBg: '#EC4899',
    tileText: '#FFFFFF',
    borderDark: '#F472B6',
    badgeBgDark: '#500724',
    badgeTextDark: '#F9A8D4',
    tileBgDark: '#DB2777',
    tileTextDark: '#FDF2F8',
  },
  'Cloud & Infra': {
    border: '#F97316',
    badgeBg: '#FFF7ED',
    badgeText: '#C2410C',
    tileBg: '#F97316',
    tileText: '#FFFFFF',
    borderDark: '#FB923C',
    badgeBgDark: '#431407',
    badgeTextDark: '#FDBA74',
    tileBgDark: '#EA580C',
    tileTextDark: '#FFF7ED',
  },
  Communication: {
    border: '#14B8A6',
    badgeBg: '#F0FDFA',
    badgeText: '#0F766E',
    tileBg: '#14B8A6',
    tileText: '#FFFFFF',
    borderDark: '#2DD4BF',
    badgeBgDark: '#134E4A',
    badgeTextDark: '#5EEAD4',
    tileBgDark: '#0D9488',
    tileTextDark: '#F0FDFA',
  },
  'Data & Analytics': {
    border: '#6366F1',
    badgeBg: '#EEF2FF',
    badgeText: '#4338CA',
    tileBg: '#6366F1',
    tileText: '#FFFFFF',
    borderDark: '#818CF8',
    badgeBgDark: '#312E81',
    badgeTextDark: '#A5B4FC',
    tileBgDark: '#4F46E5',
    tileTextDark: '#EEF2FF',
  },
  'Security & Monitoring': {
    border: '#EF4444',
    badgeBg: '#FEF2F2',
    badgeText: '#B91C1C',
    tileBg: '#EF4444',
    tileText: '#FFFFFF',
    borderDark: '#F87171',
    badgeBgDark: '#450A0A',
    badgeTextDark: '#FCA5A5',
    tileBgDark: '#DC2626',
    tileTextDark: '#FEF2F2',
  },
  'Payments & Commerce': {
    border: '#F59E0B',
    badgeBg: '#FFFBEB',
    badgeText: '#B45309',
    tileBg: '#F59E0B',
    tileText: '#FFFFFF',
    borderDark: '#FBBF24',
    badgeBgDark: '#422006',
    badgeTextDark: '#FCD34D',
    tileBgDark: '#D97706',
    tileTextDark: '#FFFBEB',
  },
  'AI & Memory': {
    border: '#7C3AED',
    badgeBg: '#F5F3FF',
    badgeText: '#5B21B6',
    tileBg: '#7C3AED',
    tileText: '#FFFFFF',
    borderDark: '#A78BFA',
    badgeBgDark: '#2E1065',
    badgeTextDark: '#C4B5FD',
    tileBgDark: '#6D28D9',
    tileTextDark: '#F5F3FF',
  },
  'Files & Docs': {
    border: '#64748B',
    badgeBg: '#F8FAFC',
    badgeText: '#334155',
    tileBg: '#64748B',
    tileText: '#FFFFFF',
    borderDark: '#94A3B8',
    badgeBgDark: '#1E293B',
    badgeTextDark: '#CBD5E1',
    tileBgDark: '#475569',
    tileTextDark: '#F8FAFC',
  },
  Automation: {
    border: '#06B6D4',
    badgeBg: '#ECFEFF',
    badgeText: '#0E7490',
    tileBg: '#06B6D4',
    tileText: '#FFFFFF',
    borderDark: '#22D3EE',
    badgeBgDark: '#164E63',
    badgeTextDark: '#67E8F9',
    tileBgDark: '#0891B2',
    tileTextDark: '#ECFEFF',
  },
};

const DEFAULT_CATEGORY_STYLE = CATEGORY_STYLES['Dev Tools'];

function getCategoryStyle(category) {
  return CATEGORY_STYLES[category] || DEFAULT_CATEGORY_STYLE;
}

function hostnameFromUrl(url) {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host === 'github.com' || host === 'gitlab.com' || host === 'localhost') return null;
    return host;
  } catch {
    return null;
  }
}

function githubOwnerFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname !== 'github.com') return null;
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] ? parts[0].toLowerCase() : null;
  } catch {
    return null;
  }
}

function domainFromSlug(slug) {
  if (!slug) return null;
  if (SLUG_LOGO_DOMAINS[slug]) return SLUG_LOGO_DOMAINS[slug];
  const normalized = slug.replace(/_/g, '-');
  if (SLUG_LOGO_DOMAINS[normalized]) return SLUG_LOGO_DOMAINS[normalized];
  return null;
}

/**
 * @param {object} server
 */
function resolveLogoDomain(server) {
  const slug = server.slug || server.id;
  const mapped = domainFromSlug(slug);
  if (mapped) return mapped;

  const owner = githubOwnerFromUrl(server.github_url);
  if (owner && GITHUB_OWNER_DOMAINS[owner]) return GITHUB_OWNER_DOMAINS[owner];

  const docsHost = hostnameFromUrl(server.docs_url);
  if (docsHost && !docsHost.includes('smithery.ai') && !docsHost.includes('glama.ai')) {
    return docsHost;
  }

  const ghHost = hostnameFromUrl(server.github_url);
  if (ghHost) return ghHost;

  if (owner) return `${owner}.com`;

  const smitheryHost = hostnameFromUrl(server.smithery_page_url);
  if (smitheryHost && smitheryHost !== 'smithery.ai') return smitheryHost;

  return null;
}

function clearbitLogoUrl(domain) {
  if (!domain) return null;
  return `${CLEARBIT_LOGO_BASE}/${domain}`;
}

/** Reliable fallback when Clearbit has no logo or hotlink fails */
function faviconLogoUrl(domain) {
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function logoInitial(name) {
  const n = String(name || '?').trim();
  const m = n.match(/[A-Za-z0-9]/);
  return (m ? m[0] : '?').toUpperCase();
}

function isRemoteServer(server) {
  const t = String(server.transport || '').toLowerCase();
  if (t === 'http' || t === 'sse') return true;
  if (server.mcp_endpoint || server.deployment_url || server.connection_url) return true;
  if (server.smithery_page_url || server.source === 'smithery') return true;
  return false;
}

function transportBadgeLabel(server) {
  return isRemoteServer(server) ? 'Remote' : 'Local';
}

/**
 * @param {object} server
 */
function getAffiliateForServer(server) {
  if (server?.affiliate_url) {
    return {
      url: server.affiliate_url,
      headline: server.affiliate_headline || `Get ${server.name}`,
      description: server.affiliate_description || '',
      cta: server.affiliate_cta || `Try ${server.name} →`,
      provider: server.name,
    };
  }
  const slug = server?.slug || server?.id;
  return slug ? MCP_AFFILIATE_LINKS[slug] || null : null;
}

function attachBranding(server) {
  const categoryStyle = getCategoryStyle(server.category);
  const logoDomain = resolveLogoDomain(server);
  const logoUrl = clearbitLogoUrl(logoDomain);
  const logoFallbackUrl = faviconLogoUrl(logoDomain);
  const initial = logoInitial(server.name);
  const remote = isRemoteServer(server);
  const affiliate = getAffiliateForServer(server);

  return {
    ...server,
    logoDomain: logoDomain || undefined,
    logoUrl: logoUrl || undefined,
    logoFallbackUrl: logoFallbackUrl || undefined,
    logoInitial: initial,
    categoryStyle,
    transportBadge: transportBadgeLabel(server),
    isRemote: remote,
    affiliate: affiliate || undefined,
  };
}

function attachBrandingList(servers) {
  return servers.map(attachBranding);
}

function getCategoryStylesForClient() {
  return CATEGORY_STYLES;
}

module.exports = {
  CATEGORY_STYLES,
  CLEARBIT_LOGO_BASE,
  getCategoryStyle,
  resolveLogoDomain,
  clearbitLogoUrl,
  logoInitial,
  isRemoteServer,
  transportBadgeLabel,
  attachBranding,
  attachBrandingList,
  getCategoryStylesForClient,
};
