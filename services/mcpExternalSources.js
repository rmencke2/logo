'use strict';

/**
 * External classic MCP *server* directory adapters.
 * Discover candidates from third-party registries and curated lists,
 * then diff against Influzer's /mcp catalog.
 *
 * Not WebMCP websites — those live under services/webmcp/.
 */

const fs = require('fs');
const path = require('path');
const {
  slugify,
  normalizeGithubUrl,
  mapCategory,
  mapTransport,
  finalizeServer,
} = require('../scripts/utils/normalize');

const ROOT = path.join(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'data', 'mcp-external-sources.json');
const GENERATED_PATH = path.join(ROOT, 'data', 'servers-generated.json');
const MANUAL_PATH = path.join(ROOT, 'data', 'mcp-servers-manual.json');
const LEGACY_MANUAL_PATH = path.join(ROOT, 'data', 'mcp-servers.json');
const DISCOVERED_PATH = path.join(ROOT, 'data', 'mcp-servers-discovered.json');

const UA = 'InfluzerMcpCatalog/1.0 (+https://www.influzer.ai/mcp)';
const DEFAULT_TIMEOUT_MS = Number(process.env.MCP_EXTERNAL_TIMEOUT_MS || 30000);

const GLAMA_BASE = 'https://glama.ai/api/mcp/v1';
const SMITHERY_BASE = 'https://api.smithery.ai/servers';
const MCPSERVERS_BASE = 'https://mcpservers.org';

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadSourceRegistry() {
  return readJson(SOURCES_PATH, { sources: [] });
}

async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': UA, ...headers },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Build lookup indexes for the current Influzer MCP catalog.
 */
function loadCatalogIndex() {
  const generated = readJson(GENERATED_PATH, { servers: [] });
  const manualFile = fs.existsSync(MANUAL_PATH)
    ? MANUAL_PATH
    : fs.existsSync(LEGACY_MANUAL_PATH)
      ? LEGACY_MANUAL_PATH
      : null;
  const manual = manualFile ? readJson(manualFile, { servers: [] }) : { servers: [] };
  const discovered = readJson(DISCOVERED_PATH, { servers: [] });

  const servers = [
    ...(generated.servers || []),
    ...(manual.servers || []).map((s) => ({
      ...s,
      slug: s.slug || s.id,
      source: s.source || 'manual',
    })),
    ...(discovered.servers || []),
  ];

  const bySlug = new Map();
  const byGithub = new Map();
  const byQualified = new Map();
  const byEndpoint = new Map();

  for (const s of servers) {
    const slug = String(s.slug || s.id || '').toLowerCase();
    if (slug) bySlug.set(slug, s);
    const ghExact = githubIdentity(s.github_url);
    if (ghExact) byGithub.set(ghExact, s);
    const ghRoot = normalizeGithubUrl(s.github_url);
    if (ghRoot) byGithub.set(ghRoot, s);
    if (s.smithery_qualified_name) {
      byQualified.set(String(s.smithery_qualified_name).toLowerCase(), s);
    }
    if (s.registry_name) {
      byQualified.set(String(s.registry_name).toLowerCase(), s);
    }
    for (const url of [s.mcp_endpoint, s.deployment_url, s.docs_url, s.primary_url]) {
      const key = normalizeEndpointKey(url);
      if (key) byEndpoint.set(key, s);
    }
  }

  return {
    servers,
    catalog_count: bySlug.size || servers.length,
    bySlug,
    byGithub,
    byQualified,
    byEndpoint,
  };
}

