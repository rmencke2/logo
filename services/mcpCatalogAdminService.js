// ================================
//  MCP catalog admin — review submissions, add to manual catalog
// ================================

const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../auth');
const {
  clearMcpCache,
  getMcpCategories,
  getAllMcpServers,
  findMcpServerBySlug,
  isInTop100,
} = require('./mcpDirectoryService');
const { sendMcpApprovalEmail } = require('../emailService');

const SUBMISSIONS_DIR = path.join(__dirname, '..', 'data', 'mcp-submissions');
const MANUAL_PATH = path.join(__dirname, '..', 'data', 'mcp-servers-manual.json');
const PINNED_PATH = path.join(__dirname, '..', 'data', 'mcp-top100-pinned.json');

function ensureSubmissionsDir() {
  if (!fs.existsSync(SUBMISSIONS_DIR)) {
    fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
  }
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^https?-/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function readManualFile() {
  if (!fs.existsSync(MANUAL_PATH)) {
    return { categories: getMcpCategories(), servers: [] };
  }
  return JSON.parse(fs.readFileSync(MANUAL_PATH, 'utf8'));
}

function writeManualFile(data) {
  fs.writeFileSync(MANUAL_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  clearMcpCache();
}

function readSubmissionFile(id) {
  const safeId = path.basename(String(id));
  const filePath = path.join(SUBMISSIONS_DIR, `${safeId}.json`);
  if (!fs.existsSync(filePath)) return null;
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { id: safeId, filePath, ...raw };
}

function listSubmissions({ status } = {}) {
  ensureSubmissionsDir();
  const items = fs
    .readdirSync(SUBMISSIONS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((filename) => {
      const id = filename.replace(/\.json$/, '');
      const full = readSubmissionFile(id);
      return {
        id,
        serverName: full.serverName,
        suggestedSlug: full.suggestedSlug,
        category: full.category,
        transport: full.transport,
        submitterEmail: full.submitterEmail,
        submitterName: full.submitterName,
        submittedAt: full.submittedAt,
        reviewStatus: full.reviewStatus || 'pending',
        approvedSlug: full.approvedSlug || null,
        toolCount: Array.isArray(full.tools) ? full.tools.length : 0,
      };
    })
    .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));

  if (!status || status === 'all') return items;
  return items.filter((s) => s.reviewStatus === status);
}

function parseToolsFromText(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const sep = line.includes(' — ') ? ' — ' : line.includes(' - ') ? ' - ' : null;
      if (sep) {
        const [name, ...rest] = line.split(sep);
        return { name: name.trim(), description: rest.join(sep).trim() };
      }
      return { name: line, description: '' };
    });
}

function submissionToManualServer(sub, overrides = {}) {
  const transport = overrides.transport || sub.transport || 'unknown';
  const primaryUrl = overrides.primaryUrl || sub.primaryUrl || '';
  const slug = slugify(overrides.slug || sub.suggestedSlug || sub.serverName);

  const tools =
    Array.isArray(overrides.tools) && overrides.tools.length
      ? overrides.tools
      : Array.isArray(sub.tools) && sub.tools.length
        ? sub.tools
        : parseToolsFromText(sub.toolsFormatted);

  const server = {
    name: overrides.serverName || sub.serverName,
    slug,
    category: overrides.category || sub.category || 'Dev Tools',
    description: overrides.description || sub.description || '',
    official:
      overrides.official !== undefined ? Boolean(overrides.official) : Boolean(sub.official),
    transport,
    icon: overrides.icon || 'globe',
    featured: Boolean(overrides.featured),
    github_url: overrides.githubUrl || sub.githubUrl || undefined,
    docs_url: overrides.docsUrl || sub.docsUrl || undefined,
    stars: parseInt(overrides.stars ?? sub.stars ?? '0', 10) || 0,
    tools,
  };

  if (transport === 'http' || transport === 'sse') {
    server.mcp_endpoint = overrides.mcpEndpoint || primaryUrl || undefined;
  }
  if (overrides.installCommand || sub.install_command) {
    server.install_command = overrides.installCommand || sub.install_command;
  } else if (transport === 'stdio' && primaryUrl && !primaryUrl.startsWith('http')) {
    server.install_command = primaryUrl;
  }

  const ownerUserId = overrides.ownerUserId ?? sub.submitterUserId;
  if (ownerUserId) {
    server.owner_user_id = ownerUserId;
  }

  for (const key of Object.keys(server)) {
    if (server[key] === undefined || server[key] === '') delete server[key];
  }

  return server;
}

