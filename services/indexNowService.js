'use strict';

/**
 * IndexNow — notify Bing/Yandex/compatible engines of URL changes.
 * Key file is served at https://www.influzer.ai/{key}.txt
 */

const fs = require('fs');
const path = require('path');
const { getTop100McpServers } = require('./mcpDirectoryService');

const SITE_HOST = 'www.influzer.ai';
const SITE_BASE = `https://${SITE_HOST}`;
const KEY_FILE = path.join(__dirname, '..', 'public', 'indexnow-key.txt');
const BLOG_POSTS_DIR = path.join(__dirname, '..', 'content', 'blog');
const ENDPOINT = process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';

function readKey() {
  const fromEnv = String(process.env.INDEXNOW_KEY || '').trim();
  if (fromEnv) return fromEnv;
  try {
    return fs.readFileSync(KEY_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}

function keyLocation(key) {
  return `${SITE_BASE}/${encodeURIComponent(key)}.txt`;
}

function recentInsightSlugs(limit = 20) {
  if (!fs.existsSync(BLOG_POSTS_DIR)) return [];
  const files = fs.readdirSync(BLOG_POSTS_DIR).filter((f) => f.endsWith('.json'));
  const posts = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(BLOG_POSTS_DIR, file), 'utf8'));
      if (parsed?.slug && parsed?.date) posts.push({ slug: parsed.slug, date: parsed.date });
    } catch {
      // skip bad post files
    }
  }
  return posts
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limit)
    .map((p) => p.slug);
}

function moneyPageUrls() {
  const urls = [
    `${SITE_BASE}/`,
    `${SITE_BASE}/mcp`,
    `${SITE_BASE}/mcp/all`,
    `${SITE_BASE}/mcp/submit`,
    `${SITE_BASE}/mcp/scoreboard`,
    `${SITE_BASE}/mcp/discovery/setup`,
    `${SITE_BASE}/mcp/discovery/starters`,
    `${SITE_BASE}/insights`,
    `${SITE_BASE}/news`,
    `${SITE_BASE}/webmcp`,
    `${SITE_BASE}/recipes`,
    `${SITE_BASE}/methodology`,
    `${SITE_BASE}/modelspend`,
    `${SITE_BASE}/llms.txt`,
  ];
  for (const s of getTop100McpServers().slice(0, 40)) {
    urls.push(`${SITE_BASE}/mcp/${s.slug}`);
  }
  for (const slug of recentInsightSlugs(20)) {
    urls.push(`${SITE_BASE}/insights/${slug}`);
  }
  return [...new Set(urls)];
}

/**
 * @param {string[]} urlList
 * @param {{ dryRun?: boolean }} [opts]
 */
async function submitIndexNow(urlList, opts = {}) {
  const key = readKey();
  if (!key) {
    return { ok: false, skipped: true, reason: 'missing IndexNow key' };
  }
  const list = (urlList || []).filter((u) => typeof u === 'string' && u.startsWith(SITE_BASE));
  if (!list.length) {
    return { ok: false, skipped: true, reason: 'no urls' };
  }
  const body = {
    host: SITE_HOST,
    key,
    keyLocation: keyLocation(key),
    urlList: list.slice(0, 10000),
  };
  if (opts.dryRun) {
    return { ok: true, dryRun: true, submitted: body.urlList.length, endpoint: ENDPOINT };
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  return {
    ok: res.status === 200 || res.status === 202,
    status: res.status,
    submitted: body.urlList.length,
    body: text.slice(0, 500),
  };
}

function registerIndexNowRoutes(app) {
  const key = readKey();
  if (!key) return;

  // IndexNow key verification file.
  app.get(`/${key}.txt`, (req, res) => {
    res.type('text/plain');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(key);
  });
}

module.exports = {
  readKey,
  keyLocation,
  moneyPageUrls,
  submitIndexNow,
  registerIndexNowRoutes,
  SITE_BASE,
  SITE_HOST,
};
