'use strict';

const path = require('path');
const { findMcpServerBySlug } = require('./mcpDirectoryService');
const { buildInstallSnippets } = require('./mcpInstallSnippets');

const SITE_BASE = 'https://www.influzer.ai';

function setInstallCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
}

function snippetsForSlug(slug) {
  const server = findMcpServerBySlug(String(slug || '').trim().toLowerCase());
  if (!server) return null;
  return buildInstallSnippets(server);
}

function handleInstallJson(req, res) {
  setInstallCors(res);
  const snippets = snippetsForSlug(req.params.slug);
  if (!snippets) {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(404).json({
      ok: false,
      error: 'not_found',
      safety_badge: null,
      directory: `${SITE_BASE}/mcp`,
    });
  }
  const format = String(req.query.format || '').toLowerCase();
  if (format === 'md' || format === 'markdown') {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('text/markdown; charset=utf-8');
    return res.send(snippets.markdown);
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.json(snippets);
}

function registerMcpInstallRoutes(app) {
  app.options('/api/v1/install/:slug', (req, res) => {
    setInstallCors(res);
    res.status(204).end();
  });
  app.options('/api/mcp/v1/install/:slug', (req, res) => {
    setInstallCors(res);
    res.status(204).end();
  });

  app.get('/api/v1/install/:slug', handleInstallJson);
  app.get('/api/mcp/v1/install/:slug', handleInstallJson);

  app.options('/embed/mcp/:file', (req, res) => {
    setInstallCors(res);
    res.status(204).end();
  });
  app.options('/embed/install.js', (req, res) => {
    setInstallCors(res);
    res.status(204).end();
  });

  app.get('/embed/mcp/:file', (req, res) => {
    setInstallCors(res);
    const snippets = snippetsForSlug(String(req.params.file || '').replace(/\.md$/i, ''));
    if (!snippets) {
      return res.status(404).type('text/plain').send('MCP listing not found');
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.type('text/markdown; charset=utf-8');
    return res.send(snippets.markdown);
  });

  app.get('/embed/install.js', (req, res) => {
    setInstallCors(res);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.type('application/javascript; charset=utf-8');
    res.sendFile(path.join(__dirname, '..', 'public', 'js', 'influzer-install-embed.js'));
  });
}

module.exports = {
  registerMcpInstallRoutes,
  snippetsForSlug,
};