function upsertManualServer(server) {
  const manual = readManualFile();
  const idx = manual.servers.findIndex((s) => s.slug === server.slug);
  const isNew = idx < 0;
  if (idx >= 0) {
    const merged = { ...manual.servers[idx], ...server };
    if (!server.hidden) delete merged.hidden;
    manual.servers[idx] = merged;
  } else {
    manual.servers.unshift(server);
  }
  writeManualFile(manual);
  if (isNew && !server.hidden) {
    const { recordMcpServerAdded } = require('./mcpCatalogChangelogService');
    recordMcpServerAdded(server, 'manual');
  }
}

function readPinnedFile() {
  if (!fs.existsSync(PINNED_PATH)) return { slugs: [] };
  const pinned = JSON.parse(fs.readFileSync(PINNED_PATH, 'utf8'));
  if (!Array.isArray(pinned.slugs)) pinned.slugs = [];
  return pinned;
}

function writePinnedFile(pinned) {
  fs.writeFileSync(PINNED_PATH, `${JSON.stringify(pinned, null, 2)}\n`, 'utf8');
  clearMcpCache();
}

function isPinnedToTop100(slug) {
  return readPinnedFile().slugs.includes(slug);
}

function findManualServer(slug) {
  return readManualFile().servers.find((s) => s.slug === slug) || null;
}

function removeManualServerBySlug(slug) {
  const manual = readManualFile();
  const next = manual.servers.filter((s) => s.slug !== slug);
  if (next.length === manual.servers.length) return false;
  manual.servers = next;
  writeManualFile(manual);
  return true;
}

function renamePinnedSlug(oldSlug, newSlug) {
  const pinned = readPinnedFile();
  const idx = pinned.slugs.indexOf(oldSlug);
  if (idx < 0) return;
  pinned.slugs[idx] = newSlug;
  writePinnedFile(pinned);
}

function isSlugTaken(slug, exceptSlug = null) {
  if (exceptSlug && slug === exceptSlug) return false;
  const manual = findManualServer(slug);
  if (manual && !manual.hidden) return true;
  return Boolean(findMcpServerBySlug(slug));
}

function reclaimHiddenSlug(slug) {
  const manual = findManualServer(slug);
  if (manual?.hidden) {
    removeManualServerBySlug(slug);
    return true;
  }
  return false;
}

function catalogServerToEditPayload(server) {
  const manual = findManualServer(server.slug);
  return {
    slug: server.slug,
    originalSlug: server.slug,
    serverName: server.name,
    description: server.description || '',
    category: server.category || 'Dev Tools',
    transport: server.transport || 'unknown',
    mcpEndpoint: server.mcp_endpoint || server.deployment_url || '',
    installCommand: server.install_command || '',
    githubUrl: server.github_url || '',
    docsUrl: server.docs_url || '',
    stars: server.stars || 0,
    official: Boolean(server.official),
    featured: Boolean(server.featured),
    icon: server.icon || 'globe',
    tools: server.tools || [],
    inManual: Boolean(manual),
    catalogSource: manual ? 'manual' : server.source || 'catalog',
    inTop100: isInTop100(server.slug),
    pinnedToTop100: isPinnedToTop100(server.slug),
    pageUrl: `/mcp/${server.slug}`,
  };
}

function editBodyToManualServer(body) {
  return submissionToManualServer(
    { tools: [] },
    {
      serverName: body.serverName,
      slug: body.slug,
      description: body.description,
      category: body.category,
      transport: body.transport,
      mcpEndpoint: body.mcpEndpoint,
      installCommand: body.installCommand,
      githubUrl: body.githubUrl,
      docsUrl: body.docsUrl,
      stars: body.stars,
      official: body.official,
      featured: body.featured,
      icon: body.icon,
      tools: body.tools,
    },
  );
}

function validateManualServer(server) {
  if (!server.name || !server.slug || !server.description) {
    throw new Error('Server name, slug, and description are required');
  }
  if (!server.tools?.length) {
    throw new Error('At least one tool is required');
  }
  const categories = [...getMcpCategories(), 'Other'];
  if (!categories.includes(server.category)) {
    throw new Error('Invalid category');
  }
}

