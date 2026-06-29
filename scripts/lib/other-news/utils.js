// Shared helpers for the "In other news..." ingestion pipeline.

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', '..', '..', 'config', 'other-news-sources.config.json');
const ARTICLES_PATH = path.join(__dirname, '..', '..', '..', 'data', 'other-news-articles.json');
const OVERRIDES_PATH = path.join(__dirname, '..', '..', '..', 'data', 'other-news-overrides.json');

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'source',
]);

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function canonicalizeUrl(input) {
  try {
    const url = new URL(input);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }
    let normalized = url.toString();
    if (normalized.endsWith('/') && url.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return String(input || '').trim();
  }
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a, b) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const wa = new Set(na.split(' ').filter((w) => w.length > 2));
  const wb = new Set(nb.split(' ').filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  for (const w of wa) {
    if (wb.has(w)) overlap += 1;
  }
  return overlap / Math.max(wa.size, wb.size);
}

function appendUtm(url, utm) {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('utm_source')) {
      parsed.searchParams.set('utm_source', utm.source);
    }
    if (!parsed.searchParams.has('utm_medium')) {
      parsed.searchParams.set('utm_medium', utm.medium);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function truncate(text, max = 280) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

function daysAgoIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function isWithinRecency(publishedAt, recencyDays) {
  if (!publishedAt) return true;
  const ts = new Date(publishedAt).getTime();
  if (Number.isNaN(ts)) return true;
  return ts >= Date.now() - recencyDays * 24 * 60 * 60 * 1000;
}

module.exports = {
  CONFIG_PATH,
  ARTICLES_PATH,
  OVERRIDES_PATH,
  loadConfig,
  readJson,
  writeJson,
  canonicalizeUrl,
  normalizeTitle,
  titleSimilarity,
  appendUtm,
  truncate,
  daysAgoIso,
  isWithinRecency,
};
