'use strict';

/**
 * Compare a stored MCP listing with the publisher's server card.
 * One GET of /.well-known/mcp/server-card.json. Never calls the paid API
 * and never writes the catalog.
 */

const { assertSafePublicUrl } = require('./webmcp/ssrf');

const CARD_PATH = '/.well-known/mcp/server-card.json';
const MAX_CARD_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;

function priceTokens(text) {
  const found = new Set();
  const re = /\$\s?(\d{1,6}(?:\.\d{1,6})?)/g;
  const source = String(text || '');
  let match = re.exec(source);
  while (match) {
    found.add(`$${normalizeAmount(match[1])}`);
    match = re.exec(source);
  }
  return [...found].sort();
}

function normalizeAmount(raw) {
  if (!String(raw).includes('.')) return String(raw);
  return String(raw).replace(/0+$/, '').replace(/\.$/, '');
}

function listingText(listing) {
  const parts = [listing?.description || ''];
  for (const tool of listing?.tools || []) {
    parts.push(tool?.description || '');
  }
  return parts.join('\n');
}

function toolMap(tools) {
  const map = new Map();
  for (const tool of tools || []) {
    const name = String(tool?.name || '').trim();
    if (!name) continue;
    map.set(name, String(tool?.description || '').trim());
  }
  return map;
}

