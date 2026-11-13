#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getClientIp } = require('../utils/clientIp');
const { sanitizeMemeText, finiteInRange } = require('../utils/memeText');
const { isSafeInternalRedirect } = require('../utils/siteUrl');

const spoofed = {
  socket: { remoteAddress: '127.0.0.1' },
  headers: {
    'x-forwarded-for': '198.51.100.1, 203.0.113.9',
    'x-real-ip': '203.0.113.9',
  },
  ip: '198.51.100.1',
};
assert.equal(getClientIp(spoofed), '203.0.113.9');

const direct = {
  socket: { remoteAddress: '203.0.113.8' },
  headers: {
    'x-forwarded-for': '198.51.100.1',
    'x-real-ip': '198.51.100.1',
  },
  ip: '203.0.113.8',
};
assert.equal(getClientIp(direct), '203.0.113.8');

assert.equal(sanitizeMemeText("hello:textfile=/etc/passwd"), 'hellotextfileetcpasswd');
assert.equal(sanitizeMemeText('Hello, world!'), 'Hello, world!');
assert.equal(finiteInRange('nope', 1.5, 1, 3), 1.5);
assert.equal(finiteInRange(99, 1.5, 1, 3), 3);

assert.equal(isSafeInternalRedirect('/mcp'), true);
assert.equal(isSafeInternalRedirect('//evil.example'), false);
assert.equal(isSafeInternalRedirect('/\\evil.example'), false);

const core = fs.readFileSync(path.join(__dirname, '..', 'services', 'core.js'), 'utf8');
assert.match(core, /trust proxy',\s*1/);
assert.match(core, /limit: '1mb'/);
const abuse = fs.readFileSync(path.join(__dirname, '..', 'abuseProtection.js'), 'utf8');
assert.doesNotMatch(abuse, /x-forwarded-for/i);

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert.match(server, /127\.0\.0\.1/);

const video = fs.readFileSync(path.join(__dirname, '..', 'services', 'videoService.js'), 'utf8');
assert.doesNotMatch(video, /drawtext=text=/);
assert.match(video, /textfile=/);
assert.match(video, /80 \* 1024 \* 1024/);

console.log('security hardening tests passed');
