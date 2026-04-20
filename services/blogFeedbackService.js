// ================================
//  Blog Feedback Service (reactions + comments)
// ================================

const { getDatabase } = require('../database');

const VALID_REACTIONS = new Set(['up', 'down']);
const MAX_NAME_LENGTH = 60;
const MAX_COMMENT_LENGTH = 1000;

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    return String(forwardedFor).split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function sanitizeText(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim();
}

async function initializeBlogFeedbackTables(db) {
  return new Promise((resolve, reject) => {
    db.db.serialize(() => {
      db.db.run(`
        CREATE TABLE IF NOT EXISTS blog_reactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL,
          ip_address TEXT NOT NULL,
          reaction TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(slug, ip_address)
        )
      `);

      db.db.run(`
        CREATE TABLE IF NOT EXISTS blog_comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL,
          name TEXT NOT NULL,
          comment TEXT NOT NULL,
          ip_address TEXT,
          approved INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.db.run(
        'CREATE INDEX IF NOT EXISTS idx_blog_reactions_slug ON blog_reactions(slug)',
      );
      db.db.run(
        'CREATE INDEX IF NOT EXISTS idx_blog_comments_slug ON blog_comments(slug)',
      );

      resolve();
    });
  });
}

async function getReactionCounts(slug) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.db.get(
      `SELECT
        SUM(CASE WHEN reaction = 'up' THEN 1 ELSE 0 END) as up,
        SUM(CASE WHEN reaction = 'down' THEN 1 ELSE 0 END) as down
       FROM blog_reactions
       WHERE slug = ?`,
      [slug],
      (err, row) => {
        if (err) reject(err);
        else
          resolve({
            up: row?.up || 0,
            down: row?.down || 0,
          });
      },
    );
  });
}

async function getUserReaction(slug, ipAddress) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.db.get(
      'SELECT reaction FROM blog_reactions WHERE slug = ? AND ip_address = ?',
      [slug, ipAddress],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.reaction || null);
      },
    );
  });
}

async function setReaction(slug, ipAddress, reaction) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.db.run(
      `INSERT INTO blog_reactions (slug, ip_address, reaction)
       VALUES (?, ?, ?)
       ON CONFLICT(slug, ip_address)
       DO UPDATE SET reaction = excluded.reaction, updated_at = CURRENT_TIMESTAMP`,
      [slug, ipAddress, reaction],
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
}

async function clearReaction(slug, ipAddress) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.db.run(
      'DELETE FROM blog_reactions WHERE slug = ? AND ip_address = ?',
      [slug, ipAddress],
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
}

async function listComments(slug) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.db.all(
      `SELECT id, name, comment, created_at
       FROM blog_comments
       WHERE slug = ? AND approved = 1
       ORDER BY created_at DESC
       LIMIT 100`,
      [slug],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      },
    );
  });
}

async function addComment(slug, name, comment, ipAddress) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.db.run(
      `INSERT INTO blog_comments (slug, name, comment, ip_address, approved)
       VALUES (?, ?, ?, ?, 1)`,
      [slug, name, comment, ipAddress],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      },
    );
  });
}

async function countRecentCommentsByIp(ipAddress, withinSeconds = 60) {
  const db = await getDatabase();
  const since = new Date(Date.now() - withinSeconds * 1000).toISOString();
  return new Promise((resolve, reject) => {
    db.db.get(
      `SELECT COUNT(*) as count FROM blog_comments
       WHERE ip_address = ? AND created_at > ?`,
      [ipAddress, since],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      },
    );
  });
}

async function initializeBlogFeedbackService(app) {
  const db = await getDatabase();
  await initializeBlogFeedbackTables(db);

  // GET reactions and comments for a post
  app.get('/api/blog/:slug/feedback', async (req, res) => {
    try {
      const slug = String(req.params.slug || '').slice(0, 200);
      if (!slug) return res.status(400).json({ error: 'Missing slug' });

      const ip = getClientIp(req);
      const [counts, userReaction, comments] = await Promise.all([
        getReactionCounts(slug),
        getUserReaction(slug, ip),
        listComments(slug),
      ]);

      res.json({
        slug,
        reactions: counts,
        userReaction,
        comments,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST/toggle reaction
  app.post('/api/blog/:slug/reactions', async (req, res) => {
    try {
      const slug = String(req.params.slug || '').slice(0, 200);
      const { reaction } = req.body || {};
      if (!slug) return res.status(400).json({ error: 'Missing slug' });
      if (!VALID_REACTIONS.has(reaction)) {
        return res.status(400).json({ error: 'Invalid reaction' });
      }

      const ip = getClientIp(req);
      const existing = await getUserReaction(slug, ip);

      if (existing === reaction) {
        await clearReaction(slug, ip);
      } else {
        await setReaction(slug, ip, reaction);
      }

      const [counts, userReaction] = await Promise.all([
        getReactionCounts(slug),
        getUserReaction(slug, ip),
      ]);

      res.json({ slug, reactions: counts, userReaction });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST new comment
  app.post('/api/blog/:slug/comments', async (req, res) => {
    try {
      const slug = String(req.params.slug || '').slice(0, 200);
      if (!slug) return res.status(400).json({ error: 'Missing slug' });

      const name = sanitizeText(req.body?.name || '').slice(0, MAX_NAME_LENGTH);
      const comment = sanitizeText(req.body?.comment || '').slice(
        0,
        MAX_COMMENT_LENGTH,
      );

      if (name.length < 2) {
        return res.status(400).json({ error: 'Please provide a name.' });
      }
      if (comment.length < 2) {
        return res.status(400).json({ error: 'Please write a comment.' });
      }

      const ip = getClientIp(req);

      // Rate limit: max 3 comments per 60 seconds per IP
      const recent = await countRecentCommentsByIp(ip, 60);
      if (recent >= 3) {
        return res
          .status(429)
          .json({ error: 'You are posting too quickly. Please wait a moment.' });
      }

      await addComment(slug, name, comment, ip);
      const comments = await listComments(slug);

      res.json({ slug, comments });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log('Blog feedback service initialized');
}

module.exports = {
  initializeBlogFeedbackService,
};
