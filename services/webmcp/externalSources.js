'use strict';

/**
 * External WebMCP directory adapters.
 * Discover candidate sites from third-party registries and curated lists,
 * then diff against Influzer's catalog.
 *
 * These are WebMCP *websites* (browser document.modelContext tools),
 * not classic remote MCP servers.
 */

const fs = require('fs');
const path = require('path');
const { WebMcpDiscoveryProvider, fetchJson } = require('./discoveryProvider');
const { normalizeHost, normalizeHttpsUrl, normalizeSite } = require('./normalize');

const ROOT = path.join(__dirname, '..', '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'webmcp-external-sources.json');
const SITES_PATH = path.join(ROOT, 'data', 'webmcp-sites.json');

const UA = 'InfluzerWebMcpDirectoryBot/1.0 (+https://www.influzer.ai/webmcp/about)';
const DEFAULT_TIMEOUT_MS = Number(process.env.WEBMCP_EXTERNAL_TIMEOUT_MS || 25000);

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadSourceRegistry() {
  return readJson(SOURCES_PATH, { sources: [] });
}

function loadCatalogHosts() {
  const catalog = readJson(SITES_PATH, { sites: [] });
  const byHost = new Map();
  for (const site of catalog.sites || []) {
    if (!site?.host) continue;
    byHost.set(String(site.host).toLowerCase(), site);
  }
  return { catalog, byHost };
}

async function fetchText(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: '*/*', 'User-Agent': UA },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
}

function candidateKey(candidate) {
  return String(candidate.host || '').toLowerCase();
}

function makeCandidate({
  host,
  url,
  name,
  description,
  category,
  site_type,
  tools,
  source_id,
  source_name,
  source_url,
  raw_ref,
}) {
  const resolvedHost = normalizeHost(host || url);
  if (!resolvedHost || isDeniedHost(resolvedHost)) return null;
  const canonical = normalizeHttpsUrl(url || `https://${resolvedHost}/`, resolvedHost);
  return {
    host: resolvedHost,
    url: canonical,
    name: name || resolvedHost,
    description: description || '',
    category: category || 'Uncategorized',
    site_type: site_type || 'live',
    tools: Array.isArray(tools) ? tools : [],
    source_id,
    source_name,
    source_url: source_url || null,
    raw_ref: raw_ref || null,
  };
}

/** webmcp.com / webmcp.cool compatible JSON API */
async function fetchWebmcpApi(source) {
  const provider = new WebMcpDiscoveryProvider({ baseUrl: source.base_url });
  const { sites, total, pages } = await provider.listAllSites({ fields: 'full', type: 'all' });
  const candidates = [];
  for (const raw of sites) {
    const c = makeCandidate({
      host: raw.host,
      url: raw.url || raw.canonical_url,
      name: raw.name,
      description: raw.desc || raw.description,
      category: raw.category,
      site_type: raw.type || raw.site_type,
      tools: raw.tools,
      source_id: source.id,
      source_name: source.name,
      source_url: `${String(source.base_url).replace(/\/$/, '')}/sites/${raw.host}`,
      raw_ref: raw.host,
    });
    if (c) candidates.push(c);
  }
  return {
    candidates,
    meta: { fetched: sites.length, reported_total: total, pages },
  };
}

/**
 * Reverse webmcpdirectory.com sitemap slug (dots → hyphens in their URLs).
 * Returns preferred host plus alternates (hyphenated brands are ambiguous).
 *   monday-com → monday.com
 *   persona-chat-dev → persona-chat.dev (and persona.chat.dev)
 *   docs-mcp-b-ai → docs.mcp-b.ai (and docs.mcp.b.ai)
 */
function directoryToolSlugToHosts(slug) {
  const s = String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/^tool\//, '');
  if (!s || s.includes('/')) return [];
  const m = s.match(/^(.+)-([a-z0-9]{2,24})$/);
  if (!m) return [];
  const left = m[1];
  const tld = m[2];
  const hosts = new Set();
  hosts.add(`${left.replace(/-/g, '.')}.${tld}`);
  hosts.add(`${left}.${tld}`);
  const parts = left.split('-').filter(Boolean);
  if (parts.length >= 2) {
    hosts.add(`${parts[0]}.${parts.slice(1).join('-')}.${tld}`);
    hosts.add(`${parts.slice(0, -1).join('-')}.${parts[parts.length - 1]}.${tld}`);
    hosts.add(`${parts.slice(0, -1).join('.')}.${parts[parts.length - 1]}.${tld}`);
  }
  return [...hosts].map((h) => normalizeHost(h)).filter(Boolean);
}