function searchCatalogServers(query, limit = 50) {
  const q = String(query || '').trim().toLowerCase();
  const manualSlugs = new Set(readManualFile().servers.filter((s) => !s.hidden).map((s) => s.slug));
  let servers = getAllMcpServers();

  if (q) {
    servers = servers.filter(
      (s) =>
        s.slug.includes(q) ||
        (s.name || '').toLowerCase().includes(q) ||
        (s.description || '').toLowerCase().includes(q),
    );
  }

  return servers.slice(0, limit).map((s) => ({
    slug: s.slug,
    name: s.name,
    category: s.category || '',
    transport: s.transport || '',
    toolCount: s.tools?.length || 0,
    source: manualSlugs.has(s.slug) ? 'manual' : s.source || 'catalog',
    inTop100: isInTop100(s.slug),
    pageUrl: `/mcp/${s.slug}`,
  }));
}

function updateCatalogServer(originalSlug, body = {}) {
  const existing = findMcpServerBySlug(originalSlug);
  if (!existing) throw new Error('Server not found in catalog');

  const server = editBodyToManualServer(body);
  validateManualServer(server);

  const newSlug = server.slug;
  if (newSlug !== originalSlug) {
    if (isSlugTaken(newSlug)) {
      throw new Error('Another server already uses that slug');
    }
    reclaimHiddenSlug(newSlug);
    if (findManualServer(originalSlug)) {
      removeManualServerBySlug(originalSlug);
    } else {
      upsertManualServer({
        slug: originalSlug,
        hidden: true,
        name: existing.name,
        category: existing.category || 'Dev Tools',
        description: existing.description || '',
        transport: 'unknown',
        tools: [],
      });
    }
    renamePinnedSlug(originalSlug, newSlug);
  }

  upsertManualServer(server);
  syncTop100Pin(newSlug, Boolean(body.pinToTop100));

  return { server, slug: newSlug, pageUrl: `/mcp/${newSlug}` };
}

function pinToTop100(slug) {
  const pinned = readPinnedFile();
  if (!pinned.slugs.includes(slug)) {
    pinned.slugs.unshift(slug);
    writePinnedFile(pinned);
  }
}

function unpinFromTop100(slug) {
  const pinned = readPinnedFile();
  const next = pinned.slugs.filter((s) => s !== slug);
  if (next.length === pinned.slugs.length) return;
  pinned.slugs = next;
  writePinnedFile(pinned);
}

function syncTop100Pin(slug, shouldPin) {
  if (shouldPin) pinToTop100(slug);
  else unpinFromTop100(slug);
}

