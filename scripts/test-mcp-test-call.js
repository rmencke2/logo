'use strict';

const os = require('os');
const path = require('path');
process.env.DB_PATH = path.join(os.tmpdir(), `mcp-trial-test-${process.pid}.db`);

const assert = require('node:assert/strict');
const ejs = require('ejs');
const { buildCheckReport, checkMcpServer, setTrialClientForTests, CALL_LIMIT, CALL_WINDOW_MS } = require('../services/mcpServerCheck');
const { verdictForWrite, executeToolTrial } = require('../services/mcpToolTrial');
const { callLiveMcpTools } = require('../scripts/utils/mcp-live-client');

const FLAG = 'Destructive, with no idempotency note';
const VERDICTS = {
  unchanged: 'The record did not change.',
  differentRecord: 'This wrote a different record.',
  fieldsMismatch: 'The written fields do not match what was sent.',
  matched: 'The named record changed to match what was sent.',
  noReadBack: 'No read-back tool, so a success response is not proof the right record changed.',
};

function schema(properties, required) {
  return {
    type: 'object',
    required: required || Object.keys(properties),
    properties,
  };
}

function rawTool(name, annotations, properties) {
  return {
    name,
    description: `${name} does a thing.`,
    inputSchema: schema(properties || { id: { type: 'string' } }),
    annotations,
  };
}

const searchRaw = rawTool('search_docs', { readOnlyHint: true, destructiveHint: false }, { q: { type: 'string' } });
const getRaw = rawTool('get_row', { readOnlyHint: true, destructiveHint: false }, { id: { type: 'string' } });
const getV2Raw = rawTool('get_row_v2', { readOnlyHint: true, destructiveHint: false }, { id: { type: 'string' } });
const updateRaw = rawTool(
  'update_row',
  { destructiveHint: true, idempotentHint: false },
  { id: { type: 'string' }, name: { type: 'string' }, city: { type: 'string' } },
);
const archiveRaw = rawTool('archive_row', { destructiveHint: true, idempotentHint: true }, { id: { type: 'string' } });
const bareRaw = { name: 'do_thing' };

function liveOk(tools) {
  return {
    status: 'ok',
    tools,
    httpStatus: 200,
    serverInfo: { name: 'fixture-mcp', version: '1.0.0' },
    protocolVersion: '2024-11-05',
    contentType: 'application/json',
  };
}

function reportWith(tools) {
  return buildCheckReport({
    url: 'https://8.8.8.8/mcp',
    catalog: [],
    live: liveOk(tools),
  });
}

function recordResult(record) {
  return {
    content: [{ type: 'text', text: JSON.stringify(record) }],
    structuredContent: record,
    isError: false,
  };
}

function mockClient(reply) {
  const seen = [];
  const fn = async (endpoint, calls, opts) => {
    seen.push({
      endpoint,
      calls,
      token: opts && opts.bearerToken ? opts.bearerToken : '',
    });
    if (typeof reply === 'function') return reply(calls, seen);
    return reply;
  };
  fn.seen = seen;
  return fn;
}

function scripted(before, after, writeText) {
  return mockClient((calls) => ({
    status: 'ok',
    calls: calls.map((call) => ({
      name: call.name,
      role: call.role,
      ok: true,
      isError: false,
      result: call.role === 'before'
        ? recordResult(before)
        : call.role === 'after'
          ? recordResult(after)
          : { content: [{ type: 'text', text: writeText || 'updated' }], isError: false },
    })),
  }));
}

function containsSecret(value, secret) {
  if (typeof value === 'string') return value.includes(secret);
  if (Array.isArray(value)) return value.some((item) => containsSecret(item, secret));
  if (value && typeof value === 'object') return Object.values(value).some((item) => containsSecret(item, secret));
  return false;
}

async function writeTrial(report, { before, after, args, recordId, readBackName, writeText, bearerToken }) {
  const client = scripted(before, after, writeText);
  const trial = await executeToolTrial({
    report,
    toolName: 'update_row',
    args,
    recordId: recordId || 'rec-1',
    disposable: true,
    readBackName,
    bearerToken,
    callLiveMcpTools: client,
  });
  return { trial, client };
}

