'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseResourceMetadataUrl,
  authorizationServerMetadataUrl,
  publicAuthAttempt,
  tryRegisterProbeClient,
  probeEndpointForTools,
} = require('./utils/mcp-probe-auth');

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function allowExample(url) {
  const parsed = new URL(url);
  if (!parsed.hostname.endsWith('example.com')) throw new Error(`blocked ${parsed.hostname}`);
  return parsed.href;
}

const RESOURCE_HEADER =
  'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"';

function registrationFetch() {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body || '' });
    if (String(url).includes('oauth-protected-resource')) {
      return jsonResponse({
        resource: 'https://mcp.example.com/mcp',
        authorization_servers: ['https://auth.example.com'],
      });
    }
    if (String(url).includes('/.well-known/oauth-authorization-server')) {
      return jsonResponse({
        registration_endpoint: 'https://auth.example.com/register',
        token_endpoint: 'https://auth.example.com/token',
        grant_types_supported: ['client_credentials', 'authorization_code'],
      });
    }
    if (String(url).endsWith('/register')) {
      return jsonResponse({ client_id: 'cid-1', client_secret: 'sec-1' }, 201);
    }
    if (String(url).endsWith('/token')) {
      return jsonResponse({ access_token: 'tok-1', token_type: 'Bearer' });
    }
    throw new Error(`unexpected ${url}`);
  };
  return { calls, fetchImpl };
}

async function main() {
  assert.equal(
    parseResourceMetadataUrl(RESOURCE_HEADER),
    'https://mcp.example.com/.well-known/oauth-protected-resource',
  );
  assert.equal(parseResourceMetadataUrl('Bearer realm="mcp"'), null);
  assert.equal(
    authorizationServerMetadataUrl('https://auth.example.com/tenant'),
    'https://auth.example.com/.well-known/oauth-authorization-server/tenant',
  );

  const skipped = await tryRegisterProbeClient({
    wwwAuthenticate: RESOURCE_HEADER,
    email: '',
    fetchImpl: async () => {
      throw new Error('fetch should not run without a mailbox');
    },
  });
  assert.equal(skipped.attempted, false);
  assert.match(skipped.reason, /MCP_PROBE_ACCOUNT_EMAIL is not set/);

  const noMetadata = await tryRegisterProbeClient({
    wwwAuthenticate: 'Bearer realm="mcp"',
    email: 'probe@example.com',
    fetchImpl: async () => {
      throw new Error('fetch should not run without resource metadata');
    },
  });
  assert.equal(noMetadata.attempted, false);

  let redirectFetches = 0;
  const redirected = await tryRegisterProbeClient({
    wwwAuthenticate: RESOURCE_HEADER,
    email: 'probe@example.com',
    assertUrl: allowExample,
    fetchImpl: async () => {
      redirectFetches += 1;
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secret' } });
    },
  });
  assert.equal(redirectFetches, 1);
  assert.match(redirected.reason, /redirect was not followed/);

  const { calls, fetchImpl } = registrationFetch();
  const registered = await tryRegisterProbeClient({
    wwwAuthenticate: RESOURCE_HEADER,
    email: 'probe@example.com',
    assertUrl: allowExample,
    fetchImpl,
  });
  assert.equal(registered.registered, true);
  assert.equal(registered.accessToken, 'tok-1');
  const registerCall = calls.find((call) => call.url.endsWith('/register'));
  assert.deepEqual(JSON.parse(registerCall.body).contacts, ['probe@example.com']);
  const published = publicAuthAttempt(registered);
  const publishedJson = JSON.stringify(published);
  assert.equal(publishedJson.includes('sec-1'), false);
  assert.equal(publishedJson.includes('tok-1'), false);
  assert.equal(published.clientId, 'cid-1');

  const accountsPath = path.join(os.tmpdir(), `mcp-probe-accounts-${process.pid}.json`);
  const bearers = [];
  const fetchLive = async (_url, opts = {}) => {
    bearers.push(opts.bearerToken || null);
    if (opts.bearerToken === 'tok-1') {
      return { status: 'ok', tools: [{ name: 'search', description: 'Search docs when you need a page.' }] };
    }
    return { status: 'auth_required', reason: 'Unauthorized', wwwAuthenticate: RESOURCE_HEADER };
  };

  const first = await probeEndpointForTools({
    endpoint: 'https://mcp.example.com/mcp',
    timeoutMs: 1000,
    fetchLive,
    accountsPath,
    email: 'probe@example.com',
    assertUrl: allowExample,
    fetchImpl,
  });
  assert.equal(first.live.status, 'ok');
  assert.equal(first.authAttempt.tokenAcquired, true);
  const firstJson = JSON.stringify(first.authAttempt);
  assert.equal(firstJson.includes('sec-1'), false);
  assert.equal(firstJson.includes('tok-1'), false);
  const stored = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
  assert.equal(stored['https://mcp.example.com/mcp'].client_secret, 'sec-1');

  let secondRegistration = 0;
  const second = await probeEndpointForTools({
    endpoint: 'https://mcp.example.com/mcp',
    timeoutMs: 1000,
    fetchLive,
    accountsPath,
    email: 'probe@example.com',
    assertUrl: allowExample,
    fetchImpl,
    registerClient: async () => {
      secondRegistration += 1;
      return { attempted: false, reason: 'should reuse the stored client' };
    },
  });
  assert.equal(secondRegistration, 0);
  assert.equal(second.live.status, 'ok');
  assert.match(second.authAttempt.reason, /registered earlier/);
  fs.unlinkSync(accountsPath);

  const password = 'read-only-pass';
  const loginBearers = [];
  const loginProbe = await probeEndpointForTools({
    endpoint: 'https://mcp.example.com/mcp',
    submission: {
      testAccount: {
        kind: 'login',
        label: 'reviewer@example.com',
        secret: password,
        consent: true,
      },
    },
    fetchLive: async (_url, opts = {}) => {
      loginBearers.push(opts.bearerToken || null);
      return { status: 'auth_required', reason: 'Unauthorized', wwwAuthenticate: '' };
    },
    registerClient: async () => ({
      attempted: false,
      registered: false,
      reason: 'The 401 did not advertise OAuth resource metadata, so there is no registration endpoint to call.',
    }),
  });
  assert.equal(loginBearers.includes(password), false);
  assert.match(loginProbe.authAttempt.reason, /does not submit website signup/);
  assert.equal(JSON.stringify(loginProbe.authAttempt).includes(password), false);

  const token = 'submitted-bearer-token';
  const submitted = await probeEndpointForTools({
    endpoint: 'https://mcp.example.com/mcp',
    submission: { testAccount: { kind: 'bearer', secret: token, consent: true } },
    fetchLive: async (_url, opts = {}) => {
      assert.equal(opts.bearerToken, token);
      return { status: 'ok', tools: [{ name: 'list', description: 'List records when the agent needs ids.' }] };
    },
    registerClient: async () => {
      throw new Error('registration should not run after a bearer succeeds');
    },
  });
  assert.equal(submitted.authAttempt.mode, 'submitted_bearer');
  assert.equal(JSON.stringify(submitted).includes(token), false);

  const gitignore = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.match(gitignore, /data\/mcp-probe-accounts\.json/);
  assert.match(gitignore, /data\/mcp-submissions\/\*\.json/);

  console.log('MCP probe auth tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
