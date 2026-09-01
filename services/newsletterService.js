// ================================
//  Newsletter Service
// ================================

const crypto = require('crypto');
const { getDatabase } = require('../database');
const { requireAuth } = require('../auth');
const { requireAdmin } = require('./adminService');
const { clientErrorMessage } = require('../utils/safeError');
const { getMcpServersForNewsletter } = require('./mcpCatalogChangelogService');
const {
  sendBlogNewsletterEmail,
  buildBlogNewsletterHtml,
  buildBlogNewsletterText,
  resolveNewsletterSubject,
  isEmailConfigured,
} = require('../emailService');

// Lazy-load blog helpers — top-level require('./staticService') is circular via
// staticService → webmcpDirectoryService → scanService → newsletterService.
function getBlogHelpers() {
  return require('./staticService');
}

const MAX_EMAIL_LENGTH = 254;
const SEND_DELAY_MS = 250;

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    return String(forwardedFor).split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function sanitizeEmail(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .toLowerCase()
    .slice(0, MAX_EMAIL_LENGTH);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Block disposable / probe / localhost addresses from the newsletter list.
 * These came in via WebMCP scan tests and caused bounce floods on broadcast.
 */
function isEligibleNewsletterEmail(email) {
  const value = sanitizeEmail(email);
  if (!isValidEmail(value)) return false;

  const [local = '', domain = ''] = value.split('@');
  const blockedDomains = new Set([
    'example.com',
    'example.org',
    'example.net',
    'example.edu',
    'localhost',
    'invalid',
    'test',
    'localdomain',
  ]);
  if (blockedDomains.has(domain)) return false;
  if (domain.endsWith('.example') || domain.endsWith('.test') || domain.endsWith('.invalid')) {
    return false;
  }
  if (domain === 'influzer.ai' && /(^|[.+_-])(test|probe|scan|verify|coerce|dummy)([.+_-]|$)/.test(local)) {
    return false;
  }
  if (/^(rate-limit|scanner-verify|prod-scan-test|url-coerce-test|test[+._-])/i.test(local)) {
    return false;
  }
  return true;
}

function getBaseUrl() {
  return (process.env.BASE_URL || 'https://www.influzer.ai').replace(/\/$/, '');
}

function generateUnsubscribeToken() {
  return crypto.randomBytes(24).toString('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runDb(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getDbRow(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function getDbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function ensureNewsletterColumn(db, columnSql) {
  try {
    await runDb(db, columnSql);
  } catch (error) {
    if (!String(error.message || '').includes('duplicate column')) {
      throw error;
    }
  }
}

async function initializeNewsletterTables(db) {
  await runDb(db, `
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      source TEXT DEFAULT 'site',
      ip_address TEXT,
      status TEXT DEFAULT 'active',
      unsubscribe_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await runDb(
    db,
    'CREATE INDEX IF NOT EXISTS idx_newsletter_created_at ON newsletter_subscribers(created_at)',
  );
  await runDb(
    db,
    'CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status)',
  );
  await ensureNewsletterColumn(
    db,
    'ALTER TABLE newsletter_subscribers ADD COLUMN unsubscribe_token TEXT',
  );

  await runDb(db, `
    CREATE TABLE IF NOT EXISTS newsletter_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blog_slug TEXT NOT NULL,
      blog_title TEXT,
      recipient_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      sent_by INTEGER,
      custom_intro TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await runDb(
    db,
    'CREATE INDEX IF NOT EXISTS idx_newsletter_sends_slug ON newsletter_sends(blog_slug)',
  );
}

async function countRecentSubscriptionsByIp(ipAddress, withinSeconds = 3600) {
  const db = await getDatabase();
  const since = new Date(Date.now() - withinSeconds * 1000).toISOString();
  return getDbRow(
    db,
    `SELECT COUNT(*) as count
     FROM newsletter_subscribers
     WHERE ip_address = ? AND created_at > ?`,
    [ipAddress, since],
  ).then((row) => row?.count || 0);
}

async function addSubscriber(email, source, ipAddress) {
  const db = await getDatabase();
  const token = generateUnsubscribeToken();
  const result = await runDb(
    db,
    `INSERT INTO newsletter_subscribers (email, source, ip_address, status, unsubscribe_token)
     VALUES (?, ?, ?, 'active', ?)`,
    [email, source || 'site', ipAddress || 'unknown', token],
  );
  return result.lastID;
}

async function subscribeToNewsletter(email, source, ipAddress) {
  const sanitized = sanitizeEmail(email);
  if (!isValidEmail(sanitized)) {
    return { success: false, reason: 'invalid_email' };
  }
  if (!isEligibleNewsletterEmail(sanitized)) {
    return { success: false, reason: 'ineligible_email' };
  }

  const db = await getDatabase();
  const existing = await getDbRow(
    db,
    'SELECT id, status FROM newsletter_subscribers WHERE email = ?',
    [sanitized],
  );

  if (existing?.status === 'active') {
    return { success: true, already: true };
  }

  if (existing) {
    const token = generateUnsubscribeToken();
    await runDb(
      db,
      `UPDATE newsletter_subscribers
       SET status = 'active', source = ?, ip_address = ?, unsubscribe_token = ?
       WHERE id = ?`,
      [source || 'site', ipAddress || 'unknown', token, existing.id],
    );
    return { success: true, reactivated: true };
  }

  try {
    await addSubscriber(sanitized, source, ipAddress);
    return { success: true };
  } catch (error) {
    if (String(error.message || '').includes('UNIQUE constraint failed')) {
      return { success: true, already: true };
    }
    throw error;
  }
}

async function ensureSubscriberToken(subscriber) {
  if (subscriber.unsubscribe_token) {
    return subscriber.unsubscribe_token;
  }
  const db = await getDatabase();
  const token = generateUnsubscribeToken();
  await runDb(
    db,
    'UPDATE newsletter_subscribers SET unsubscribe_token = ? WHERE id = ?',
    [token, subscriber.id],
  );
  return token;
}

async function listSubscribers(limit = 200) {
  const db = await getDatabase();
  const cappedLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  return getDbAll(
    db,
    `SELECT id, email, source, status, created_at
     FROM newsletter_subscribers
     ORDER BY created_at DESC
     LIMIT ?`,
    [cappedLimit],
  );
}

async function listActiveSubscribers() {
  const db = await getDatabase();
  return getDbAll(
    db,
    `SELECT id, email, unsubscribe_token
     FROM newsletter_subscribers
     WHERE status = 'active'
     ORDER BY id ASC`,
  );
}

async function countActiveSubscribers() {
  const db = await getDatabase();
  const row = await getDbRow(
    db,
    `SELECT COUNT(*) as count FROM newsletter_subscribers WHERE status = 'active'`,
  );
  return row?.count || 0;
}

async function getLatestSendForSlug(slug) {
  const db = await getDatabase();
  return getDbRow(
    db,
    `SELECT id, blog_slug, blog_title, recipient_count, failed_count, custom_intro, created_at
     FROM newsletter_sends
     WHERE blog_slug = ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [slug],
  );
}

async function listRecentSends(limit = 50) {
  const db = await getDatabase();
  const cappedLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  return getDbAll(
    db,
    `SELECT id, blog_slug, blog_title, recipient_count, failed_count, created_at
     FROM newsletter_sends
     ORDER BY created_at DESC
     LIMIT ?`,
    [cappedLimit],
  );
}

function buildPostUrl(slug) {
  return `${getBaseUrl()}/insights/${slug}`;
}

function buildCoverImageUrl(post) {
  if (!post?.coverImage) return '';
  if (post.coverImage.startsWith('http')) return post.coverImage;
  return `${getBaseUrl()}${post.coverImage}`;
}

function buildUnsubscribeUrl(token) {
  return `${getBaseUrl()}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

async function getLastNewsletterSendAt() {
  const db = await getDatabase();
  const row = await getDbRow(
    db,
    `SELECT created_at FROM newsletter_sends ORDER BY created_at DESC LIMIT 1`,
  );
  return row?.created_at || null;
}

async function resolveNewsletterMcpServers() {
  let since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const lastSendAt = await getLastNewsletterSendAt();
    if (lastSendAt) since = lastSendAt;
  } catch (error) {
    console.warn('Newsletter last-send lookup failed:', error.message);
  }
  return getMcpServersForNewsletter({ since, limit: 8 });
}

function decodeBasicEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function cleanNewsletterText(value) {
  return decodeBasicEntities(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function getRecentBriefsForNewsletter(currentSlug, limit = 3) {
  const { getAllNewsItems } = require('./newsService');
  return getAllNewsItems()
    .filter((item) => item.slug !== currentSlug && item.relatedInsightSlug !== currentSlug)
    .slice(0, Math.max(1, Math.min(6, Number(limit) || 3)))
    .map((item) => ({
      slug: item.slug,
      title: item.title,
      excerpt: item.excerpt,
      date: item.date,
    }));
}

function truncateTitle(value, max = 110) {
  const text = cleanNewsletterText(value);
  if (text.length <= max) return text;
  const sliced = text.slice(0, max - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const clipped = lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced;
  return `${clipped.trim()}…`;
}

function cleanAroundTheWebTitle(value) {
  let text = cleanNewsletterText(value);
  text = text.replace(/^GitHub:\s+\S+\s+—\s+/i, '');
  return truncateTitle(text, 110);
}

function getAroundTheWebForNewsletter(limit = 3) {
  try {
    const { getDisplayArticles } = require('./otherNewsService');
    const { articles } = getDisplayArticles(Math.max(1, Math.min(6, Number(limit) || 3)));
    return (articles || [])
      .map((article) => ({
        title: cleanAroundTheWebTitle(article.title),
        source: cleanNewsletterText(article.source).slice(0, 80),
        url: article.outbound_url || article.url || '',
        date: article.display_date || '',
      }))
      .filter((article) => article.title && article.url);
  } catch (error) {
    console.warn('Newsletter around-the-web lookup failed:', error.message);
    return [];
  }
}

function getCatalogStatForNewsletter() {
  try {
    const { getMcpHeroStats } = require('./mcpDirectoryService');
    const stats = getMcpHeroStats();
    const total = Number(stats.totalServers) || 0;
    const withTools = Number(stats.serversWithIndexedTools) || 0;
    if (!total) return null;
    const pct = Math.round((withTools / total) * 100);
    return {
      label: `${total.toLocaleString('en-US')} MCP servers in the directory`,
      detail: `${withTools.toLocaleString('en-US')} have indexed tools (${pct}%). Search first — then allowlist before you install.`,
    };
  } catch (error) {
    console.warn('Newsletter catalog stat lookup failed:', error.message);
    return null;
  }
}

function resolveIntro(post, customIntro) {
  const custom = String(customIntro || '').trim();
  if (custom) return custom;
  return String(post?.newsletterIntro || '').trim();
}

async function resolveNewsletterExtras(post) {
  return {
    recentMcpServers: await resolveNewsletterMcpServers(),
    recentBriefs: getRecentBriefsForNewsletter(post.slug),
    aroundTheWeb: getAroundTheWebForNewsletter(),
    catalogStat: getCatalogStatForNewsletter(),
  };
}

function buildNewsletterPayload(post, customIntro, extras = {}) {
  const postUrl = buildPostUrl(post.slug);
  const coverImageUrl = buildCoverImageUrl(post);
  const recentMcpServers = Array.isArray(extras.recentMcpServers)
    ? extras.recentMcpServers
    : extras;
  return {
    post,
    postUrl,
    coverImageUrl,
    customIntro: resolveIntro(post, customIntro),
    recentMcpServers: Array.isArray(recentMcpServers) ? recentMcpServers : [],
    recentBriefs: extras.recentBriefs || [],
    aroundTheWeb: extras.aroundTheWeb || [],
    catalogStat: extras.catalogStat || null,
    pullQuote: post.newsletterPullQuote || '',
  };
}

async function sendNewsletterToRecipients({
  post,
  customIntro,
  recipients,
  testMode = false,
}) {
  if (!isEmailConfigured()) {
    throw new Error(
      'Email is not configured (set EMAIL_SERVICE=resend + RESEND_API_KEY, or gmail/SMTP_* in .env).',
    );
  }

  const payload = buildNewsletterPayload(
    post,
    customIntro,
    await resolveNewsletterExtras(post),
  );
  let sent = 0;
  let failed = 0;
  const errors = [];
  let lastDelivery = null;

  let skipped = 0;

  for (const recipient of recipients) {
    if (!testMode && !isEligibleNewsletterEmail(recipient.email)) {
      skipped += 1;
      continue;
    }
    try {
      const token = await ensureSubscriberToken(recipient);
      const delivery = await sendBlogNewsletterEmail({
        to: recipient.email,
        ...payload,
        unsubscribeUrl: buildUnsubscribeUrl(token),
      });
      lastDelivery = delivery;
      sent += 1;
    } catch (error) {
      failed += 1;
      errors.push({ email: recipient.email, error: clientErrorMessage(error, 'Send failed') });
    }

    if (!testMode && SEND_DELAY_MS > 0) {
      await sleep(SEND_DELAY_MS);
    }
  }

  return { sent, failed, skipped, errors, lastDelivery };
}

async function previewBlogNewsletter({ slug, customIntro = '' }) {
  const { findBlogPostBySlug } = getBlogHelpers();
  const post = findBlogPostBySlug(slug);
  if (!post) {
    throw new Error('Blog post not found');
  }

  const extras = await resolveNewsletterExtras(post);
  const payload = buildNewsletterPayload(post, customIntro, extras);
  const unsubscribeUrl = `${getBaseUrl()}/newsletter/unsubscribe?token=preview`;
  return {
    mode: 'preview',
    slug,
    title: post.title,
    subject: resolveNewsletterSubject(post),
    html: buildBlogNewsletterHtml({ ...payload, unsubscribeUrl }),
    text: buildBlogNewsletterText({ ...payload, unsubscribeUrl }),
    postUrl: payload.postUrl,
    intro: payload.customIntro,
    catalogStat: payload.catalogStat,
    briefCount: payload.recentBriefs.length,
    aroundTheWebCount: payload.aroundTheWeb.length,
    mcpServerCount: payload.recentMcpServers.length,
  };
}

async function sendBlogNewsletter({
  slug,
  customIntro = '',
  testEmail = '',
  confirmResend = false,
  sentByUserId = null,
}) {
  const { findBlogPostBySlug } = getBlogHelpers();
  const post = findBlogPostBySlug(slug);
  if (!post) {
    throw new Error('Blog post not found');
  }

  const trimmedIntro = String(customIntro || '').trim().slice(0, 2000);
  const previousSend = await getLatestSendForSlug(slug);

  if (testEmail) {
    const email = sanitizeEmail(testEmail);
    if (!isValidEmail(email)) {
      throw new Error('Invalid test email address');
    }
    const result = await sendNewsletterToRecipients({
      post,
      customIntro: trimmedIntro,
      recipients: [{ id: 0, email, unsubscribe_token: 'test-preview-token' }],
      testMode: true,
    });
    return {
      mode: 'test',
      slug,
      title: post.title,
      sent: result.sent,
      failed: result.failed,
      errors: result.errors,
      to: result.lastDelivery?.to || email,
      from: result.lastDelivery?.from || null,
      provider: result.lastDelivery?.provider || null,
      messageId: result.lastDelivery?.messageId || null,
      subject: result.lastDelivery?.subject || null,
    };
  }

  if (previousSend && !confirmResend) {
    const error = new Error('Newsletter was already sent for this post');
    error.code = 'ALREADY_SENT';
    error.previousSend = previousSend;
    throw error;
  }

  const recipients = await listActiveSubscribers();
  if (!recipients.length) {
    throw new Error('No active subscribers to send to');
  }

  const result = await sendNewsletterToRecipients({
    post,
    customIntro: trimmedIntro,
    recipients,
  });

  const db = await getDatabase();
  await runDb(
    db,
    `INSERT INTO newsletter_sends (blog_slug, blog_title, recipient_count, failed_count, sent_by, custom_intro)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [slug, post.title, result.sent, result.failed, sentByUserId, trimmedIntro || null],
  );

  return {
    mode: 'broadcast',
    slug,
    title: post.title,
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped || 0,
    totalRecipients: recipients.length,
    errors: result.errors.slice(0, 10),
    resent: Boolean(previousSend),
  };
}

async function unsubscribeByToken(token) {
  const db = await getDatabase();
  const safeToken = String(token || '').trim();
  if (!safeToken) {
    return { success: false, reason: 'missing_token' };
  }

  const subscriber = await getDbRow(
    db,
    'SELECT id, email, status FROM newsletter_subscribers WHERE unsubscribe_token = ?',
    [safeToken],
  );

  if (!subscriber) {
    return { success: false, reason: 'not_found' };
  }

  if (subscriber.status === 'unsubscribed') {
    return { success: true, already: true, email: subscriber.email };
  }

  await runDb(
    db,
    "UPDATE newsletter_subscribers SET status = 'unsubscribed' WHERE id = ?",
    [subscriber.id],
  );

  return { success: true, email: subscriber.email };
}

async function initializeNewsletterService(app) {
  const db = await getDatabase();
  await initializeNewsletterTables(db);

  const handleSubscribe = async (req, res) => {
    try {
      const email = sanitizeEmail(req.body?.email || '');
      const source = String(req.body?.source || 'site').slice(0, 120);
      const honeypot = String(req.body?.website || '').trim();

      if (honeypot) {
        return res.status(400).json({ error: 'Spam check failed.' });
      }
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }

      const ip = getClientIp(req);
      const recent = await countRecentSubscriptionsByIp(ip, 3600);
      if (recent >= 10) {
        return res.status(429).json({ error: 'Too many signup attempts. Please try again later.' });
      }

      try {
        await subscribeToNewsletter(email, source, ip);
      } catch (error) {
        if (String(error.message || '').includes('UNIQUE constraint failed')) {
          return res.json({ success: true, message: 'You are already subscribed.' });
        }
        throw error;
      }

      return res.json({ success: true, message: "You're in! First issue arrives Thursday." });
    } catch (error) {
      return res.status(500).json({ error: clientErrorMessage(error, 'Subscription failed') });
    }
  };

  app.post('/api/newsletter/subscribe', handleSubscribe);
  app.post('/api/subscribe', handleSubscribe);

  app.get('/newsletter/unsubscribe', async (req, res) => {
    try {
      const result = await unsubscribeByToken(req.query.token);
      res.render('newsletter-unsubscribe', { result });
    } catch (error) {
      res.status(500).render('newsletter-unsubscribe', {
        result: { success: false, reason: 'error', message: clientErrorMessage(error, 'Unsubscribe failed') },
      });
    }
  });

  app.get('/admin/api/newsletter/subscribers', requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 200;
      const subscribers = await listSubscribers(limit);
      const activeCount = await countActiveSubscribers();
      res.json({ subscribers, activeCount });
    } catch (error) {
      res.status(500).json({ error: clientErrorMessage(error, 'Request failed') });
    }
  });

  app.get('/admin/api/newsletter/blog-posts', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { getAllBlogPosts } = getBlogHelpers();
      const posts = getAllBlogPosts().slice(0, 40);
      const sends = await listRecentSends(100);
      const sendBySlug = new Map(sends.map((send) => [send.blog_slug, send]));

      res.json({
        emailConfigured: isEmailConfigured(),
        activeSubscriberCount: await countActiveSubscribers(),
        posts: posts.map((post) => {
          const send = sendBySlug.get(post.slug);
          return {
            slug: post.slug,
            title: post.title,
            date: post.date,
            excerpt: post.excerpt,
            category: post.category,
            coverImage: post.coverImage,
            url: buildPostUrl(post.slug),
            newsletterSent: Boolean(send),
            lastSentAt: send?.created_at || null,
            lastSentCount: send?.recipient_count || 0,
          };
        }),
        recentSends: sends,
      });
    } catch (error) {
      res.status(500).json({ error: clientErrorMessage(error, 'Request failed') });
    }
  });

  app.get('/admin/api/newsletter/preview', requireAuth, requireAdmin, async (req, res) => {
    try {
      const slug = String(req.query.slug || '').trim();
      const customIntro = String(req.query.intro || '').trim().slice(0, 2000);
      const { findBlogPostBySlug } = getBlogHelpers();
      const post = findBlogPostBySlug(slug);
      if (!post) {
        return res.status(404).json({ error: 'Blog post not found' });
      }

      const payload = buildNewsletterPayload(
        post,
        customIntro,
        await resolveNewsletterExtras(post),
      );
      const unsubscribeUrl = `${getBaseUrl()}/newsletter/unsubscribe?token=preview`;
      const html = buildBlogNewsletterHtml({
        ...payload,
        unsubscribeUrl,
      });

      res.json({
        slug,
        title: post.title,
        subject: resolveNewsletterSubject(post),
        html,
        postUrl: payload.postUrl,
      });
    } catch (error) {
      res.status(500).json({ error: clientErrorMessage(error, 'Request failed') });
    }
  });

  app.post('/admin/api/newsletter/send', requireAuth, requireAdmin, async (req, res) => {
    try {
      const slug = String(req.body?.slug || '').trim();
      const customIntro = String(req.body?.customIntro || '').trim();
      const testEmail = String(req.body?.testEmail || '').trim();
      const confirmResend = Boolean(req.body?.confirmResend);

      if (!slug) {
        return res.status(400).json({ error: 'Blog post slug is required' });
      }

      const result = await sendBlogNewsletter({
        slug,
        customIntro,
        testEmail,
        confirmResend,
        sentByUserId: req.user?.id || null,
      });

      res.json({ success: true, ...result });
    } catch (error) {
      if (error.code === 'ALREADY_SENT') {
        return res.status(409).json({
          error: error.message,
          code: error.code,
          previousSend: error.previousSend,
        });
      }
      res.status(500).json({ error: clientErrorMessage(error, 'Request failed') });
    }
  });

  console.log('Newsletter service initialized');
}

module.exports = {
  initializeNewsletterService,
  sendBlogNewsletter,
  previewBlogNewsletter,
  subscribeToNewsletter,
  countActiveSubscribers,
  listActiveSubscribers,
  isEligibleNewsletterEmail,
};