async function assertFlagAndPage() {
  const report = reportWith([searchRaw, getRaw, getV2Raw, updateRaw, archiveRaw, bareRaw]);
  const update = report.tools.find((tool) => tool.name === 'update_row');
  const archive = report.tools.find((tool) => tool.name === 'archive_row');
  const bare = report.tools.find((tool) => tool.name === 'do_thing');
  const search = report.tools.find((tool) => tool.name === 'search_docs');
  assert.equal(update.trust_flag, FLAG);
  assert.equal(update.read_only, false);
  assert.equal(update.default_read_back, 'get_row');
  assert.equal(archive.trust_flag, null);
  assert.equal(archive.read_only, false);
  assert.equal(bare.trust_flag, null);
  assert.ok(bare.gaps.includes('Missing annotations'));
  assert.equal(update.gaps.includes('Missing annotations'), false);
  assert.equal(update.gaps.includes(FLAG), false);
  assert.equal(search.read_only, true);
  assert.equal(search.trust_flag, null);

  report.id = 'b'.repeat(24);
  const html = await ejs.renderFile(path.join(__dirname, '..', 'views', 'mcp-check.ejs'), {
    title: 'Check',
    description: 'Check',
    canonicalUrl: 'https://www.influzer.ai/mcp/check',
    assetVersion: '1',
    navPath: '/mcp/check',
    canCheck: true,
    csrfToken: 'csrf-test',
    formError: null,
    check: report,
    noindex: true,
    prefillUrl: '',
    prefillTransport: 'http',
    cspNonce: 'test-nonce',
  });
  assert.match(html, /Missing annotations/);
  assert.match(html, new RegExp(FLAG));
  assert.equal(html.split(FLAG).length - 1, 1);
  assert.match(html, /<span>This target is disposable<\/span>/);
  assert.match(html, /method="post" action="\/mcp\/check\/b{24}\/call"/);
  assert.equal(/action="[^"]*\?/.test(html), false);
  assert.doesNotMatch(html, /onclick=/);
  assert.match(html, /<script nonce="test-nonce" src="\/js\/mcp-check-page\.js/);
  const updateForm = html.slice(html.indexOf('data-tool="update_row"') - 80, html.indexOf('data-tool="archive_row"'));
  assert.match(updateForm, /This target is disposable/);
  const searchForm = html.slice(html.indexOf('data-tool="search_docs"'), html.indexOf('</form>', html.indexOf('data-tool="search_docs"')));
  assert.equal(searchForm.includes('This target is disposable'), false);
  assert.match(searchForm, /name="arguments"/);
}

async function assertVerdicts() {
  const report = reportWith([searchRaw, getRaw, getV2Raw, updateRaw]);
  const fixtures = [
    {
      name: 'unchanged',
      before: { id: 'rec-1', name: 'Ada' },
      after: { id: 'rec-1', name: 'Ada' },
      args: { id: 'rec-1', name: 'Ada' },
      verdict: VERDICTS.unchanged,
    },
    {
      name: 'different record',
      before: { id: 'rec-1', name: 'Ada' },
      after: { id: 'rec-2', name: 'Grace' },
      args: { id: 'rec-1', name: 'Grace', city: 'Paris' },
      verdict: VERDICTS.differentRecord,
    },
    {
      name: 'absent fields',
      before: { id: 'rec-1', name: 'Ada' },
      after: { id: 'rec-1', name: 'Grace' },
      args: { id: 'rec-1', name: 'Grace', city: 'Paris' },
      verdict: VERDICTS.fieldsMismatch,
    },
    {
      name: 'matched',
      before: { id: 'rec-1', name: 'Ada' },
      after: { id: 'rec-1', name: 'Grace', city: 'Paris' },
      args: { id: 'rec-1', name: 'Grace', city: 'Paris' },
      verdict: VERDICTS.matched,
    },
  ];

  for (const fixture of fixtures) {
    assert.equal(
      verdictForWrite({
        before: fixture.before,
        after: fixture.after,
        recordId: 'rec-1',
        args: fixture.args,
        idArgument: 'id',
      }),
      fixture.verdict,
      fixture.name,
    );
    const { trial, client } = await writeTrial(report, fixture);
    assert.equal(trial.verdict, fixture.verdict, fixture.name);
    assert.equal(trial.payload.text, 'updated', fixture.name);
    assert.notEqual(trial.verdict, trial.payload.text);
    assert.equal(client.seen.length, 1, fixture.name);
    assert.deepEqual(
      client.seen[0].calls.map((call) => call.name),
      ['get_row', 'update_row', 'get_row'],
      fixture.name,
    );
    assert.equal(client.seen[0].endpoint, 'https://8.8.8.8/mcp');
  }

  const matched = await writeTrial(report, fixtures[3]);
  assert.ok(matched.trial.diff.some((row) => row.field === 'name' && row.before === 'Ada' && row.after === 'Grace'));

  const wrongValue = await writeTrial(report, {
    before: { id: 'rec-1', name: 'Ada' },
    after: { id: 'rec-1', name: 'Grace', city: 'Lyon' },
    args: { id: 'rec-1', name: 'Grace', city: 'Paris' },
  });
  assert.equal(wrongValue.trial.verdict, VERDICTS.fieldsMismatch);

  const chosen = await writeTrial(report, {
    ...fixtures[3],
    readBackName: 'get_row_v2',
  });
  assert.deepEqual(
    chosen.client.seen[0].calls.map((call) => call.name),
    ['get_row_v2', 'update_row', 'get_row_v2'],
  );
  assert.deepEqual(chosen.client.seen[0].calls[0].arguments, { id: 'rec-1' });
}

