#!/usr/bin/env node
'use strict';

/**
 * Follow https://github.com/webmachinelearning/webmcp and refresh Influzer's
 * WebMCP standard snapshot + browser compatibility entries.
 *
 * Usage:
 *   node scripts/refresh-webmcp-standard.js
 *   node scripts/refresh-webmcp-standard.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const {
  fetchStandardSnapshot,
  mapBrowserToEcosystemEntry,
} = require('../services/webmcp/standardTracker');

const ROOT = path.join(__dirname, '..');
const STANDARD_PATH = path.join(ROOT, 'data', 'webmcp-standard.json');
const ECOSYSTEM_PATH = path.join(ROOT, 'data', 'webmcp-ecosystem.json');

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function mergeEcosystem(existing, snapshot) {
  const checkedDay = snapshot.checked_at.slice(0, 10);
  const trackedBrowsers = (snapshot.implementation_browsers || []).map((b) =>
    mapBrowserToEcosystemEntry(b, snapshot.checked_at),
  );
  const bySlug = new Map((existing.entries || []).map((e) => [e.slug, e]));

  for (const browser of trackedBrowsers) {
    const prev = bySlug.get(browser.slug) || {};
    bySlug.set(browser.slug, {
      ...prev,
      ...browser,
      // Keep a human editorial summary only if parser summary is empty
      summary: browser.summary || prev.summary,
    });
  }

  // Ensure canonical standards entry stays present and fresh
  bySlug.set('w3c-webmcp-draft', {
    name: 'W3C WebMCP (webmachinelearning/webmcp)',
    slug: 'w3c-webmcp-draft',
    group: 'frameworks',
    support_status: 'partial',
    version_or_flag: `main @ ${snapshot.repo.head_sha_short || 'unknown'}`,
    summary:
      'Canonical WebMCP incubation repo (W3C Web Machine Learning Community Group). Influzer tracks commits and implementation-status.md from this repository.',
    evidence_url: snapshot.repo.html_url,
    verified_at: checkedDay,
    sort_order: 5,
    tracked_from: 'webmachinelearning/webmcp',
  });

  bySlug.set('webmcp-types', {
    name: 'webmcp-types (npm)',
    slug: 'webmcp-types',
    group: 'frameworks',
    support_status: 'supported',
    version_or_flag: 'TypeScript definitions',
    summary: 'Official TypeScript type definitions for WebMCP, published alongside the standards effort.',
    evidence_url: snapshot.links.npm_types,
    verified_at: checkedDay,
    sort_order: 15,
    tracked_from: 'webmachinelearning/webmcp',
  });

  const entries = [...bySlug.values()].sort(
    (a, b) => (a.sort_order || 99) - (b.sort_order || 99) || a.name.localeCompare(b.name),
  );

  return {
    generated_at: snapshot.checked_at,
    tracked_repo: snapshot.repo.full_name,
    head_sha: snapshot.repo.head_sha_short,
    entries,
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`==> Refresh WebMCP standard tracker${dryRun ? ' (dry run)' : ''}`);

  const snapshot = await fetchStandardSnapshot();
  const existingEcosystem = readJson(ECOSYSTEM_PATH, { entries: [] });
  const ecosystem = mergeEcosystem(existingEcosystem, snapshot);

  console.log(`    repo: ${snapshot.repo.full_name}`);
  console.log(`    head: ${snapshot.repo.head_sha_short} · pushed ${snapshot.repo.pushed_at}`);
  console.log(`    stars: ${snapshot.repo.stars} · open issues: ${snapshot.repo.open_issues}`);
  console.log(`    commits tracked: ${snapshot.recent_commits.length}`);
  console.log(`    browsers from implementation-status.md: ${snapshot.implementation_browsers.length}`);
  for (const b of snapshot.implementation_browsers) {
    console.log(`      - ${b.name}: ${b.support_status}${b.version_or_flag ? ` (${b.version_or_flag})` : ''}`);
  }

  if (dryRun) return;

  writeJson(STANDARD_PATH, snapshot);
  writeJson(ECOSYSTEM_PATH, ecosystem);
  console.log(`    wrote ${path.relative(ROOT, STANDARD_PATH)}`);
  console.log(`    wrote ${path.relative(ROOT, ECOSYSTEM_PATH)}`);
}

main().catch((err) => {
  console.error('WebMCP standard refresh failed:', err.message);
  process.exit(1);
});
