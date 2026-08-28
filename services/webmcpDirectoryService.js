'use strict';

/**
 * Influzer WebMCP Directory — catalog load, search, pages, and public API.
 */

const fs = require('fs');
const path = require('path');
const { normalizeHost, normalizeHttpsUrl, slugifyCategory } = require('./webmcp/normalize');
const { startWebmcpScan, publicScanView, getScan } = require('./webmcp/scanService');
const { clientErrorMessage } = require('../utils/safeError');
const { ensureScanTables } = require('./webmcp/scanStore');

const ROOT = path.join(__dirname, '..');
const SITES_PATH = path.join(ROOT, 'data', 'webmcp-sites.json');
const META_PATH = path.join(ROOT, 'data', 'webmcp-meta.json');
const CATEGORIES_PATH = path.join(ROOT, 'data', 'webmcp-categories.json');
const ECOSYSTEM_PATH = path.join(ROOT, 'data', 'webmcp-ecosystem.json');
const RESOURCES_PATH = path.join(ROOT, 'data', 'webmcp-resources.json');
const MANUAL_PATH = path.join(ROOT, 'data', 'webmcp-manual.json');
const SELF_TOOLS_PATH = path.join(ROOT, 'data', 'influzer-webmcp-tools.json');

const SITE_BASE = 'https://www.influzer.ai';

let cache = null;

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`WebMCP: failed reading ${filePath}:`, err.message);
    return fallback;
  }
}

function clearWebmcpCache() {
  cache = null;
}

function loadCatalog() {
  if (cache) return cache;
  const sitesFile = readJson(SITES_PATH, { sites: [] });
  const meta = readJson(META_PATH, {});
  const categoriesFile = readJson(CATEGORIES_PATH, { categories: [] });
  const ecosystem = readJson(ECOSYSTEM_PATH, { entries: [] });
  const resources = readJson(RESOURCES_PATH, { resources: [] });
  const manual = readJson(MANUAL_PATH, { sites: {} });

  const sites = (sitesFile.sites || []).filter((s) => s && s.host && s.published !== false);
  const byHost = new Map(sites.map((s) => [s.host, s]));

  cache = {
    sites,
    byHost,
    meta,
    categories: categoriesFile.categories || [],
    ecosystemEntries: (ecosystem.entries || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    resources: (resources.resources || []).filter((r) => r.published !== false),
    manual,
    generatedAt: sitesFile.generated_at || meta.generated_at || null,
  };
  return cache;
}

function getWebmcpStats() {
  const { sites, meta, categories, generatedAt } = loadCatalog();
  return {
    site_count: meta.site_count ?? sites.length,
    tool_count: meta.tool_count ?? sites.reduce((n, s) => n + (s.tool_count || 0), 0),
    live_count: meta.live_count ?? sites.filter((s) => s.site_type === 'live').length,
    demo_count: meta.demo_count ?? sites.filter((s) => s.site_type === 'demo').length,
    category_count: meta.category_count ?? categories.length,
    verified_count: sites.filter((s) => s.verification_status === 'verified').length,
    generated_at: generatedAt || meta.refreshed_at || null,
    refreshed_at: meta.refreshed_at || generatedAt || null,
  };
}

function siteSummary(site) {
  return {
    host: site.host,
    slug: site.slug || site.host,
    name: site.name,
    canonical_url: site.canonical_url,
    description: site.description,
    category: site.category,
    category_slug: site.category_slug,
    site_type: site.site_type,
    verification_status: site.verification_status,
    availability_status: site.availability_status || 'active',
    favicon_url: site.favicon_url,
    tool_count: site.tool_count,
    answer_count: site.answer_count,
    act_count: site.act_count,
    transact_count: site.transact_count,
    implementation: site.implementation,
    score: site.score,
    grade: site.grade,
    last_seen_at: site.last_seen_at,
    last_verified_at: site.last_verified_at,
    first_seen_at: site.first_seen_at,
    representative_tools: (site.tools || []).slice(0, 5).map((t) => t.name),
    provenance: site.provenance || null,
  };
}

function toolMatchesQuery(tool, q) {
  if (!q) return true;
  const hay = [
    tool.name,
    tool.description,
    tool.host,
    ...(tool.required || []),
    ...Object.keys(tool.input_schema?.properties || {}),
    ...Object.values(tool.input_schema?.properties || {}).map((p) => p?.description || ''),
  ]
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).filter(Boolean).every((token) => hay.includes(token));
}

