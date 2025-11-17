// ================================
//  SQLite Session Store for express-session
// ================================

const { Store } = require('express-session');
const { getDatabase } = require('./database');

/**
 * Custom SQLite session store for express-session
 * Stores sessions in the SQLite database for persistence across server restarts
 */
class SQLiteSessionStore extends Store {
  constructor(options = {}) {
    super(options);
    this.db = null;
    this.initPromise = null;
  }

  async getDb() {
    if (!this.db) {
      if (!this.initPromise) {
        this.initPromise = getDatabase().then(async db => {
          this.db = db;
          // Ensure express_sessions table exists
          await this.createTable();
          return db;
        });
      }
      return this.initPromise;
    }
    return Promise.resolve(this.db);
  }

  async get(sessionId, callback) {
    try {
      const db = await this.getDb();
      
      // Get session data from express_sessions table (separate from our custom sessions table)
      const sessionData = await new Promise((resolve, reject) => {
        db.db.get(
          'SELECT data, expires_at FROM express_sessions WHERE id = ?',
          [sessionId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!sessionData) {
        return callback(null, null);
      }

      // Check if session has expired
      if (new Date(sessionData.expires_at) < new Date()) {
        // Delete expired session
        await this.destroy(sessionId, () => {});
        return callback(null, null);
      }

      // Parse session data from JSON
      const data = JSON.parse(sessionData.data || '{}');
      callback(null, data);
    } catch (err) {
      // If table doesn't exist yet, return null (will be created on first set)
      if (err.message && err.message.includes('no such table')) {
        return callback(null, null);
      }
      callback(err);
    }
  }

  async set(sessionId, session, callback) {
    try {
      const db = await this.getDb();
      
      // Calculate expiration (7 days from now, or use session cookie maxAge)
      const maxAge = session.cookie?.maxAge || 7 * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + maxAge);

      // Serialize session data to JSON
      const sessionData = JSON.stringify(session);

      // Store in express_sessions table (separate from our custom sessions table)
      await new Promise((resolve, reject) => {
        db.db.run(
          `INSERT OR REPLACE INTO express_sessions (id, data, expires_at, created_at) 
           VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
          [sessionId, sessionData, expiresAt.toISOString()],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Also update our custom sessions table if there's a userId
      const userId = session.userId || session.passport?.user || null;
      if (userId) {
        try {
          // Delete existing session if it exists
          await db.deleteSession(sessionId);
        } catch (err) {
          // Ignore if session doesn't exist
        }
        // Create new session record
        await db.createSession(userId, sessionId, expiresAt.toISOString());
      }
      
      callback(null);
    } catch (err) {
      // If table doesn't exist, create it and retry
      if (err.message && err.message.includes('no such table')) {
        await this.createTable();
        return this.set(sessionId, session, callback);
      }
      callback(err);
    }
  }

  async destroy(sessionId, callback) {
    try {
      const db = await this.getDb();
      
      // Delete from express_sessions table
      await new Promise((resolve, reject) => {
        db.db.run('DELETE FROM express_sessions WHERE id = ?', [sessionId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Also delete from our custom sessions table
      try {
        await db.deleteSession(sessionId);
      } catch (err) {
        // Ignore if session doesn't exist in custom table
      }
      
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  async touch(sessionId, session, callback) {
    // Update expiration time
    try {
      const db = await this.getDb();
      const maxAge = session.cookie?.maxAge || 7 * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + maxAge);

      // Update expiration in express_sessions table
      await new Promise((resolve, reject) => {
        db.db.run(
          'UPDATE express_sessions SET expires_at = ? WHERE id = ?',
          [expiresAt.toISOString(), sessionId],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Also update custom sessions table if userId exists
      const userId = session.userId || session.passport?.user || null;
      if (userId) {
        try {
          await db.deleteSession(sessionId);
          await db.createSession(userId, sessionId, expiresAt.toISOString());
        } catch (err) {
          // Ignore errors
        }
      }
      
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  async all(callback) {
    // Not typically needed, but required by Store interface
    callback(null, []);
  }

  async length(callback) {
    try {
      const db = await this.getDb();
      const result = await new Promise((resolve, reject) => {
        db.db.get('SELECT COUNT(*) as count FROM express_sessions WHERE expires_at > ?', 
          [new Date().toISOString()], 
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      callback(null, result?.count || 0);
    } catch (err) {
      callback(err);
    }
  }

  async clear(callback) {
    try {
      const db = await this.getDb();
      
      // Delete all express sessions
      await new Promise((resolve, reject) => {
        db.db.run('DELETE FROM express_sessions', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Also clear custom sessions
      await db.deleteExpiredSessions();
      await new Promise((resolve, reject) => {
        db.db.run('DELETE FROM sessions', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  async createTable() {
    try {
      const db = await this.getDb();
      await new Promise((resolve, reject) => {
        db.db.run(`
          CREATE TABLE IF NOT EXISTS express_sessions (
            id TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      // Create index for expiration cleanup
      await new Promise((resolve, reject) => {
        db.db.run('CREATE INDEX IF NOT EXISTS idx_express_sessions_expires ON express_sessions(expires_at)', (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (err) {
      console.error('Error creating express_sessions table:', err);
    }
  }
}

module.exports = SQLiteSessionStore;

