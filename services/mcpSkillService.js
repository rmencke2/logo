'use strict';

const fs = require('fs');
const path = require('path');

const SITE_BASE = 'https://www.influzer.ai';
const SKILL_REL = path.join('skills', 'influzer-mcp', 'SKILL.md');
const SKILL_FILE = path.join(__dirname, '..', 'public', SKILL_REL);
const SKILL_URL = `${SITE_BASE}/skills/influzer-mcp/SKILL.md`;
const SKILL_PAGE = `${SITE_BASE}/mcp/discovery/skill`;
const SKILL_DESCRIPTION =
  'Search the Influzer MCP catalog, handshake a remote URL, and paste Cursor / Claude / ChatGPT / ACP install snippets. Not a safe-to-install badge.';

function setSkillCors(res) {
  res.removeHeader('Access-Control-Allow-Credentials');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

function skillIndex() {
  return {
    skills: [
      {
        name: 'influzer-mcp',
        description: SKILL_DESCRIPTION,
        url: SKILL_URL,
        page: SKILL_PAGE,
        discovery: `${SITE_BASE}/mcp/discovery`,
        probe: `${SITE_BASE}/api/v1/probe`,
        safety_badge: null,
      },
    ],
  };
}

function getSkillAssetVersion() {
  try {
    const files = ['home.css', 'mcp-setup-page.css'];
    let latest = 0;
    for (const file of files) {
      latest = Math.max(
        latest,
        fs.statSync(path.join(__dirname, '..', 'public', 'css', file)).mtimeMs,
      );
    }
    return String(Math.floor(latest));
  } catch {
    return String(Date.now());
  }
}

function registerMcpSkillRoutes(app) {
  app.options('/.well-known/agent-skills/index.json', (req, res) => {
    setSkillCors(res);
    res.status(204).end();
  });
  app.options('/skills/influzer-mcp/SKILL.md', (req, res) => {
    setSkillCors(res);
    res.status(204).end();
  });

  app.get('/.well-known/agent-skills/index.json', (req, res) => {
    setSkillCors(res);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.json(skillIndex());
  });

  app.get('/skills/influzer-mcp/SKILL.md', (req, res) => {
    setSkillCors(res);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.type('text/markdown; charset=utf-8');
    return res.sendFile(SKILL_FILE);
  });

  app.get('/skills/influzer-mcp', (req, res) => {
    res.redirect(301, '/skills/influzer-mcp/SKILL.md');
  });

  app.get('/mcp/discovery/skill', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    const assetVersion = getSkillAssetVersion();
    res.render('mcp-discovery-skill', {
      canonicalUrl: SKILL_PAGE,
      skillUrl: SKILL_URL,
      skillIndexUrl: `${SITE_BASE}/.well-known/agent-skills/index.json`,
      discoveryEndpoint: `${SITE_BASE}/mcp/discovery`,
      probeDocs: `${SITE_BASE}/mcp/probe`,
      installExample: `${SITE_BASE}/api/v1/install/influzer-mcp-discovery`,
      cursorSkillCommand:
        'mkdir -p .cursor/skills/influzer-mcp && curl -fsSL -o .cursor/skills/influzer-mcp/SKILL.md \\\n  https://www.influzer.ai/skills/influzer-mcp/SKILL.md',
      claudeSkillCommand:
        'mkdir -p .claude/skills/influzer-mcp && curl -fsSL -o .claude/skills/influzer-mcp/SKILL.md \\\n  https://www.influzer.ai/skills/influzer-mcp/SKILL.md',
      assetVersion,
    });
  });
}

module.exports = {
  registerMcpSkillRoutes,
  skillIndex,
  SKILL_URL,
  SKILL_PAGE,
  SKILL_FILE,
  SKILL_DESCRIPTION,
};
