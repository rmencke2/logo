'use strict';

const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const express = require('express');

const tmpDb = path.join(os.tmpdir(), `mcp-discovery-analytics-${Date.now()}-${process.pid}.db`);
process.env.DB_PATH = tmpDb;

function closeSqlite(dbWrapper) {
  return new Promise((resolve, reject) => {
    dbWrapper.db.close((err) => (err ? reject(err) : resolve()));
  });
}

function postJson(port, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/mcp/discovery',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function waitForCalls(getStats, expected, timeoutMs = 3000) {
  const started = Date.now();
  let stats = await getStats();
  while (stats.totalCalls < expected && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    stats = await getStats();
  }
  return stats;
}

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, port };
}

async function main() {
  const {
    inferClientName,
    logMcpDiscoveryCall,
    getMcpDiscoveryAnalytics,
    ensureMcpDiscoveryAnalyticsTables,
  } = require('../services/mcpDiscoveryAnalytics');

  assert.equal(inferClientName('initialize', { clientInfo: { name: 'cursor-vscode' } }, ''), 'cursor-vscode');
  assert.equal(inferClientName('tools/list', {}, 'Cursor/1.0'), 'cursor');
  assert.equal(inferClientName('tools/call', {}, 'Claude-User'), 'claude');
  assert.equal(inferClientName('ping', {}, 'Mozilla/5.0'), null);

  await ensureMcpDiscoveryAnalyticsTables();

  await logMcpDiscoveryCall({
    rpcMethod: 'initialize',
    success: true,
    durationMs: 12,
    ipAddress: '203.0.113.10',
    userAgent: 'Cursor/1.0',
    clientName: 'cursor-vscode',
  });
  await logMcpDiscoveryCall({
    rpcMethod: 'tools/call',
    toolName: 'search_mcp_servers',
    success: true,
    durationMs: 40,
    ipAddress: '203.0.113.10',
    userAgent: 'Cursor/1.0',
    clientName: 'cursor',
  });
  await logMcpDiscoveryCall({
    rpcMethod: 'tools/call',
    toolName: 'get_mcp_server',
    success: false,
    errorMessage: 'boom',
    durationMs: 8,
    ipAddress: '203.0.113.11',
    clientName: 'claude',
  });

  const logged = await getMcpDiscoveryAnalytics(1);
  assert.equal(logged.totalCalls, 3);
  assert.equal(logged.toolCalls, 2);
  assert.equal(logged.uniqueIps, 2);
  assert.equal(logged.failedCalls, 1);
  assert.ok(logged.byTool.some((row) => row.toolName === 'search_mcp_servers' && row.calls === 1));
  assert.ok(logged.byClient.some((row) => row.clientName === 'cursor-vscode'));

  const { registerMcpDiscoveryRoutes } = require('../services/mcpDiscoveryMcpService');
  const app = express();
  app.use(express.json());
  registerMcpDiscoveryRoutes(app);
  const { server, port } = await listen(app);

  const before = await getMcpDiscoveryAnalytics(1);

  const initRes = await postJson(
    port,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', clientInfo: { name: 'cursor-vscode', version: '1.0' } },
    },
    { 'User-Agent': 'Cursor/2.0', 'X-Forwarded-For': '198.51.100.7' },
  );
  assert.equal(initRes.status, 200);
  assert.equal(initRes.body.result.serverInfo.name, 'influzer-mcp-discovery');

  const searchRes = await postJson(
    port,
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'search_mcp_servers', arguments: { query: 'github' } },
    },
    { 'User-Agent': 'Cursor/2.0', 'X-Forwarded-For': '198.51.100.7' },
  );
  assert.equal(searchRes.status, 200);
  assert.equal(searchRes.body.result.isError, false);

  const badRes = await postJson(
    port,
    { jsonrpc: '2.0', id: 3, method: 'not-a-method' },
    { 'User-Agent': 'Cursor/2.0', 'X-Forwarded-For': '198.51.100.7' },
  );
  assert.equal(badRes.status, 200);
  assert.equal(badRes.body.error.code, -32601);

  const after = await waitForCalls(getMcpDiscoveryAnalytics, before.totalCalls + 3);
  assert.ok(after.totalCalls >= before.totalCalls + 3, `expected at least 3 new calls, got ${after.totalCalls - before.totalCalls}`);
  assert.ok(after.failedCalls >= before.failedCalls + 1);
  assert.ok(after.byMethod.some((row) => row.rpcMethod === 'initialize'));
  assert.ok(after.byTool.some((row) => row.toolName === 'search_mcp_servers'));

  await new Promise((resolve) => server.close(resolve));
  const { getDatabase } = require('../database');
  await closeSqlite(await getDatabase());

  console.log('MCP Discovery analytics tests passed');
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
