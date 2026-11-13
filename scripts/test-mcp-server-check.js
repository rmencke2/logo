'use strict';

const os = require('os');
const path = require('path');
process.env.DB_PATH = path.join(os.tmpdir(), `mcp-check-test-${process.pid}.db`);

const assert = require('node:assert/strict');
const ejs = require('ejs');
const { computeQualitySignals } = require('./utils/mcp-quality');
const { cspNonceMiddleware } = require('../middleware/cspNonce');
const { buildCheckReport, checkMcpServer } = require('../services/mcpServerCheck');

const annotated = {
  name: 'search_docs',
  title: 'Search docs',
  description: 'Search the public docs.',
  inputSchema: {
    type: 'object',
    required: ['q'],
    properties: {
      q: { type: 'string', description: 'Query text' },
      limit: { type: 'integer' },
    },
  },
  outputSchema: { type: 'object' },
  annotations: {
    title: 'Search',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
    audience: 'public',
  },
};

const partial = {
  name: 'lookup_page',
  description: 'Fetch one page.',
  annotations: { readOnlyHint: true },
};

const bare = { name: 'do_thing' };

function liveOk(tools, extra) {
  return {
    status: 'ok',
    tools,
    httpStatus: 200,
    serverInfo: { name: 'example-mcp', version: '1.2.0' },
    protocolVersion: '2024-11-05',
    instructions: 'Use the search tool first.',
    capabilities: { tools: {}, resources: {}, prompts: {} },
    contentType: 'application/json',
    resource_count: 4,
    prompt_count: 1,
    latency_ms: 42,
    ...extra,
  };
}

async function render(check) {
  return ejs.renderFile(path.join(__dirname, '..', 'views', 'mcp-check.ejs'), {
    title: 'Check an MCP server',
    description: 'Check',
    canonicalUrl: 'https://www.influzer.ai/mcp/check',
    assetVersion: '1',
    navPath: '/mcp/check',
    canCheck: true,
    csrfToken: 'csrf-test',
    formError: null,
    check,
    noindex: Boolean(check),
    prefillUrl: '',
    prefillTransport: 'http',
    cspNonce: 'test-nonce',
  });
}

