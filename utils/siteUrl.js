'use strict';

/**
 * Public site URL helpers — keep www as the browser-facing origin.
 * OAuth may still callback on the apex if BASE_URL is apex; session cookies
 * use Domain=.influzer.ai so the session survives the apex → www hop.
 */

function normalizeHttpsOrigin(raw) {
  const value = String(raw || '')
    .trim()
    .replace(/\/$/, '');
  if (!value) return '';
  return value.replace(/^http:\/\//i, 'https://');
}

function getConfiguredBaseUrl() {
  return normalizeHttpsOrigin(process.env.BASE_URL) || 'https://www.influzer.ai';
}

/** Origin used for post-login redirects and absolute links in the browser. */
function getPublicSiteOrigin() {
  const base = getConfiguredBaseUrl();
  if (base === 'https://influzer.ai') return 'https://www.influzer.ai';
  return base;
}

function absoluteSiteUrl(pathOrUrl) {
  const raw = String(pathOrUrl || '/');
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return `${getPublicSiteOrigin()}${path}`;
}

function isSafeInternalRedirect(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//');
}

module.exports = {
  normalizeHttpsOrigin,
  getConfiguredBaseUrl,
  getPublicSiteOrigin,
  absoluteSiteUrl,
  isSafeInternalRedirect,
};