function normalizeEndpointKey(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url.trim());
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/$/, '').toLowerCase()}`;
  } catch {
    return null;
  }
}

/** Prefer full tree/blob path for monorepo servers; else repo root. */
function githubIdentity(githubUrl) {
  if (!githubUrl || typeof githubUrl !== 'string') return null;
  const trimmed = githubUrl.trim().replace(/\/$/, '').split('#')[0];
  if (/github\.com\/[^/]+\/[^/]+\/(tree|blob)\//i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return normalizeGithubUrl(trimmed);
}

function candidateKey(candidate) {
  const gh = githubIdentity(candidate.github_url);
  if (gh) return `gh:${gh}`;
  if (candidate.registry_name) return `reg:${String(candidate.registry_name).toLowerCase()}`;
  if (candidate.smithery_qualified_name) {
    return `sq:${String(candidate.smithery_qualified_name).toLowerCase()}`;
  }
  return `slug:${String(candidate.slug || '').toLowerCase()}`;
}

function makeCandidate({
  name,
  slug,
  description,
  category,
  github_url,
  docs_url,
  mcp_endpoint,
  transport,
  official,
  stars,
  tools,
  source_id,
  source_name,
  source_url,
  registry_name,
  smithery_qualified_name,
  raw_ref,
}) {
  const resolvedName = String(name || slug || registry_name || '').trim();
  if (!resolvedName) return null;
  const resolvedSlug = slugify(slug || resolvedName);
  return {
    name: resolvedName,
    slug: resolvedSlug,
    description: String(description || '').trim(),
    category: category || mapCategory(resolvedName, description || ''),
    github_url: github_url || undefined,
    docs_url: docs_url || undefined,
    mcp_endpoint: mcp_endpoint || undefined,
    transport: transport || 'unknown',
    official: Boolean(official),
    stars: Number(stars) || 0,
    tools: Array.isArray(tools) ? tools : [],
    source_id,
    source_name,
    source_url: source_url || null,
    registry_name: registry_name || undefined,
    smithery_qualified_name: smithery_qualified_name || undefined,
    raw_ref: raw_ref || null,
  };
}

function findInCatalog(candidate, index) {
  const ghExact = githubIdentity(candidate.github_url);
  if (ghExact && index.byGithub.has(ghExact)) return index.byGithub.get(ghExact);

  // Only fall back to repo-root match when the candidate is NOT a monorepo tree/blob URL
  const ghRoot = normalizeGithubUrl(candidate.github_url);
  const isMonorepoPath =
    candidate.github_url && /github\.com\/[^/]+\/[^/]+\/(tree|blob)\//i.test(candidate.github_url);
  if (!isMonorepoPath && ghRoot && index.byGithub.has(ghRoot)) {
    return index.byGithub.get(ghRoot);
  }

  if (candidate.registry_name) {
    const q = String(candidate.registry_name).toLowerCase();
    if (index.byQualified.has(q)) return index.byQualified.get(q);
  }
  if (candidate.smithery_qualified_name) {
    const q = String(candidate.smithery_qualified_name).toLowerCase();
    if (index.byQualified.has(q)) return index.byQualified.get(q);
  }

  const slug = String(candidate.slug || '').toLowerCase();
  if (slug && index.bySlug.has(slug)) return index.bySlug.get(slug);
  // Official reference servers are often cataloged as "memory" not "mcp-memory"
  if (slug.startsWith('mcp-')) {
    const short = slug.slice(4);
    if (index.bySlug.has(short)) return index.bySlug.get(short);
  }

  for (const url of [candidate.mcp_endpoint, candidate.docs_url]) {
    const key = normalizeEndpointKey(url);
    if (key && index.byEndpoint.has(key)) return index.byEndpoint.get(key);
  }
  return null;
}

// ——— Adapters ———

async function fetchOfficialRegistry(source) {
  const base = String(source.base_url || 'https://registry.modelcontextprotocol.io/v0/servers').replace(
    /\/$/,
    '',
  );
  const maxPages = Number(process.env.MCP_REGISTRY_MAX_PAGES || source.max_pages || 250);
  const pageSize = Number(process.env.MCP_REGISTRY_PAGE_SIZE || 100);
  const byName = new Map();
  let cursor = null;
  let pages = 0;
  let rawRows = 0;

  while (pages < maxPages) {
    pages += 1;
    const params = new URLSearchParams({ limit: String(pageSize) });
    if (cursor) params.set('cursor', cursor);
    const data = await fetchJson(`${base}?${params}`);
    const batch = data.servers || [];
    rawRows += batch.length;
    for (const row of batch) {
      const server = row.server || {};
      const name = server.name;
      if (!name) continue;
      const meta = row._meta?.['io.modelcontextprotocol.registry/official'] || {};
      if (meta.status && meta.status !== 'active') continue;
      const prev = byName.get(name);
      if (!prev || meta.isLatest) {
        byName.set(name, row);
      }
    }
    cursor = data.metadata?.nextCursor || null;
    if (!cursor || !batch.length) break;
    await sleep(40);
  }

  const candidates = [];
  for (const row of byName.values()) {
    const server = row.server || {};
    const meta = row._meta?.['io.modelcontextprotocol.registry/official'] || {};
    const remotes = Array.isArray(server.remotes) ? server.remotes : [];
    const remoteUrl = remotes.find((r) => r?.url)?.url;
    const packages = Array.isArray(server.packages) ? server.packages : [];
    const transport = remotes.length
      ? mapTransport(remotes[0]?.type || 'http')
      : packages.length
        ? 'stdio'
        : 'unknown';
    const title = server.title || server.name;
    const gh = server.repository?.url || undefined;
    const c = makeCandidate({
      name: title,
      slug: slugify(server.name),
      description: server.description || '',
      github_url: gh,
      docs_url: remoteUrl || `https://registry.modelcontextprotocol.io/servers/${encodeURIComponent(server.name)}`,
      mcp_endpoint: remoteUrl,
      transport,
      official: true,
      stars: 0,
      source_id: source.id,
      source_name: source.name,
      source_url: `https://registry.modelcontextprotocol.io/?q=${encodeURIComponent(server.name)}`,
      registry_name: server.name,
      raw_ref: `${server.name}@${server.version || meta.updatedAt || ''}`,
    });
    if (c) candidates.push(c);
  }

  return {
    candidates,
    meta: { pages, raw_rows: rawRows, unique_names: byName.size, exhausted: !cursor },
  };
}