function directoryToolSlugToHost(slug) {
  return directoryToolSlugToHosts(slug)[0] || null;
}

async function fetchWebmcpDirectorySitemap(source) {
  const xml = await fetchText(source.sitemap_url);
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
  const candidates = [];
  const seen = new Set();
  for (const loc of locs) {
    const match = loc.match(/\/tool\/([^/?#]+)/i);
    if (!match) continue;
    const slug = decodeURIComponent(match[1]);
    const hosts = directoryToolSlugToHosts(slug);
    if (!hosts.length) continue;
    for (const host of hosts) {
      if (seen.has(host)) continue;
      seen.add(host);
      const c = makeCandidate({
        host,
        url: `https://${host}/`,
        name: host,
        source_id: source.id,
        source_name: source.name,
        source_url: loc,
        raw_ref: slug,
      });
      if (c) candidates.push(c);
    }
  }
  return { candidates, meta: { sitemap_urls: locs.length, tool_entries: candidates.length } };
}

async function fetchRegistryDevSitemap(source) {
  const xml = await fetchText(source.sitemap_url);
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
  const candidates = [];
  const seen = new Set();
  for (const loc of locs) {
    const match = loc.match(/\/domain\/(.+)$/i);
    if (!match) continue;
    let domainPath = decodeURIComponent(match[1]).replace(/\/$/, '');
    if (!domainPath || domainPath === 'webmcp-registry.dev') continue;
    // Path demos: googlechromelabs.github.io/webmcp-tools/demos/coffee-shop
    let host;
    let url;
    if (domainPath.includes('/')) {
      url = `https://${domainPath}/`;
      // Prefer leaf demo slug when present (aligns with webmcp.com path-demo hosts)
      const leaf = domainPath.split('/').filter(Boolean).pop();
      host = normalizeHost(leaf) || normalizeHost(domainPath);
    } else {
      host = normalizeHost(domainPath);
      url = `https://${host}/`;
    }
    if (!host || seen.has(host)) continue;
    seen.add(host);
    const c = makeCandidate({
      host,
      url,
      name: host,
      site_type: domainPath.includes('/demos/') ? 'demo' : 'live',
      source_id: source.id,
      source_name: source.name,
      source_url: loc,
      raw_ref: domainPath,
    });
    if (c) candidates.push(c);
  }
  return { candidates, meta: { sitemap_urls: locs.length, domain_entries: candidates.length } };
}

function extractMarkdownUrls(markdown) {
  const urls = new Set();
  const mdLinks = [...markdown.matchAll(/\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g)];
  for (const m of mdLinks) urls.add(m[1].replace(/[.,;]+$/, ''));
  const bare = [...markdown.matchAll(/https?:\/\/[^\s)<>"']+/g)];
  for (const m of bare) urls.add(m[0].replace(/[.,;]+$/, ''));
  return [...urls];
}

const SKIP_HOST_SUFFIXES = [
  'github.com',
  'githubusercontent.com',
  'npmjs.com',
  'medium.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'youtube.com',
  'google.com',
  'chromium.org',
];

/** Never import these as WebMCP site hosts (docs, noise, or known bad aliases). */
const DENY_HOSTS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'localhost',
  'ec.europa.eu',
]);

function isDeniedHost(host) {
  const h = String(host || '').toLowerCase();
  if (!h) return true;
  if (DENY_HOSTS.has(h)) return true;
  return false;
}

function shouldSkipDiscoveryUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (SKIP_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) return true;
    if (host === 'raw.githubusercontent.com') return true;
    return false;
  } catch {
    return true;
  }
}

async function fetchAwesomeMarkdown(source) {
  const md = await fetchText(source.markdown_url);
  const urls = extractMarkdownUrls(md).filter((u) => !shouldSkipDiscoveryUrl(u));
  const candidates = [];
  const seen = new Set();
  for (const url of urls) {
    let host = normalizeHost(url);
    // github.io demo pages — use leaf folder as demo host when deep path
    try {
      const u = new URL(url);
      if (u.hostname.endsWith('github.io') && u.pathname.split('/').filter(Boolean).length >= 2) {
        const leaf = u.pathname.split('/').filter(Boolean).pop();
        const leafHost = normalizeHost(leaf);
        if (leafHost) host = leafHost;
      }
    } catch {
      /* keep host */
    }
    if (!host || seen.has(host)) continue;
    seen.add(host);
    const c = makeCandidate({
      host,
      url,
      name: host,
      site_type: String(url).includes('/demos/') ? 'demo' : 'live',
      source_id: source.id,
      source_name: source.name,
      source_url: source.markdown_url,
      raw_ref: url,
    });
    if (c) candidates.push(c);
  }
  return { candidates, meta: { markdown_urls: urls.length, kept: candidates.length } };
}

async function fetchGenericSitemap(source) {
  const xml = await fetchText(source.sitemap_url);
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1].trim());
  const candidates = [];
  const seen = new Set();
  for (const loc of locs) {
    if (shouldSkipDiscoveryUrl(loc)) continue;
    const host = normalizeHost(loc);
    if (!host || seen.has(host)) continue;
    // Skip the directory's own marketing hosts unless they are the only hit
    if (host === 'webmcptools.io' || host.endsWith('.webmcptools.io')) continue;
    seen.add(host);
    const c = makeCandidate({
      host,
      url: loc,
      source_id: source.id,
      source_name: source.name,
      source_url: loc,
      raw_ref: loc,
    });
    if (c) candidates.push(c);
  }
  return { candidates, meta: { sitemap_urls: locs.length, kept: candidates.length } };
}

