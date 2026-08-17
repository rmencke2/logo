#!/usr/bin/env node
'use strict';

/**
 * Upsert Influzer.ai as a first-party WebMCP site into the catalog.
 * Source of tool schemas: data/influzer-webmcp-tools.json
 *
 *   node scripts/upsert-influzer-webmcp-site.js
 */

const fs = require('fs');
const path = require('path');
const { normalizeSite, slugifyCategory } = require('../services/webmcp/normalize');

const ROOT = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'data', 'influzer-webmcp-tools.json');
const SITES_PATH = path.join(ROOT, 'data', 'webmcp-sites.json');
const META_PATH = path.join(ROOT, 'data', 'webmcp-meta.json');
const CATEGORIES_PATH = path.join(ROOT, 'data', 'webmcp-categories.json');
const MANUAL_PATH = path.join(ROOT, 'data', 'webmcp-manual.json');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
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

function buildInfluzerSite(manifest, previous) {
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
        outputSchema: t.output_schema || null,
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
  site.last_verified_at = now.slice(0, 10);
  site.editorial_notes = 'First-party Influzer WebMCP showcase. Tools registered via document.modelContext on site pages.';
  return site;
}

function main() {
  const manifest = readJson(MANIFEST_PATH, null);
  if (!manifest?.host || !Array.isArray(manifest.tools)) {
    throw new Error('Missing or invalid data/influzer-webmcp-tools.json');
  }

  const sitesFile = readJson(SITES_PATH, { version: 1, sites: [] });
  const sites = Array.isArray(sitesFile.sites) ? sitesFile.sites.slice() : [];
  const prevIdx = sites.findIndex((s) => s.host === 'influzer.ai');
  const previous = prevIdx >= 0 ? sites[prevIdx] : null;
  const site = buildInfluzerSite(manifest, previous);

  if (prevIdx >= 0) sites[prevIdx] = site;
  else sites.push(site);

  sites.sort((a, b) => (b.tool_count || 0) - (a.tool_count || 0) || a.host.localeCompare(b.host));

  const published = sites.filter((s) => s.published !== false);
  const now = new Date().toISOString();
  const meta = readJson(META_PATH, {});
  const categories = rebuildCategories(sites);

  writeJson(SITES_PATH, {
    ...sitesFile,
    version: 1,
    sites,
  });
  writeJson(META_PATH, {
    ...meta,
    refreshed_at: now,
    site_count: published.length,
    tool_count: published.reduce((n, s) => n + (s.tool_count || 0), 0),
    live_count: published.filter((s) => s.site_type === 'live').length,
    demo_count: published.filter((s) => s.site_type === 'demo').length,
    category_count: categories.length,
  });
  writeJson(CATEGORIES_PATH, { generated_at: now, categories });

  // Keep manual overlay so catalog refresh preserves Influzer metadata
  const manual = readJson(MANUAL_PATH, { sites: {} });
  manual.sites = manual.sites || {};
  manual.sites['influzer.ai'] = {
    name: manifest.name,
    description: manifest.description,
    category: manifest.category,
    site_type: 'live',
    verification_status: 'verified',
    published: true,
    editorial_notes: 'First-party WebMCP showcase — tools from data/influzer-webmcp-tools.json',
    tools_source: 'data/influzer-webmcp-tools.json',
  };
  writeJson(MANUAL_PATH, manual);

  console.log(`Upserted influzer.ai with ${site.tool_count} tools (verified)`);
  console.log(`Catalog now ${published.length} published sites`);
}

main();