async function fetchGlamaList(source) {
  const target = Number(process.env.GLAMA_TARGET || source.target || 3000);
  const pageSize = 100;
  const collected = [];
  let after = null;
  let page = 0;

  while (collected.length < target) {
    page += 1;
    const params = new URLSearchParams({ pageSize: String(pageSize) });
    if (after) params.set('after', after);
    const data = await fetchJson(`${GLAMA_BASE}/servers?${params}`);
    const batch = data.servers || [];
    if (!batch.length) break;
    for (const item of batch) {
      collected.push(item);
      if (collected.length >= target) break;
    }
    if (!data.pageInfo?.hasNextPage) break;
    after = data.pageInfo.endCursor;
    await sleep(80);
  }

  const candidates = [];
  for (const item of collected) {
    const name = item.name || item.slug;
    const gh = item.repository?.url || item.github_url;
    const c = makeCandidate({
      name,
      slug: slugify(item.slug || name),
      description: item.description || '',
      github_url: gh,
      docs_url: item.url || `https://glama.ai/mcp/servers/${item.id || ''}`,
      stars: item.stars || item.starCount || 0,
      source_id: source.id,
      source_name: source.name,
      source_url: item.url || null,
      raw_ref: item.id || `${item.namespace}/${item.slug}`,
    });
    if (c) candidates.push(c);
  }
  return { candidates, meta: { listed: collected.length, pages: page } };
}

async function fetchSmitheryList(source) {
  const maxPages = Number(process.env.SMITHERY_MAX_PAGES || source.max_pages || 150);
  const pageSize = 100;
  const candidates = [];
  let page = 1;
  let totalPages = 1;

  while (page <= maxPages && page <= totalPages) {
    const data = await fetchJson(`${SMITHERY_BASE}?page=${page}&pageSize=${pageSize}`);
    totalPages = data.pagination?.totalPages || totalPages;
    for (const item of data.servers || []) {
      const qn = item.qualifiedName || item.namespace;
      const homepage = item.homepage || '';
      const gh = homepage.includes('github.com')
        ? homepage
        : item.repository?.url || undefined;
      const c = makeCandidate({
        name: item.displayName || qn,
        slug: slugify(qn || item.displayName),
        description: item.description || '',
        github_url: gh,
        docs_url: item.homepage || `https://smithery.ai/servers/${qn}`,
        transport: item.remote ? 'http' : 'stdio',
        official: Boolean(item.verified),
        stars: item.useCount || item.score || 0,
        source_id: source.id,
        source_name: source.name,
        source_url: `https://smithery.ai/servers/${qn}`,
        smithery_qualified_name: qn,
        raw_ref: qn,
      });
      if (c) candidates.push(c);
    }
    page += 1;
    await sleep(100);
  }

  return { candidates, meta: { pages: page - 1, total_pages: totalPages } };
}

