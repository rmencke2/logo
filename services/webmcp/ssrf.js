'use strict';

/**
 * SSRF-safe URL checks for the WebMCP scanner.
 */

const dns = require('dns').promises;
const net = require('net');
const { normalizeHost, normalizeHttpsUrl } = require('./normalize');

function isPrivateIp(ip) {
  const raw = String(ip || '').trim().toLowerCase();
  if (!raw) return true;
  if (raw === '::1' || raw === '0.0.0.0') return true;
  if (raw.startsWith('fc') || raw.startsWith('fd') || raw.startsWith('fe80')) return true;

  if (net.isIPv4(raw)) {
    const parts = raw.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast/reserved
    return false;
  }

  if (net.isIPv6(raw)) {
    if (raw === '::' || raw.startsWith('::ffff:127.') || raw.startsWith('::ffff:10.')) return true;
    if (raw.startsWith('::ffff:192.168.') || raw.startsWith('::ffff:169.254.')) return true;
    return false;
  }

  return true;
}

async function assertSafePublicUrl(input, { allowHttp = false } = {}) {
  let url;
  try {
    url = new URL(String(input || '').trim());
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
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Local hostnames are not allowed');
  }
  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error('Private IP addresses are not allowed');
  }

  const host = normalizeHost(hostname) || hostname;
  if (!host || (!host.includes('.') && !net.isIP(host))) {
    throw new Error('Invalid hostname');
  }

  // Block obvious cloud metadata hosts
  if (host === 'metadata.google.internal' || host === 'metadata' || host.endsWith('.internal')) {
    throw new Error('Internal hostnames are not allowed');
  }

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
  }

  url.hash = '';
  return {
    href: url.toString(),
    origin: url.origin,
    host: normalizeHost(host) || host.replace(/^www\./, ''),
    canonical: normalizeHttpsUrl(url.toString(), host),
  };
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
  assertSafePublicUrl,
  isSameOrigin,
};
