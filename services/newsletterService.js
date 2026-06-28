// ================================
//  Newsletter Service
// ================================

const crypto = require('crypto');
const { getDatabase } = require('../database');
const { requireAuth } = require('../auth');
const { requireAdmin } = require('./adminService');
const { getAllBlogPosts, findBlogPostBySlug } = require('./staticService');
const {
  sendBlogNewsletterEmail,
  buildBlogNewsletterHtml,
  isEmailConfigured,
} = require('../emailService');

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

function buildNewsletterPayload(post, customIntro) {
  const postUrl = buildPostUrl(post.slug);
  const coverImageUrl = buildCoverImageUrl(post);
  return { post, postUrl, coverImageUrl, customIntro: customIntro || '' };
}

async function sendNewsletterToRecipients({
  post,
  customIntro,
  recipients,
  testMode = false,
}) {
  if (!isEmailConfigured()) {
    throw new Error(
      'Email is not configured (set EMAIL_SERVICE=gmail + EMAIL_USER + EMAIL_PASS, or SMTP_* in .env).',
    );
  }

  const payload = buildNewsletterPayload(post, customIntro);
  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const recipient of recipients) {
    try {
      const token = await ensureSubscriberToken(recipient);
      await sendBlogNewsletterEmail({
        to: recipient.email,
        ...payload,
        unsubscribeUrl: buildUnsubscribeUrl(token),
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      errors.push({ email: recipient.email, error: error.message });
    }

    if (!testMode && SEND_DELAY_MS > 0) {
      await sleep(SEND_DELAY_MS);
    }
  }

  return { sent, failed, errors };
}

async function sendBlogNewsletter({
  slug,
  customIntro = '',
  testEmail = '',
  confirmResend = false,
  sentByUserId = null,
}) {
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
        await addSubscriber(email, source, ip);
      } catch (error) {
        if (String(error.message || '').includes('UNIQUE constraint failed')) {
          return res.json({ success: true, message: 'You are already subscribed.' });
        }
        throw error;
      }

      return res.json({ success: true, message: "You're in! First issue arrives Thursday." });
    } catch (error) {
      return res.status(500).json({ error: error.message });
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
        result: { success: false, reason: 'error', message: error.message },
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
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/admin/api/newsletter/blog-posts', requireAuth, requireAdmin, async (req, res) => {
    try {
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
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/admin/api/newsletter/preview', requireAuth, requireAdmin, async (req, res) => {
    try {
      const slug = String(req.query.slug || '').trim();
      const customIntro = String(req.query.intro || '').trim().slice(0, 2000);
      const post = findBlogPostBySlug(slug);
      if (!post) {
        return res.status(404).json({ error: 'Blog post not found' });
      }

      const payload = buildNewsletterPayload(post, customIntro);
      const html = buildBlogNewsletterHtml({
        ...payload,
        unsubscribeUrl: `${getBaseUrl()}/newsletter/unsubscribe?token=preview`,
      });

      res.json({
        slug,
        title: post.title,
        subject: `New on Influzer Insights: ${post.title}`,
        html,
        postUrl: payload.postUrl,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
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
      res.status(500).json({ error: error.message });
    }
  });

  console.log('Newsletter service initialized');
}

module.exports = {
  initializeNewsletterService,
};