function siteMatchesQuery(site, q) {
  if (!q) return true;
  const toolHit = (site.tools || []).some((t) => toolMatchesQuery(t, q));
  if (toolHit) return true;
  const hay = [site.host, site.name, site.description, site.category].join(' ').toLowerCase();
  return q.split(/\s+/).filter(Boolean).every((token) => hay.includes(token));
}

function filterSites(query = {}) {
  const {
    q = '',
    category = '',
    type = '',
    kind = '',
    verified = '',
    implementation = '',
    status = '',
    min_tools = '',
    sort = 'relevance',
  } = query;

  const qNorm = String(q || '').trim().toLowerCase();
  const minTools = Number(min_tools) || 0;
  let list = loadCatalog().sites.slice();

  if (category) list = list.filter((s) => s.category_slug === category || s.category === category);
  if (type && type !== 'all') list = list.filter((s) => s.site_type === type);
  if (verified === 'verified') list = list.filter((s) => s.verification_status === 'verified');
  if (verified === 'unverified') list = list.filter((s) => s.verification_status !== 'verified');
  if (implementation && implementation !== 'all') {
    list = list.filter((s) => s.implementation === implementation);
  }
  if (status && status !== 'all') list = list.filter((s) => (s.availability_status || 'active') === status);
  if (minTools > 0) list = list.filter((s) => (s.tool_count || 0) >= minTools);
  if (kind) {
    list = list.filter((s) => (s.tools || []).some((t) => t.kind === kind));
  }
  if (qNorm) list = list.filter((s) => siteMatchesQuery(s, qNorm));

  const sorter = {
    tools: (a, b) => b.tool_count - a.tool_count || a.host.localeCompare(b.host),
    score: (a, b) => (b.score || -1) - (a.score || -1) || b.tool_count - a.tool_count,
    recent: (a, b) => String(b.last_verified_at || b.last_seen_at || '').localeCompare(String(a.last_verified_at || a.last_seen_at || '')),
    newest: (a, b) => String(b.first_seen_at || '').localeCompare(String(a.first_seen_at || '')),
    relevance: (a, b) => {
      if (!qNorm) return b.tool_count - a.tool_count;
      const exactA = a.host === qNorm || a.name.toLowerCase() === qNorm ? 1 : 0;
      const exactB = b.host === qNorm || b.name.toLowerCase() === qNorm ? 1 : 0;
      if (exactA !== exactB) return exactB - exactA;
      return b.tool_count - a.tool_count;
    },
  };

  list.sort(sorter[sort] || sorter.relevance);
  return list;
}

function paginate(items, page = 1, limit = 24) {
  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / safeLimit));
  const offset = (safePage - 1) * safeLimit;
  return {
    items: items.slice(offset, offset + safeLimit),
    page: safePage,
    limit: safeLimit,
    total,
    pages,
  };
}

function findSiteByHost(hostOrSlug) {
  const host = normalizeHost(hostOrSlug) || String(hostOrSlug || '').toLowerCase();
  return loadCatalog().byHost.get(host) || null;
}

function loadSelfToolsManifest() {
  return readJson(SELF_TOOLS_PATH, { version: 1, host: 'influzer.ai', tools: [] });
}

function listTools(query = {}) {
  const qNorm = String(query.q || '').trim().toLowerCase();
  const kind = query.kind || '';
  const implementation = query.implementation || '';
  const siteHost = normalizeHost(query.site || query.host || '');

  const tools = [];
  for (const site of loadCatalog().sites) {
    if (siteHost && site.host !== siteHost) continue;
    for (const tool of site.tools || []) {
      if (kind && tool.kind !== kind) continue;
      if (implementation && tool.implementation_type !== implementation) continue;
      const row = {
        ...tool,
        host: site.host,
        site_name: site.name,
        site_type: site.site_type,
        category: site.category,
        verification_status: site.verification_status,
        last_seen_at: site.last_seen_at,
        score: site.score,
      };
      if (qNorm && !toolMatchesQuery(row, qNorm) && !siteMatchesQuery(site, qNorm)) continue;
      tools.push(row);
    }
  }
  return tools;
}

function relatedSites(site, limit = 4) {
  return loadCatalog()
    .sites.filter((s) => s.host !== site.host && s.category_slug === site.category_slug)
    .sort((a, b) => b.tool_count - a.tool_count)
    .slice(0, limit)
    .map(siteSummary);
}

function lookupByUrl(url) {
  const host = normalizeHost(url);
  if (!host) return null;
  const site = findSiteByHost(host);
  return site ? siteSummary(site) : null;
}

