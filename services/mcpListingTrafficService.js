/**
 * MCP listing traffic — weekly ranking from /mcp/:slug page views,
 * owner contact resolution, and congrats-email helpers.
 */

const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../database');
const {
  findMcpServerBySlug,
  getMcpHomepagePreview,
  getAllMcpServers,
} = require('./mcpDirectoryService');
const { isReservedMcpPath } = require('./mcpSubmissionService');

const SUBMISSIONS_DIR = path.join(__dirname, '..', 'data', 'mcp-submissions');
const MANUAL_PATH = path.join(__dirname, '..', 'data', 'mcp-servers-manual.json');
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 60 * 1000;

let rankingCache = { at: 0, days: 7, rows: null };

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function sinceIso(days = 7) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
}

function weekKey(date = new Date()) {
  // ISO week: YYYY-Www
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function slugFromMcpPage(page) {
  const match = String(page || '').match(/^\/mcp\/([^/?#]+)\/?$/i);
  if (!match) return null;
  const slug = decodeURIComponent(match[1]).toLowerCase();
  if (!slug || isReservedMcpPath(slug)) return null;
  // Nested discovery pages are reserved prefixes; single-segment only already.
  if (slug.includes('.')) return null;
  return slug;
}

async function ensureTrafficTables(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS mcp_weekly_traffic_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_key TEXT NOT NULL,
      slug TEXT NOT NULL,
      email TEXT NOT NULL,
      views INTEGER DEFAULT 0,
      unique_visitors INTEGER DEFAULT 0,
      rank_position INTEGER,
      message_id TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(week_key, slug, email)
    )`,
  );
  await dbRun(
    db,
    'CREATE INDEX IF NOT EXISTS idx_mcp_weekly_traffic_week ON mcp_weekly_traffic_emails(week_key)',
  );
}

/**
 * Rank listing pages by views in the last `days` days.
 * Uses existing page_views rows written for GET /mcp/:slug.
 */
async function getWeeklyListingRanking({ days = 7, limit = 50, useCache = true } = {}) {
  if (
    useCache &&
    rankingCache.rows &&
    rankingCache.days === days &&
    Date.now() - rankingCache.at < CACHE_TTL_MS
  ) {
    return rankingCache.rows.slice(0, limit);
  }

  const db = await getDatabase();
  const since = sinceIso(days);
  const rows = await dbAll(
    db,
    `SELECT page,
            COUNT(*) as views,
            COUNT(DISTINCT ip_address) as unique_visitors
     FROM page_views
     WHERE created_at > ?
       AND page LIKE '/mcp/%'
       AND page NOT LIKE '/mcp/%/%'
     GROUP BY page
     ORDER BY views DESC
     LIMIT 500`,
    [since],
  );

  const ranked = [];
  for (const row of rows) {
    const slug = slugFromMcpPage(row.page);
    if (!slug) continue;
    const server = findMcpServerBySlug(slug);
    if (!server || server.hidden) continue;
    ranked.push({
      slug,
      name: server.name,
      category: server.category || '',
      views: row.views || 0,
      unique_visitors: row.unique_visitors || 0,
      page: row.page,
    });
  }

  rankingCache = { at: Date.now(), days, rows: ranked };
  return ranked.slice(0, limit);
}

function loadApprovedSubmissionContacts() {
  const bySlug = new Map();
  if (!fs.existsSync(SUBMISSIONS_DIR)) return bySlug;
  let files = [];
  try {
    files = fs.readdirSync(SUBMISSIONS_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return bySlug;
  }
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(SUBMISSIONS_DIR, file), 'utf8'));
      if (data.reviewStatus && data.reviewStatus !== 'approved') continue;
      const slug = String(data.approvedSlug || data.suggestedSlug || '')
        .toLowerCase()
        .trim();
      const email = String(data.submitterEmail || '')
        .trim()
        .toLowerCase();
      if (!slug || !email || !email.includes('@')) continue;
      // Prefer newer files / keep first if already set with email
      if (!bySlug.has(slug)) {
        bySlug.set(slug, {
          email,
          name: data.submitterName || '',
          source: 'submission',
          userId: data.submitterUserId || null,
        });
      }
    } catch {
      /* ignore bad file */
    }
  }
  return bySlug;
}

function loadManualOwnerUserIds() {
  const bySlug = new Map();
  try {
    if (!fs.existsSync(MANUAL_PATH)) return bySlug;
    const data = JSON.parse(fs.readFileSync(MANUAL_PATH, 'utf8'));
    for (const server of data.servers || []) {
      if (server.owner_user_id && server.slug) {
        bySlug.set(String(server.slug).toLowerCase(), Number(server.owner_user_id));
      }
    }
  } catch {
    /* ignore */
  }
  return bySlug;
}

async function resolveListingContacts(slugs) {
  const db = await getDatabase();
  const submissionContacts = loadApprovedSubmissionContacts();
  const manualOwners = loadManualOwnerUserIds();
  const out = [];

  for (const slug of slugs) {
    const key = String(slug).toLowerCase();
    let contact = submissionContacts.get(key) || null;

    if (!contact) {
      const ownerId = manualOwners.get(key);
      if (ownerId) {
        const user = await dbGet(
          db,
          'SELECT id, email, name FROM users WHERE id = ? AND email IS NOT NULL AND email != ""',
          [ownerId],
        );
        if (user?.email) {
          contact = {
            email: String(user.email).toLowerCase(),
            name: user.name || '',
            source: 'owner_user',
            userId: user.id,
          };
        }
      }
    }

    // Also try catalog owner_user_id from live merge
    if (!contact) {
      const server = findMcpServerBySlug(key);
      if (server?.owner_user_id) {
        const user = await dbGet(
          db,
          'SELECT id, email, name FROM users WHERE id = ? AND email IS NOT NULL AND email != ""',
          [server.owner_user_id],
        );
        if (user?.email) {
          contact = {
            email: String(user.email).toLowerCase(),
            name: user.name || '',
            source: 'catalog_owner',
            userId: user.id,
          };
        }
      }
    }

    out.push({ slug: key, contact });
  }
  return out;
}

function isSponsoredListing(slug) {
  try {
    return require('./mcpPromoteService').isSponsoredSlug(slug);
  } catch {
    return false;
  }
}

/**
 * Homepage list: traffic leaders first, fill from Top 100 preview.
 * Paid pins stay on the sponsor rail and are not inserted into this list.
 */
async function getHomeTopServersByTraffic(limit = 6, { days = 7 } = {}) {
  const ranked = await getWeeklyListingRanking({ days, limit: limit * 3, useCache: true });
  const picked = [];
  const seen = new Set();

  for (const row of ranked) {
    if (picked.length >= limit) break;
    const server = findMcpServerBySlug(row.slug);
    if (!server || seen.has(row.slug) || isSponsoredListing(row.slug)) continue;
    seen.add(row.slug);
    picked.push({
      server,
      views: row.views,
      unique_visitors: row.unique_visitors,
      source: 'traffic',
    });
  }

  if (picked.length < limit) {
    const fallback = getMcpHomepagePreview(limit * 2).servers || [];
    for (const server of fallback) {
      if (picked.length >= limit) break;
      if (seen.has(server.slug) || isSponsoredListing(server.slug)) continue;
      seen.add(server.slug);
      picked.push({
        server,
        views: 0,
        unique_visitors: 0,
        source: 'catalog',
      });
    }
  }

  // Last resort: any catalog servers
  if (picked.length < limit) {
    for (const server of getAllMcpServers()) {
      if (picked.length >= limit) break;
      if (seen.has(server.slug) || isSponsoredListing(server.slug)) continue;
      seen.add(server.slug);
      picked.push({ server, views: 0, unique_visitors: 0, source: 'catalog' });
    }
  }

  return {
    days,
    trafficCount: ranked.length,
    items: picked.slice(0, limit),
  };
}

/**
 * Real page_views totals for the sponsor block. available is false when the
 * query cannot run — callers must hide the figures.
 */
async function getDirectoryAudienceStats({ days = 30 } = {}) {
  const windowDays = Math.max(1, Math.min(90, Number(days) || 30));
  try {
    const db = await getDatabase();
    const since = sinceIso(windowDays);
    const site = await dbGet(
      db,
      `SELECT COUNT(*) AS views, COUNT(DISTINCT ip_address) AS visitors
       FROM page_views
       WHERE created_at > ?`,
      [since],
    );
    const listings = await dbGet(
      db,
      `SELECT COUNT(*) AS views
       FROM page_views
       WHERE created_at > ?
         AND page LIKE '/mcp/%'
         AND page NOT LIKE '/mcp/%/%'`,
      [since],
    );
    return {
      available: true,
      days: windowDays,
      visitors: Number(site?.visitors) || 0,
      page_views: Number(site?.views) || 0,
      listingViews: Number(listings?.views) || 0,
    };
  } catch (err) {
    console.warn('Sponsor audience stats unavailable:', err.message || err);
    return {
      available: false,
      days: windowDays,
      visitors: null,
      page_views: null,
      listingViews: null,
    };
  }
}

async function wasCongratsSent(db, week, slug, email) {
  const row = await dbGet(
    db,
    'SELECT id FROM mcp_weekly_traffic_emails WHERE week_key = ? AND slug = ? AND email = ?',
    [week, slug, email],
  );
  return Boolean(row);
}

async function recordCongratsSent(db, { week, slug, email, views, uniqueVisitors, rank, messageId }) {
  await dbRun(
    db,
    `INSERT OR IGNORE INTO mcp_weekly_traffic_emails
      (week_key, slug, email, views, unique_visitors, rank_position, message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [week, slug, email, views, uniqueVisitors, rank, messageId || null],
  );
}

function buildWeeklyCongratsEmail({ contact, server, stats, rank, week, baseUrl }) {
  const base = String(baseUrl || process.env.BASE_URL || 'https://www.influzer.ai').replace(
    /\/$/,
    '',
  );
  const listingUrl = `${base}/mcp/${encodeURIComponent(server.slug)}`;
  const promoteUrl = `${base}/mcp/promote?slug=${encodeURIComponent(server.slug)}`;
  const recipeUrl = `${base}/recipes/new?server=${encodeURIComponent(server.slug)}`;
  const name = contact.name || 'there';
  const views = stats.views || 0;
  const uniques = stats.unique_visitors || 0;

  const subject = `Your MCP listing had ${views.toLocaleString()} visits this week — ${server.name}`;
  const html = `
    <!DOCTYPE html>
    <html>
      <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
        <div style="max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="margin:0 0 12px;">Nice week for ${escapeHtml(server.name)}</h2>
          <p>Hi ${escapeHtml(name)},</p>
          <p>
            Your Influzer listing
            <a href="${escapeHtml(listingUrl)}">${escapeHtml(server.name)}</a>
            showed up in our directory traffic for <strong>${escapeHtml(week)}</strong>.
          </p>
          <ul style="font-size:15px;color:#444;">
            <li><strong>${views.toLocaleString()}</strong> listing page views</li>
            <li><strong>${uniques.toLocaleString()}</strong> unique visitors</li>
            ${rank ? `<li>Roughly <strong>#${rank}</strong> among listing pages this week</li>` : ''}
          </ul>
          <p style="margin:24px 0;">
            <a href="${escapeHtml(listingUrl)}" style="display:inline-block;padding:12px 22px;background:#6366f1;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;">Open your listing</a>
          </p>
          <p style="font-size:14px;color:#555;">Want more visibility?</p>
          <ul style="font-size:14px;color:#444;">
            <li><a href="${escapeHtml(promoteUrl)}">Labeled Sponsored placement</a> — top of homepage, /mcp, /webmcp, scoreboard</li>
            <li><a href="${escapeHtml(recipeUrl)}">Share a recipe</a> using your server</li>
          </ul>
          <p style="font-size:13px;color:#888;margin-top:28px;">— Influzer.ai MCP Directory</p>
        </div>
      </body>
    </html>
  `;
  const text = [
    `Hi ${name},`,
    '',
    `Your Influzer listing ${server.name} showed up in directory traffic for ${week}.`,
    '',
    `Listing page views: ${views}`,
    `Unique visitors: ${uniques}`,
    rank ? `Approx rank this week: #${rank}` : '',
    '',
    `Open your listing: ${listingUrl}`,
    `Promote: ${promoteUrl}`,
    `Share a recipe: ${recipeUrl}`,
    '',
    '— Influzer.ai MCP Directory',
  ]
    .filter(Boolean)
    .join('\n');

  return { subject, html, text, listingUrl };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Prepare / send weekly congrats to contactable owners in the traffic ranking.
 */
async function sendWeeklyTrafficCongrats({
  days = 7,
  limit = 25,
  minViews = 3,
  dryRun = true,
  force = false,
} = {}) {
  const { deliverEmail, getFromAddress, isEmailConfigured } = require('../emailService');
  const db = await getDatabase();
  await ensureTrafficTables(db);

  const week = weekKey();
  const ranked = await getWeeklyListingRanking({ days, limit: Math.max(limit, 50), useCache: false });
  const eligible = ranked.filter((r) => r.views >= minViews).slice(0, limit);
  const contacts = await resolveListingContacts(eligible.map((r) => r.slug));
  const contactBySlug = new Map(contacts.map((c) => [c.slug, c.contact]));

  const planned = [];
  for (let i = 0; i < eligible.length; i += 1) {
    const row = eligible[i];
    const contact = contactBySlug.get(row.slug);
    if (!contact?.email) {
      planned.push({ ...row, rank: i + 1, status: 'skipped-no-email' });
      continue;
    }
    if (!force && (await wasCongratsSent(db, week, row.slug, contact.email))) {
      planned.push({ ...row, rank: i + 1, email: contact.email, status: 'skipped-already-sent' });
      continue;
    }
    const server = findMcpServerBySlug(row.slug);
    if (!server) {
      planned.push({ ...row, rank: i + 1, status: 'skipped-missing-server' });
      continue;
    }
    planned.push({
      ...row,
      rank: i + 1,
      email: contact.email,
      name: contact.name,
      server,
      status: 'ready',
    });
  }

  const results = [];
  for (const item of planned) {
    if (item.status !== 'ready') {
      results.push(item);
      continue;
    }
    const content = buildWeeklyCongratsEmail({
      contact: { name: item.name, email: item.email },
      server: item.server,
      stats: { views: item.views, unique_visitors: item.unique_visitors },
      rank: item.rank,
      week,
    });
    if (dryRun) {
      results.push({ ...item, status: 'dry-run', subject: content.subject });
      continue;
    }
    if (!isEmailConfigured()) {
      results.push({ ...item, status: 'error', error: 'Email not configured' });
      continue;
    }
    try {
      const info = await deliverEmail({
        from: getFromAddress(),
        to: item.email,
        subject: content.subject,
        html: content.html,
        text: content.text,
      });
      await recordCongratsSent(db, {
        week,
        slug: item.slug,
        email: item.email,
        views: item.views,
        uniqueVisitors: item.unique_visitors,
        rank: item.rank,
        messageId: info.messageId,
      });
      results.push({
        ...item,
        status: 'sent',
        messageId: info.messageId,
        subject: content.subject,
      });
    } catch (err) {
      results.push({ ...item, status: 'error', error: err.message });
    }
  }

  return {
    week,
    days,
    minViews,
    dryRun,
    ranked: eligible.length,
    results,
  };
}

function clearTrafficCache() {
  rankingCache = { at: 0, days: 7, rows: null };
}

function registerMcpListingTrafficRoutes(app, requireAdmin) {
  const { requireAuth } = require('../auth');
  const { clientErrorMessage } = require('../utils/safeError');

  app.get('/admin/api/mcp/traffic/weekly', requireAuth, requireAdmin, async (req, res) => {
    try {
      const days = Math.min(30, Math.max(1, parseInt(req.query.days, 10) || 7));
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
      const ranked = await getWeeklyListingRanking({ days, limit, useCache: false });
      const contacts = await resolveListingContacts(ranked.map((r) => r.slug));
      const contactMap = new Map(contacts.map((c) => [c.slug, c.contact]));
      res.json({
        week: weekKey(),
        days,
        servers: ranked.map((row, index) => ({
          ...row,
          rank: index + 1,
          contact: contactMap.get(row.slug) || null,
        })),
      });
    } catch (error) {
      res.status(500).json({ error: clientErrorMessage(error, 'Request failed') });
    }
  });
}

async function initializeMcpListingTrafficService(app, requireAdmin) {
  const db = await getDatabase();
  await ensureTrafficTables(db);
  if (app && requireAdmin) {
    registerMcpListingTrafficRoutes(app, requireAdmin);
  }
  console.log('✅ MCP listing traffic service initialized');
}

module.exports = {
  slugFromMcpPage,
  getWeeklyListingRanking,
  getHomeTopServersByTraffic,
  getDirectoryAudienceStats,
  resolveListingContacts,
  sendWeeklyTrafficCongrats,
  buildWeeklyCongratsEmail,
  ensureTrafficTables,
  weekKey,
  clearTrafficCache,
  initializeMcpListingTrafficService,
  registerMcpListingTrafficRoutes,
  WEEK_MS,
};
