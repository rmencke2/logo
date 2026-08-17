#!/usr/bin/env node
'use strict';

async function main() {
  const assert = require('assert');
  const { isPrivateIp, assertSafePublicUrl } = require('../services/webmcp/ssrf');
  const { buildScorecard, suggestJourneys } = require('../services/webmcp/scorecard');

  assert.equal(isPrivateIp('127.0.0.1'), true);
  assert.equal(isPrivateIp('10.0.0.2'), true);
  assert.equal(isPrivateIp('192.168.1.1'), true);
  assert.equal(isPrivateIp('8.8.8.8'), false);

  await assert.rejects(() => assertSafePublicUrl('http://example.com'), /https/);
  await assert.rejects(() => assertSafePublicUrl('https://localhost/'), /Local/);
  await assert.rejects(() => assertSafePublicUrl('https://127.0.0.1/'), /Private|private|not allowed/);

  const { coerceHttpsUrl } = require('../services/webmcp/ssrf');
  assert.equal(coerceHttpsUrl('www.influzer.ai'), 'https://www.influzer.ai');
  assert.equal(coerceHttpsUrl('influzer.ai/webmcp'), 'https://influzer.ai/webmcp');
  assert.equal(coerceHttpsUrl('https://www.influzer.ai'), 'https://www.influzer.ai');
  const coerced = await assertSafePublicUrl('www.example.com');
  assert.equal(coerced.host, 'example.com');
  assert.ok(coerced.href.startsWith('https://'));

  const empty = buildScorecard({ tools: [], pagesScanned: 1, crashes: 0, host: 'example.com' });
  assert.ok(empty.score < 50);
  assert.ok(empty.findings.some((f) => /No WebMCP tools/i.test(f.text)));

  const tools = [
    {
      name: 'search_items',
      description: 'Search catalog items',
      kind: 'answer',
      input_schema: {
        type: 'object',
        properties: { q: { type: 'string', description: 'Query' } },
        required: ['q'],
      },
    },
    {
      name: 'navigate_home',
      description: 'Navigate to home',
      kind: 'act',
      page_url: '/app',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', enum: ['/'] } },
      },
    },
  ];
  const scored = buildScorecard({ tools, pagesScanned: 3, crashes: 0, host: 'example.com' });
  assert.ok(scored.score >= 60);
  assert.ok(scored.grade);
  assert.ok(['R5', 'R4', 'R3', 'R2', 'R1', 'R0'].includes(scored.readiness || scored.grade));
  assert.ok(suggestJourneys(tools, 'example.com').length >= 1);

  console.log('webmcp scan unit tests OK');
  console.log(`  sample readiness ${scored.readiness || scored.grade} (${scored.score}) — ${scored.label}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
