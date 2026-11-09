#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { mergeManualInto, clearMcpCache } = require('../services/mcpDirectoryService');

const ROOT = path.join(__dirname, '..');

function testMergeKeepsApprovedSlug() {
  clearMcpCache();
  const generated = [
    {
      id: 'com-agentxhq-agentx',
      slug: 'com-agentxhq-agentx',
      name: 'AgentX',
      description: 'stub',
      github_url: 'https://github.com/agentxhq/agentx-mcp',
      tools: [],
      source: 'official-registry',
    },
  ];
  const manual = {
    servers: [
      {
        name: 'AgentX',
        slug: 'agentx',
        category: 'Dev Tools',
        description: 'Approved listing',
        transport: 'http',
        mcp_endpoint: 'https://www.agentxhq.com/mcp',
        github_url: 'https://github.com/agentxhq/agentx-mcp',
        tools: [{ name: 'list_agents', description: 'List agents' }],
      },
    ],
  };
  const merged = mergeManualInto(generated, manual);
  assert.ok(
    merged.some((s) => s.slug === 'agentx' && s.tools?.length === 1),
    'approved slug agentx must remain public',
  );
  assert.ok(
    !merged.some((s) => s.slug === 'com-agentxhq-agentx'),
    'registry slug should be replaced by the approved manual slug',
  );
}

function testPreserveScriptRestoresLocalOnly() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-manual-preserve-'));
  const committedPath = path.join(ROOT, 'data', 'mcp-servers-manual.json');
  const backup = fs.readFileSync(committedPath, 'utf8');
  try {
    const committed = JSON.parse(backup);
    committed.servers = committed.servers.filter((s) => s.slug !== 'local-only-test-server');
    fs.writeFileSync(committedPath, `${JSON.stringify(committed, null, 2)}\n`);

    const preserved = JSON.parse(backup);
    preserved.servers.unshift({
      name: 'Local Only',
      slug: 'local-only-test-server',
      category: 'Dev Tools',
      description: 'Should survive deploy reset',
      transport: 'http',
      mcp_endpoint: 'https://example.com/mcp',
      tools: [],
    });
    const preservedPath = path.join(tmp, 'mcp-servers-manual.json');
    fs.writeFileSync(preservedPath, `${JSON.stringify(preserved, null, 2)}\n`);

    const result = spawnSync('node', [path.join(ROOT, 'scripts/merge-preserved-mcp-manual.js'), preservedPath], {
      encoding: 'utf8',
    });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const after = JSON.parse(fs.readFileSync(committedPath, 'utf8'));
    assert.ok(
      after.servers.some((s) => s.slug === 'local-only-test-server'),
      'local-only slug must be restored',
    );
  } finally {
    fs.writeFileSync(committedPath, backup);
  }
}

function testAgentxManualPresent() {
  const manual = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mcp-servers-manual.json'), 'utf8'));
  const agentx = manual.servers.find((s) => s.slug === 'agentx');
  assert.ok(agentx, 'agentx must be in mcp-servers-manual.json');
  assert.strictEqual(agentx.mcp_endpoint, 'https://www.agentxhq.com/mcp');
  assert.ok(agentx.tools?.length >= 10, 'agentx should list its documented tools');
}

function testImagesvgManualPresent() {
  const manual = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/mcp-servers-manual.json'), 'utf8'));
  const imagesvg = manual.servers.find((s) => s.slug === 'imagesvg');
  assert.ok(imagesvg, 'imagesvg must be in mcp-servers-manual.json');
  assert.strictEqual(imagesvg.mcp_endpoint, 'https://imagesvg.com/mcp');
  assert.strictEqual(imagesvg.docs_url, 'https://imagesvg.com/en/developers');
  assert.ok(imagesvg.tools?.some((t) => t.name === 'imagesvg_vectorize'));
}

testMergeKeepsApprovedSlug();
testPreserveScriptRestoresLocalOnly();
testAgentxManualPresent();
testImagesvgManualPresent();
console.log('mcp manual preserve ok');
