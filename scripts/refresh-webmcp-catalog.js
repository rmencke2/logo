#!/usr/bin/env node
'use strict';

/**
 * Idempotent WebMCP catalog refresh from the public discovery API.
 *
 * Usage:
 *   node scripts/refresh-webmcp-catalog.js
 *
 * Writes:
 *   data/webmcp-sites.json
 *   data/webmcp-meta.json
 */

const fs = require('fs');
const path = require('path');
const { WebMcpDiscoveryProvider } = require('../services/webmcp/discoveryProvider');
const { normalizeSite, slugifyCategory } = require('../services/webmcp/normalize');

const ROOT = path.join(__dirname, '..');
const SITES_PATH = path.join(ROOT, 'data', 'webmcp-sites.json');
const META_PATH = path.join(ROOT, 'data', 'webmcp-meta.json');
const MANUAL_PATH = path.join(ROOT, 'data', 'webmcp-manual.json');
const CATEGORIES_PATH = path.join(ROOT, 'data', 'webmcp-categories.json');
const SELF_TOOLS_PATH = path.join(ROOT, 'data', 'influzer-webmcp-tools.json');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function loadManualByHost() {
  const manual = readJson(MANUAL_PATH, { sites: {} });
  return manual.sites && typeof manual.sites === 'object' ? manual.sites : {};
}

function applyManual(site, overlay) {
  if (!overlay) return site;
  const next = { ...site };
  if (overlay.name) next.name = overlay.name;
  if (overlay.description != null) next.description = overlay.description;
  if (overlay.category) {
    next.category = overlay.category;
    next.category_slug = slugifyCategory(overlay.category);
  }
  if (overlay.site_type) next.site_type = overlay.site_type;
  if (overlay.published === false) next.published = false;
  if (overlay.published === true) next.published = true;
  if (overlay.verification_status) next.verification_status = overlay.verification_status;
  if (overlay.editorial_notes) next.editorial_notes = overlay.editorial_notes;
  return next;
}

function buildFirstPartyInfluzerSite(previous) {
  const manifest = readJson(SELF_TOOLS_PATH, null);
  if (!manifest?.host || !Array.isArray(manifest.tools)) return null;
  const now = new Date().toISOString();
  const site = normalizeSite(
    {
      host: manifest.host,
      name: manifest.name,
      url: manifest.canonical_url,
      desc: manifest.description,
      category: manifest.category,
      type: manifest.site_type || 'live',
      apiSurface: manifest.api_surface || 'spec',
      favicon: 'https://www.influzer.ai/favicon-32x32.png',
      tools: (manifest.tools || []).map((t) => ({
        name: t.name,
        description: t.description,
        kind: t.kind,
        impl: t.implementation_type || 'imperative',
        page: t.page_url || '/',
        inputSchema: t.input_schema || { type: 'object' },
      })),
    },
    {
      verification_status: 'verified',
      availability_status: 'active',
      published: true,
      first_seen_at: previous?.first_seen_at || now,
      last_seen_at: now,
      provenance: {
        source_name: 'influzer.ai',
        source_url: 'https://www.influzer.ai/webmcp/demo',
        imported_at: now,
      },
    },
  );
  if (site) {
    site.last_verified_at = now.slice(0, 10);
    site.editorial_notes =
      'First-party Influzer WebMCP showcase. Tools registered via document.modelContext.';
  }
  return site;
}

function rebuildCategories(sites) {
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

async function main() {
  const previous = readJson(SITES_PATH, { sites: [] });
  const previousByHost = new Map((previous.sites || []).map((s) => [s.host, s]));
  const manualByHost = loadManualByHost();

  const provider = new WebMcpDiscoveryProvider();
  console.log('Fetching WebMCP discovery catalog…');
  const { sites: rawSites, total, pages, generatedAt } = await provider.listAllSites({
    fields: 'full',
    type: 'all',
  });
  console.log(`Fetched ${rawSites.length} sites (reported total ${total}) across ${pages} pages`);

  const now = new Date().toISOString();
  const normalized = [];
  for (const raw of rawSites) {
    const prev = previousByHost.get(String(raw.host || '').toLowerCase().replace(/^www\./, ''));
    let site = normalizeSite(raw, {
      verification_status: 'unverified',
      availability_status: 'active',
      published: true,
      first_seen_at: prev?.first_seen_at || now,
      last_seen_at: now,
      provenance: {
        source_name: 'webmcp.com',
        source_url: `https://webmcp.com/sites/${normalizeSite(raw)?.host || raw.host}`,
        imported_at: now,
      },
    });
    if (!site) continue;
    site = applyManual(site, manualByHost[site.host]);
    // Preserve Influzer verification if manual set it
    if (prev?.verification_status === 'verified' && !manualByHost[site.host]?.verification_status) {
      site.verification_status = 'verified';
      site.last_verified_at = prev.last_verified_at;
    }
    normalized.push(site);
  }

  // Always publish first-party Influzer WebMCP showcase (not dependent on upstream)
  const influzer = buildFirstPartyInfluzerSite(previousByHost.get('influzer.ai'));
  if (influzer) {
    const idx = normalized.findIndex((s) => s.host === 'influzer.ai');
    if (idx >= 0) normalized[idx] = influzer;
    else normalized.push(influzer);
  }

  normalized.sort((a, b) => b.tool_count - a.tool_count || a.host.localeCompare(b.host));

  const published = normalized.filter((s) => s.published !== false);
  const toolTotal = published.reduce((n, s) => n + (s.tool_count || 0), 0);
  const liveCount = published.filter((s) => s.site_type === 'live').length;
  const demoCount = published.filter((s) => s.site_type === 'demo').length;

  const payload = {
    version: 1,
    generated_at: generatedAt,
    source: {
      name: 'webmcp.com',
      base_url: process.env.WEBMCP_DISCOVERY_BASE_URL || 'https://webmcp.com',
      reported_total: total,
    },
    sites: normalized,
  };

  const meta = {
    generated_at: generatedAt,
    refreshed_at: now,
    site_count: published.length,
    tool_count: toolTotal,
    live_count: liveCount,
    demo_count: demoCount,
    category_count: 0,
    upstream_total: total,
  };

  const categories = rebuildCategories(normalized);
  meta.category_count = categories.length;

  writeJson(SITES_PATH, payload);
  writeJson(META_PATH, meta);
  writeJson(CATEGORIES_PATH, { generated_at: now, categories });

  console.log(`Wrote ${normalized.length} sites (${published.length} published), ${toolTotal} tools`);
  console.log(`Categories: ${categories.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
