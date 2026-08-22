'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const tmpDb = path.join(os.tmpdir(), `mcp-rate-${Date.now()}-${process.pid}.db`);
process.env.DB_PATH = tmpDb;

function closeSqlite(dbWrapper) {
  return new Promise((resolve, reject) => {
    dbWrapper.db.close((err) => (err ? reject(err) : resolve()));
  });
}

function resetModules() {
  delete require.cache[require.resolve('../database')];
  delete require.cache[require.resolve('../services/mcpSubmissionService')];
}

async function main() {
  const {
    checkMcpSubmitRateLimit,
    RATE_LIMIT_PER_HOUR,
    MCP_SUBMIT_ENDPOINT,
    RATE_LIMIT_WINDOW_MS,
  } = require('../services/mcpSubmissionService');
  const { getDatabase } = require('../database');

  const ip = '203.0.113.42';
  for (let i = 0; i < RATE_LIMIT_PER_HOUR; i++) {
    assert.equal(await checkMcpSubmitRateLimit(ip), true, `attempt ${i + 1} should be allowed`);
  }
  assert.equal(await checkMcpSubmitRateLimit(ip), false, '6th attempt should be blocked');

  const db = await getDatabase();
  const count = await db.getIPUsageCountForEndpoint(ip, MCP_SUBMIT_ENDPOINT, RATE_LIMIT_WINDOW_MS);
  assert.equal(count, RATE_LIMIT_PER_HOUR);

  const ip2 = '203.0.113.99';
  for (let i = 0; i < 3; i++) {
    assert.equal(await checkMcpSubmitRateLimit(ip2), true);
  }

  await closeSqlite(db);
  resetModules();

  const { checkMcpSubmitRateLimit: checkAfterReconnect, RATE_LIMIT_PER_HOUR: limit } = require('../services/mcpSubmissionService');
  for (let i = 0; i < limit - 3; i++) {
    assert.equal(await checkAfterReconnect(ip2), true);
  }
  assert.equal(await checkAfterReconnect(ip2), false, 'should stay blocked after reconnect');

  console.log('MCP submit rate limit tests passed');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    try {
      fs.unlinkSync(tmpDb);
    } catch {
      // ignore cleanup errors
    }
  });