async function main() {
  const reviewed = buildCheckReport({
    url: 'https://example.com/mcp',
    transport: 'http',
    catalog: [],
    live: liveOk([annotated, partial, bare]),
  });

  assert.equal(reviewed.summary.tool_count, 3);
  assert.equal(reviewed.summary.annotated_count, 2);
  assert.equal(reviewed.summary.missing_description_count, 1);
  assert.equal(reviewed.summary.missing_input_schema_count, 2);
  assert.equal(reviewed.summary.missing_annotations_count, 1);
  assert.equal(reviewed.in_catalog, false);
  assert.equal(reviewed.server.name, 'example-mcp');
  assert.equal(reviewed.server.version, '1.2.0');
  assert.equal(reviewed.resource_count, 4);
  assert.equal(reviewed.prompt_count, 1);
  assert.equal(reviewed.quality.safety_badge, null);

  const search = reviewed.tools.find((tool) => tool.name === 'search_docs');
  const empty = reviewed.tools.find((tool) => tool.name === 'do_thing');
  const hinted = reviewed.tools.find((tool) => tool.name === 'lookup_page');
  assert.equal(search.missing_description, false);
  assert.equal(search.missing_input_schema, false);
  assert.equal(search.missing_annotations, false);
  assert.equal(search.title, 'Search docs');
  assert.equal(search.fields[0].name, 'q');
  assert.equal(search.fields[0].type, 'string');
  assert.equal(search.fields[0].required, true);
  assert.equal(search.output_schema, 'present');
  assert.deepEqual(
    search.hints.map((hint) => hint.value),
    ['true', 'false', 'true', 'true'],
  );
  assert.equal(search.other_annotations[0].key, 'audience');

  assert.equal(empty.missing_description, true);
  assert.equal(empty.missing_input_schema, true);
  assert.equal(empty.missing_annotations, true);
  assert.ok(empty.gaps.includes('Missing description'));
  assert.ok(empty.gaps.includes('Missing input schema'));
  assert.ok(empty.gaps.includes('Missing annotations'));
  assert.equal(empty.hints.every((hint) => hint.set === false), true);

  assert.equal(hinted.missing_annotations, false);
  assert.equal(hinted.missing_input_schema, true);
  assert.equal(hinted.hints.find((hint) => hint.key === 'destructiveHint').set, false);

  const expected = computeQualitySignals(
    {
      transport: 'http',
      tools: reviewed.tools.map((tool) => ({ name: tool.name, description: tool.description })),
      mcp_endpoint: reviewed.url,
    },
    {
      endpoint_status: 'ok',
      validation_method: 'live_mcp',
      validated_at: reviewed.probed_at,
      tool_count: reviewed.tools.length,
    },
  );
  assert.equal(reviewed.quality.score, expected.verification_grade);
  assert.equal(reviewed.quality.letter, expected.verification_grade_letter);
  assert.equal(reviewed.quality.tier, expected.demoware_tier);
  assert.ok(reviewed.quality.parts.includes('live_ok +40'));
  assert.ok(reviewed.quality.missing.includes('five_tools +10'));
  assert.ok(reviewed.quality.tool_gaps.some((gap) => gap.includes('missing a description')));
  assert.equal(Object.prototype.hasOwnProperty.call(reviewed, 'score'), false);

  const html = await render(reviewed);
  assert.match(html, /search_docs/);
  assert.match(html, /Missing description/);
  assert.match(html, /Missing annotations/);
  assert.match(html, /readOnlyHint/);
  assert.match(html, /Verification grade/);
  assert.match(html, new RegExp(`>${expected.verification_grade_letter}<`));
  assert.match(html, /Not in the Influzer catalog/);
  assert.match(html, /Query text/);
  assert.match(html, /Not set/);

  const opening = 'Create a project from the brief. ';
  const middle = 'Keep the full description on its own line. ';
  const longDescription = `${opening}${middle.repeat(40)}\nSecond line stays visible.`;
  assert.ok(longDescription.length > 1500);
  assert.ok(longDescription.length < 8000);
  const verbose = buildCheckReport({
    url: 'https://example.com/mcp',
    catalog: [],
    live: liveOk([{
      name: 'create_project',
      description: `${longDescription} <script>alert(1)</script>`,
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Project name' },
          slug: { type: 'string', description: 'URL slug' },
          brief: { type: 'string', description: 'The brief' },
          public: { type: 'boolean', description: 'Visible to the team' },
          locale: { type: 'string', description: 'Locale' },
          notes: { type: 'string', description: 'Notes' },
        },
      },
    }]),
  });
  const created = verbose.tools[0];
  assert.equal(created.fields.length, 6);
  assert.equal(created.input_note.startsWith('6 fields'), true);
  assert.equal(created.description.includes('…'), false);
  assert.ok(created.description.length > 1500);
  assert.equal(created.description.split('Keep the full description on its own line.').length - 1, 40);
  assert.equal(created.description.includes('Create a project from the brief.'), true);
  assert.equal(created.description.includes('\nSecond line stays visible.'), true);
  assert.equal(created.description.includes('<script>alert(1)</script>'), true);
  assert.ok(created.gaps.includes('Missing annotations'));
  const verboseHtml = await render(verbose);
  assert.match(verboseHtml, /Second line stays visible\./);
  assert.match(verboseHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(verboseHtml.includes('<script>alert(1)</script>'), false);
  for (const field of ['name', 'slug', 'brief', 'public', 'locale', 'notes']) {
    assert.match(verboseHtml, new RegExp(`<code>${field}</code>`));
  }
  assert.match(verboseHtml, /Missing annotations/);
  assert.match(verboseHtml, /Input schema — 6 fields/);

  const filler = 'Middle sentence stays in view. ';
  const huge = `${opening}${filler.repeat(300)}UNIQUE_TAIL_MUST_NOT_SHOW.`;
  assert.ok(huge.length > 8000);
  const capped = buildCheckReport({
    url: 'https://example.com/mcp',
    catalog: [],
    live: liveOk([{ name: 'huge_tool', description: huge }]),
  });
  const shown = capped.tools[0].description;
  assert.ok(shown.length <= 8000);
  assert.equal(shown.includes('…'), false);
  assert.equal(shown.startsWith(opening.trim()), true);
  assert.equal(shown.endsWith('.'), true);
  assert.equal(shown.includes('UNIQUE_TAIL_MUST_NOT_SHOW'), false);

  let calls = 0;
  const refused = await checkMcpServer({
    url: 'https://127.0.0.1/mcp',
    persist: false,
    inspectLiveMcpServer: async () => {
      calls += 1;
      throw new Error('should not fetch');
    },
  });
  assert.equal(calls, 0);
  assert.equal(refused.status, 'rejected');
  assert.equal(refused.code, 'url_not_allowed');
  assert.equal(refused.quality, null);
  assert.match(refused.reason, /private/i);
  const refusedHtml = await render(refused);
  assert.match(refusedHtml, /URL not allowed/);
  assert.match(refusedHtml, /Nothing was fetched/);

  let bareHostFetched = '';
  const bareHost = await checkMcpServer({
    url: '8.8.8.8/mcp',
    persist: false,
    inspectLiveMcpServer: async (url) => {
      bareHostFetched = String(url);
      return { status: 'ok_empty', tools: [], httpStatus: 200, serverInfo: { name: 'public-ip' } };
    },
  });
  assert.equal(bareHostFetched, 'https://8.8.8.8/mcp');
  assert.equal(bareHost.url, 'https://8.8.8.8/mcp');

  let doubledFetched = '';
  const doubled = await checkMcpServer({
    url: 'https://https://8.8.8.8/mcp',
    persist: false,
    inspectLiveMcpServer: async (url) => {
      doubledFetched = String(url);
      return { status: 'ok_empty', tools: [], httpStatus: 200 };
    },
  });
  assert.equal(doubledFetched, 'https://8.8.8.8/mcp');
  assert.equal(doubled.url, 'https://8.8.8.8/mcp');

  let httpCalls = 0;
  const pastedHttp = await checkMcpServer({
    url: 'https://http://8.8.8.8/mcp',
    persist: false,
    inspectLiveMcpServer: async () => {
      httpCalls += 1;
      return { status: 'ok_empty', tools: [] };
    },
  });
  assert.equal(httpCalls, 0);
  assert.equal(pastedHttp.status, 'rejected');

  for (const blocked of [
    'https://localhost/mcp',
    'https://169.254.169.254/latest',
    'https://10.1.2.3/mcp',
    'https://metadata.google.internal/',
    'http://127.0.0.1/mcp',
  ]) {
    const report = await checkMcpServer({
      url: blocked,
      persist: false,
      inspectLiveMcpServer: async () => {
        throw new Error('should not fetch');
      },
    });
    assert.equal(report.status, 'rejected', blocked);
    assert.equal(report.code, 'url_not_allowed', blocked);
  }

  let redirectCalls = 0;
  const bounced = await checkMcpServer({
    url: 'https://8.8.8.8/mcp',
    persist: false,
    inspectLiveMcpServer: async () => {
      redirectCalls += 1;
      return { status: 'redirect', location: 'https://127.0.0.1/mcp', httpStatus: 302, tools: [] };
    },
  });
  assert.equal(redirectCalls, 1);
  assert.equal(bounced.status, 'rejected');
  assert.match(bounced.reason, /not followed/i);
  assert.match(bounced.redirect_blocked, /127\.0\.0\.1/);

  const secret = 's3cr3t-token-value';
  const hops = [];
  const followed = await checkMcpServer({
    url: 'https://8.8.8.8/mcp?token=s3cr3t-token-value',
    bearerToken: secret,
    persist: false,
    inspectLiveMcpServer: async (url, opts) => {
      hops.push({ url, token: opts.bearerToken || '' });
      if (String(url).includes('8.8.8.8')) {
        return { status: 'redirect', location: 'https://1.1.1.1/mcp', tools: [] };
      }
      return {
        status: 'error',
        reason: `upstream said ${secret}`,
        tools: [{ name: 'echo', description: `leak ${secret}` }],
        httpStatus: 500,
      };
    },
  });
  assert.equal(hops.length, 2);
  assert.equal(hops[0].token, secret);
  assert.equal(hops[1].token, '');
  assert.equal(JSON.stringify(followed).includes(secret), false);
  assert.match(followed.reason, /\[redacted\]/);
  assert.equal(followed.token_sent, true);
  assert.equal(followed.url, 'https://1.1.1.1/mcp');

  const direct = await checkMcpServer({
    url: `https://8.8.8.8/mcp?token=${secret}`,
    persist: false,
    inspectLiveMcpServer: async () => ({ status: 'ok_empty', tools: [], httpStatus: 200 }),
  });
  assert.equal(direct.url.includes(secret), false);
  assert.match(direct.url, /token=%5Bredacted%5D|token=\[redacted\]/);

  const emptyLive = buildCheckReport({
    url: 'https://example.com/mcp',
    catalog: [],
    live: { status: 'ok_empty', tools: [], httpStatus: 200, serverInfo: { name: 'quiet' } },
  });
  const emptyHtml = await render(emptyLive);
  assert.match(emptyHtml, /No tools/);
  assert.match(emptyHtml, /returned an empty list/);
  assert.match(emptyHtml, /quiet/);

  const down = buildCheckReport({
    url: 'https://example.com/mcp',
    catalog: [],
    live: { status: 'unreachable', reason: 'timeout', tools: [] },
  });
  const downHtml = await render(down);
  assert.match(downHtml, /Unreachable/);
  assert.match(downHtml, /could not be reached/);

  const form = await render(null);
  assert.match(form, /action="\/mcp\/check"/);
  assert.match(form, /placeholder="https:\/\/mcp\.example\.com"/);
  assert.match(form, /name="url"[\s\S]*value="https:\/\/"/);
  assert.doesNotMatch(form, /onclick=/);
  assert.match(form, /<script nonce="test-nonce" src="\/js\/mcp-check-page\.js/);
  assert.equal(form.includes('?token='), false);
  assert.match(
    form,
    /<a href="\/mcp" class="home-nav__link">MCP Servers<\/a>\s*<a href="\/mcp\/check" class="home-nav__link is-active">Check server<\/a>/,
  );
  assert.doesNotMatch(form, /<a href="\/mcp\/discovery\/setup" class="home-nav__link is-active">/);

  const siteHeader = await ejs.renderFile(path.join(__dirname, '..', 'views', 'partials', 'site-header.ejs'), {
    navPath: '/mcp/check',
    cspNonce: 'test-nonce',
  });
  assert.match(
    siteHeader,
    /<a href="\/mcp" class="site-header-link">MCP Servers<\/a>\s*<a href="\/mcp\/check" class="site-header-link is-active">Check server<\/a>/,
  );
  assert.doesNotMatch(siteHeader, /onclick=/);

  for (const navPath of ['/', '/mcp']) {
    const header = await ejs.renderFile(path.join(__dirname, '..', 'views', 'partials', 'home-header.ejs'), {
      navPath,
      cspNonce: 'test-nonce',
      assetVersion: '1',
    });
    assert.match(
      header,
      /<nav class="home-nav__links" id="mainSiteNav" aria-label="Main">\s*<a href="\/mcp" class="home-nav__link[^"]*">MCP Servers<\/a>\s*<a href="\/mcp\/check" class="home-nav__link">Check server<\/a>/,
    );
    assert.equal(header.includes('onclick='), false);
  }

  const signedOut = await ejs.renderFile(path.join(__dirname, '..', 'views', 'mcp-check.ejs'), {
    title: 'Check an MCP server',
    description: 'Check',
    canonicalUrl: 'https://www.influzer.ai/mcp/check',
    assetVersion: '1',
    navPath: '/mcp/check',
    canCheck: false,
    csrfToken: '',
    formError: null,
    check: null,
    noindex: false,
    prefillUrl: '',
    prefillTransport: 'http',
    cspNonce: 'test-nonce',
  });
  assert.match(signedOut, /Sign in to check a server/);
  assert.equal(signedOut.includes('name="url"'), false);

  const flagged = buildCheckReport({
    url: 'https://example.com/mcp',
    catalog: [],
    live: liveOk([
      {
        name: 'delete_row',
        description: 'Delete a row.',
        inputSchema: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', description: 'Row id' } },
        },
        annotations: { destructiveHint: true },
      },
      {
        name: 'archive_row',
        description: 'Archive a row.',
        inputSchema: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        annotations: { destructiveHint: true, idempotentHint: true },
      },
      {
        name: 'purge_row',
        description: 'Purge a row.',
        inputSchema: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        annotations: { destructiveHint: true, idempotentHint: false },
      },
      bare,
    ]),
  });
  const deleteRow = flagged.tools.find((tool) => tool.name === 'delete_row');
  const archiveRow = flagged.tools.find((tool) => tool.name === 'archive_row');
  const purgeRow = flagged.tools.find((tool) => tool.name === 'purge_row');
  const bareRow = flagged.tools.find((tool) => tool.name === 'do_thing');
  assert.equal(deleteRow.trust_flag, 'Destructive, with no idempotency note');
  assert.equal(purgeRow.trust_flag, 'Destructive, with no idempotency note');
  assert.equal(archiveRow.trust_flag, null);
  assert.equal(bareRow.trust_flag, null);
  assert.equal(deleteRow.gaps.includes('Missing annotations'), false);
  assert.equal(deleteRow.gaps.includes('Destructive, with no idempotency note'), false);
  assert.ok(bareRow.gaps.includes('Missing annotations'));
  const flaggedHtml = await render({ ...flagged, id: 'a'.repeat(24) });
  assert.equal(flaggedHtml.split('Destructive, with no idempotency note').length - 1, 2);
  assert.match(flaggedHtml, /Missing annotations/);
  assert.match(flaggedHtml, /<span>This target is disposable<\/span>/);
  assert.match(flaggedHtml, /method="post" action="\/mcp\/check\/a{24}\/call"/);
  assert.equal(flaggedHtml.includes('?token='), false);
  assert.doesNotMatch(flaggedHtml, /onclick=/);
  assert.match(flaggedHtml, /<script nonce="test-nonce" src="\/js\/mcp-check-page\.js/);

  await assertHttpGate();

  console.log(
    `mcp server check tests passed — grade ${reviewed.quality.letter} (${reviewed.quality.score}), bare tool flagged, private URL rejected`,
  );
  process.exit(0);
}