function parseAwesomeMarkdown(md, source) {
  const candidates = [];
  const seen = new Set();
  const patterns = [
    /^\s*[-*]\s+\*\*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\*\*\s*[-–—]\s*(.+)$/gm,
    /^\s*[-*]\s+\[([^\]]+)\]\((https?:\/\/github\.com\/[^)]+)\)\s*[-–—]?\s*(.*)$/gm,
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(md)) !== null) {
      const [, name, url, description] = match;
      const gh = url.includes('github.com') ? url.replace(/\/$/, '').split('#')[0] : undefined;
      const key = (gh || url).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const c = makeCandidate({
        name: name.trim(),
        slug: slugify(name),
        description: (description || name).trim(),
        github_url: gh,
        docs_url: gh ? undefined : url,
        official: /modelcontextprotocol/i.test(url),
        source_id: source.id,
        source_name: source.name,
        source_url: url,
        raw_ref: url,
      });
      if (c) candidates.push(c);
    }
  }
  return candidates;
}

async function fetchAwesomeMcp(source) {
  const md = await fetchText(source.markdown_url);
  const candidates = parseAwesomeMarkdown(md, source);
  return { candidates, meta: { markdown_chars: md.length } };
}

function extractMcpserversItemList(html) {
  const items = [];
  const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      const list = data?.mainEntity?.itemListElement;
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        if (entry?.name && entry?.url) {
          items.push({ name: String(entry.name).trim(), url: String(entry.url).trim() });
        }
      }
    } catch {
      /* skip */
    }
  }
  return items;
}

function slugFromMcpserversUrl(pageUrl) {
  try {
    const parts = new URL(pageUrl).pathname.split('/').filter(Boolean);
    const idx = parts.indexOf('servers');
    if (idx >= 0 && parts[idx + 1]) return slugify(parts.slice(idx + 1).join('-'));
  } catch {
    /* fall through */
  }
  return slugify(pageUrl);
}

async function fetchMcpserversOrg(source) {
  const maxPages = Number(process.env.MCPSERVERS_MAX_PAGES || source.max_pages || 100);
  const seen = new Set();
  const candidates = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = page === 1 ? `${MCPSERVERS_BASE}/all` : `${MCPSERVERS_BASE}/all?page=${page}`;
    const html = await fetchText(url);
    const batch = extractMcpserversItemList(html);
    if (!batch.length) break;
    for (const item of batch) {
      const slug = slugFromMcpserversUrl(item.url);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const c = makeCandidate({
        name: item.name,
        slug,
        description: `${item.name} — listed on mcpservers.org.`,
        docs_url: item.url,
        source_id: source.id,
        source_name: source.name,
        source_url: item.url,
        raw_ref: item.url,
      });
      if (c) candidates.push(c);
    }
    if (batch.length < 20) break;
    await sleep(200);
  }

  return { candidates, meta: { unique: candidates.length } };
}

/**
 * Parse modelcontextprotocol/servers README for reference + archived entries.
 */
