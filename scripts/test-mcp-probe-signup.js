'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Duplex } = require('stream');
const { readProbeInbox, imapQuote } = require('./utils/mcp-probe-mailbox');
const { parseSignupForm, tryProbeSignup } = require('./utils/mcp-probe-signup');
const { probeEndpointForTools } = require('./utils/mcp-probe-auth');

const APP_PASSWORD = 'app-secret-value';
const SIGNUP_HTML = `<!doctype html><title>Create account</title>
<form method="post" action="/signup">
  <input type="hidden" name="csrf" value="csrf-1">
  <input type="email" name="email">
  <input type="password" name="password">
  <input type="password" name="password_confirmation">
</form>`;

function allowExample(url) {
  const parsed = new URL(url);
  if (!parsed.hostname.endsWith('example.com')) throw new Error(`blocked ${parsed.hostname}`);
  return parsed.href;
}

class FakeImap extends Duplex {
  constructor() {
    super();
    this.clientText = '';
  }
  _read() {}
  _write(chunk, _enc, cb) {
    this.clientText += chunk.toString();
    const text = chunk.toString();
    if (text.startsWith('A1 LOGIN')) this.push('A1 OK logged in\r\n');
    else if (text.startsWith('A2 ')) this.push('A2 OK [READ-WRITE] INBOX\r\n');
    else if (text.startsWith('A3 ')) this.push('* SEARCH 9\r\nA3 OK SEARCH done\r\n');
    else if (text.startsWith('A4 ')) {
      const body = 'Confirm https://mcp.example.com/verify?access_token=tok-from-mail\r\n';
      this.push(`* 1 FETCH (UID 9 BODY[TEXT] {${Buffer.byteLength(body)}}\r\n${body}A4 OK FETCH done\r\n`);
    } else if (text.startsWith('A5 ')) this.push('A5 OK logout\r\n');
    cb();
  }
}

async function main() {
  assert.throws(() => imapQuote('bad\nsecret'), /line break/);
  assert.equal(imapQuote('ab"c'), '"ab\\"c"');

  const socket = new FakeImap();
  const inboxPromise = readProbeInbox({
    email: 'probe@example.com',
    password: APP_PASSWORD,
    socket,
    hosts: new Set(['mcp.example.com']),
    since: new Date('2026-11-23T00:00:00Z'),
  });
  socket.push('* OK Gimap ready\r\n');
  const inbox = await inboxPromise;
  assert.equal(inbox.link, 'https://mcp.example.com/verify?access_token=tok-from-mail');
  assert.equal(inbox.link.includes(APP_PASSWORD), false);
  assert.match(socket.clientText, /LOGIN "probe@example.com"/);

  const bad = new FakeImap();
  bad._write = function write(chunk, _enc, cb) {
    if (chunk.toString().startsWith('A1 ')) this.push('A1 NO [AUTHENTICATIONFAILED] Invalid credentials\r\n');
    cb();
  };
  const badPromise = readProbeInbox({
    email: 'probe@example.com',
    password: APP_PASSWORD,
    socket: bad,
  });
  bad.push('* OK ready\r\n');
  await assert.rejects(badPromise, (err) => {
    assert.equal(String(err.message).includes(APP_PASSWORD), false);
    assert.match(err.message, /App Password/);
    return true;
  });

  const captcha = parseSignupForm('<form method="post"><div class="g-recaptcha"></div><input type="email" name="email"></form>', 'https://mcp.example.com/signup');
  assert.equal(captcha.blocked, 'captcha');

  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body || '' });
    const href = String(url);
    if (href.includes('oauth-protected-resource')) {
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (href.endsWith('/signup') && (opts.method || 'GET') === 'GET') {
      return new Response(SIGNUP_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    if (opts.method === 'POST' && href.endsWith('/signup')) {
      return new Response('{"ok":true}', { status: 202, headers: { 'content-type': 'application/json' } });
    }
    if (href.includes('/verify')) {
      return new Response('verified', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } });
  };

  const accountsPath = path.join(os.tmpdir(), `mcp-signup-${process.pid}.json`);
  const result = await tryProbeSignup({
    endpoint: 'https://mcp.example.com/mcp',
    wwwAuthenticate: 'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"',
    accountsPath,
    fetchImpl,
    assertUrl: allowExample,
    email: 'probe@example.com',
    mailboxPassword: APP_PASSWORD,
    readInbox: async () => ({
      links: ['https://mcp.example.com/verify?access_token=signup-token-1'],
      link: 'https://mcp.example.com/verify?access_token=signup-token-1',
    }),
  });
  assert.equal(result.accessToken, 'signup-token-1');
  const posted = calls.find((call) => call.method === 'POST');
  assert.ok(posted, 'signup form should be posted');
  const params = new URLSearchParams(posted.body);
  assert.equal(params.get('email'), 'probe@example.com');
  assert.equal(params.get('csrf'), 'csrf-1');
  assert.equal(params.get('password'), params.get('password_confirmation'));
  const stored = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
  const generated = stored['https://mcp.example.com/mcp'].signup_password;
  assert.equal(params.get('password'), generated);
  assert.equal(JSON.stringify(result).includes(generated), false);
  assert.equal(JSON.stringify(result).includes(APP_PASSWORD), false);
  assert.equal(posted.body.includes(APP_PASSWORD), false);
  fs.unlinkSync(accountsPath);

  const captchaCalls = [];
  const captchaResult = await tryProbeSignup({
    endpoint: 'https://mcp.example.com/mcp',
    accountsPath: path.join(os.tmpdir(), `mcp-signup-captcha-${process.pid}.json`),
    fetchImpl: async (url, opts = {}) => {
      captchaCalls.push(opts.method || 'GET');
      if (String(url).endsWith('/signup')) {
        return new Response(
          '<form method="post" action="/signup"><div class="g-recaptcha"></div><input type="email" name="email"></form>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }
      return new Response('no', { status: 404 });
    },
    assertUrl: allowExample,
    email: 'probe@example.com',
    mailboxPassword: APP_PASSWORD,
    readInbox: async () => {
      throw new Error('inbox should not be read');
    },
  });
  assert.match(captchaResult.reason, /captcha/);
  assert.equal(captchaCalls.includes('POST'), false);

  const probed = await probeEndpointForTools({
    endpoint: 'https://mcp.example.com/mcp',
    fetchLive: async (_url, opts = {}) => (
      opts.bearerToken === 'signup-token'
        ? { status: 'ok', tools: [{ name: 'search', description: 'Search after the account exists.' }] }
        : { status: 'auth_required', wwwAuthenticate: 'Bearer realm="mcp"', reason: 'Unauthorized' }
    ),
    registerClient: async () => ({ attempted: true, reason: 'No dynamic client registration.' }),
    trySignup: async () => ({
      attempted: true,
      accessToken: 'signup-token',
      reason: 'Signed up with the probe mailbox and obtained a token.',
    }),
  });
  assert.equal(probed.live.status, 'ok');
  assert.match(probed.authAttempt.reason, /probe mailbox/);
  assert.equal(JSON.stringify(probed.authAttempt).includes('signup-token'), false);

  console.log('MCP probe signup tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
