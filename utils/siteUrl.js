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
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return false;
  if (path.includes('\\') || path.includes('://') || /[\u0000-\u001F\u007F]/.test(path)) return false;
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return false;
  if (decoded.includes('\\') || decoded.includes('://') || /[\u0000-\u001F\u007F]/.test(decoded)) return false;
  return true;
}

module.exports = {
  normalizeHttpsOrigin,
  getConfiguredBaseUrl,
  getPublicSiteOrigin,
  absoluteSiteUrl,
  isSafeInternalRedirect,
};
