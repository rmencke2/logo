'use strict';

const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const { registerHealthRoutes } = require('../services/healthService');

async function request(app, path) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const json = await res.json();
  await new Promise((r) => server.close(r));
  return { status: res.status, json };
}

async function main() {
  const app = express();
  registerHealthRoutes(app);

  const healthz = await request(app, '/healthz');
  assert.equal(healthz.status, 200);
  assert.equal(healthz.json.status, 'ok');
  assert.equal(typeof healthz.json.pid, 'number');
  assert.ok(healthz.json.uptime_s >= 0);

  const health = await request(app, '/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.status, 'ok');

  console.log('healthz tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
