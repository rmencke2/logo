'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { resolveGeneratedImgPath } = require('../utils/safePath');
const { sanitizeLogoIcon, escapeSvgText } = require('../utils/svgSanitize');
const { clientErrorPayload, clientErrorMessage } = require('../utils/safeError');

test('resolveGeneratedImgPath accepts valid generated_img paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-path-'));
  const imgDir = path.join(root, 'generated_img');
  fs.mkdirSync(imgDir);
  const file = path.join(imgDir, 'logo.png');
  fs.writeFileSync(file, 'png');

  const result = resolveGeneratedImgPath('/generated_img/logo.png', root);
  assert.equal(result.ok, true);
  assert.equal(result.filePath, file);
});

test('resolveGeneratedImgPath rejects path traversal', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-path-'));
  fs.mkdirSync(path.join(root, 'generated_img'));

  const result = resolveGeneratedImgPath('/generated_img/../package.json', root);
  assert.equal(result.ok, false);
});

test('resolveGeneratedImgPath rejects paths outside generated_img', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-path-'));
  const result = resolveGeneratedImgPath('/etc/passwd', root);
  assert.equal(result.ok, false);
});

test('escapeSvgText encodes markup characters', () => {
  assert.equal(escapeSvgText('a&b<c>"\''), 'a&amp;b&lt;c&gt;&quot;&apos;');
});

test('sanitizeLogoIcon accepts emoji and rejects markup', () => {
  assert.equal(sanitizeLogoIcon('🚀'), '🚀');
  assert.throws(() => sanitizeLogoIcon('<b>'), /invalid characters/i);
  assert.throws(() => sanitizeLogoIcon('a'.repeat(20)), /too long/i);
});

test('clientErrorPayload hides details in production', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.deepEqual(clientErrorPayload('Failed', new Error('secret')), { error: 'Failed' });
    assert.equal(clientErrorMessage(new Error('secret'), 'Failed'), 'Failed');
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('clientErrorPayload includes details in development', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    assert.deepEqual(clientErrorPayload('Failed', new Error('secret')), {
      error: 'Failed',
      details: 'secret',
    });
    assert.equal(clientErrorMessage(new Error('secret'), 'Failed'), 'secret');
  } finally {
    process.env.NODE_ENV = prev;
  }
});
