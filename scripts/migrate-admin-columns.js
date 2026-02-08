// ================================
//  Database Migration Script
//  Adds admin and blocking columns to existing users table
// ================================
// Usage: node scripts/migrate-admin-columns.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'logo_generator.db');

async function migrateDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Database connection error:', err);
        reject(err);
        return;
      }
      console.log('✅ Connected to SQLite database');
    });

    db.serialize(() => {
      // Check if columns exist
      db.all("PRAGMA table_info(users)", (err, columns) => {
        if (err) {
          console.error('❌ Error checking table info:', err);
          db.close();
          reject(err);
          return;
        }

        const columnNames = columns.map(col => col.name);
        const migrations = [];

        // Add is_admin column if it doesn't exist
        if (!columnNames.includes('is_admin')) {
          migrations.push(() => {
            return new Promise((resolve, reject) => {
              db.run('ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0', (err) => {
                if (err) {
                  console.error('❌ Error adding is_admin column:', err);
                  reject(err);
                } else {
                  console.log('✅ Added is_admin column');
                  resolve();
                }
              });
            });
          });
        } else {
          console.log('ℹ️  is_admin column already exists');
        }

        // Add is_blocked column if it doesn't exist
        if (!columnNames.includes('is_blocked')) {
          migrations.push(() => {
            return new Promise((resolve, reject) => {
              db.run('ALTER TABLE users ADD COLUMN is_blocked BOOLEAN DEFAULT 0', (err) => {
                if (err) {
                  console.error('❌ Error adding is_blocked column:', err);
                  reject(err);
                } else {
                  console.log('✅ Added is_blocked column');
                  resolve();
                }
              });
            });
          });
        } else {
          console.log('ℹ️  is_blocked column already exists');
        }

        // Add blocked_reason column if it doesn't exist
        if (!columnNames.includes('blocked_reason')) {
          migrations.push(() => {
            return new Promise((resolve, reject) => {
              db.run('ALTER TABLE users ADD COLUMN blocked_reason TEXT', (err) => {
                if (err) {
                  console.error('❌ Error adding blocked_reason column:', err);
                  reject(err);
                } else {
                  console.log('✅ Added blocked_reason column');
                  resolve();
                }
              });
            });
          });
        } else {
          console.log('ℹ️  blocked_reason column already exists');
        }

        // Add blocked_at column if it doesn't exist
        if (!columnNames.includes('blocked_at')) {
          migrations.push(() => {
            return new Promise((resolve, reject) => {
              db.run('ALTER TABLE users ADD COLUMN blocked_at DATETIME', (err) => {
                if (err) {
                  console.error('❌ Error adding blocked_at column:', err);
                  reject(err);
                } else {
                  console.log('✅ Added blocked_at column');
                  resolve();
                }
              });
            });
          });
        } else {
          console.log('ℹ️  blocked_at column already exists');
        }

        // Create custom_user_limits table if it doesn't exist
        db.run(`
          CREATE TABLE IF NOT EXISTS custom_user_limits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            daily_limit INTEGER,
            hourly_limit INTEGER,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          )
        `, (err) => {
          if (err) {
            console.error('❌ Error creating custom_user_limits table:', err);
          } else {
            console.log('✅ Ensured custom_user_limits table exists');
          }
        });

        // Run all migrations
        Promise.all(migrations.map(migrate => migrate()))
          .then(() => {
            console.log('\n✅ Migration completed successfully!');
            db.close();
            resolve();
          })
          .catch((err) => {
            console.error('\n❌ Migration failed:', err);
            db.close();
            reject(err);
          });
      });
    });
  });
}

// Run migration
migrateDatabase()
  .then(() => {
    console.log('\n🎉 Database migration complete!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n💥 Migration error:', err);
    process.exit(1);
  });