function serverCardUrl(endpoint) {
  const url = new URL(endpoint);
  url.pathname = CARD_PATH;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function parseServerCard(text) {
  let data;
  try {
    data = JSON.parse(String(text || ''));
  } catch {
    const err = new Error('Server card was not JSON');
    err.code = 'bad_card';
    throw err;
  }
  const info = data?.serverInfo && typeof data.serverInfo === 'object' ? data.serverInfo : {};
  const description = String(info.description || data.description || '').trim().slice(0, 4000);
  const tools = [];
  if (Array.isArray(data.tools)) {
    for (const tool of data.tools.slice(0, 80)) {
      const name = String(tool?.name || '').trim().slice(0, 120);
      if (!name) continue;
      tools.push({
        name,
        description: String(tool?.description || '').trim().slice(0, 4000),
      });
    }
  }
  if (!description && !tools.length) {
    const err = new Error('Server card has no description or tools');
    err.code = 'empty_card';
    throw err;
  }
  return { description, tools };
}

function diffListingCopy(stored, live) {
  const storedPrices = priceTokens(listingText(stored));
  const livePrices = priceTokens(listingText(live));
  const priceChanged =
    livePrices.length > 0 &&
    (storedPrices.length !== livePrices.length ||
      storedPrices.some((token, i) => token !== livePrices[i]));

  const oldTools = toolMap(stored?.tools);
  const newTools = toolMap(live?.tools);
  const added = [];
  const removed = [];
  const changed = [];
  if (newTools.size) {
    for (const [name, description] of newTools) {
      if (!oldTools.has(name)) added.push(name);
      else if (oldTools.get(name) !== description) changed.push(name);
    }
    for (const name of oldTools.keys()) {
      if (!newTools.has(name)) removed.push(name);
    }
  }

  return {
    price: { stored: storedPrices, live: livePrices, changed: priceChanged },
    tools: {
      added,
      removed,
      changed,
      live: [...newTools.entries()].map(([name, description]) => ({ name, description })),
    },
    descriptionDiffers: Boolean(
      stored?.description &&
        live?.description &&
        String(stored.description).trim() !== String(live.description).trim(),
    ),
    liveDescription: String(live?.description || ''),
    drifted: priceChanged || added.length > 0 || removed.length > 0 || changed.length > 0,
  };
}

function githubRepoServerJsonUrl(githubUrl) {
  let url;
  try {
    url = new URL(String(githubUrl || '').trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || (host !== 'github.com' && host !== 'www.github.com')) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, '');
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
  return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/server.json`;
}

async function fetchLimited(url, opts = {}) {
  const { fetchImpl, timeoutMs, maxBytes, headers } = opts;
  const doFetch = fetchImpl || fetch;
  const timeout = timeoutMs || DEFAULT_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await doFetch(url, {
      redirect: 'manual',
      signal: ctrl.signal,
      headers: {
        'user-agent': 'InfluzerListingCheck/1.0',
        accept: 'application/json, text/plain;q=0.9, */*;q=0.1',
        ...(headers || {}),
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location && !opts._followed) {
        try {
          const next = new URL(location, url);
          if (next.protocol === 'https:') {
            const safe = await assertSafePublicUrl(next.toString(), { allowHttp: false });
            return fetchLimited(safe.href, { ...opts, _followed: true });
          }
        } catch {
          return { ok: false, status: res.status, error: 'redirect' };
        }
      }
      return { ok: false, status: res.status, error: 'redirect' };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > (maxBytes || MAX_CARD_BYTES)) {
      return { ok: false, status: res.status, error: 'too_large' };
    }
    return { ok: res.ok, status: res.status, body: buf.toString('utf8') };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err?.name === 'AbortError' ? 'timeout' : 'fetch_failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function readServerCard(endpoint, opts = {}) {
  let cardUrl;
  try {
    cardUrl = serverCardUrl(endpoint);
    const safe = await assertSafePublicUrl(cardUrl, { allowHttp: false });
    cardUrl = safe.href;
  } catch (err) {
    return { ok: false, error: err.message || 'URL is not allowed', cardUrl: cardUrl || null };
  }

  const response = await fetchLimited(cardUrl, opts);
  if (!response.ok) {
    const missing = response.status === 404;
    return {
      ok: false,
      status: response.status,
      error: missing
        ? `No server card published at ${cardUrl}`
        : (response.error || `HTTP ${response.status}`),
      cardUrl,
    };
  }
  try {
    return { ok: true, status: response.status, cardUrl, card: parseServerCard(response.body) };
  } catch (err) {
    return { ok: false, status: response.status, error: err.code || err.message, cardUrl };
  }
}

async function readJsonDocument(targetUrl, opts = {}) {
  let cardUrl = targetUrl;
  try {
    const safe = await assertSafePublicUrl(targetUrl, { allowHttp: false });
    cardUrl = safe.href;
  } catch (err) {
    return { ok: false, error: err.message || 'URL is not allowed', cardUrl };
  }
  const response = await fetchLimited(cardUrl, opts);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: response.error || `HTTP ${response.status}`,
      cardUrl,
    };
  }
  try {
    return { ok: true, status: response.status, cardUrl, card: parseServerCard(response.body) };
  } catch (err) {
    return { ok: false, status: response.status, error: err.code || err.message, cardUrl };
  }
}

/**
 * Well-known server card first. Many publishers, including registry servers,
 * never host that file and instead publish server.json on GitHub.
 */
async function readPublisherCopy({ endpoint, githubUrl } = {}, opts = {}) {
  const card = await readServerCard(endpoint, opts);
  if (card.ok) return { ...card, source: 'well-known' };
  const missing = card.status === 404 || card.error === 'empty_card';
  const repoJson = githubRepoServerJsonUrl(githubUrl);
  if (missing && repoJson) {
    const repo = await readJsonDocument(repoJson, opts);
    if (repo.ok) {
      return {
        ...repo,
        source: 'github-server-json',
        wellKnownUrl: card.cardUrl || null,
        wellKnownStatus: card.status || 0,
      };
    }
  }
  return card;
}

function driftFromCard(server, cardResult) {
  const base = {
    slug: server.slug,
    name: server.name || server.slug,
    endpoint: server.mcp_endpoint || server.deployment_url || '',
    cardUrl: cardResult.cardUrl || null,
  };
  if (!cardResult.ok) {
    const missing = cardResult.status === 404 || cardResult.error === 'empty_card';
    return { ...base, kind: missing ? 'no_card' : 'error', error: cardResult.error || `HTTP ${cardResult.status}` };
  }
  const diff = diffListingCopy(server, cardResult.card);
  if (!diff.drifted) return { ...base, kind: 'ok' };
  return {
    ...base,
    kind: 'drift',
    price: diff.price,
    tools_changed: diff.tools.changed,
    tools_added: diff.tools.added,
    tools_removed: diff.tools.removed,
    description_differs: diff.descriptionDiffers,
    live_description: diff.liveDescription.slice(0, 500),
  };
}

module.exports = {
  CARD_PATH,
  priceTokens,
  serverCardUrl,
  parseServerCard,
  diffListingCopy,
  driftFromCard,
  fetchLimited,
  readServerCard,
  githubRepoServerJsonUrl,
  readPublisherCopy,
};
