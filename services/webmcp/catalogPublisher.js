'use strict';

/**
 * Publish a scanned WebMCP site into the Influzer catalog JSON snapshot.
 */

const fs = require('fs');
const path = require('path');
const { normalizeSite, slugifyCategory } = require('./normalize');

const ROOT = path.join(__dirname, '..', '..');
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

function guessCategory(tools = []) {
  const hay = tools.map((t) => `${t.name} ${t.description}`).join(' ').toLowerCase();
  if (/directory|search_webmcp|catalog|listing/.test(hay)) return 'Directories & Discovery';
  if (/shop|cart|checkout|product/.test(hay)) return 'E-commerce';
  if (/docs|api|developer|sdk/.test(hay)) return 'Developer Tools';
  if (/chat|agent|ai/.test(hay)) return 'AI & Agents';
  return 'Uncategorized';
}

function publishScannedSite({ scanResult, scorecard, clearCache }) {
  if (!scanResult?.host || !Array.isArray(scanResult.tools) || !scanResult.tools.length) {
    return { published: false, reason: 'no_tools' };
  }

  const now = new Date().toISOString();
  const sitesFile = readJson(SITES_PATH, { version: 1, sites: [] });
  const sites = Array.isArray(sitesFile.sites) ? sitesFile.sites.slice() : [];
  const prevIdx = sites.findIndex((s) => s.host === scanResult.host);
  const previous = prevIdx >= 0 ? sites[prevIdx] : null;

  // Never overwrite first-party Influzer curated tools with a thinner scan
  if (scanResult.host === 'influzer.ai' && previous?.provenance?.source_name === 'influzer.ai') {
    if ((previous.tool_count || 0) >= scanResult.tools.length) {
      return {
        published: true,
        reason: 'first_party_preserved',
        host: scanResult.host,
        site: previous,
      };
    }
  }

  const category = previous?.category || guessCategory(scanResult.tools);
  const site = normalizeSite(
    {
      host: scanResult.host,
      name: previous?.name || scanResult.site_guess?.name || scanResult.host,
      url: scanResult.canonical_url,
      desc: previous?.description || scanResult.site_guess?.description || '',
      category,
      type: 'live',
      apiSurface: 'spec',
      tools: scanResult.tools.map((t) => ({
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
        source_name: 'influzer-scan',
        source_url: `https://www.influzer.ai/webmcp/sites/${scanResult.host}`,
        imported_at: now,
      },
    },
  );

  site.last_verified_at = now.slice(0, 10);
  site.score = scorecard?.score ?? null;
  site.grade = scorecard?.grade ?? null;
  site.editorial_notes = `Influzer scan ${scorecard?.grade || ''} (${scorecard?.score ?? '?'}). Auto-listed after tool detection.`;
  site.scorecard = scorecard || null;

  if (prevIdx >= 0) sites[prevIdx] = site;
  else sites.push(site);
  sites.sort((a, b) => (b.tool_count || 0) - (a.tool_count || 0) || a.host.localeCompare(b.host));

  const published = sites.filter((s) => s.published !== false);
  const categories = rebuildCategories(sites);
  const meta = readJson(META_PATH, {});

  writeJson(SITES_PATH, { ...sitesFile, version: 1, sites });
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

  const manual = readJson(MANUAL_PATH, { sites: {} });
  manual.sites = manual.sites || {};
  // Don't clobber curated Influzer first-party manual entry
  if (scanResult.host !== 'influzer.ai' || !manual.sites['influzer.ai']?.tools_source) {
    manual.sites[scanResult.host] = {
      ...(manual.sites[scanResult.host] || {}),
      name: site.name,
      description: site.description,
      category: site.category,
      site_type: 'live',
      verification_status: 'verified',
      published: true,
      editorial_notes: site.editorial_notes,
    };
    writeJson(MANUAL_PATH, manual);
  }

  if (typeof clearCache === 'function') clearCache();

  return { published: true, host: site.host, site, reason: 'listed' };
}

module.exports = {
  publishScannedSite,
  guessCategory,
};
