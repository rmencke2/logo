'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const { getMcpServer } = require('../services/mcpDiscoveryTools');
const { skillIndex, SKILL_FILE, SKILL_DESCRIPTION } = require('../services/mcpSkillService');

function main() {
  const raw = fs.readFileSync(SKILL_FILE, 'utf8');
  assert.match(raw, /^---\nname: influzer-mcp\n/);
  assert.ok(raw.includes('https://www.influzer.ai/mcp/discovery'));
  assert.ok(raw.includes('/api/v1/probe'));
  assert.ok(raw.includes('safety_badge'));
  assert.ok(raw.includes('WebMCP'));
  assert.ok(raw.includes('ACP'));
  assert.equal(/ignore previous instructions/i.test(raw), false);

  const idx = skillIndex();
  assert.equal(idx.skills.length, 3);
  assert.equal(idx.skills[0].name, 'influzer-mcp');
  assert.equal(idx.skills[0].safety_badge, null);
  assert.ok(idx.skills[0].url.endsWith('/skills/influzer-mcp/SKILL.md'));
  assert.ok(SKILL_DESCRIPTION.includes('Not a safe-to-install badge'));

  const claude = idx.skills.find((s) => s.name === 'influzer-mcp-claude');
  const chatgpt = idx.skills.find((s) => s.name === 'influzer-mcp-chatgpt');
  assert.ok(claude.url.endsWith('/skills/influzer-mcp-claude/SKILL.md'));
  assert.ok(chatgpt.url.endsWith('/skills/influzer-mcp-chatgpt/SKILL.md'));
  for (const skill of [claude, chatgpt]) {
    const body = fs.readFileSync(
      require('path').join(__dirname, '..', 'public', 'skills', skill.name, 'SKILL.md'),
      'utf8',
    );
    assert.match(body, new RegExp(`^---\\nname: ${skill.name}\\n`));
    assert.ok(body.includes('https://www.influzer.ai/mcp/discovery'));
    assert.ok(body.includes('safety_badge') || body.includes('SAFE'));
    assert.equal(/ignore previous instructions/i.test(body), false);
    assert.equal(skill.safety_badge, null);
  }

  const live = getMcpServer({ slug: 'influzer-mcp-discovery' });
  assert.ok(live.server);
  assert.ok(live.server.install);
  assert.equal(live.server.install.safety_badge, null);
  assert.equal(live.server.install.has_remote, true);
  assert.ok(live.server.install.clients.cursor.code.includes('https://www.influzer.ai/mcp/discovery'));
  assert.equal(live.server.install.clients.claude.available, true);
  assert.ok(live.server.install.skill_url.includes('/skills/influzer-mcp/SKILL.md'));
  assert.ok(live.server.install.badge_url.includes('/api/v1/probe/badge'));
  assert.ok(raw.includes('/api/v1/probe/badge'));

  const missing = getMcpServer({ slug: '' });
  assert.ok(missing.error);

  console.log('mcp skill tests passed');
}

main();
