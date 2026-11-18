#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  emailDomainMatch,
  bodyHasClaim,
  bodyHasOwnerEmail,
  claimLine,
  githubRepo,
  proofUrls,
  ownersUrls,
  decodeGithubContent,
  collectEvidence,
} = require('../services/mcpListingClaimService');
const fs = require('fs');
const path = require('path');

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async arrayBuffer() {
      return Buffer.from(body);
    },
  };
}

function testEmailDomain() {
  const server = {
    mcp_endpoint: 'https://nanoparse.app/mcp',
    docs_url: 'https://nanoparse.app/quickstart',
    github_url: 'https://github.com/nanoparse-dev/nanoparse-mcp',
  };
  assert.strictEqual(emailDomainMatch('hello@nanoparse.app', server).pass, true);
  assert.strictEqual(emailDomainMatch('ops@mail.nanoparse.app', server).host, 'nanoparse.app');
  assert.strictEqual(emailDomainMatch('someone@gmail.com', server).pass, false);
  assert.strictEqual(emailDomainMatch('hello@other.dev', server).pass, false);
}

function testClaimFileHelpers() {
  const code = 'abc123';
  assert.strictEqual(bodyHasClaim(`noise\n${claimLine(code)}\n`, code), true);
  assert.strictEqual(bodyHasClaim('influzer-claim other', code), false);
  assert.deepStrictEqual(githubRepo('https://github.com/nanoparse-dev/nanoparse-mcp.git'), {
    owner: 'nanoparse-dev',
    repo: 'nanoparse-mcp',
  });
  assert.strictEqual(githubRepo('https://nanoparse.app/docs'), null);
  const urls = proofUrls({
    mcp_endpoint: 'https://nanoparse.app/mcp?x=1',
    docs_url: 'https://nanoparse.app/quickstart',
  });
  assert.deepStrictEqual(urls, ['https://nanoparse.app/.well-known/influzer-claim.txt']);
}

function testOwnersHelpers() {
  assert.strictEqual(
    bodyHasOwnerEmail(
      JSON.stringify({
        $schema: 'https://verifymcp.io/schemas/owners.json',
        owners: ['aiagentcycle@gmail.com'],
      }),
      'aiagentcycle@gmail.com',
    ),
    true,
  );
  assert.strictEqual(
    bodyHasOwnerEmail(JSON.stringify({ owners: ['other@example.com'] }), 'aiagentcycle@gmail.com'),
    false,
  );
  assert.strictEqual(bodyHasOwnerEmail('not-json', 'a@b.com'), false);
  assert.deepStrictEqual(
    ownersUrls({
      mcp_endpoint: 'https://mcp.aiagentcycle.com/sse',
      docs_url: 'https://mcp.aiagentcycle.com/',
    }),
    [
      'https://mcp.aiagentcycle.com/.well-known/owners.json',
      'https://mcp.aiagentcycle.com/sse/.well-known/owners.json',
    ],
  );
}

function testGithubDecode() {
  const line = claimLine('deadbeef');
  const content = Buffer.from(`${line}\n`).toString('base64');
  const text = decodeGithubContent(JSON.stringify({ encoding: 'base64', size: line.length + 1, content }));
  assert.strictEqual(bodyHasClaim(text, 'deadbeef'), true);
}

async function testCollectEvidence() {
  const code = 'cafebabe';
  const line = claimLine(code);
  const server = {
    mcp_endpoint: 'https://example.com/mcp',
    docs_url: 'https://example.com/docs',
    github_url: 'https://github.com/acme/demo',
  };
  const githubBody = JSON.stringify({
    encoding: 'base64',
    size: line.length,
    content: Buffer.from(line).toString('base64'),
  });
  const ownersBody = JSON.stringify({
    $schema: 'https://verifymcp.io/schemas/owners.json',
    owners: ['owner@example.com'],
  });
  const evidence = await collectEvidence(
    server,
    { email: 'owner@example.com', code },
    {
      fetchImpl: async (url) => {
        if (String(url).includes('api.github.com')) return response(200, githubBody);
        if (String(url).includes('owners.json')) return response(200, ownersBody);
        if (String(url).includes('influzer-claim.txt')) return response(200, `${line}\n`);
        return response(404, '');
      },
    },
  );
  assert.strictEqual(evidence.emailDomain.pass, true);
  assert.strictEqual(evidence.ownersFile.pass, true);
  assert.strictEqual(evidence.siteFile.pass, true);
  assert.strictEqual(evidence.githubFile.pass, true);
  assert.strictEqual(evidence.anyPass, true);
}

async function testOwnersOnlyPass() {
  const server = {
    mcp_endpoint: 'https://mcp.aiagentcycle.com/mcp',
  };
  const evidence = await collectEvidence(
    server,
    { email: 'aiagentcycle@gmail.com', code: 'deadbeef' },
    {
      fetchImpl: async (url) => {
        if (String(url).endsWith('/.well-known/owners.json') || String(url).includes('/owners.json')) {
          return response(
            200,
            JSON.stringify({
              $schema: 'https://verifymcp.io/schemas/owners.json',
              owners: ['aiagentcycle@gmail.com'],
            }),
          );
        }
        return response(404, '');
      },
    },
  );
  assert.strictEqual(evidence.emailDomain.pass, false);
  assert.strictEqual(evidence.ownersFile.pass, true);
  assert.strictEqual(evidence.siteFile.pass, false);
  assert.strictEqual(evidence.anyPass, true);
}

function testClaimPathIsReserved() {
  const src = fs.readFileSync(path.join(__dirname, '../services/mcpSubmissionService.js'), 'utf8');
  assert.match(src, /'claim'/);
}

async function main() {
  testEmailDomain();
  testClaimFileHelpers();
  testOwnersHelpers();
  testGithubDecode();
  await testCollectEvidence();
  await testOwnersOnlyPass();
  testClaimPathIsReserved();
  console.log('mcp listing claims ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