async function assertGates() {
  const report = reportWith([searchRaw, getRaw, updateRaw]);
  const blocked = mockClient(() => {
    throw new Error('should not call');
  });
  for (const input of [
    { disposable: false, recordId: 'rec-1' },
    { disposable: true, recordId: '' },
    { disposable: false, recordId: '' },
  ]) {
    await assert.rejects(
      () => executeToolTrial({
        report,
        toolName: 'update_row',
        args: { id: 'rec-1' },
        recordId: input.recordId,
        disposable: input.disposable,
        callLiveMcpTools: blocked,
      }),
      (err) => err.status === 400 && err.code === 'disposable_required',
    );
  }
  assert.equal(blocked.seen.length, 0);

  const privateReport = reportWith([updateRaw]);
  privateReport.url = 'https://10.1.2.3/mcp';
  await assert.rejects(
    () => executeToolTrial({
      report: privateReport,
      toolName: 'update_row',
      args: { id: 'rec-1' },
      recordId: 'rec-1',
      disposable: true,
      callLiveMcpTools: blocked,
    }),
    (err) => err.status === 400 && err.code === 'url_not_allowed',
  );
  assert.equal(blocked.seen.length, 0);

  const lonely = reportWith([updateRaw]);
  assert.equal(lonely.tools[0].default_read_back, null);
  const noReadBackClient = scripted(null, null, 'updated');
  const noReadBack = await executeToolTrial({
    report: lonely,
    toolName: 'update_row',
    args: { id: 'rec-1', name: 'Grace' },
    recordId: 'rec-1',
    disposable: true,
    callLiveMcpTools: noReadBackClient,
  });
  assert.equal(noReadBack.verdict, VERDICTS.noReadBack);
  assert.equal(noReadBack.before, null);
  assert.equal(noReadBack.after, null);
  assert.equal(noReadBackClient.seen[0].calls.length, 1);
  assert.equal(noReadBackClient.seen[0].calls[0].role, 'write');
  assert.equal(noReadBack.payload.text, 'updated');

  const secret = 'tok"en-value';
  const readClient = mockClient((calls) => ({
    status: 'ok',
    calls: calls.map((call) => ({
      name: call.name,
      role: call.role,
      ok: true,
      result: { content: [{ type: 'text', text: `found rec-9 and ${secret}` }], isError: false },
    })),
  }));
  const appeared = await executeToolTrial({
    report,
    toolName: 'search_docs',
    args: { q: 'ada' },
    recordId: 'rec-9',
    disposable: false,
    bearerToken: secret,
    callLiveMcpTools: readClient,
  });
  assert.equal(readClient.seen.length, 1);
  assert.equal(readClient.seen[0].token, secret);
  assert.deepEqual(readClient.seen[0].calls[0].arguments, { q: 'ada' });
  assert.equal(appeared.kind, 'read');
  assert.match(appeared.content_text, /found rec-9/);
  assert.equal(appeared.content_text.includes(secret), false);
  assert.equal(appeared.id_note, 'The record id appears in the result.');
  assert.equal(containsSecret(appeared, secret), false);

  const absentClient = mockClient((calls) => ({
    status: 'ok',
    calls: calls.map((call) => ({
      name: call.name,
      role: call.role,
      ok: true,
      result: { content: [{ type: 'text', text: 'nothing here' }], isError: false },
    })),
  }));
  const absent = await executeToolTrial({
    report,
    toolName: 'search_docs',
    args: { q: 'ada' },
    recordId: 'rec-9',
    callLiveMcpTools: absentClient,
  });
  assert.equal(absent.content_text, 'nothing here');
  assert.equal(absent.id_note, 'The record id does not appear in the result.');
  assert.equal(absentClient.seen[0].calls.length, 1);
}