function parseOfficialMcpReadme(md, source) {
  const candidates = [];
  const seen = new Set();

  // Relative src links: **[Fetch](src/fetch)** - description
  const relativeRe = /^\s*[-*]\s+\*\*\[([^\]]+)\]\((src\/[^)]+|https?:\/\/[^)]+)\)\*\*\s*[-–—]\s*(.+)$/gm;
  let match;
  while ((match = relativeRe.exec(md)) !== null) {
    const [, name, href, description] = match;
    let github_url;
    if (href.startsWith('src/')) {
      github_url = `https://github.com/modelcontextprotocol/servers/tree/main/${href}`;
    } else if (href.includes('github.com')) {
      github_url = href.replace(/\/$/, '').split('#')[0];
    } else {
      github_url = undefined;
    }
    const key = (github_url || href).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const c = makeCandidate({
      name: name.trim(),
      slug: slugify(name),
      description: description.trim(),
      github_url,
      docs_url: github_url,
      official: true,
      source_id: source.id,
      source_name: source.name,
      source_url: href.startsWith('http') ? href : github_url,
      raw_ref: href,
    });
    if (c) candidates.push(c);
  }

  // Absolute archived links already covered by relativeRe when they use **[Name](url)**
  return candidates;
}

async function fetchOfficialMcpRepo(source) {
  const md = await fetchText(source.readme_url);
  const candidates = parseOfficialMcpReadme(md, source);
  return { candidates, meta: { markdown_chars: md.length, parsed: candidates.length } };
}

const ADAPTERS = {
  officialRegistry: fetchOfficialRegistry,
  glama: fetchGlamaList,
  smithery: fetchSmitheryList,
  awesomeMcp: fetchAwesomeMcp,
  mcpserversOrg: fetchMcpserversOrg,
  officialMcpRepo: fetchOfficialMcpRepo,
};

async function runAdapter(source) {
  const fn = ADAPTERS[source.adapter];
  if (!fn) {
    return { ok: false, error: `Unknown adapter: ${source.adapter}`, candidates: [], meta: {} };
  }
  try {
    const result = await fn(source);
    return { ok: true, error: null, candidates: result.candidates || [], meta: result.meta || {} };
  } catch (err) {
    return { ok: false, error: err.message || String(err), candidates: [], meta: {} };
  }
}

/**
 * Compare enabled external sources against Influzer's catalog.
 */
