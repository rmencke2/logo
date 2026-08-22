'use strict';

/**
 * Smoke-test native addons after npm ci on production (glibc-sensitive).
 * Exits non-zero if sqlite3 cannot load or query.
 */
const sqlite3 = require('sqlite3');

const version = require('sqlite3/package.json').version;
const db = new sqlite3.Database(':memory:');

db.get('SELECT sqlite_version() AS v', (err, row) => {
  if (err) {
    console.error(`sqlite3 ${version} failed:`, err.message);
    process.exit(1);
  }
  console.log(`sqlite3 ${version} OK (lib ${row.v})`);
  db.close();
});
