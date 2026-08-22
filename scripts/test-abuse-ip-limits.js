'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PROD_SANITY = process.argv.includes('--prod-sanity');
const TEST_IP = '203.0.113.250';
const TEST_ENDPOINT = 'abuse-limit-test';

function resetModules() {
  delete require.cache[require.resolve('../database')];
  delete require.cache[require.resolve('../abuseProtection')];
}

function cleanupTestRows(dbWrapper) {
  return new Promise((resolve, reject) => {
    dbWrapper.db.run(
      'DELETE FROM usage_logs WHERE ip_address = ? AND endpoint = ?',
      [TEST_IP, TEST_ENDPOINT],
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

async function runChecks() {
  const { checkIPLimits, ABUSE_CONFIG } = require('../abuseProtection');
  const { getDatabase } = require('../database');
  const db = await getDatabase();

  try {
    let limits = await checkIPLimits(TEST_IP);
    assert.equal(limits.hourlyCount, 0, 'hourly count starts at 0');
    assert.equal(limits.allowed, true, 'fresh IP should be allowed');

    for (let i = 0; i < ABUSE_CONFIG.IP_HOURLY_LIMIT; i++) {
      await db.logUsage(null, TEST_IP, TEST_ENDPOINT);
    }

    limits = await checkIPLimits(TEST_IP);
    assert.equal(
      limits.hourlyCount,
      ABUSE_CONFIG.IP_HOURLY_LIMIT,
      `hourly count should reach limit (${ABUSE_CONFIG.IP_HOURLY_LIMIT})`,
    );
    assert.equal(limits.allowed, false, 'at hourly limit should block');

    await db.logUsage(null, TEST_IP, TEST_ENDPOINT);
    limits = await checkIPLimits(TEST_IP);
    assert.equal(limits.allowed, false, 'over hourly limit stays blocked');
    assert.ok(limits.hourlyCount > ABUSE_CONFIG.IP_HOURLY_LIMIT, 'count continues past limit');

    console.log(
      `Abuse IP limit checks passed (hourly ${ABUSE_CONFIG.IP_HOURLY_LIMIT}, daily ${ABUSE_CONFIG.IP_DAILY_LIMIT})`,
    );
  } finally {
    if (PROD_SANITY) {
      await cleanupTestRows(db);
      console.log('Cleaned up prod sanity test rows');
    }
  }
}

async function main() {
  if (PROD_SANITY) {
    console.log('Running abuse limit prod sanity check on', process.env.DB_PATH || 'default DB');
    resetModules();
    await runChecks();
    return;
  }

  const tmpDb = path.join(os.tmpdir(), `abuse-limit-${Date.now()}-${process.pid}.db`);
  process.env.DB_PATH = tmpDb;
  resetModules();
  try {
    await runChecks();
  } finally {
    resetModules();
    try {
      fs.unlinkSync(tmpDb);
    } catch {
      // ignore cleanup errors
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
