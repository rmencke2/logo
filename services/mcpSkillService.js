'use strict';

const fs = require('fs');
const path = require('path');

const SITE_BASE = 'https://www.influzer.ai';
const SKILL_PAGE = `${SITE_BASE}/mcp/discovery/skill`;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const SKILL_DESCRIPTION =
  'Search the Influzer MCP catalog, handshake a remote URL, and paste Cursor / Claude / ChatGPT / ACP install snippets. Not a safe-to-install badge.';

const SKILLS = [
  {
    name: 'influzer-mcp',
    description: SKILL_DESCRIPTION,
    file: path.join(PUBLIC_DIR, 'skills', 'influzer-mcp', 'SKILL.md'),
  },
  {
    name: 'influzer-mcp-claude',
    description:
      'Find an MCP server from inside Claude and return an HTTPS connector URL. Not a safe-to-install badge. Claude chat cannot use stdio.',
    file: path.join(PUBLIC_DIR, 'skills', 'influzer-mcp-claude', 'SKILL.md'),
  },
  {
    name: 'influzer-mcp-chatgpt',
    description:
      'Find an MCP server from inside ChatGPT and return an HTTPS custom-connector URL. Not a safe-to-install badge. ChatGPT cannot use stdio.',
    file: path.join(PUBLIC_DIR, 'skills', 'influzer-mcp-chatgpt', 'SKILL.md'),
  },
];

const SKILL_FILE = SKILLS[0].file;
const SKILL_URL = `${SITE_BASE}/skills/influzer-mcp/SKILL.md`;

function skillUrl(name) {
  return `${SITE_BASE}/skills/${name}/SKILL.md`;
}

function findSkill(name) {
  return SKILLS.find((skill) => skill.name === name) || null;
}

function setSkillCors(res) {
  res.removeHeader('Access-Control-Allow-Credentials');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

function skillIndex() {
  return {
    skills: SKILLS.map((skill) => ({
      name: skill.name,
      description: skill.description,
      url: skillUrl(skill.name),
      page: SKILL_PAGE,
      discovery: `${SITE_BASE}/mcp/discovery`,
      probe: `${SITE_BASE}/api/v1/probe`,
      safety_badge: null,
    })),
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
  app.get('/.well-known/agent-skills/index.json', (req, res) => {
    setSkillCors(res);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.json(skillIndex());
  });

  function sendSkill(req, res) {
    const skill = findSkill(String(req.params.name || ''));
    if (!skill) return res.status(404).type('text/plain').send('Skill not found');
    setSkillCors(res);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.type('text/markdown; charset=utf-8');
    return res.sendFile(skill.file);
  }

  app.options('/skills/:name/SKILL.md', (req, res) => {
    if (!findSkill(req.params.name)) return res.status(404).end();
    setSkillCors(res);
    res.status(204).end();
  });

  app.get('/skills/:name/SKILL.md', sendSkill);

  app.get('/skills/:name', (req, res) => {
    if (!findSkill(req.params.name)) return res.status(404).type('text/plain').send('Skill not found');
    res.redirect(301, `/skills/${req.params.name}/SKILL.md`);
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
        'mkdir -p .claude/skills/influzer-mcp-claude && curl -fsSL -o .claude/skills/influzer-mcp-claude/SKILL.md \\\n  https://www.influzer.ai/skills/influzer-mcp-claude/SKILL.md',
      claudeSkillUrl: skillUrl('influzer-mcp-claude'),
      chatgptSkillUrl: skillUrl('influzer-mcp-chatgpt'),
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
