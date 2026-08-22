'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { resolveGeneratedImgPath } = require('../utils/safePath');

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
