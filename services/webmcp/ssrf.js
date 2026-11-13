'use strict';

/**
 * SSRF-safe URL checks for the WebMCP scanner.
 */

const dns = require('dns').promises;
const net = require('net');
const { normalizeHost, normalizeHttpsUrl } = require('./normalize');

function isPrivateIpv4(raw) {
  const parts = String(raw || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function mappedIpv4(raw) {
  const dotted = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) return dotted[1];
  const hex = raw.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  const n = (hi << 16) + lo;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function isPrivateIp(ip) {
  const raw = String(ip || '').trim().toLowerCase();
  if (!raw) return true;
  if (raw === '::1' || raw === '::' || raw === '0.0.0.0') return true;
  if (raw.startsWith('fc') || raw.startsWith('fd') || raw.startsWith('fe80') || raw.startsWith('64:ff9b:')) {
    return true;
  }

  const mapped = mappedIpv4(raw);
  if (mapped) return isPrivateIpv4(mapped);

  if (net.isIPv4(raw)) return isPrivateIpv4(raw);
  if (net.isIPv6(raw)) return false;
  return true;
}

function coerceHttpsUrl(input) {
  let raw = String(input || '').trim();
  if (!raw) return '';
  // Strip accidental whitespace / wrapping quotes
  raw = raw.replace(/^['"]|['"]$/g, '');
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, '')}`;
  }
  return raw;
}

async function assertSafePublicUrl(input, { allowHttp = false } = {}) {
  let url;
  try {
    url = new URL(coerceHttpsUrl(input));
  } catch {
    throw new Error('Invalid URL');
  }

  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new Error('Only https URLs are allowed');
  }
  if (url.username || url.password) {
    throw new Error('URLs with credentials are not allowed');
  }

  const hostname = String(url.hostname || '').toLowerCase().replace(/\.$/, '');
  if (!hostname) throw new Error('Invalid hostname');
  if (/^\d+$/.test(hostname)) throw new Error('Numeric hostnames are not allowed');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal' ||
    hostname === 'metadata' ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Local hostnames are not allowed');
  }
  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error('Private IP addresses are not allowed');
  }

  const host = normalizeHost(hostname) || hostname;
  if (!host || (!host.includes('.') && !net.isIP(host))) {
    throw new Error('Invalid hostname');
  }

  let address = net.isIP(host) ? host : '';
  if (!net.isIP(host)) {
    let records;
    try {
      records = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
      throw new Error('Hostname could not be resolved');
    }
    if (!records.length) throw new Error('Hostname could not be resolved');
    for (const rec of records) {
      if (isPrivateIp(rec.address)) {
        throw new Error('Hostname resolves to a private address');
      }
    }
    const v4 = records.find((rec) => net.isIPv4(rec.address));
    address = (v4 || records[0]).address;
  }

  url.hash = '';
  return {
    href: url.toString(),
    origin: url.origin,
    host: normalizeHost(host) || host.replace(/^www\./, ''),
    canonical: normalizeHttpsUrl(url.toString(), host),
    address,
  };
}

const fetchDecisionCache = new Map();
const FETCH_DECISION_TTL_MS = 60 * 1000;

function cacheFetchDecision(hostname, ok) {
  if (fetchDecisionCache.size > 500) fetchDecisionCache.clear();
  fetchDecisionCache.set(hostname, { ok, exp: Date.now() + FETCH_DECISION_TTL_MS });
}

/**
 * True when a browser request must not be sent. Used by the scanner so a
 * redirect or a later DNS answer cannot reach a private or metadata address.
 */
async function isUnsafeFetchTarget(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return true;
  }
  if (url.protocol === 'data:' || url.protocol === 'blob:' || url.protocol === 'about:') return false;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;

  const hostname = String(url.hostname || '').replace(/\.$/, '').toLowerCase();
  const cached = fetchDecisionCache.get(hostname);
  if (cached && cached.exp > Date.now()) return !cached.ok;

  try {
    await assertSafePublicUrl(`${url.protocol}//${url.host}/`);
    cacheFetchDecision(hostname, true);
    return false;
  } catch {
    cacheFetchDecision(hostname, false);
    return true;
  }
}

function isSameOrigin(candidate, origin) {
  try {
    const u = new URL(candidate, origin);
    return u.origin === origin && (u.protocol === 'https:' || u.protocol === 'http:');
  } catch {
    return false;
  }
}

module.exports = {
  isPrivateIp,
  coerceHttpsUrl,
  assertSafePublicUrl,
  isSameOrigin,
  isUnsafeFetchTarget,
};
