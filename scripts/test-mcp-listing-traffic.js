'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const tmpDb = path.join(
  os.tmpdir(),
  `mcp-traffic-test-${process.pid}-${crypto.randomBytes(4).toString('hex')}.db`,
);
process.env.DB_PATH = tmpDb;
delete require.cache[require.resolve('../database')];

const { getDatabase } = require('../database');
const {
  slugFromMcpPage,
  getWeeklyListingRanking,
  getHomeTopServersByTraffic,
  buildWeeklyCongratsEmail,
  clearTrafficCache,
  weekKey,
} = require('../services/mcpListingTrafficService');
const { findMcpServerBySlug } = require('../services/mcpDirectoryService');

async function insertPageView(db, page, ip, createdAt) {
  await new Promise((resolve, reject) => {
    db.db.run(
      `INSERT INTO page_views (page, user_id, ip_address, country, user_agent, referrer, created_at)
       VALUES (?, NULL, ?, 'Test', 'test-agent', '', ?)`,
      [page, ip, createdAt],
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

async function ensurePageViews(db) {
  await new Promise((resolve, reject) => {
    db.db.run(
      `CREATE TABLE IF NOT EXISTS page_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        page TEXT,
        user_id INTEGER,
        ip_address TEXT,
        country TEXT,
        user_agent TEXT,
        referrer TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

async function main() {
  assert.equal(slugFromMcpPage('/mcp/firecrawl'), 'firecrawl');
  assert.equal(slugFromMcpPage('/mcp/submit'), null);
  assert.equal(slugFromMcpPage('/mcp/discovery/setup'), null);
  assert.equal(slugFromMcpPage('/insights/foo'), null);

  const firecrawl = findMcpServerBySlug('firecrawl');
  const postgres = findMcpServerBySlug('postgres');
  assert.ok(firecrawl && postgres, 'need catalog fixtures');

  const db = await getDatabase();
  await ensurePageViews(db);
  const now = new Date();
  const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
  const old = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);

  // firecrawl: 5 views / 3 uniques
  await insertPageView(db, '/mcp/firecrawl', '1.1.1.1', recent);
  await insertPageView(db, '/mcp/firecrawl', '1.1.1.1', recent);
  await insertPageView(db, '/mcp/firecrawl', '1.1.1.2', recent);
  await insertPageView(db, '/mcp/firecrawl', '1.1.1.3', recent);
  await insertPageView(db, '/mcp/firecrawl', '1.1.1.3', recent);
  // postgres: 2 views
  await insertPageView(db, '/mcp/postgres', '2.2.2.2', recent);
  await insertPageView(db, '/mcp/postgres', '2.2.2.3', recent);
  // noise
  await insertPageView(db, '/mcp/submit', '9.9.9.9', recent);
  await insertPageView(db, '/mcp/firecrawl', '8.8.8.8', old);

  clearTrafficCache();
  const ranked = await getWeeklyListingRanking({ days: 7, limit: 10, useCache: false });
  assert.ok(ranked.length >= 2);
  assert.equal(ranked[0].slug, 'firecrawl');
  assert.equal(ranked[0].views, 5);
  assert.equal(ranked[0].unique_visitors, 3);
  assert.equal(ranked[1].slug, 'postgres');

  const home = await getHomeTopServersByTraffic(6, { days: 7 });
  assert.equal(home.items[0].server.slug, 'firecrawl');
  assert.equal(home.items[0].source, 'traffic');
  assert.ok(home.items.length === 6);

  const email = buildWeeklyCongratsEmail({
    contact: { name: 'Alex', email: 'alex@example.com' },
    server: firecrawl,
    stats: { views: 5, unique_visitors: 3 },
    rank: 1,
    week: weekKey(),
  });
  assert.match(email.subject, /5/);
  assert.match(email.html, /Sponsored/);
  assert.match(email.html, /recipes\/new\?server=firecrawl/);
  assert.match(email.text, /Unique visitors: 3/);

  console.log('MCP listing traffic tests passed');
  await new Promise((resolve) => db.db.close(() => resolve()));
  try {
    fs.unlinkSync(tmpDb);
  } catch {
    /* ignore */
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  try {
    fs.unlinkSync(tmpDb);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