async function verifyExternalSources({ sourceIds = null } = {}) {
  const registry = loadSourceRegistry();
  let sources = (registry.sources || []).filter((s) => s.enabled !== false);
  if (sourceIds?.length) {
    const want = new Set(sourceIds.map((s) => String(s).toLowerCase()));
    sources = sources.filter((s) => want.has(String(s.id).toLowerCase()));
  }

  const index = loadCatalogIndex();
  const missingByKey = new Map();
  const presentKeys = new Set();
  const perSource = [];

  for (const source of sources) {
    const result = await runAdapter(source);
    const present = [];
    const missing = [];
    for (const candidate of result.candidates) {
      const existing = findInCatalog(candidate, index);
      if (existing) {
        present.push(candidate);
        presentKeys.add(candidateKey(candidate));
      } else {
        missing.push(candidate);
        const key = candidateKey(candidate);
        const prev = missingByKey.get(key);
        if (!prev) {
          missingByKey.set(key, {
            ...candidate,
            sources: [source.id],
          });
        } else {
          prev.sources = [...new Set([...(prev.sources || []), source.id])];
          if ((candidate.tools?.length || 0) > (prev.tools?.length || 0)) {
            prev.tools = candidate.tools;
          }
          if (!prev.github_url && candidate.github_url) prev.github_url = candidate.github_url;
          if (!prev.mcp_endpoint && candidate.mcp_endpoint) prev.mcp_endpoint = candidate.mcp_endpoint;
          if (!prev.description && candidate.description) prev.description = candidate.description;
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
      missing_sample: missing.slice(0, 8).map((c) => ({
        slug: c.slug,
        name: c.name,
        github_url: c.github_url || null,
        registry_name: c.registry_name || null,
      })),
    });
  }

  return {
    generated_at: new Date().toISOString(),
    catalog_server_count: index.catalog_count,
    sources: perSource,
    missing_servers: [...missingByKey.values()].sort((a, b) => a.name.localeCompare(b.name)),
    present_overlap: presentKeys.size,
    missing_count: missingByKey.size,
  };
}

function candidateToServer(candidate) {
  const today = new Date().toISOString().slice(0, 10);
  const desc =
    candidate.description ||
    `Discovered via ${candidate.source_name || candidate.source_id}. Details pending catalog refresh.`;
  return finalizeServer({
    id: candidate.slug,
    slug: candidate.slug,
    name: candidate.name,
    description: desc.length >= 12 ? desc : `${desc} MCP server.`.slice(0, 2000),
    category: candidate.category || mapCategory(candidate.name, desc),
    official: Boolean(candidate.official),
    transport: candidate.transport || 'unknown',
    tools: candidate.tools || [],
    github_url: candidate.github_url,
    docs_url: candidate.docs_url,
    mcp_endpoint: candidate.mcp_endpoint,
    deployment_url: candidate.mcp_endpoint,
    stars: candidate.stars || 0,
    source: 'discovered',
    last_updated: today,
    registry_name: candidate.registry_name,
    smithery_qualified_name: candidate.smithery_qualified_name,
    provenance: {
      source_name: candidate.source_name || candidate.source_id,
      source_url: candidate.source_url,
      discovered_via: Array.isArray(candidate.sources)
        ? candidate.sources
        : [candidate.source_id].filter(Boolean),
      imported_at: new Date().toISOString(),
    },
  });
}

/**
 * Import missing candidates into data/mcp-servers-discovered.json overlay.
 */
function importMissingCandidates(missingServers, { dryRun = true } = {}) {
  const discovered = readJson(DISCOVERED_PATH, {
    version: 1,
    generated_at: null,
    servers: [],
  });
  const existingSlugs = new Set((discovered.servers || []).map((s) => String(s.slug).toLowerCase()));
  const index = loadCatalogIndex();
  const toImport = [];

  for (const candidate of missingServers) {
    if (findInCatalog(candidate, index)) continue;
    if (existingSlugs.has(String(candidate.slug).toLowerCase())) continue;
    const server = candidateToServer(candidate);
    if (!server?.slug) continue;
    // filterNoise requires description >= 12 or stars > 0
    if ((server.description || '').length < 12 && !(server.stars > 0)) {
      server.description = `${server.name} MCP server listed by ${candidate.source_name || 'external registry'}.`;
    }
    toImport.push(server);
    existingSlugs.add(String(server.slug).toLowerCase());
  }

  if (dryRun) {
    return {
      dry_run: true,
      would_import: toImport.length,
      slugs: toImport.map((s) => s.slug),
      with_github: toImport.filter((s) => s.github_url).length,
      with_endpoint: toImport.filter((s) => s.mcp_endpoint).length,
      stubs: toImport.filter((s) => !(s.tools || []).length).length,
    };
  }

  const now = new Date().toISOString();
  const merged = [...(discovered.servers || []), ...toImport].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );
  const next = {
    version: 1,
    generated_at: discovered.generated_at || now,
    refreshed_at: now,
    source: {
      name: 'influzer-mcp-external-import',
      note: 'Servers discovered from external registries but missing from the last refresh-data run',
    },
    import: {
      at: now,
      added: toImport.length,
      sources: [...new Set(toImport.flatMap((s) => s.provenance?.discovered_via || []))],
    },
    servers: merged,
  };
  fs.writeFileSync(DISCOVERED_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  return {
    dry_run: false,
    imported: toImport.length,
    slugs: toImport.map((s) => s.slug),
    server_count: merged.length,
  };
}

function loadDiscoveredServers() {
  const data = readJson(DISCOVERED_PATH, { servers: [] });
  return Array.isArray(data.servers) ? data.servers : [];
}

module.exports = {
  SOURCES_PATH,
  DISCOVERED_PATH,
  ADAPTERS,
  loadSourceRegistry,
  loadCatalogIndex,
  loadDiscoveredServers,
  verifyExternalSources,
  importMissingCandidates,
  makeCandidate,
  candidateToServer,
  candidateKey,
  findInCatalog,
  parseAwesomeMarkdown,
  parseOfficialMcpReadme,
  normalizeEndpointKey,
  githubIdentity,
};
