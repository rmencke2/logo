// ================================
//  MCP listing ownership — submitter self-service edit
// ================================

const fs = require('fs');
const path = require('path');
const { requireAuth, requireAuthPage } = require('../auth');
const { getMcpCategories, findMcpServerBySlug } = require('./mcpDirectoryService');
const {
  findManualServer,
  catalogServerToEditPayload,
  updateCatalogServer,
  validateManualServer,
  editBodyToManualServer,
} = require('./mcpCatalogAdminService');

const SUBMISSIONS_DIR = path.join(__dirname, '..', 'data', 'mcp-submissions');
const MANUAL_PATH = path.join(__dirname, '..', 'data', 'mcp-servers-manual.json');

function readManualServers() {
  if (!fs.existsSync(MANUAL_PATH)) return [];
  const data = JSON.parse(fs.readFileSync(MANUAL_PATH, 'utf8'));
  return Array.isArray(data.servers) ? data.servers : [];
}

function listOwnedPublishedListings(userId) {
  return readManualServers()
    .filter((s) => !s.hidden && s.owner_user_id === userId)
    .map((s) => {
      const live = findMcpServerBySlug(s.slug);
      return {
        slug: s.slug,
        name: live?.name || s.name,
        category: live?.category || s.category || '',
        status: 'published',
        pageUrl: `/mcp/${s.slug}`,
        editUrl: `/mcp/my-listings/${s.slug}`,
        submittedAt: s.last_updated || null,
      };
    })
    .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
}

function listOwnedPendingSubmissions(userId) {
  if (!fs.existsSync(SUBMISSIONS_DIR)) return [];
  return fs
    .readdirSync(SUBMISSIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((filename) => {
      const raw = JSON.parse(fs.readFileSync(path.join(SUBMISSIONS_DIR, filename), 'utf8'));
      return {
        id: filename.replace(/\.json$/, ''),
        ...raw,
      };
    })
    .filter((s) => s.submitterUserId === userId && (s.reviewStatus || 'pending') === 'pending')
    .map((s) => ({
      slug: s.suggestedSlug || s.serverName,
      name: s.serverName,
      category: s.category || '',
      status: 'pending',
      pageUrl: null,
      editUrl: null,
      submittedAt: s.submittedAt || null,
    }))
    .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
}

function getOwnedListingsForUser(userId) {
  return [...listOwnedPublishedListings(userId), ...listOwnedPendingSubmissions(userId)];
}

function assertUserOwnsListing(userId, slug) {
  const manual = findManualServer(slug);
  if (!manual || manual.hidden || manual.owner_user_id !== userId) {
    throw new Error('You do not have permission to edit this listing');
  }
}

function updateOwnedListing(userId, slug, body = {}) {
  assertUserOwnsListing(userId, slug);
  const { pinToTop100: _ignored, ...safeBody } = body;
  return updateCatalogServer(slug, safeBody);
}

function registerMcpOwnerRoutes(app) {
  app.get('/mcp/my-listings', requireAuthPage, (req, res) => {
    res.render('mcp-my-listings', {
      pageTitle: 'My MCP Listings',
      metaDescription: 'View and edit MCP directory listings you submitted with your Influzer account.',
      canonicalUrl: 'https://www.influzer.ai/mcp/my-listings',
    });
  });

  app.get('/mcp/my-listings/:slug', requireAuthPage, (req, res) => {
    try {
      assertUserOwnsListing(req.user.id, req.params.slug);
    } catch {
      return res.status(404).render('404', { title: 'Listing not found' });
    }
    res.render('mcp-edit-listing', {
      pageTitle: 'Edit MCP Listing',
      slug: req.params.slug,
      canonicalUrl: `https://www.influzer.ai/mcp/my-listings/${req.params.slug}`,
    });
  });

  app.get('/api/mcp/my-listings', requireAuth, (req, res) => {
    try {
      res.json({ listings: getOwnedListingsForUser(req.user.id) });
    } catch (err) {
      console.error('MCP my-listings error:', err);
      res.status(500).json({ error: 'Failed to load your listings' });
    }
  });

  app.get('/api/mcp/my-listings/:slug', requireAuth, (req, res) => {
    try {
      assertUserOwnsListing(req.user.id, req.params.slug);
      const server = findMcpServerBySlug(req.params.slug);
      if (!server) return res.status(404).json({ error: 'Listing not found in catalog' });
      res.json({
        server: catalogServerToEditPayload(server),
        categories: [...getMcpCategories(), 'Other'],
      });
    } catch (err) {
      console.error('MCP owned listing detail error:', err);
      res.status(err.message.includes('permission') ? 403 : 500).json({
        error: err.message || 'Failed to load listing',
      });
    }
  });

  app.put('/api/mcp/my-listings/:slug', requireAuth, (req, res) => {
    try {
      const server = editBodyToManualServer(req.body || {});
      validateManualServer(server);
      const result = updateOwnedListing(req.user.id, req.params.slug, req.body || {});
      res.json({
        success: true,
        message: `Updated ${result.server.name}`,
        ...result,
      });
    } catch (err) {
      console.error('MCP owned listing update error:', err);
      const status = err.message.includes('permission') ? 403 : 400;
      res.status(status).json({ error: err.message || 'Failed to update listing' });
    }
  });
}

module.exports = {
  registerMcpOwnerRoutes,
  getOwnedListingsForUser,
  assertUserOwnsListing,
  updateOwnedListing,
};
