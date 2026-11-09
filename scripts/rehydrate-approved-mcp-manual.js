#!/usr/bin/env node
'use strict';

/**
 * After deploy reset, rebuild any approved submission slugs that are missing
 * from data/mcp-servers-manual.json. Submissions live only on the server
 * (gitignored); approvals used to vanish on git reset --hard.
 *
 * Usage: node scripts/rehydrate-approved-mcp-manual.js
 */

const fs = require('fs');
const path = require('path');
const {
  submissionToManualServer,
  validateManualServer,
  parseToolsFromText,
} = require('../services/mcpCatalogAdminService');

const ROOT = path.join(__dirname, '..');
const MANUAL_PATH = path.join(ROOT, 'data', 'mcp-servers-manual.json');
const SUBMISSIONS_DIR = path.join(ROOT, 'data', 'mcp-submissions');

function readManual() {
  if (!fs.existsSync(MANUAL_PATH)) return { categories: [], servers: [] };
  const data = JSON.parse(fs.readFileSync(MANUAL_PATH, 'utf8'));
  if (!Array.isArray(data.servers)) data.servers = [];
  return data;
}

function listApprovedSubmissions() {
  if (!fs.existsSync(SUBMISSIONS_DIR)) return [];
  const bySlug = new Map();
  for (const name of fs.readdirSync(SUBMISSIONS_DIR)) {
    if (!name.endsWith('.json')) continue;
    let sub;
    try {
      sub = JSON.parse(fs.readFileSync(path.join(SUBMISSIONS_DIR, name), 'utf8'));
    } catch {
      continue;
    }
    if (sub.reviewStatus !== 'approved') continue;
    const slug = String(sub.approvedSlug || sub.suggestedSlug || '').trim();
    if (!slug) continue;
    const t = Date.parse(sub.reviewedAt || sub.submittedAt || 0) || 0;
    const prev = bySlug.get(slug);
    const pt = prev ? Date.parse(prev.reviewedAt || prev.submittedAt || 0) || 0 : -1;
    if (!prev || t >= pt) bySlug.set(slug, sub);
  }
  return [...bySlug.values()];
}

function buildServer(sub) {
  const server = submissionToManualServer(sub, {});
  if (!server.tools?.length && sub.toolsFormatted) {
    server.tools = parseToolsFromText(sub.toolsFormatted);
  }
  if (server.tools?.length === 1 && !server.tools[0].description && sub.toolsFormatted) {
    const parsed = parseToolsFromText(sub.toolsFormatted);
    if (parsed.length > 1) server.tools = parsed;
  }
  validateManualServer(server);
  return server;
}

function main() {
  const manual = readManual();
  const existing = new Set(manual.servers.map((s) => s.slug).filter(Boolean));
  const restored = [];
  const skipped = [];

  for (const sub of listApprovedSubmissions()) {
    const slug = String(sub.approvedSlug || sub.suggestedSlug || '').trim();
    if (existing.has(slug)) {
      skipped.push({ slug, reason: 'already-present' });
      continue;
    }
    try {
      const server = buildServer(sub);
      manual.servers.unshift(server);
      existing.add(slug);
      restored.push(slug);
    } catch (err) {
      skipped.push({ slug, reason: err.message });
    }
  }

  if (restored.length) {
    fs.writeFileSync(MANUAL_PATH, `${JSON.stringify(manual, null, 2)}\n`, 'utf8');
    console.log(
      `Rehydrated ${restored.length} approved MCP listing(s) from submissions: ${restored.join(', ')}`,
    );
  } else {
    console.log('No approved submissions needed rehydration into the manual catalog');
  }
  if (skipped.length) {
    console.log(`Skipped ${skipped.length} (already present or invalid)`);
  }
}

main();