function buildFacetCounts(allForFacets) {
  const categories = {};
  const types = { live: 0, demo: 0, unknown: 0 };
  for (const s of allForFacets) {
    categories[s.category_slug] = (categories[s.category_slug] || 0) + 1;
    types[s.site_type] = (types[s.site_type] || 0) + 1;
  }
  return { categories, types };
}

function registerWebmcpRoutes(app) {
  const renderLocals = (req, extra = {}) => ({
    path: req.path,
    query: req.query,
    stats: getWebmcpStats(),
    categories: loadCatalog().categories,
    assetVersion: process.env.ASSET_VERSION || Date.now().toString(36),
    ...extra,
  });

  app.get('/webmcp', (req, res) => {
    const filtered = filterSites(req.query);
    const { items, page, limit, total, pages } = paginate(filtered, req.query.page, req.query.limit || 24);
    const facets = buildFacetCounts(loadCatalog().sites);
    res.render('webmcp-index', renderLocals(req, {
      title: 'WebMCP Directory — Websites with tools for AI agents | Influzer.ai',
      description:
        'Find websites that expose structured WebMCP tools for AI agents. Search by site, tool, capability, or category — and inspect JSON schemas.',
      canonicalUrl: `${SITE_BASE}/webmcp`,
      sites: items.map(siteSummary),
      page,
      limit,
      total,
      pages,
      facets,
      filters: req.query,
    }));
  });

  app.get('/webmcp/tools', (req, res) => {
    const tools = listTools(req.query);
    const { items, page, limit, total, pages } = paginate(tools, req.query.page, req.query.limit || 40);
    res.render('webmcp-tools', renderLocals(req, {
      title: 'WebMCP Tools Directory | Influzer.ai',
      description: 'Search WebMCP tools across websites — names, descriptions, and input schema properties.',
      canonicalUrl: `${SITE_BASE}/webmcp/tools`,
      tools: items,
      page,
      limit,
      total,
      pages,
      filters: req.query,
    }));
  });

  app.get('/webmcp/categories/:category', (req, res) => {
    const slug = req.params.category;
    const cat = loadCatalog().categories.find((c) => c.slug === slug);
    if (!cat) return res.status(404).render('404', { title: 'Category Not Found' });
    const filtered = filterSites({ ...req.query, category: slug });
    const { items, page, limit, total, pages } = paginate(filtered, req.query.page, req.query.limit || 24);
    res.render('webmcp-category', renderLocals(req, {
      title: `${cat.name} WebMCP Websites | Influzer.ai`,
      description: `Browse WebMCP-enabled websites in ${cat.name}: tools, schemas, and verification status.`,
      canonicalUrl: `${SITE_BASE}/webmcp/categories/${slug}`,
      category: cat,
      sites: items.map(siteSummary),
      page,
      limit,
      total,
      pages,
      filters: req.query,
    }));
  });

  app.get('/webmcp/ecosystem', (req, res) => {
    res.render('webmcp-ecosystem', renderLocals(req, {
      title: 'WebMCP Ecosystem & Compatibility | Influzer.ai',
      description: 'Track browser, agent, and framework support for WebMCP — with evidence links and checked dates.',
      canonicalUrl: `${SITE_BASE}/webmcp/ecosystem`,
      entries: loadCatalog().ecosystemEntries,
    }));
  });

  app.get('/webmcp/demo', (req, res) => {
    const manifest = loadSelfToolsManifest();
    res.render('webmcp-demo', renderLocals(req, {
      title: 'Influzer.ai WebMCP Demo — Try live tools | Influzer.ai',
      description:
        'Interactive demo of Influzer.ai’s document.modelContext WebMCP tools. Search the WebMCP and MCP directories, inspect schemas, and run executeTool() in the browser.',
      canonicalUrl: `${SITE_BASE}/webmcp/demo`,
      tools: manifest.tools || [],
    }));
  });

  app.get('/webmcp/challenge', (req, res) => {
    const manifest = loadSelfToolsManifest();
    res.render('webmcp-challenge', renderLocals(req, {
      title: 'Agent Discovery Copilot — Build with WebMCP + MCP | Influzer.ai',
      description:
        'Open in ChatGPT’s browser: discover WebMCP websites and classic MCP servers while building an app. recommend_agent_stack, inspect tools, open sites — human + agent together.',
      canonicalUrl: `${SITE_BASE}/webmcp/challenge`,
      tools: manifest.tools || [],
    }));
  });

  app.get('/webmcp/resources', (req, res) => {
    res.render('webmcp-resources', renderLocals(req, {
      title: 'WebMCP Resources — Specs, Docs & Guides | Influzer.ai',
      description: 'Curated WebMCP specifications, browser docs, testing tools, and Influzer implementation guides.',
      canonicalUrl: `${SITE_BASE}/webmcp/resources`,
      resources: loadCatalog().resources,
    }));
  });

  app.get('/webmcp/about', (req, res) => {
    res.render('webmcp-about', renderLocals(req, {
      title: 'What is the Influzer WebMCP Directory? | Influzer.ai',
      description:
        'How Influzer’s WebMCP Directory works, how it differs from MCP servers, and what “verified” means.',
      canonicalUrl: `${SITE_BASE}/webmcp/about`,
    }));
  });

  app.get('/webmcp/submit', (req, res) => {
    res.render('webmcp-submit', renderLocals(req, {
      title: 'Scan & list your WebMCP website | Influzer.ai',
      description:
        'Scan your site for WebMCP tools, get an Influzer scorecard, and list in the directory. Email required — we’ll also add you to the Influzer newsletter.',
      canonicalUrl: `${SITE_BASE}/webmcp/submit`,
      initialScanId: req.query.scan || null,
    }));
  });

  app.get('/webmcp/submit/:scanId', (req, res) => {
    res.redirect(302, `/webmcp/submit?scan=${encodeURIComponent(req.params.scanId)}`);
  });

  // JSON scan API (primary path for the live UI)
  app.post('/api/webmcp/v1/scans', async (req, res) => {
    try {
      await ensureScanTables();
      const body = req.body || {};
      if (body.company_website) {
        return res.json({ ok: true, ignored: true });
      }
      const url = String(body.url || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const relationship = String(body.relationship || 'owner').slice(0, 40);
      const newsletterOptIn = body.newsletter !== false && body.newsletter !== '0';
      if (!url || !email.includes('@')) {
        return res.status(400).json({ ok: false, error: 'url_and_email_required' });
      }
      const scan = await startWebmcpScan({
        url,
        email,
        relationship,
        ip: req.ip || 'unknown',
        newsletterOptIn,
        clearCache: clearWebmcpCache,
      });
      res.status(202).json({ ok: true, scan: publicScanView(scan) });
    } catch (err) {
      const status = err.code === 'RATE_LIMIT' ? 429 : 400;
      if (err.retryAfterSec) res.set('Retry-After', String(err.retryAfterSec));
      res.status(status).json({ ok: false, error: err.code || 'scan_start_failed', message: err.message });
    }
  });

  app.get('/api/webmcp/v1/scans/:id', async (req, res) => {
    try {
      const scan = await getScan(req.params.id);
      if (!scan) return res.status(404).json({ ok: false, error: 'not_found' });
      res.set('Cache-Control', 'no-store');
      res.json({ ok: true, scan: publicScanView(scan) });
    } catch (err) {
      res.status(500).json({ ok: false, error: clientErrorMessage(err, 'Scan lookup failed') });
    }
  });

  app.get('/webmcp/sites/:host', (req, res) => {
    const site = findSiteByHost(req.params.host);
    if (!site) return res.status(404).render('404', { title: 'WebMCP Site Not Found' });
    const selected = req.query.tool
      ? (site.tools || []).find((t) => t.name === req.query.tool) || site.tools?.[0]
      : site.tools?.[0];
    res.render('webmcp-site', renderLocals(req, {
      title: `${site.name} WebMCP Tools, Schemas & Agent Capabilities | Influzer.ai`,
      description: `Inspect the WebMCP tools exposed by ${site.host}, including capabilities, input schemas, implementation type, and verification status.`,
      canonicalUrl: `${SITE_BASE}/webmcp/sites/${site.host}`,
      site,
      selectedTool: selected || null,
      related: relatedSites(site),
      scorecard: site.scorecard || null,
    }));
  });

  // --- Public API ---
  app.get('/api/webmcp/v1/stats', (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ ok: true, ...getWebmcpStats() });
  });

  app.get('/api/webmcp/v1/sites', (req, res) => {
    const filtered = filterSites(req.query);
    const { items, page, limit, total, pages } = paginate(filtered, req.query.page, req.query.limit || 50);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      ok: true,
      generated_at: getWebmcpStats().generated_at,
      page,
      limit,
      total,
      pages,
      filters: {
        q: req.query.q || null,
        category: req.query.category || null,
        type: req.query.type || null,
        kind: req.query.kind || null,
        verified: req.query.verified || null,
        implementation: req.query.implementation || null,
        status: req.query.status || null,
        min_tools: req.query.min_tools || null,
        sort: req.query.sort || 'relevance',
      },
      sites: items.map(siteSummary),
    });
  });

  app.get('/api/webmcp/v1/sites/:host', (req, res) => {
    const site = findSiteByHost(req.params.host);
    if (!site) return res.status(404).json({ ok: false, error: 'not_found' });
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      ok: true,
      site: {
        ...siteSummary(site),
        description: site.description,
        provenance: site.provenance,
        api_surface: site.api_surface,
        tools: site.tools,
      },
      related: relatedSites(site),
      scorecard: site.score == null
        ? { status: 'not_scored', note: 'Transparent scorecards ship in a later phase.' }
        : { overall_score: site.score, grade: site.grade },
    });
  });

  app.get('/api/webmcp/v1/tools', (req, res) => {
    const tools = listTools(req.query);
    const { items, page, limit, total, pages } = paginate(tools, req.query.page, req.query.limit || 50);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ ok: true, page, limit, total, pages, tools: items });
  });

  app.get('/api/webmcp/v1/lookup', (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ ok: false, error: 'url_required' });
    const site = lookupByUrl(String(url));
    res.set('Cache-Control', 'public, max-age=30');
    res.json({ ok: true, found: Boolean(site), site });
  });

  app.get('/api/webmcp/v1/self', (req, res) => {
    const manifest = loadSelfToolsManifest();
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      ok: true,
      host: manifest.host || 'influzer.ai',
      name: manifest.name || 'Influzer.ai',
      description: manifest.description || '',
      canonical_url: manifest.canonical_url || `${SITE_BASE}/`,
      demo_url: manifest.demo_url || `${SITE_BASE}/webmcp/demo`,
      category: manifest.category || 'Directories & Discovery',
      site_type: manifest.site_type || 'live',
      implementation: manifest.implementation || 'imperative',
      api_surface: manifest.api_surface || 'spec',
      tool_count: (manifest.tools || []).length,
      tools: manifest.tools || [],
      how_to_test: {
        browser_demo: `${SITE_BASE}/webmcp/demo`,
        node_script: 'node scripts/demo-influzer-webmcp.js',
        unit_test: 'node scripts/test-influzer-webmcp.js',
        standard: 'https://github.com/webmachinelearning/webmcp',
      },
    });
  });
}

