// ================================
//  Blog Feedback Service (reactions + comments)
// ================================

const { getDatabase } = require('../database');
const { requireAuth } = require('../auth');
const { requireAdmin } = require('./adminService');

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

async function verifyTurnstileToken(token, ipAddress) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return { success: true, skipped: true };
  }
  if (!token || typeof token !== 'string') {
    return { success: false, error: 'Missing Turnstile token.' };
  }

  try {
    const body = new URLSearchParams({
      secret,
      response: token,
      remoteip: ipAddress || '',
    });
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );
    const data = await response.json();
    if (!data.success) {
      return { success: false, error: 'Turnstile verification failed.' };
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Turnstile verification error.' };
  }
}

async function listAdminComments({ slug = '', status = 'all', limit = 200 }) {
  const db = await getDatabase();
  const where = [];
  const params = [];

  if (slug) {
    where.push('slug = ?');
    params.push(slug);
  }
  if (status === 'approved') where.push('approved = 1');
  if (status === 'pending') where.push('approved = 0');

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const cappedLimit = Math.max(1, Math.min(500, Number(limit) || 200));

  return new Promise((resolve, reject) => {
    db.db.all(
      `SELECT id, slug, name, comment, approved, ip_address, created_at
       FROM blog_comments
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ?`,
      [...params, cappedLimit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      },
    );
  });
}

async function setCommentApproval(commentId, approved) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.db.run(
      'UPDATE blog_comments SET approved = ? WHERE id = ?',
      [approved ? 1 : 0, commentId],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes || 0);
      },
    );
  });
}

async function deleteCommentById(commentId) {
  const db = await getDatabase();
  return new Promise((resolve, reject) => {
    db.db.run(
      'DELETE FROM blog_comments WHERE id = ?',
      [commentId],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes || 0);
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

      const turnstile = await verifyTurnstileToken(
        req.body?.turnstileToken,
        ip,
      );
      if (!turnstile.success) {
        return res.status(400).json({ error: turnstile.error });
      }

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

  // Admin: list comments for moderation
  app.get('/admin/api/blog/comments', requireAuth, requireAdmin, async (req, res) => {
    try {
      const slug = String(req.query.slug || '').slice(0, 200);
      const status = String(req.query.status || 'all');
      const limit = parseInt(req.query.limit, 10) || 200;
      const comments = await listAdminComments({ slug, status, limit });
      res.json({ comments });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: approve/hide a comment
  app.post('/admin/api/blog/comments/:id/approval', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid comment id' });
      }
      const approved = Boolean(req.body?.approved);
      const changes = await setCommentApproval(id, approved);
      if (!changes) return res.status(404).json({ error: 'Comment not found' });
      res.json({ success: true, id, approved });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin: delete a comment
  app.delete('/admin/api/blog/comments/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Invalid comment id' });
      }
      const changes = await deleteCommentById(id);
      if (!changes) return res.status(404).json({ error: 'Comment not found' });
      res.json({ success: true, id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  console.log('Blog feedback service initialized');
}

module.exports = {
  initializeBlogFeedbackService,
};