async function assertClientDoesNotFollowRedirects() {
  const urls = [];
  const previous = global.fetch;
  global.fetch = async (url, init) => {
    urls.push(String(url));
    const payload = JSON.parse(init.body);
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    if (payload.method === 'initialize') {
      return new Response(JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 't', version: '1' },
        },
      }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' },
      });
    }
    if (payload.method === 'notifications/initialized') {
      return new Response('{}', { status: 202, headers: { 'content-type': 'application/json' } });
    }
    if (payload.method === 'tools/call') {
      assert.equal(init.headers['Mcp-Session-Id'], 'sess-1');
      assert.equal(payload.params.name, 'update_row');
      return new Response('', { status: 302, headers: { location: 'https://127.0.0.1/steal' } });
    }
    throw new Error(`unexpected method ${payload.method}`);
  };
  try {
    const result = await callLiveMcpTools('https://8.8.8.8/mcp', [
      { name: 'update_row', arguments: { id: 'rec-1' }, role: 'write' },
      { name: 'get_row', arguments: { id: 'rec-1' }, role: 'after' },
    ], { bearerToken: 'test-token', redirect: 'manual' });
    assert.equal(result.status, 'redirect');
    assert.equal(urls.length, 3);
    assert.ok(urls.every((url) => url === 'https://8.8.8.8/mcp'));
    assert.equal(urls.some((url) => url.includes('127.0.0.1')), false);
  } finally {
    global.fetch = previous;
  }
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

