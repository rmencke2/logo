// ================================
//  Newsletter Service
// ================================

const { getDatabase } = require('../database');
const { requireAuth } = require('../auth');
const { requireAdmin } = require('./adminService');

const MAX_EMAIL_LENGTH = 254;

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

async function initializeNewsletterTables(db) {
  return new Promise((resolve) => {
    db.db.serialize(() => {
      db.db.run(`
        CREATE TABLE IF NOT EXISTS newsletter_subscribers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          source TEXT DEFAULT 'site',
          ip_address TEXT,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.db.run(
        'CREATE INDEX IF NOT EXISTS idx_newsletter_created_at ON newsletter_subscribers(created_at)',
      );
      resolve();
    });
  });
}

async function countRecentSubscriptionsByIp(ipAddress, withinSeconds = 3600) {
  const db = await getDatabase();
  const since = new Date(Date.now() - withinSeconds * 1000).toISOString();
  return new Promise((resolve, reject) => {
    db.db.get(
      `SELECT COUNT(*) as count
       FROM newsletter_subscribers
       WHERE ip_address = ? AND created_at > ?`,
      [ipAddress, since],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      },
    );
  });
}

async function addSubscriber(email, source, ipAddress) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.db.run(
      `INSERT INTO newsletter_subscribers (email, source, ip_address, status)
       VALUES (?, ?, ?, 'active')`,
      [email, source || 'site', ipAddress || 'unknown'],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      },
    );
  });
}

async function listSubscribers(limit = 200) {
  const db = await getDatabase();
  const cappedLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  return new Promise((resolve, reject) => {
    db.db.all(
      `SELECT id, email, source, status, created_at
       FROM newsletter_subscribers
       ORDER BY created_at DESC
       LIMIT ?`,
      [cappedLimit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      },
    );
  });
}

async function initializeNewsletterService(app) {
  const db = await getDatabase();
  await initializeNewsletterTables(db);

  app.post('/api/newsletter/subscribe', async (req, res) => {
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

      return res.json({ success: true, message: 'Thanks! You are subscribed.' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/admin/api/newsletter/subscribers', requireAuth, requireAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 200;
      const subscribers = await listSubscribers(limit);
      res.json({ subscribers });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log('Newsletter service initialized');
}

module.exports = {
  initializeNewsletterService,
};
