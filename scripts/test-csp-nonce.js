'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ejs = require('ejs');
const express = require('express');
const { mountCsp, applyNoncesToHtml, cspDirectives } = require('../middleware/cspNonce');

const root = path.join(__dirname, '..');

function walk(dir, ext, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, ext, out);
    else if (ent.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function parseCsp(header) {
  const directives = new Map();
  for (const part of String(header || '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const space = trimmed.indexOf(' ');
    if (space === -1) directives.set(trimmed, '');
    else directives.set(trimmed.slice(0, space), trimmed.slice(space + 1).trim());
  }
  return directives;
}

function assertScriptCsp(header) {
  const directives = parseCsp(header);
  const scriptSrc = directives.get('script-src') || '';
  const scriptSrcAttr = directives.get('script-src-attr') || '';
  const styleSrc = directives.get('style-src') || '';
  assert.ok(scriptSrc, 'missing script-src');
  assert.doesNotMatch(scriptSrc, /unsafe-inline/);
  assert.doesNotMatch(scriptSrcAttr, /unsafe-inline/);
  assert.match(scriptSrcAttr, /'none'/);
  assert.match(scriptSrc, /'self'/);
  assert.match(scriptSrc, /https:\/\/challenges\.cloudflare\.com/);
  assert.match(scriptSrc, /https:\/\/www\.googletagmanager\.com/);
  assert.match(styleSrc, /'unsafe-inline'/);
  const nonce = scriptSrc.match(/'nonce-([A-Za-z0-9_-]+)'/);
  assert.ok(nonce, `script-src missing nonce: ${scriptSrc}`);
  return nonce[1];
}

assert.deepEqual(cspDirectives.scriptSrcAttr, ["'none'"]);
assert.ok(!cspDirectives.scriptSrc.includes("'unsafe-inline'"));
assert.ok(cspDirectives.styleSrc.includes("'unsafe-inline'"));

const stamped = applyNoncesToHtml(
  '<!DOCTYPE html><script>window.__ok=1</script><script src="/js/app.js"></script>',
  'abc123',
);
assert.match(stamped, /<script nonce="abc123">window\.__ok=1<\/script>/);
assert.match(stamped, /<script nonce="abc123" src="\/js\/app\.js">/);

const thirdParty = applyNoncesToHtml(
  '<!DOCTYPE html><script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>',
  'abc123',
);
assert.doesNotMatch(thirdParty, /nonce=/);

const already = applyNoncesToHtml('<script nonce="keep">1</script>', 'other');
assert.equal(already, '<script nonce="keep">1</script>');

for (const file of walk(path.join(root, 'views'), '.ejs')) {
  const html = fs.readFileSync(file, 'utf8');
  ejs.compile(html, { filename: file });
  const tags = html.match(/<script\b[^>]*>/gi) || [];
  for (const tag of tags) {
    assert.match(tag, /\bnonce\s*=/, `${file} script missing nonce: ${tag}`);
  }
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${file} still has an inline event handler`);
}

for (const rel of ['public/index.html', 'public/admin.html', 'public/footer.html']) {
  const html = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, `${rel} still has an inline event handler`);
}

for (const rel of ['public/js/main.js', 'public/js/mcp-cards.js']) {
  const js = fs.readFileSync(path.join(root, rel), 'utf8');
  assert.doesNotMatch(js, /\son[a-z]+\s*=/, `${rel} still emits an inline event handler`);
}

const staticService = fs.readFileSync(path.join(root, 'services', 'staticService.js'), 'utf8');
assert.match(staticService, /\/meme-generator\.html/);
assert.match(staticService, /\/video-converter\.html/);
assert.match(staticService, /\/video-to-gif\.html/);
assert.match(staticService, /\/video-metadata\.html/);

const core = fs.readFileSync(path.join(root, 'services', 'core.js'), 'utf8');
assert.match(core, /mountCsp\(app\)/);
assert.doesNotMatch(core, /scriptSrcAttr:\s*\["'unsafe-inline'"\]/);

const adminHtml = fs.readFileSync(path.join(root, 'public', 'admin.html'), 'utf8');
const scriptStart = adminHtml.indexOf('<script>');
const scriptEnd = adminHtml.lastIndexOf('</script>');
assert.ok(scriptStart > 0 && scriptEnd > scriptStart);
const adminJsPath = path.join(os.tmpdir(), 'influzer-admin-csp-check.js');
fs.writeFileSync(adminJsPath, adminHtml.slice(scriptStart + '<script>'.length, scriptEnd));
const checked = spawnSync(process.execPath, ['--check', adminJsPath], { encoding: 'utf8' });
assert.equal(checked.status, 0, checked.stderr || checked.stdout);

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(root, 'views'));
  mountCsp(app);
  app.get('/login', (req, res) => res.render('login'));
  app.get('/logo-generator', (req, res) => {
    res.sendFile(path.join(root, 'public', 'index.html'));
  });
  app.get('/admin-file', (req, res) => {
    res.sendFile(path.join(root, 'public', 'admin.html'));
  });
  app.get('/api/sample', (req, res) => {
    res.json({ html: '<script>alert(1)</script>' });
  });

  const server = await listen(app);
  try {
    const port = server.address().port;
    const login = await fetch(`http://127.0.0.1:${port}/login`);
    const loginHtml = await login.text();
    assert.equal(login.status, 200);
    const loginNonce = assertScriptCsp(login.headers.get('content-security-policy'));
    assert.match(loginHtml, new RegExp(`<script nonce="${loginNonce}">`));
    assert.doesNotMatch(loginHtml, /\son[a-z]+\s*=/i);

    const logo = await fetch(`http://127.0.0.1:${port}/logo-generator`);
    const logoHtml = await logo.text();
    assert.equal(logo.status, 200);
    const logoNonce = assertScriptCsp(logo.headers.get('content-security-policy'));
    assert.match(logoHtml, new RegExp(`<script nonce="${logoNonce}">`));
    const ad = logoHtml.match(/<script\b[^>]*pagead2\.googlesyndication\.com[^>]*>/i);
    assert.ok(ad, 'expected the existing AdSense tag to remain in the logo page');
    assert.doesNotMatch(ad[0], /\snonce=/);

    const admin = await fetch(`http://127.0.0.1:${port}/admin-file`);
    const adminBody = await admin.text();
    assert.equal(admin.status, 200);
    const adminNonce = assertScriptCsp(admin.headers.get('content-security-policy'));
    assert.match(adminBody, new RegExp(`<script nonce="${adminNonce}">`));
    assert.doesNotMatch(adminBody, /\son[a-z]+\s*=/i);

    const api = await fetch(`http://127.0.0.1:${port}/api/sample`);
    const apiBody = await api.json();
    assert.equal(apiBody.html, '<script>alert(1)</script>');
    assert.ok(api.headers.get('content-security-policy'));
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }

  console.log('csp nonce tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
