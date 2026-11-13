/**
 * MCP directory branding: stored or same-origin logos, category colors, transport badges.
 * Remote logo CDNs (Clearbit and similar) are not requested.
 */

const fs = require('fs');
const path = require('path');
const { MCP_AFFILIATE_LINKS } = require('../data/mcp-affiliate-links');

const LOCAL_LOGO_DIR = path.join(__dirname, '..', 'public', 'images', 'mcp-logos');
const LOCAL_LOGO_EXT = new Set(['.png', '.svg', '.webp', '.jpg', '.jpeg']);
const STORED_LOGO_FIELDS = ['logo_url', 'logo', 'icon_url', 'logoUrl'];

/** @type {Map<string, string> | null} */
let localLogoIndex = null;

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

function readLocalLogoIndex() {
  if (localLogoIndex) return localLogoIndex;
  localLogoIndex = new Map();
  let names = [];
  try {
    names = fs.readdirSync(LOCAL_LOGO_DIR);
  } catch {
    return localLogoIndex;
  }
  for (const name of names) {
    const ext = path.extname(name).toLowerCase();
    if (!LOCAL_LOGO_EXT.has(ext)) continue;
    const slug = path.basename(name, path.extname(name)).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug) || localLogoIndex.has(slug)) continue;
    localLogoIndex.set(slug, `/images/mcp-logos/${name}`);
  }
  return localLogoIndex;
}

function isSafeSameOriginPath(value) {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (value.includes('..') || value.includes('\\') || value.includes('\0')) return false;
  return /^\/[A-Za-z0-9._~/-]+(?:\?[A-Za-z0-9._~%=&+-]*)?$/.test(value);
}

/** Logo CDNs and favicon proxies. Listings must not hotlink these. */
function isLogoCdnUrl(urlString) {
  const lower = String(urlString || '').toLowerCase();
  if (lower.includes('clearbit') || lower.includes('/s2/favicons')) return true;
  let host = '';
  try {
    host = new URL(urlString, 'https://www.influzer.ai').hostname.toLowerCase();
  } catch {
    return true;
  }
  if (host === 'clearbit.com' || host.endsWith('.clearbit.com')) return true;
  if (host === 'logo.dev' || host.endsWith('.logo.dev')) return true;
  if (host === 'unavatar.io' || host.endsWith('.unavatar.io')) return true;
  if (host === 'icons.duckduckgo.com' || host === 'logo.uplead.com') return true;
  if (host === 'favicon.yandex.net' || host === 'icon.horse') return true;
  return false;
}

function storedLogoUrl(server) {
  for (const field of STORED_LOGO_FIELDS) {
    const raw = server?.[field];
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (!value || isLogoCdnUrl(value)) continue;
    if (isSafeSameOriginPath(value)) return value;
    try {
      const parsed = new URL(value);
      if (parsed.username || parsed.password || parsed.protocol !== 'https:') continue;
      const host = parsed.hostname.toLowerCase();
      if (host === 'influzer.ai' || host === 'www.influzer.ai') {
        const pathAndQuery = `${parsed.pathname}${parsed.search}`;
        if (isSafeSameOriginPath(pathAndQuery)) return pathAndQuery;
        continue;
      }
      if (!isLogoCdnUrl(value)) return value;
    } catch {
      continue;
    }
  }
  return null;
}

function localLogoUrl(server) {
  const slug = String(server?.slug || server?.id || '')
    .trim()
    .toLowerCase();
  if (!slug) return null;
  return readLocalLogoIndex().get(slug) || null;
}

/**
 * 1. Logo already stored on the listing (same-origin, or a non-CDN URL).
 * 2. Same-origin file public/images/mcp-logos/{slug}.
 * 3. null — templates show the letter tile. No remote logo host is invented.
 * @param {object} server
 */
function resolveServerLogoUrl(server) {
  return storedLogoUrl(server) || localLogoUrl(server) || null;
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
  const logoUrl = resolveServerLogoUrl(server);
  const initial = logoInitial(server.name);
  const remote = isRemoteServer(server);
  const affiliate = getAffiliateForServer(server);

  const branded = {
    ...server,
    logoInitial: initial,
    categoryStyle,
    transportBadge: transportBadgeLabel(server),
    isRemote: remote,
    affiliate: affiliate || undefined,
  };
  delete branded.logoFallbackUrl;
  delete branded.logoDomain;
  if (logoUrl) branded.logoUrl = logoUrl;
  else delete branded.logoUrl;
  return branded;
}

function attachBrandingList(servers) {
  return servers.map(attachBranding);
}

function getCategoryStylesForClient() {
  return CATEGORY_STYLES;
}

module.exports = {
  CATEGORY_STYLES,
  getCategoryStyle,
  resolveServerLogoUrl,
  logoInitial,
  isRemoteServer,
  transportBadgeLabel,
  attachBranding,
  attachBrandingList,
  getCategoryStylesForClient,
};
