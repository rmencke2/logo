// ================================
//  Database Setup & Models
// ================================

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'logo_generator.db');

// Initialize database
function initDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Database connection error:', err);
        reject(err);
        return;
      }
      console.log('✅ Connected to SQLite database');
    });

    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON');

    // Create tables
    db.serialize(() => {
      // Users table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE,
          password_hash TEXT,
          email_verified BOOLEAN DEFAULT 0,
          email_verification_token TEXT,
          email_verification_expires INTEGER,
          provider TEXT,
          provider_id TEXT,
          name TEXT,
          avatar_url TEXT,
          subscription_tier TEXT DEFAULT 'free',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_login DATETIME,
          UNIQUE(provider, provider_id)
        )
      `);

      // Sessions table
      db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id INTEGER,
          expires_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Usage tracking table
      db.run(`
        CREATE TABLE IF NOT EXISTS usage_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          ip_address TEXT,
          endpoint TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )
      `);

      // Abuse tracking table
      db.run(`
        CREATE TABLE IF NOT EXISTS abuse_tracking (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          identifier TEXT NOT NULL,
          identifier_type TEXT NOT NULL,
          violation_type TEXT,
          count INTEGER DEFAULT 1,
          first_occurrence DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_occurrence DATETIME DEFAULT CURRENT_TIMESTAMP,
          blocked_until DATETIME,
          UNIQUE(identifier, identifier_type)
        )
      `);

      // Password reset tokens
      db.run(`
        CREATE TABLE IF NOT EXISTS password_resets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          token TEXT UNIQUE,
          expires_at DATETIME,
          used BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // Create indexes for performance
      db.run('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
      db.run('CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at)');
      db.run('CREATE INDEX IF NOT EXISTS idx_abuse_identifier ON abuse_tracking(identifier, identifier_type)');

      resolve(db);
    });
  });
}

// Database helper functions
class Database {
  constructor(db) {
    this.db = db;
  }

  // User operations
  async createUser(userData) {
    return new Promise((resolve, reject) => {
      const {
        email,
        passwordHash,
        provider,
        providerId,
        name,
        avatarUrl,
        emailVerified = false,
      } = userData;

      const emailVerificationToken = email && !emailVerified
        ? crypto.randomBytes(32).toString('hex')
        : null;
      const emailVerificationExpires = emailVerificationToken
        ? Date.now() + 24 * 60 * 60 * 1000 // 24 hours
        : null;

      this.db.run(
        `INSERT INTO users (email, password_hash, provider, provider_id, name, avatar_url, email_verified, email_verification_token, email_verification_expires)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          email,
          passwordHash,
          provider,
          providerId,
          name,
          avatarUrl,
          emailVerified ? 1 : 0,
          emailVerificationToken,
          emailVerificationExpires,
        ],
        function(err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint')) {
              reject(new Error('User already exists'));
            } else {
              reject(err);
            }
            return;
          }
          resolve({ id: this.lastID, emailVerificationToken });
        }
      );
    });
  }

  async getUserByEmail(email) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE email = ?',
        [email],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async getUserById(id) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT id, email, name, avatar_url, subscription_tier, email_verified, created_at, last_login FROM users WHERE id = ?',
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async getUserByProvider(provider, providerId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE provider = ? AND provider_id = ?',
        [provider, providerId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async updateUser(id, updates) {
    return new Promise((resolve, reject) => {
      const fields = Object.keys(updates)
        .map(key => `${key} = ?`)
        .join(', ');
      const values = Object.values(updates);

      this.db.run(
        `UPDATE users SET ${fields} WHERE id = ?`,
        [...values, id],
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  }

  async verifyEmail(token) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM users WHERE email_verification_token = ? AND email_verification_expires > ?',
        [token, Date.now()],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          if (!row) {
            resolve(null);
            return;
          }
          this.db.run(
            'UPDATE users SET email_verified = 1, email_verification_token = NULL, email_verification_expires = NULL WHERE id = ?',
            [row.id],
            function(updateErr) {
              if (updateErr) reject(updateErr);
              else resolve(row);
            }
          );
        }
      );
    });
  }

  // Session operations
  async createSession(userId, sessionId, expiresAt) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
        [sessionId, userId, expiresAt],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getSession(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT s.*, u.id as user_id, u.email, u.name, u.avatar_url, u.subscription_tier, u.email_verified FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > ?',
        [sessionId, new Date().toISOString()],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async deleteSession(sessionId) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM sessions WHERE id = ?', [sessionId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async deleteExpiredSessions() {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM sessions WHERE expires_at < ?',
        [new Date().toISOString()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  // Usage tracking
  async logUsage(userId, ipAddress, endpoint) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO usage_logs (user_id, ip_address, endpoint) VALUES (?, ?, ?)',
        [userId, ipAddress, endpoint],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async getUsageCount(userId, timeWindowMs) {
    return new Promise((resolve, reject) => {
      const since = new Date(Date.now() - timeWindowMs).toISOString();
      this.db.get(
        'SELECT COUNT(*) as count FROM usage_logs WHERE user_id = ? AND created_at > ?',
        [userId, since],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        }
      );
    });
  }

  async getIPUsageCount(ipAddress, timeWindowMs) {
    return new Promise((resolve, reject) => {
      const since = new Date(Date.now() - timeWindowMs).toISOString();
      this.db.get(
        'SELECT COUNT(*) as count FROM usage_logs WHERE ip_address = ? AND created_at > ?',
        [ipAddress, since],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        }
      );
    });
  }

  // Abuse tracking
  async recordAbuse(identifier, identifierType, violationType) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO abuse_tracking (identifier, identifier_type, violation_type, count, last_occurrence)
         VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(identifier, identifier_type) DO UPDATE SET
           count = count + 1,
           last_occurrence = CURRENT_TIMESTAMP,
           violation_type = ?`,
        [identifier, identifierType, violationType, violationType],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async checkAbuseStatus(identifier, identifierType) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM abuse_tracking WHERE identifier = ? AND identifier_type = ?',
        [identifier, identifierType],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async blockIdentifier(identifier, identifierType, blockUntil) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE abuse_tracking SET blocked_until = ? WHERE identifier = ? AND identifier_type = ?',
        [blockUntil, identifier, identifierType],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async isBlocked(identifier, identifierType) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT blocked_until FROM abuse_tracking WHERE identifier = ? AND identifier_type = ? AND blocked_until > ?',
        [identifier, identifierType, new Date().toISOString()],
        (err, row) => {
          if (err) reject(err);
          else resolve(!!row);
        }
      );
    });
  }
}

let dbInstance = null;
let database = null;

async function getDatabase() {
  if (!dbInstance) {
    dbInstance = await initDatabase();
    database = new Database(dbInstance);
    
    // Clean up expired sessions periodically
    setInterval(() => {
      database.deleteExpiredSessions().catch(console.error);
    }, 60 * 60 * 1000); // Every hour
  }
  return database;
}

module.exports = { getDatabase, Database };