async function fetchMonitorOnly(source) {
  try {
    const html = await fetchText(source.home_url);
    return {
      candidates: [],
      meta: {
        status: 'monitor_only',
        home_bytes: html.length,
        note: source.use_for || 'No public list API yet — monitored only',
      },
    };
  } catch (err) {
    return {
      candidates: [],
      meta: { status: 'monitor_unreachable', error: err.message },
    };
  }
}

async function fetchGithubCodeSearch(source) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  if (!token) {
    return {
      candidates: [],
      meta: {
        status: 'skipped',
        note: 'Set GITHUB_TOKEN to enable GitHub code search discovery',
      },
    };
  }

  const candidates = [];
  const seen = new Set();
  const queries = source.queries || ['document.modelContext.registerTool'];

  for (const q of queries) {
    const params = new URLSearchParams({
      q: `${q} in:file`,
      per_page: '30',
    });
    const url = `https://api.github.com/search/code?${params}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': UA,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`GitHub ${res.status}: ${body.slice(0, 180)}`);
      }
      const data = await res.json();
      for (const item of data.items || []) {
        const htmlUrl = item.html_url || '';
        const repo = item.repository?.html_url || '';
        // Prefer GitHub Pages guess from repo homepage later; for now keep repo as ref
        const homepage = item.repository?.homepage;
        if (homepage && !shouldSkipDiscoveryUrl(homepage)) {
          const host = normalizeHost(homepage);
          if (host && !seen.has(host)) {
            seen.add(host);
            const c = makeCandidate({
              host,
              url: homepage,
              source_id: source.id,
              source_name: source.name,
              source_url: htmlUrl || repo,
              raw_ref: q,
            });
            if (c) candidates.push(c);
          }
        }
      }
    } finally {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  return { candidates, meta: { queries: queries.length, kept: candidates.length } };
}

const ADAPTERS = {
  webmcpApi: fetchWebmcpApi,
  webmcpDirectorySitemap: fetchWebmcpDirectorySitemap,
  registryDevSitemap: fetchRegistryDevSitemap,
  awesomeMarkdown: fetchAwesomeMarkdown,
  genericSitemap: fetchGenericSitemap,
  monitorOnly: fetchMonitorOnly,
  githubCodeSearch: fetchGithubCodeSearch,
};

async function collectFromSource(source) {
  const adapter = ADAPTERS[source.adapter];
  if (!adapter) {
    return {
      source,
      ok: false,
      error: `Unknown adapter: ${source.adapter}`,
      candidates: [],
      meta: {},
    };
  }
  try {
    const result = await adapter(source);
    return {
      source,
      ok: true,
      candidates: result.candidates || [],
      meta: result.meta || {},
    };
  } catch (err) {
    return {
      source,
      ok: false,
      error: err.message || String(err),
      candidates: [],
      meta: {},
    };
  }
}

/**
 * Diff external candidates against the Influzer WebMCP catalog.
 */
async function verifyExternalSources({ sourceIds = null } = {}) {
  const registry = loadSourceRegistry();
  const { catalog, byHost } = loadCatalogHosts();
  let sources = (registry.sources || []).filter((s) => s.enabled !== false);
  if (sourceIds?.length) {
    const want = new Set(sourceIds);
    sources = sources.filter((s) => want.has(s.id));
  }

  const perSource = [];
  const missingByHost = new Map();
  const presentByHost = new Map();

  for (const source of sources) {
    const result = await collectFromSource(source);
    const missing = [];
    const present = [];
    for (const c of result.candidates) {
      const key = candidateKey(c);
      if (byHost.has(key)) {
        present.push(c);
        if (!presentByHost.has(key)) presentByHost.set(key, []);
        presentByHost.get(key).push(source.id);
      } else {
        missing.push(c);
        const existing = missingByHost.get(key);
        if (!existing) {
          missingByHost.set(key, { ...c, sources: [source.id] });
        } else {
          const existingTools = Array.isArray(existing.tools) ? existing.tools.length : 0;
          const nextTools = Array.isArray(c.tools) ? c.tools.length : 0;
          if (nextTools > existingTools) {
            missingByHost.set(key, {
              ...c,
              sources: [...new Set([...(existing.sources || []), source.id])],
            });
          } else {
            existing.sources = [...new Set([...(existing.sources || []), source.id])];
          }
        }
      }
    }
    perSource.push({
      id: source.id,
      name: source.name,
      ok: result.ok,
      error: result.error || null,
      usefulness: source.usefulness,
      machine_readable: source.machine_readable,
      fetched: result.candidates.length,
      present: present.length,
      missing: missing.length,
      meta: result.meta,
      missing_sample: missing.slice(0, 8).map((c) => ({ host: c.host, url: c.url })),
    });
  }

  return {
    generated_at: new Date().toISOString(),
    catalog_site_count: (catalog.sites || []).length,
    sources: perSource,
    missing_hosts: [...missingByHost.values()].sort((a, b) => a.host.localeCompare(b.host)),
    present_overlap: presentByHost.size,
    missing_count: missingByHost.size,
  };
}

function candidateToSite(candidate, previous) {
  const now = new Date().toISOString();
  return normalizeSite(
    {
      host: candidate.host,
      name: candidate.name,
      url: candidate.url,
      desc:
        candidate.description ||
        `Discovered via ${candidate.source_name || candidate.source_id}. Tool schemas pending Influzer scan/refresh.`,
      category: candidate.category || 'Uncategorized',
      type: candidate.site_type || 'live',
      tools: candidate.tools || [],
    },
    {
      verification_status: 'unverified',
      availability_status: 'active',
      published: true,
      first_seen_at: previous?.first_seen_at || now,
      last_seen_at: now,
      provenance: {
        source_name: candidate.source_name || candidate.source_id || 'external',
        source_url: candidate.source_url || candidate.url,
        imported_at: now,
        discovered_via: Array.isArray(candidate.sources)
          ? candidate.sources
          : [candidate.source_id].filter(Boolean),
      },
    },
  );
}

function rebuildCategories(sites) {
  const { slugifyCategory } = require('./normalize');
  const map = new Map();
  for (const site of sites) {
    if (site.published === false) continue;
    const slug = site.category_slug || slugifyCategory(site.category);
    const existing = map.get(slug) || {
      slug,
      name: site.category || 'Uncategorized',
      site_count: 0,
      tool_count: 0,
    };
    existing.site_count += 1;
    existing.tool_count += site.tool_count || 0;
    if (!existing.name && site.category) existing.name = site.category;
    map.set(slug, existing);
  }
  return [...map.values()].sort((a, b) => b.site_count - a.site_count || a.name.localeCompare(b.name));
}

/**
 * Import missing hosts into data/webmcp-sites.json.
 * Prefer richer tool payloads when a candidate already has tools (API sources).
 */
function importMissingCandidates(missingHosts, { dryRun = true, preferWithTools = true } = {}) {
  const catalog = readJson(SITES_PATH, { version: 1, sites: [] });
  const previousByHost = new Map((catalog.sites || []).map((s) => [s.host, s]));
  const toImport = [];

  // When directory slug expansion produced aliases, prefer an already-present
  // sibling (or the richest new candidate) and skip empty alias stubs.
  const byRawRef = new Map();
  for (const candidate of missingHosts) {
    const ref = candidate.raw_ref || candidate.host;
    if (!byRawRef.has(ref)) byRawRef.set(ref, []);
    byRawRef.get(ref).push(candidate);
  }

  const selected = [];
  for (const [, group] of byRawRef) {
    const presentSibling = group.find((c) => previousByHost.has(c.host));
    if (presentSibling) continue;
    // If any alternate host already exists in catalog (from a prior import), skip group
    if (group.some((c) => previousByHost.has(c.host))) continue;
    group.sort((a, b) => (b.tools?.length || 0) - (a.tools?.length || 0));
    const best = group[0];
    // Skip thin aliases that look like hyphen/dot mutations of a richer catalog host
    if (!best.tools?.length) {
      const mutated = group
        .flatMap((c) => [c.host, c.host.replace(/-/g, '.'), c.host.replace(/\./g, '-')])
        .some((h) => previousByHost.has(h) && (previousByHost.get(h).tool_count || 0) > 0);
      if (mutated) continue;
    }
    selected.push(best);
  }

  for (const candidate of selected) {
    if (previousByHost.has(candidate.host) || isDeniedHost(candidate.host)) continue;
    if (preferWithTools && (!candidate.tools || !candidate.tools.length)) {
      candidate._thin = true;
    }
    const site = candidateToSite(candidate, null);
    if (!site) continue;
    if (candidate._thin) {
      site.editorial_notes =
        'Imported from external directory without tool schemas — run Influzer scan or wait for webmcp.com refresh to enrich.';
    }
    toImport.push(site);
  }

  if (dryRun) {
    return {
      dry_run: true,
      would_import: toImport.length,
      hosts: toImport.map((s) => s.host),
      with_tools: toImport.filter((s) => s.tool_count > 0).length,
      stubs: toImport.filter((s) => s.tool_count === 0).length,
    };
  }

  const merged = [...(catalog.sites || []), ...toImport].sort((a, b) =>
    a.host.localeCompare(b.host),
  );
  const now = new Date().toISOString();
  const nextCatalog = {
    version: 1,
    generated_at: catalog.generated_at || now,
    source: catalog.source || {
      name: 'influzer-multi-source',
      note: 'Merged Influzer catalog with external WebMCP directory imports',
    },
    sites: merged,
  };

  const toolCount = merged.reduce((sum, s) => sum + (s.tool_count || 0), 0);
  const meta = {
    generated_at: catalog.generated_at || now,
    refreshed_at: now,
    site_count: merged.filter((s) => s.published !== false).length,
    tool_count: toolCount,
    live_count: merged.filter((s) => s.published !== false && s.site_type === 'live').length,
    demo_count: merged.filter((s) => s.published !== false && s.site_type === 'demo').length,
    category_count: 0,
    import: {
      at: now,
      added: toImport.length,
      sources: [...new Set(toImport.flatMap((s) => s.provenance?.discovered_via || []))],
    },
  };
  const categories = rebuildCategories(merged);
  meta.category_count = categories.length;

  fs.writeFileSync(SITES_PATH, `${JSON.stringify(nextCatalog, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(ROOT, 'data', 'webmcp-meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    path.join(ROOT, 'data', 'webmcp-categories.json'),
    `${JSON.stringify(categories, null, 2)}\n`,
    'utf8',
  );

  return {
    dry_run: false,
    imported: toImport.length,
    hosts: toImport.map((s) => s.host),
    site_count: meta.site_count,
    tool_count: meta.tool_count,
  };
}

module.exports = {
  loadSourceRegistry,
  loadCatalogHosts,
  verifyExternalSources,
  importMissingCandidates,
  directoryToolSlugToHost,
  directoryToolSlugToHosts,
  extractMarkdownUrls,
  makeCandidate,
  candidateToSite,
  ADAPTERS,
  SOURCES_PATH,
};