function expressJsonOptional() {
  // Lightweight middleware factory — body may already be parsed globally
  return (req, res, next) => next();
}

function getWebmcpSitemapEntries() {
  const { sites, categories, generatedAt } = loadCatalog();
  const lastmod = (generatedAt || new Date().toISOString()).slice(0, 10);
  const entries = [
    { loc: `${SITE_BASE}/webmcp`, lastmod, changefreq: 'daily', priority: '0.9' },
    { loc: `${SITE_BASE}/webmcp/tools`, lastmod, changefreq: 'daily', priority: '0.8' },
    { loc: `${SITE_BASE}/webmcp/demo`, lastmod, changefreq: 'weekly', priority: '0.8' },
    { loc: `${SITE_BASE}/webmcp/ecosystem`, lastmod, changefreq: 'weekly', priority: '0.7' },
    { loc: `${SITE_BASE}/webmcp/resources`, lastmod, changefreq: 'weekly', priority: '0.7' },
    { loc: `${SITE_BASE}/webmcp/about`, lastmod, changefreq: 'monthly', priority: '0.6' },
    { loc: `${SITE_BASE}/webmcp/submit`, lastmod, changefreq: 'monthly', priority: '0.5' },
  ];
  for (const c of categories) {
    entries.push({
      loc: `${SITE_BASE}/webmcp/categories/${c.slug}`,
      lastmod,
      changefreq: 'weekly',
      priority: '0.7',
    });
  }
  for (const s of sites) {
    entries.push({
      loc: `${SITE_BASE}/webmcp/sites/${s.host}`,
      lastmod: String(s.last_seen_at || lastmod).slice(0, 10),
      changefreq: 'weekly',
      priority: '0.6',
    });
  }
  return entries;
}

module.exports = {
  clearWebmcpCache,
  loadCatalog,
  loadSelfToolsManifest,
  getWebmcpStats,
  filterSites,
  findSiteByHost,
  listTools,
  registerWebmcpRoutes,
  getWebmcpSitemapEntries,
  siteSummary,
  slugifyCategory,
};