async function assertHttp() {
  const http = require('http');
  const express = require('express');
  const session = require('express-session');
  const fs = require('fs');
  const { cspNonceMiddleware } = require('../middleware/cspNonce');
  const { getDatabase } = require('../database');
  const { registerMcpServerCheckRoutes } = require('../services/mcpServerCheck');

  const db = await getDatabase();
  await new Promise((resolve, reject) => {
    db.db.serialize(() => {
      db.db.run(`INSERT INTO users (email, password_hash, provider, name, email_verified, is_admin) VALUES ('owner@example.com', 'x', 'local', 'Owner', 1, 0)`);
      db.db.run(`INSERT INTO users (email, password_hash, provider, name, email_verified, is_admin) VALUES ('stranger@example.com', 'x', 'local', 'Stranger', 1, 0)`);
      db.db.run(`INSERT INTO users (email, password_hash, provider, name, email_verified, is_admin) VALUES ('admin@example.com', 'x', 'local', 'Admin', 1, 1)`);
      db.db.run(
        `INSERT INTO users (email, password_hash, provider, name, email_verified, is_admin) VALUES ('limit@example.com', 'x', 'local', 'Limit', 1, 0)`,
        (err) => (err ? reject(err) : resolve()),
      );
    });
  });

  const tools = [searchRaw, getRaw, getV2Raw, updateRaw, archiveRaw, bareRaw];
  const saved = await checkMcpServer({
    url: 'https://8.8.8.8/mcp',
    userId: 1,
    persist: true,
    inspectLiveMcpServer: async () => liveOk(tools),
  });
  const limited = await checkMcpServer({
    url: 'https://1.1.1.1/mcp',
    userId: 4,
    persist: true,
    inspectLiveMcpServer: async () => liveOk(tools),
  });

  const seen = [];
  setTrialClientForTests(async (endpoint, calls, opts) => {
    seen.push({ endpoint, calls, token: opts && opts.bearerToken ? opts.bearerToken : '' });
    return {
      status: 'ok',
      calls: calls.map((call) => {
        if (call.role === 'before') {
          return { name: call.name, role: call.role, ok: true, result: recordResult({ id: 'rec-1', name: 'Ada' }) };
        }
        if (call.role === 'after') {
          return {
            name: call.name,
            role: call.role,
            ok: true,
            result: recordResult({ id: 'rec-1', name: 'Grace', city: 'Paris' }),
          };
        }
        if (call.role === 'write') {
          return {
            name: call.name,
            role: call.role,
            ok: true,
            result: { content: [{ type: 'text', text: 'updated' }], isError: false },
          };
        }
        return {
          name: call.name,
          role: call.role,
          ok: true,
          result: { content: [{ type: 'text', text: 'found rec-9' }], isError: false },
        };
      }),
    };
  });

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(cspNonceMiddleware);
  app.use(session({ secret: 'mcp-trial-test', resave: false, saveUninitialized: false }));
  app.post('/__verify_login', (req, res) => {
    req.session.userId = Number(req.body.userId);
    res.json({ ok: true });
  });
  registerMcpServerCheckRoutes(app);

  const server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const port = server.address().port;
  const secret = 's3cr3t-token-value';

  try {
    const login = async (userId) => {
      const res = await request(port, { method: 'POST', path: '/__verify_login', body: `userId=${userId}` });
      return cookieFrom(res);
    };
    const owner = await login(1);
    const stranger = await login(2);
    const admin = await login(3);
    const limiter = await login(4);

    const page = await request(port, { path: `/mcp/check/${saved.id}`, cookie: owner });
    assert.equal(page.status, 200);
    assert.match(page.body, new RegExp(FLAG));
    assert.match(page.body, /Missing annotations/);
    assert.match(page.body, /<span>This target is disposable<\/span>/);
    assert.doesNotMatch(page.body, /onclick=/);
    const csrf = page.body.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(csrf);

    const before = seen.length;
    const blocked = await request(port, {
      method: 'POST',
      path: `/mcp/check/${saved.id}/call`,
      cookie: owner,
      body: `tool=update_row&arguments=${encodeURIComponent('{"id":"rec-1"}')}&record_id=rec-1&_csrf=${encodeURIComponent(csrf[1])}`,
    });
    assert.equal(blocked.status, 400);
    assert.match(blocked.body, /Tool was not called/);
    assert.match(blocked.body, /This target is disposable/);
    assert.equal(seen.length, before);

    const noId = await request(port, {
      method: 'POST',
      path: `/api/mcp/v1/checks/${saved.id}/calls`,
      cookie: owner,
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf[1] },
      body: JSON.stringify({ tool: 'update_row', arguments: { id: 'rec-1' }, disposable: true }),
    });
    assert.equal(noId.status, 400);
    assert.equal(seen.length, before);
    assert.match(JSON.parse(noId.body).message, /This target is disposable/);

    const read = await request(port, {
      method: 'POST',
      path: `/mcp/check/${saved.id}/call`,
      cookie: owner,
      body: `tool=search_docs&arguments=${encodeURIComponent('{"q":"ada"}')}&record_id=rec-9&token=${encodeURIComponent(secret)}&_csrf=${encodeURIComponent(csrf[1])}`,
    });
    assert.equal(read.status, 303);
    assert.equal(read.headers.location, `/mcp/check/${saved.id}`);
    assert.equal(String(read.headers.location).includes(secret), false);
    assert.equal(String(read.headers.location).includes('?'), false);
    assert.equal(seen.at(-1).token, secret);
    assert.equal(seen.at(-1).calls.length, 1);
    assert.equal(seen.at(-1).calls[0].name, 'search_docs');

    const again = await request(port, { path: `/mcp/check/${saved.id}`, cookie: owner });
    assert.equal(again.status, 200);
    assert.match(again.body, /found rec-9/);
    assert.match(again.body, /The record id appears in the result\./);
    assert.equal(again.body.includes(secret), false);

    const row = await new Promise((resolve, reject) => {
      db.db.get('SELECT result_json FROM mcp_server_checks WHERE id = ?', [saved.id], (err, found) => {
        if (err) reject(err);
        else resolve(found);
      });
    });
    assert.equal(row.result_json.includes(secret), false);
    assert.match(row.result_json, /found rec-9/);

    const strangerPage = await request(port, { path: `/mcp/check/${saved.id}`, cookie: stranger });
    assert.equal(strangerPage.status, 404);

    const write = await request(port, {
      method: 'POST',
      path: `/api/mcp/v1/checks/${saved.id}/calls`,
      cookie: owner,
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrf[1] },
      body: JSON.stringify({
        tool: 'update_row',
        arguments: { id: 'rec-1', name: 'Grace', city: 'Paris' },
        record_id: 'rec-1',
        disposable: true,
      }),
    });
    assert.equal(write.status, 200);
    const written = JSON.parse(write.body);
    assert.equal(written.trial.verdict, VERDICTS.matched);
    assert.equal(written.trial.payload.text, 'updated');
    assert.equal(written.ok, true);
    const shown = await request(port, { path: `/mcp/check/${saved.id}`, cookie: owner });
    assert.match(shown.body, /The named record changed to match what was sent\./);
    assert.match(shown.body, /Ada/);
    assert.match(shown.body, /Grace/);
    assert.match(shown.body, /This is the tool/);
    assert.match(shown.body, /updated/);

    const adminPage = await request(port, { path: `/mcp/check/${saved.id}`, cookie: admin });
    assert.equal(adminPage.status, 200);
    const adminCsrf = adminPage.body.match(/name="_csrf" value="([^"]+)"/);
    const adminCall = await request(port, {
      method: 'POST',
      path: `/api/mcp/v1/checks/${saved.id}/calls`,
      cookie: admin,
      headers: { 'content-type': 'application/json', 'x-csrf-token': adminCsrf[1] },
      body: JSON.stringify({ tool: 'search_docs', arguments: { q: 'admin' } }),
    });
    assert.equal(adminCall.status, 200);

    const limitPage = await request(port, { path: `/mcp/check/${limited.id}`, cookie: limiter });
    const limitCsrf = limitPage.body.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(limitCsrf);
    for (let n = 0; n < CALL_LIMIT; n += 1) {
      const ok = await request(port, {
        method: 'POST',
        path: `/api/mcp/v1/checks/${limited.id}/calls`,
        cookie: limiter,
        headers: { 'content-type': 'application/json', 'x-csrf-token': limitCsrf[1] },
        body: JSON.stringify({ tool: 'search_docs', arguments: { q: `n${n}` } }),
      });
      assert.equal(ok.status, 200, `trial ${n + 1}`);
    }
    const limitedCall = await request(port, {
      method: 'POST',
      path: `/api/mcp/v1/checks/${limited.id}/calls`,
      cookie: limiter,
      headers: { 'content-type': 'application/json', 'x-csrf-token': limitCsrf[1] },
      body: JSON.stringify({ tool: 'search_docs', arguments: { q: 'overflow' } }),
    });
    assert.equal(limitedCall.status, 429);
    assert.equal(JSON.parse(limitedCall.body).error, 'rate_limited');
  } finally {
    setTrialClientForTests(null);
    await new Promise((resolve) => server.close(resolve));
    fs.unlink(process.env.DB_PATH, () => {});
  }
}

async function main() {
  assert.equal(CALL_LIMIT, 10);
  assert.equal(CALL_WINDOW_MS, 60 * 60 * 1000);
  const previous = global.fetch;
  global.fetch = async () => {
    throw new Error('live network is not allowed in this test');
  };
  try {
    await assertFlagAndPage();
    await assertVerdicts();
    await assertGates();
    global.fetch = previous;
    await assertClientDoesNotFollowRedirects();
    global.fetch = async () => {
      throw new Error('live network is not allowed in this test');
    };
    await assertHttp();
  } finally {
    global.fetch = previous;
  }
  console.log('mcp tool trial tests passed — flag, blocked destructive call, four verdicts, read-only call');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