function request(port, { method = 'GET', path: reqPath = '/', headers = {}, body = '', cookie = '' }) {
  const http = require('http');
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        method,
        path: reqPath,
        headers: {
          ...headers,
          ...(body
            ? {
                'content-type': headers['content-type'] || 'application/x-www-form-urlencoded',
                'content-length': Buffer.byteLength(body),
              }
            : {}),
          ...(cookie ? { cookie } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function cookieFrom(res) {
  const raw = res.headers['set-cookie'];
  const line = Array.isArray(raw) ? raw[0] : raw;
  return line ? line.split(';')[0] : '';
}

async function assertHttpGate() {
  const http = require('http');
  const express = require('express');
  const session = require('express-session');
  const fs = require('fs');
  const { getDatabase } = require('../database');
  const { registerMcpServerCheckRoutes } = require('../services/mcpServerCheck');

  const db = await getDatabase();
  await new Promise((resolve, reject) => {
    db.db.serialize(() => {
      db.db.run(
        `INSERT INTO users (email, password_hash, provider, name, email_verified)
         VALUES ('checker@example.com', 'x', 'local', 'Checker', 1)`,
      );
      db.db.run(
        `INSERT INTO users (email, password_hash, provider, name, email_verified)
         VALUES ('unverified@example.com', 'x', 'local', 'Unverified', 0)`,
        (err) => (err ? reject(err) : resolve()),
      );
    });
  });

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(cspNonceMiddleware);
  app.use(session({ secret: 'mcp-check-test', resave: false, saveUninitialized: false }));
  app.post('/__verify_login', (req, res) => {
    req.session.userId = Number(req.body.userId);
    res.json({ ok: true });
  });
  registerMcpServerCheckRoutes(app);

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const port = server.address().port;

  try {
    const anon = await request(port, { path: '/mcp/check' });
    assert.equal(anon.status, 200);
    assert.match(anon.body, /Sign in to check a server/);
    assert.match(anon.body, /<a href="\/mcp\/check" class="home-nav__link is-active">Check server<\/a>/);
    assert.equal(anon.body.includes('name="url"'), false);

    const anonPost = await request(port, {
      method: 'POST',
      path: '/api/mcp/v1/checks',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://127.0.0.1/mcp' }),
    });
    assert.equal(anonPost.status, 401);

    const unverifiedLogin = await request(port, {
      method: 'POST',
      path: '/__verify_login',
      body: 'userId=2',
    });
    const unverifiedCookie = cookieFrom(unverifiedLogin);
    const unverified = await request(port, {
      method: 'POST',
      path: '/mcp/check',
      cookie: unverifiedCookie,
      body: 'url=https://example.com/mcp&_csrf=nope',
    });
    assert.equal(unverified.status, 403);
    assert.match(unverified.body, /Verify your email/);

    const login = await request(port, {
      method: 'POST',
      path: '/__verify_login',
      body: 'userId=1',
    });
    const cookie = cookieFrom(login);
    const form = await request(port, { path: '/mcp/check', cookie });
    assert.equal(form.status, 200);
    assert.match(form.body, /name="url"/);
    const csrf = form.body.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(csrf, 'form includes a csrf token');

    const missingCsrf = await request(port, {
      method: 'POST',
      path: '/mcp/check',
      cookie,
      body: 'url=https://127.0.0.1/mcp',
    });
    assert.equal(missingCsrf.status, 403);

    const rejected = await request(port, {
      method: 'POST',
      path: '/mcp/check',
      cookie,
      body: `url=${encodeURIComponent('https://10.0.0.8/mcp')}&transport=http&_csrf=${encodeURIComponent(csrf[1])}`,
    });
    assert.equal(rejected.status, 303);
    const location = rejected.headers.location || '';
    assert.match(location, /^\/mcp\/check\/[a-f0-9]{24}$/);

    const page = await request(port, { path: location, cookie });
    assert.equal(page.status, 200);
    assert.match(page.body, /URL not allowed/);
    assert.match(page.body, /Private IP addresses are not allowed/);
    assert.match(page.body, /Nothing was fetched/);
    assert.equal(page.body.includes('name="token"'), false);

    const stranger = await request(port, { path: location, cookie: unverifiedCookie });
    assert.equal(stranger.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.unlink(process.env.DB_PATH, () => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