function markSubmission(id, status, meta = {}) {
  const sub = readSubmissionFile(id);
  if (!sub) throw new Error('Submission not found');
  const { filePath, ...data } = sub;
  data.reviewStatus = status;
  data.reviewedAt = new Date().toISOString();
  if (meta.approvedSlug) data.approvedSlug = meta.approvedSlug;
  if (meta.reviewedBy) data.reviewedBy = meta.reviewedBy;
  if (meta.note) data.reviewNote = meta.note;
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function approveSubmission(id, body = {}, reviewedBy = '') {
  const sub = readSubmissionFile(id);
  if (!sub) throw new Error('Submission not found');

  const wasAlreadyApproved = sub.reviewStatus === 'approved';
  const server = submissionToManualServer(sub, body);
  validateManualServer(server);

  upsertManualServer(server);
  syncTop100Pin(server.slug, Boolean(body.pinToTop100));

  const pageUrl = `/mcp/${server.slug}`;

  markSubmission(id, 'approved', {
    approvedSlug: server.slug,
    reviewedBy,
  });

  if (sub.submitterEmail) {
    try {
      const { subscribeToNewsletter } = require('./newsletterService');
      await subscribeToNewsletter(sub.submitterEmail, 'mcp-submit-approved', 'admin-approve');
    } catch (err) {
      console.error('Newsletter subscribe on MCP approve failed:', err.message);
    }
  }

  let emailSent = false;
  let emailError = null;
  if (!wasAlreadyApproved && sub.submitterEmail) {
    try {
      await sendMcpApprovalEmail({ submission: sub, server, pageUrl });
      emailSent = true;
    } catch (err) {
      emailError = err.message || 'Failed to send approval email';
      console.error('MCP approval notification failed:', emailError);
    }
  }

  return { server, slug: server.slug, pageUrl, emailSent, emailError };
}

function registerMcpCatalogAdminRoutes(app, requireAdmin) {
  if (typeof requireAdmin !== 'function') {
    throw new Error('registerMcpCatalogAdminRoutes requires requireAdmin middleware');
  }

  app.get('/admin/api/mcp/submissions', requireAuth, requireAdmin, (req, res) => {
    try {
      const status = String(req.query.status || 'pending');
      res.json({ submissions: listSubmissions({ status }) });
    } catch (err) {
      console.error('MCP submissions list error:', err);
      res.status(500).json({ error: 'Failed to list submissions' });
    }
  });

  app.get('/admin/api/mcp/submissions/:id', requireAuth, requireAdmin, (req, res) => {
    try {
      const sub = readSubmissionFile(req.params.id);
      if (!sub) return res.status(404).json({ error: 'Submission not found' });
      const { filePath, ...payload } = sub;
      const preview = submissionToManualServer(sub, {});
      res.json({
        submission: payload,
        preview,
        categories: [...getMcpCategories(), 'Other'],
        alreadyInCatalog: Boolean(findMcpServerBySlug(preview.slug)),
      });
    } catch (err) {
      console.error('MCP submission detail error:', err);
      res.status(500).json({ error: 'Failed to load submission' });
    }
  });

  app.post('/admin/api/mcp/submissions/:id/approve', requireAuth, requireAdmin, async (req, res) => {
    try {
      const result = await approveSubmission(
        req.params.id,
        req.body || {},
        req.user?.email || req.user?.name || 'admin',
      );
      let message = `Added ${result.server.name} to the catalog`;
      if (result.emailSent) {
        message += '. Approval email sent to submitter.';
      } else if (result.emailError) {
        message += `. Warning: approval email failed (${result.emailError}).`;
      }
      res.json({
        success: true,
        message,
        ...result,
      });
    } catch (err) {
      console.error('MCP approve error:', err);
      res.status(400).json({ error: err.message || 'Failed to approve submission' });
    }
  });

  app.post('/admin/api/mcp/submissions/:id/dismiss', requireAuth, requireAdmin, (req, res) => {
    try {
      markSubmission(req.params.id, 'dismissed', {
        reviewedBy: req.user?.email || 'admin',
        note: req.body?.note || '',
      });
      res.json({ success: true, message: 'Submission dismissed' });
    } catch (err) {
      console.error('MCP dismiss error:', err);
      res.status(400).json({ error: err.message || 'Failed to dismiss submission' });
    }
  });

  app.post('/admin/api/mcp/servers', requireAuth, requireAdmin, (req, res) => {
    try {
      const server = submissionToManualServer({ tools: [] }, req.body || {});
      validateManualServer(server);
      upsertManualServer(server);
      syncTop100Pin(server.slug, Boolean(req.body.pinToTop100));
      res.json({
        success: true,
        slug: server.slug,
        pageUrl: `/mcp/${server.slug}`,
      });
    } catch (err) {
      console.error('MCP direct add error:', err);
      res.status(400).json({ error: err.message || 'Failed to add server' });
    }
  });

  app.get('/admin/api/mcp/catalog', requireAuth, requireAdmin, (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 100);
      if (!q) {
        return res.json({ servers: [], message: 'Enter a search query' });
      }
      res.json({ servers: searchCatalogServers(q, limit) });
    } catch (err) {
      console.error('MCP catalog search error:', err);
      res.status(500).json({ error: 'Failed to search catalog' });
    }
  });

  app.get('/admin/api/mcp/catalog/:slug', requireAuth, requireAdmin, (req, res) => {
    try {
      const server = findMcpServerBySlug(req.params.slug);
      if (!server) return res.status(404).json({ error: 'Server not found in catalog' });
      res.json({
        server: catalogServerToEditPayload(server),
        categories: [...getMcpCategories(), 'Other'],
      });
    } catch (err) {
      console.error('MCP catalog detail error:', err);
      res.status(500).json({ error: 'Failed to load catalog server' });
    }
  });

  app.put('/admin/api/mcp/catalog/:slug', requireAuth, requireAdmin, (req, res) => {
    try {
      const result = updateCatalogServer(req.params.slug, req.body || {});
      res.json({
        success: true,
        message: `Updated ${result.server.name} in the catalog`,
        ...result,
      });
    } catch (err) {
      console.error('MCP catalog update error:', err);
      res.status(400).json({ error: err.message || 'Failed to update catalog server' });
    }
  });
}

module.exports = {
  registerMcpCatalogAdminRoutes,
  listSubmissions,
  submissionToManualServer,
  upsertManualServer,
  approveSubmission,
  searchCatalogServers,
  updateCatalogServer,
  catalogServerToEditPayload,
  findManualServer,
  validateManualServer,
  editBodyToManualServer,
  parseToolsFromText,
};
