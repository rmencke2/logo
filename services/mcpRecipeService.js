/**
 * MCP Recipes — directory, submissions, moderation, reactions, contributor pages.
 */

const { getDatabase } = require('../database');
const { requireAuth, requireAuthPage, getOptionalAuthUser } = require('../auth');
const { requireAdmin } = require('./adminService');
const { findMcpServerBySlug, searchMcpServers } = require('./mcpDirectoryService');
const { clientErrorMessage } = require('../utils/safeError');
const {
  escapeHtml,
  validateExternalUrl,
  scanPayloadForSecrets,
  renderSafeMarkdown,
} = require('./mcpRecipeMarkdown');

const SITE_BASE_URL = 'https://www.influzer.ai';

const USE_CASES = [
  'Productivity',
  'Engineering',
  'Data & Analytics',
  'Content',
  'DevOps',
  'Research',
  'Other',
];

const COMPATIBLE_CLIENTS = [
  'Claude Desktop',
  'Claude Code',
  'Cursor',
  'ChatGPT',
  'Other',
];

const ISSUE_REASONS = [
  { id: 'outdated', label: 'Outdated instructions' },
  { id: 'code_error', label: 'Code or configuration error' },
  { id: 'unsafe', label: 'Unsafe content' },
  { id: 'spam', label: 'Spam' },
  { id: 'other', label: 'Other' },
];

const BLOCK_TYPES = new Set(['instruction', 'code', 'config', 'prompt']);
const MAX_TITLE = 160;
const MAX_SUMMARY = 400;
const MAX_MD = 12000;
const MAX_BLOCKS = 40;
const MAX_BLOCK_BODY = 16000;
const MAX_SERVERS = 12;
const RATE_CREATE_PER_HOUR = 20;
const RATE_REACT_PER_HOUR = 60;
const RATE_REPORT_PER_HOUR = 20;

function nowIso() {
  return new Date().toISOString();
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) return String(forwardedFor).split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function cleanText(input, maxLen) {
  if (typeof input !== 'string') return '';
  return input.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function slugify(value) {
  return cleanText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function initializeRecipeTables(db) {
  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS contributor_profiles (
      user_id INTEGER PRIMARY KEY,
      display_name TEXT,
      bio TEXT,
      website_url TEXT,
      github_url TEXT,
      twitter_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  );

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      author_user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      published_revision_id INTEGER,
      pending_revision_id INTEGER,
      verified_by_influzer INTEGER DEFAULT 0,
      verified_at DATETIME,
      verified_by_user_id INTEGER,
      verification_notes TEXT,
      worked_for_me_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      published_at DATETIME,
      FOREIGN KEY (author_user_id) REFERENCES users(id)
    )`,
  );

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS recipe_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      revision_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      use_case TEXT NOT NULL,
      prerequisites TEXT,
      permissions TEXT,
      expected_result TEXT,
      sample_output TEXT,
      troubleshooting TEXT,
      source_repo_url TEXT,
      compatible_clients TEXT,
      last_tested_at TEXT,
      tested_client_versions TEXT,
      tested_server_versions TEXT,
      author_reports_tested INTEGER DEFAULT 0,
      moderation_status TEXT NOT NULL DEFAULT 'draft',
      moderation_feedback TEXT,
      reviewed_by_user_id INTEGER,
      reviewed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by_user_id INTEGER NOT NULL,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
    )`,
  );

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS recipe_revision_servers (
      revision_id INTEGER NOT NULL,
      server_slug TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (revision_id, server_slug),
      FOREIGN KEY (revision_id) REFERENCES recipe_revisions(id) ON DELETE CASCADE
    )`,
  );

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS recipe_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      revision_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      block_type TEXT NOT NULL,
      title TEXT,
      body TEXT NOT NULL,
      language TEXT,
      FOREIGN KEY (revision_id) REFERENCES recipe_revisions(id) ON DELETE CASCADE
    )`,
  );

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS recipe_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      reaction TEXT NOT NULL DEFAULT 'worked',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(recipe_id, user_id),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  );

  await dbRun(
    db,
    `CREATE TABLE IF NOT EXISTS recipe_issue_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      resolved_by_user_id INTEGER,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`,
  );

  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_recipes_status ON recipes(status)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_recipes_author ON recipes(author_user_id)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_recipe_revisions_recipe ON recipe_revisions(recipe_id)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_recipe_rev_servers_slug ON recipe_revision_servers(server_slug)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_recipe_blocks_rev ON recipe_blocks(revision_id)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_recipe_reactions_recipe ON recipe_reactions(recipe_id)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_recipe_reports_status ON recipe_issue_reports(status)');
}

async function ensureUniqueSlug(db, baseSlug, excludeRecipeId = null) {
  let slug = baseSlug || 'recipe';
  let n = 0;
  for (;;) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const row = await dbGet(db, 'SELECT id FROM recipes WHERE slug = ?', [candidate]);
    if (!row || (excludeRecipeId && row.id === excludeRecipeId)) return candidate;
    n += 1;
    if (n > 200) throw new Error('Could not allocate a unique slug');
  }
}

function parseClients(raw) {
  if (Array.isArray(raw)) {
    return raw.map((c) => cleanText(String(c), 40)).filter((c) => COMPATIBLE_CLIENTS.includes(c));
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parseClients(parsed);
    } catch {
      /* ignore */
    }
  }
  return [];
}

function parseServerSlugs(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const slug = cleanText(String(item), 120).toLowerCase();
    if (!slug || seen.has(slug)) continue;
    if (!findMcpServerBySlug(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= MAX_SERVERS) break;
  }
  return out;
}

function parseBlocks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_BLOCKS).map((b, i) => {
    const blockType = cleanText(String(b?.block_type || b?.type || 'instruction'), 20);
    const type = BLOCK_TYPES.has(blockType) ? blockType : 'instruction';
    return {
      sort_order: i,
      block_type: type,
      title: cleanText(String(b?.title || ''), 160),
      body: cleanText(String(b?.body || ''), MAX_BLOCK_BODY),
      language: type === 'instruction' ? '' : cleanText(String(b?.language || ''), 40),
    };
  });
}

function validateRecipePayload(body, { requireBlocks = true } = {}) {
  const errors = [];
  const title = cleanText(body?.title, MAX_TITLE);
  const summary = cleanText(body?.summary, MAX_SUMMARY);
  const useCase = cleanText(body?.use_case, 60);
  const prerequisites = cleanText(body?.prerequisites, MAX_MD);
  const permissions = cleanText(body?.permissions, MAX_MD);
  const expectedResult = cleanText(body?.expected_result, MAX_MD);
  const sampleOutput = cleanText(body?.sample_output, MAX_MD);
  const troubleshooting = cleanText(body?.troubleshooting, MAX_MD);
  const sourceRepoCheck = validateExternalUrl(body?.source_repo_url);
  const lastTestedAt = cleanText(body?.last_tested_at, 32);
  const testedClientVersions = cleanText(body?.tested_client_versions, 400);
  const testedServerVersions = cleanText(body?.tested_server_versions, 400);
  const authorReportsTested = Boolean(body?.author_reports_tested || lastTestedAt);
  const clients = parseClients(body?.compatible_clients);
  const serverSlugs = parseServerSlugs(body?.server_slugs || body?.servers);
  const blocks = parseBlocks(body?.blocks);

  if (title.length < 8) errors.push('Title must be at least 8 characters and focus on an outcome.');
  if (summary.length < 20) errors.push('Summary must be at least 20 characters.');
  if (!USE_CASES.includes(useCase)) errors.push('Pick a valid use-case category.');
  if (!serverSlugs.length) {
    errors.push('Select at least one MCP server from the directory.');
  }
  if (!clients.length) errors.push('Select at least one compatible client (reported, not verified).');
  if (!sourceRepoCheck.ok) errors.push(sourceRepoCheck.error);
  if (requireBlocks) {
    if (!blocks.length) errors.push('Add at least one setup instruction or code block.');
    if (blocks.some((b) => !b.body)) errors.push('Every block needs a body.');
  }
  if (lastTestedAt && !/^\d{4}-\d{2}-\d{2}$/.test(lastTestedAt)) {
    errors.push('Last-tested date must be YYYY-MM-DD when provided.');
  }

  const secretHits = scanPayloadForSecrets([
    title,
    summary,
    prerequisites,
    permissions,
    expectedResult,
    sampleOutput,
    troubleshooting,
    ...blocks.map((b) => b.body),
  ]);
  if (secretHits.length) {
    errors.push(
      `${secretHits[0].message} Automated detection cannot guarantee a submission is secret-free — double-check before submitting.`,
    );
  }

  return {
    errors,
    data: {
      title,
      summary,
      use_case: useCase,
      prerequisites,
      permissions,
      expected_result: expectedResult,
      sample_output: sampleOutput,
      troubleshooting,
      source_repo_url: sourceRepoCheck.url || '',
      compatible_clients: clients,
      last_tested_at: lastTestedAt || null,
      tested_client_versions: testedClientVersions,
      tested_server_versions: testedServerVersions,
      author_reports_tested: authorReportsTested ? 1 : 0,
      server_slugs: serverSlugs,
      blocks,
    },
  };
}

async function insertRevision(db, recipeId, userId, data, moderationStatus, revisionNumber) {
  const result = await dbRun(
    db,
    `INSERT INTO recipe_revisions (
      recipe_id, revision_number, title, summary, use_case, prerequisites, permissions,
      expected_result, sample_output, troubleshooting, source_repo_url, compatible_clients,
      last_tested_at, tested_client_versions, tested_server_versions, author_reports_tested,
      moderation_status, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recipeId,
      revisionNumber,
      data.title,
      data.summary,
      data.use_case,
      data.prerequisites,
      data.permissions,
      data.expected_result,
      data.sample_output,
      data.troubleshooting,
      data.source_repo_url,
      JSON.stringify(data.compatible_clients),
      data.last_tested_at,
      data.tested_client_versions,
      data.tested_server_versions,
      data.author_reports_tested,
      moderationStatus,
      userId,
    ],
  );
  const revisionId = result.lastID;
  for (let i = 0; i < data.server_slugs.length; i += 1) {
    await dbRun(
      db,
      `INSERT INTO recipe_revision_servers (revision_id, server_slug, sort_order) VALUES (?, ?, ?)`,
      [revisionId, data.server_slugs[i], i],
    );
  }
  for (const block of data.blocks) {
    await dbRun(
      db,
      `INSERT INTO recipe_blocks (revision_id, sort_order, block_type, title, body, language)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [revisionId, block.sort_order, block.block_type, block.title, block.body, block.language],
    );
  }
  return revisionId;
}

async function loadRevision(db, revisionId) {
  if (!revisionId) return null;
  const rev = await dbGet(db, 'SELECT * FROM recipe_revisions WHERE id = ?', [revisionId]);
  if (!rev) return null;
  const servers = await dbAll(
    db,
    'SELECT server_slug, sort_order FROM recipe_revision_servers WHERE revision_id = ? ORDER BY sort_order ASC',
    [revisionId],
  );
  const blocks = await dbAll(
    db,
    'SELECT id, sort_order, block_type, title, body, language FROM recipe_blocks WHERE revision_id = ? ORDER BY sort_order ASC',
    [revisionId],
  );
  return {
    ...rev,
    compatible_clients: parseClients(rev.compatible_clients),
    server_slugs: servers.map((s) => s.server_slug),
    servers: servers.map((s) => {
      const meta = findMcpServerBySlug(s.server_slug);
      return {
        slug: s.server_slug,
        name: meta?.name || s.server_slug,
        description: meta?.description || '',
        category: meta?.category || '',
      };
    }),
    blocks,
  };
}

async function getAuthorPublic(db, userId) {
  const user = await dbGet(db, 'SELECT id, name, avatar_url FROM users WHERE id = ?', [userId]);
  if (!user) return null;
  const profile = await dbGet(db, 'SELECT * FROM contributor_profiles WHERE user_id = ?', [userId]);
  return {
    id: user.id,
    name: profile?.display_name || user.name || 'Contributor',
    avatar_url: user.avatar_url || null,
    bio: profile?.bio || '',
    website_url: profile?.website_url || '',
    github_url: profile?.github_url || '',
    twitter_url: profile?.twitter_url || '',
    profile_url: `/contributors/${user.id}`,
  };
}

function presentRevision(rev) {
  if (!rev) return null;
  return {
    id: rev.id,
    revision_number: rev.revision_number,
    title: rev.title,
    summary: rev.summary,
    use_case: rev.use_case,
    prerequisites: rev.prerequisites,
    permissions: rev.permissions,
    expected_result: rev.expected_result,
    sample_output: rev.sample_output,
    troubleshooting: rev.troubleshooting,
    source_repo_url: rev.source_repo_url,
    compatible_clients: rev.compatible_clients,
    last_tested_at: rev.last_tested_at,
    tested_client_versions: rev.tested_client_versions,
    tested_server_versions: rev.tested_server_versions,
    author_reports_tested: Boolean(rev.author_reports_tested),
    moderation_status: rev.moderation_status,
    moderation_feedback: rev.moderation_feedback,
    reviewed_at: rev.reviewed_at,
    created_at: rev.created_at,
    servers: rev.servers,
    server_slugs: rev.server_slugs,
    blocks: rev.blocks,
    html: {
      prerequisites: renderSafeMarkdown(rev.prerequisites),
      permissions: renderSafeMarkdown(rev.permissions),
      expected_result: renderSafeMarkdown(rev.expected_result),
      sample_output: renderSafeMarkdown(rev.sample_output),
      troubleshooting: renderSafeMarkdown(rev.troubleshooting),
      blocks: (rev.blocks || []).map((b) => ({
        ...b,
        body_html:
          b.block_type === 'instruction'
            ? renderSafeMarkdown(b.body)
            : `<pre class="recipe-code"><code class="language-${escapeHtml(b.language || 'text')}">${escapeHtml(b.body)}</code></pre>`,
      })),
    },
  };
}

async function presentRecipe(db, recipe, { revision = null, author = null } = {}) {
  const rev = revision || (await loadRevision(db, recipe.published_revision_id || recipe.pending_revision_id));
  const auth = author || (await getAuthorPublic(db, recipe.author_user_id));
  return {
    id: recipe.id,
    slug: recipe.slug,
    status: recipe.status,
    verified_by_influzer: Boolean(recipe.verified_by_influzer),
    verified_at: recipe.verified_at,
    verification_notes: recipe.verification_notes || '',
    worked_for_me_count: recipe.worked_for_me_count || 0,
    created_at: recipe.created_at,
    updated_at: recipe.updated_at,
    published_at: recipe.published_at,
    published_revision_id: recipe.published_revision_id,
    pending_revision_id: recipe.pending_revision_id,
    author: auth,
    revision: presentRevision(rev),
    url: `/recipes/${recipe.slug}`,
    canonical_url: `${SITE_BASE_URL}/recipes/${recipe.slug}`,
  };
}

async function listPublishedRecipes(db, { q = '', useCase = '', server = '', client = '', limit = 50, offset = 0 } = {}) {
  const rows = await dbAll(
    db,
    `SELECT r.* FROM recipes r
     WHERE r.status = 'published' AND r.published_revision_id IS NOT NULL
     ORDER BY COALESCE(r.published_at, r.updated_at) DESC
     LIMIT 500`,
  );
  const out = [];
  for (const recipe of rows) {
    const rev = await loadRevision(db, recipe.published_revision_id);
    if (!rev) continue;
    if (useCase && rev.use_case !== useCase) continue;
    if (server && !rev.server_slugs.includes(server)) continue;
    if (client && !rev.compatible_clients.includes(client)) continue;
    if (q) {
      const hay = `${rev.title} ${rev.summary} ${rev.use_case} ${rev.server_slugs.join(' ')}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) continue;
    }
    const author = await getAuthorPublic(db, recipe.author_user_id);
    out.push(await presentRecipe(db, recipe, { revision: rev, author }));
  }
  return {
    total: out.length,
    recipes: out.slice(offset, offset + limit),
  };
}

async function getPublishedRecipeBySlug(db, slug) {
  const recipe = await dbGet(
    db,
    `SELECT * FROM recipes WHERE slug = ? AND status = 'published' AND published_revision_id IS NOT NULL`,
    [slug],
  );
  if (!recipe) return null;
  return presentRecipe(db, recipe);
}

async function getRecipeForAuthor(db, recipeId, userId) {
  const recipe = await dbGet(db, 'SELECT * FROM recipes WHERE id = ? AND author_user_id = ?', [
    recipeId,
    userId,
  ]);
  if (!recipe) return null;
  const published = await loadRevision(db, recipe.published_revision_id);
  const pending = await loadRevision(db, recipe.pending_revision_id);
  const workingId =
    recipe.pending_revision_id ||
    (await dbGet(
      db,
      `SELECT id FROM recipe_revisions WHERE recipe_id = ? AND moderation_status = 'draft'
       ORDER BY revision_number DESC LIMIT 1`,
      [recipe.id],
    ))?.id ||
    recipe.published_revision_id;
  const working = await loadRevision(db, workingId);
  return {
    ...(await presentRecipe(db, recipe, { revision: working })),
    published_revision: presentRevision(published),
    pending_revision: presentRevision(pending),
    working_revision: presentRevision(working),
  };
}

async function listAuthorRecipes(db, userId) {
  const rows = await dbAll(
    db,
    `SELECT * FROM recipes WHERE author_user_id = ? ORDER BY updated_at DESC`,
    [userId],
  );
  const out = [];
  for (const recipe of rows) {
    const rev = await loadRevision(
      db,
      recipe.pending_revision_id || recipe.published_revision_id,
    );
    out.push(await presentRecipe(db, recipe, { revision: rev }));
  }
  return out;
}

async function listRecipesForServer(db, serverSlug, limit = 12) {
  const rows = await dbAll(
    db,
    `SELECT DISTINCT r.*
     FROM recipes r
     JOIN recipe_revision_servers s ON s.revision_id = r.published_revision_id
     WHERE r.status = 'published' AND s.server_slug = ?
     ORDER BY COALESCE(r.published_at, r.updated_at) DESC
     LIMIT ?`,
    [serverSlug, limit],
  );
  const out = [];
  for (const recipe of rows) {
    out.push(await presentRecipe(db, recipe));
  }
  return out;
}

async function listPendingForAdmin(db) {
  const rows = await dbAll(
    db,
    `SELECT r.*, rev.id as pending_rev_id, rev.title as pending_title, rev.created_at as submitted_at,
            rev.moderation_status as pending_status, rev.revision_number as pending_revision_number,
            u.name as author_name, u.email as author_email
     FROM recipes r
     JOIN recipe_revisions rev ON rev.id = r.pending_revision_id
     LEFT JOIN users u ON u.id = r.author_user_id
     WHERE r.pending_revision_id IS NOT NULL
       AND rev.moderation_status = 'submitted'
     ORDER BY rev.created_at ASC`,
  );
  return rows;
}

async function listOpenIssueReports(db, limit = 100) {
  return dbAll(
    db,
    `SELECT ir.*, r.slug as recipe_slug, rev.title as recipe_title, u.email as reporter_email, u.name as reporter_name
     FROM recipe_issue_reports ir
     JOIN recipes r ON r.id = ir.recipe_id
     LEFT JOIN recipe_revisions rev ON rev.id = r.published_revision_id
     LEFT JOIN users u ON u.id = ir.user_id
     WHERE ir.status = 'open'
     ORDER BY ir.created_at DESC
     LIMIT ?`,
    [limit],
  );
}

async function createRecipe(db, userId, body, { submit = false } = {}) {
  const { errors, data } = validateRecipePayload(body);
  if (errors.length) {
    const err = new Error(errors[0]);
    err.status = 400;
    err.errors = errors;
    throw err;
  }
  const baseSlug = slugify(data.title);
  const slug = await ensureUniqueSlug(db, baseSlug);
  const created = await dbRun(
    db,
    `INSERT INTO recipes (slug, author_user_id, status, updated_at)
     VALUES (?, ?, ?, ?)`,
    [slug, userId, submit ? 'pending_review' : 'draft', nowIso()],
  );
  const recipeId = created.lastID;
  const revisionId = await insertRevision(
    db,
    recipeId,
    userId,
    data,
    submit ? 'submitted' : 'draft',
    1,
  );
  if (submit) {
    await dbRun(db, 'UPDATE recipes SET pending_revision_id = ?, updated_at = ? WHERE id = ?', [
      revisionId,
      nowIso(),
      recipeId,
    ]);
  } else {
    // Keep draft as pending pointer so author can resume editing this revision
    await dbRun(db, 'UPDATE recipes SET pending_revision_id = ?, updated_at = ? WHERE id = ?', [
      revisionId,
      nowIso(),
      recipeId,
    ]);
  }
  return getRecipeForAuthor(db, recipeId, userId);
}

async function updateRecipeDraft(db, recipeId, userId, body, { submit = false } = {}) {
  const recipe = await dbGet(db, 'SELECT * FROM recipes WHERE id = ?', [recipeId]);
  if (!recipe) {
    const err = new Error('Recipe not found');
    err.status = 404;
    throw err;
  }
  if (recipe.author_user_id !== userId) {
    const err = new Error('Forbidden');
    err.status = 403;
    throw err;
  }
  if (recipe.pending_revision_id) {
    const pending = await dbGet(db, 'SELECT * FROM recipe_revisions WHERE id = ?', [
      recipe.pending_revision_id,
    ]);
    if (pending && pending.moderation_status === 'submitted') {
      const err = new Error('A revision is already awaiting review. Wait for moderation or withdraw it.');
      err.status = 409;
      throw err;
    }
  }

  const { errors, data } = validateRecipePayload(body);
  if (errors.length) {
    const err = new Error(errors[0]);
    err.status = 400;
    err.errors = errors;
    throw err;
  }

  const maxRev = await dbGet(
    db,
    'SELECT MAX(revision_number) as m FROM recipe_revisions WHERE recipe_id = ?',
    [recipeId],
  );
  const nextNum = (maxRev?.m || 0) + 1;

  // If there is an editable draft revision with no published content conflict, reuse it
  let revisionId = null;
  if (recipe.pending_revision_id) {
    const pending = await loadRevision(db, recipe.pending_revision_id);
    if (pending && pending.moderation_status === 'draft') {
      await dbRun(db, 'DELETE FROM recipe_blocks WHERE revision_id = ?', [pending.id]);
      await dbRun(db, 'DELETE FROM recipe_revision_servers WHERE revision_id = ?', [pending.id]);
      await dbRun(
        db,
        `UPDATE recipe_revisions SET
          title=?, summary=?, use_case=?, prerequisites=?, permissions=?,
          expected_result=?, sample_output=?, troubleshooting=?, source_repo_url=?,
          compatible_clients=?, last_tested_at=?, tested_client_versions=?, tested_server_versions=?,
          author_reports_tested=?, moderation_status=?, moderation_feedback=NULL
         WHERE id=?`,
        [
          data.title,
          data.summary,
          data.use_case,
          data.prerequisites,
          data.permissions,
          data.expected_result,
          data.sample_output,
          data.troubleshooting,
          data.source_repo_url,
          JSON.stringify(data.compatible_clients),
          data.last_tested_at,
          data.tested_client_versions,
          data.tested_server_versions,
          data.author_reports_tested,
          submit ? 'submitted' : 'draft',
          pending.id,
        ],
      );
      for (let i = 0; i < data.server_slugs.length; i += 1) {
        await dbRun(
          db,
          `INSERT INTO recipe_revision_servers (revision_id, server_slug, sort_order) VALUES (?, ?, ?)`,
          [pending.id, data.server_slugs[i], i],
        );
      }
      for (const block of data.blocks) {
        await dbRun(
          db,
          `INSERT INTO recipe_blocks (revision_id, sort_order, block_type, title, body, language)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [pending.id, block.sort_order, block.block_type, block.title, block.body, block.language],
        );
      }
      revisionId = pending.id;
    }
  }

  if (!revisionId) {
    revisionId = await insertRevision(
      db,
      recipeId,
      userId,
      data,
      submit ? 'submitted' : 'draft',
      nextNum,
    );
  }

  const newStatus =
    submit
      ? recipe.status === 'published'
        ? 'published'
        : 'pending_review'
      : recipe.status === 'published'
        ? 'published'
        : 'draft';

  await dbRun(
    db,
    `UPDATE recipes SET pending_revision_id = ?, status = ?, updated_at = ? WHERE id = ?`,
    [revisionId, newStatus, nowIso(), recipeId],
  );

  // Optionally refresh slug only before first publish
  if (!recipe.published_revision_id && data.title) {
    const newSlug = await ensureUniqueSlug(db, slugify(data.title), recipeId);
    await dbRun(db, 'UPDATE recipes SET slug = ? WHERE id = ?', [newSlug, recipeId]);
  }

  return getRecipeForAuthor(db, recipeId, userId);
}

async function withdrawPending(db, recipeId, userId) {
  const recipe = await dbGet(db, 'SELECT * FROM recipes WHERE id = ? AND author_user_id = ?', [
    recipeId,
    userId,
  ]);
  if (!recipe) {
    const err = new Error('Recipe not found');
    err.status = 404;
    throw err;
  }
  if (!recipe.pending_revision_id) return getRecipeForAuthor(db, recipeId, userId);
  await dbRun(
    db,
    `UPDATE recipe_revisions SET moderation_status = 'draft' WHERE id = ?`,
    [recipe.pending_revision_id],
  );
  const status = recipe.published_revision_id ? 'published' : 'draft';
  await dbRun(db, 'UPDATE recipes SET status = ?, updated_at = ? WHERE id = ?', [
    status,
    nowIso(),
    recipeId,
  ]);
  return getRecipeForAuthor(db, recipeId, userId);
}

async function approvePending(db, recipeId, adminUserId) {
  const recipe = await dbGet(db, 'SELECT * FROM recipes WHERE id = ?', [recipeId]);
  if (!recipe?.pending_revision_id) {
    const err = new Error('No pending revision');
    err.status = 400;
    throw err;
  }
  const pending = await dbGet(db, 'SELECT * FROM recipe_revisions WHERE id = ?', [
    recipe.pending_revision_id,
  ]);
  if (!pending || pending.moderation_status !== 'submitted') {
    const err = new Error('Pending revision is not awaiting review');
    err.status = 400;
    throw err;
  }
  await dbRun(
    db,
    `UPDATE recipe_revisions SET moderation_status = 'approved', reviewed_by_user_id = ?, reviewed_at = ?, moderation_feedback = NULL WHERE id = ?`,
    [adminUserId, nowIso(), pending.id],
  );
  await dbRun(
    db,
    `UPDATE recipes SET
      published_revision_id = ?,
      pending_revision_id = NULL,
      status = 'published',
      published_at = COALESCE(published_at, ?),
      updated_at = ?
     WHERE id = ?`,
    [pending.id, nowIso(), nowIso(), recipeId],
  );
  return dbGet(db, 'SELECT * FROM recipes WHERE id = ?', [recipeId]);
}

async function rejectPending(db, recipeId, adminUserId, feedback) {
  const recipe = await dbGet(db, 'SELECT * FROM recipes WHERE id = ?', [recipeId]);
  if (!recipe?.pending_revision_id) {
    const err = new Error('No pending revision');
    err.status = 400;
    throw err;
  }
  const note = cleanText(feedback, 2000) || 'Needs changes before publication.';
  await dbRun(
    db,
    `UPDATE recipe_revisions SET moderation_status = 'rejected', reviewed_by_user_id = ?, reviewed_at = ?, moderation_feedback = ? WHERE id = ?`,
    [adminUserId, nowIso(), note, recipe.pending_revision_id],
  );
  const status = recipe.published_revision_id ? 'published' : 'rejected';
  // Keep pending_revision_id so author can edit the rejected draft
  await dbRun(
    db,
    `UPDATE recipe_revisions SET moderation_status = 'draft' WHERE id = ?`,
    [recipe.pending_revision_id],
  );
  await dbRun(db, 'UPDATE recipes SET status = ?, updated_at = ? WHERE id = ?', [
    status,
    nowIso(),
    recipeId,
  ]);
  // Store feedback on the revision before flipping to draft — re-apply
  await dbRun(
    db,
    `UPDATE recipe_revisions SET moderation_feedback = ? WHERE id = ?`,
    [note, recipe.pending_revision_id],
  );
  return dbGet(db, 'SELECT * FROM recipes WHERE id = ?', [recipeId]);
}

async function unpublishRecipe(db, recipeId, adminUserId) {
  const recipe = await dbGet(db, 'SELECT * FROM recipes WHERE id = ?', [recipeId]);
  if (!recipe) {
    const err = new Error('Recipe not found');
    err.status = 404;
    throw err;
  }
  await dbRun(
    db,
    `UPDATE recipes SET status = 'unpublished', updated_at = ? WHERE id = ?`,
    [nowIso(), recipeId],
  );
  await dbRun(
    db,
    `UPDATE recipes SET verification_notes = COALESCE(verification_notes, '') || ? WHERE id = ?`,
    [`\n[unpublished by admin ${adminUserId} at ${nowIso()}]`, recipeId],
  );
  return dbGet(db, 'SELECT * FROM recipes WHERE id = ?', [recipeId]);
}

async function setVerification(db, recipeId, adminUserId, { verified, notes } = {}) {
  const recipe = await dbGet(db, 'SELECT * FROM recipes WHERE id = ?', [recipeId]);
  if (!recipe) {
    const err = new Error('Recipe not found');
    err.status = 404;
    throw err;
  }
  if (verified) {
    await dbRun(
      db,
      `UPDATE recipes SET verified_by_influzer = 1, verified_at = ?, verified_by_user_id = ?, verification_notes = ?, updated_at = ? WHERE id = ?`,
      [nowIso(), adminUserId, cleanText(notes, 2000), nowIso(), recipeId],
    );
  } else {
    await dbRun(
      db,
      `UPDATE recipes SET verified_by_influzer = 0, verified_at = NULL, verified_by_user_id = NULL, verification_notes = ?, updated_at = ? WHERE id = ?`,
      [cleanText(notes, 2000), nowIso(), recipeId],
    );
  }
  return dbGet(db, 'SELECT * FROM recipes WHERE id = ?', [recipeId]);
}

async function toggleWorkedReaction(db, recipeId, userId) {
  const recipe = await dbGet(
    db,
    `SELECT * FROM recipes WHERE id = ? AND status = 'published'`,
    [recipeId],
  );
  if (!recipe) {
    const err = new Error('Recipe not found');
    err.status = 404;
    throw err;
  }
  const existing = await dbGet(
    db,
    'SELECT id FROM recipe_reactions WHERE recipe_id = ? AND user_id = ?',
    [recipeId, userId],
  );
  if (existing) {
    await dbRun(db, 'DELETE FROM recipe_reactions WHERE id = ?', [existing.id]);
  } else {
    await dbRun(
      db,
      `INSERT INTO recipe_reactions (recipe_id, user_id, reaction) VALUES (?, ?, 'worked')`,
      [recipeId, userId],
    );
  }
  const countRow = await dbGet(
    db,
    'SELECT COUNT(*) as c FROM recipe_reactions WHERE recipe_id = ?',
    [recipeId],
  );
  await dbRun(db, 'UPDATE recipes SET worked_for_me_count = ? WHERE id = ?', [
    countRow?.c || 0,
    recipeId,
  ]);
  const userHas = await dbGet(
    db,
    'SELECT id FROM recipe_reactions WHERE recipe_id = ? AND user_id = ?',
    [recipeId, userId],
  );
  return { count: countRow?.c || 0, reacted: Boolean(userHas) };
}

async function createIssueReport(db, recipeId, userId, reason, details) {
  const recipe = await dbGet(
    db,
    `SELECT * FROM recipes WHERE id = ? AND status = 'published'`,
    [recipeId],
  );
  if (!recipe) {
    const err = new Error('Recipe not found');
    err.status = 404;
    throw err;
  }
  if (!ISSUE_REASONS.some((r) => r.id === reason)) {
    const err = new Error('Invalid report reason');
    err.status = 400;
    throw err;
  }
  const result = await dbRun(
    db,
    `INSERT INTO recipe_issue_reports (recipe_id, user_id, reason, details) VALUES (?, ?, ?, ?)`,
    [recipeId, userId, reason, cleanText(details, 2000)],
  );
  return { id: result.lastID };
}

async function upsertContributorProfile(db, userId, body) {
  const displayName = cleanText(body?.display_name, 80);
  const bio = cleanText(body?.bio, 600);
  const website = validateExternalUrl(body?.website_url);
  const github = validateExternalUrl(body?.github_url);
  const twitter = validateExternalUrl(body?.twitter_url);
  if (!website.ok || !github.ok || !twitter.ok) {
    const err = new Error('External links must use http:// or https://');
    err.status = 400;
    throw err;
  }
  const existing = await dbGet(db, 'SELECT user_id FROM contributor_profiles WHERE user_id = ?', [
    userId,
  ]);
  if (existing) {
    await dbRun(
      db,
      `UPDATE contributor_profiles SET display_name=?, bio=?, website_url=?, github_url=?, twitter_url=?, updated_at=? WHERE user_id=?`,
      [displayName, bio, website.url, github.url, twitter.url, nowIso(), userId],
    );
  } else {
    await dbRun(
      db,
      `INSERT INTO contributor_profiles (user_id, display_name, bio, website_url, github_url, twitter_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, displayName, bio, website.url, github.url, twitter.url],
    );
  }
  return getAuthorPublic(db, userId);
}

async function getContributorPage(db, userId) {
  const author = await getAuthorPublic(db, userId);
  if (!author) return null;
  const recipes = await dbAll(
    db,
    `SELECT * FROM recipes WHERE author_user_id = ? AND status = 'published' AND published_revision_id IS NOT NULL
     ORDER BY COALESCE(published_at, updated_at) DESC`,
    [userId],
  );
  const presented = [];
  for (const recipe of recipes) {
    presented.push(await presentRecipe(db, recipe));
  }
  return { author, recipes: presented };
}

async function getSitemapRecipeEntries(db) {
  const rows = await dbAll(
    db,
    `SELECT r.slug, COALESCE(r.published_at, r.updated_at) as lastmod
     FROM recipes r
     WHERE r.status = 'published' AND r.published_revision_id IS NOT NULL`,
  );
  return rows.map((r) => ({
    loc: `${SITE_BASE_URL}/recipes/${r.slug}`,
    lastmod: String(r.lastmod || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    changefreq: 'weekly',
    priority: '0.7',
  }));
}

async function checkRate(db, userId, ip, endpoint, limit) {
  const identifier = userId ? `user:${userId}` : `ip:${ip}`;
  const count = await db.getIPUsageCountForEndpoint(identifier, endpoint, 60 * 60 * 1000);
  if (count >= limit) return false;
  await db.logUsage(userId || null, identifier, endpoint);
  return true;
}

function recipePageLocals(extra = {}) {
  return {
    useCases: USE_CASES,
    compatibleClients: COMPATIBLE_CLIENTS,
    issueReasons: ISSUE_REASONS,
    assetVersion: process.env.ASSET_VERSION || String(Date.now()).slice(0, 8),
    ...extra,
  };
}

function registerMcpRecipeRoutes(app) {
  // —— Public pages ——
  app.get('/recipes', async (req, res) => {
    try {
      const db = await getDatabase();
      const q = cleanText(String(req.query.q || ''), 120);
      const useCase = cleanText(String(req.query.use_case || ''), 60);
      const server = cleanText(String(req.query.server || ''), 120).toLowerCase();
      const client = cleanText(String(req.query.client || ''), 40);
      const result = await listPublishedRecipes(db, { q, useCase, server, client, limit: 100 });
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.render(
        'recipes-index',
        recipePageLocals({
          pageTitle: 'MCP Recipes',
          metaDescription:
            'Practical, community-shared examples for accomplishing real tasks with one or more MCP servers.',
          canonicalUrl: `${SITE_BASE_URL}/recipes`,
          recipes: result.recipes,
          total: result.total,
          filters: { q, use_case: useCase, server, client },
          loadError: null,
        }),
      );
    } catch (error) {
      console.error('Recipes index error:', error);
      res.status(500).render(
        'recipes-index',
        recipePageLocals({
          pageTitle: 'MCP Recipes',
          metaDescription: 'Practical MCP recipes from the Influzer community.',
          canonicalUrl: `${SITE_BASE_URL}/recipes`,
          recipes: [],
          total: 0,
          filters: { q: '', use_case: '', server: '', client: '' },
          loadError: 'We could not load recipes right now. Please try again shortly.',
        }),
      );
    }
  });

  app.get('/recipes/new', requireAuthPage, async (req, res) => {
    const prefillServer = cleanText(String(req.query.server || ''), 120).toLowerCase();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.render(
      'recipe-edit',
      recipePageLocals({
        pageTitle: 'Share a recipe',
        metaDescription: 'Submit an MCP recipe for review on Influzer.',
        canonicalUrl: `${SITE_BASE_URL}/recipes/new`,
        noindex: true,
        mode: 'create',
        recipe: null,
        prefillServer: findMcpServerBySlug(prefillServer) ? prefillServer : '',
        formError: null,
      }),
    );
  });

  app.get('/recipes/mine', requireAuthPage, async (req, res) => {
    const db = await getDatabase();
    const recipes = await listAuthorRecipes(db, req.user.id);
    const profile = await getAuthorPublic(db, req.user.id);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.render(
      'recipes-mine',
      recipePageLocals({
        pageTitle: 'My recipes',
        metaDescription: 'Your MCP recipe drafts and submissions.',
        canonicalUrl: `${SITE_BASE_URL}/recipes/mine`,
        noindex: true,
        recipes,
        profile,
      }),
    );
  });

  app.get('/recipes/:slug/edit', requireAuthPage, async (req, res) => {
    const db = await getDatabase();
    const recipeRow = await dbGet(db, 'SELECT * FROM recipes WHERE slug = ?', [req.params.slug]);
    if (!recipeRow || recipeRow.author_user_id !== req.user.id) {
      return res.status(404).render('404', { title: 'Recipe Not Found' });
    }
    const recipe = await getRecipeForAuthor(db, recipeRow.id, req.user.id);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.render(
      'recipe-edit',
      recipePageLocals({
        pageTitle: `Edit: ${recipe.revision?.title || recipe.slug}`,
        metaDescription: 'Edit your MCP recipe.',
        canonicalUrl: `${SITE_BASE_URL}/recipes/${recipe.slug}/edit`,
        noindex: true,
        mode: 'edit',
        recipe,
        prefillServer: '',
        formError: null,
      }),
    );
  });

  app.get('/recipes/:slug/preview', requireAuthPage, async (req, res) => {
    const db = await getDatabase();
    const recipeRow = await dbGet(db, 'SELECT * FROM recipes WHERE slug = ?', [req.params.slug]);
    if (!recipeRow) return res.status(404).render('404', { title: 'Recipe Not Found' });
    const isAdmin = Boolean(req.user?.is_admin);
    if (recipeRow.author_user_id !== req.user.id && !isAdmin) {
      return res.status(404).render('404', { title: 'Recipe Not Found' });
    }
    const revisionId =
      recipeRow.pending_revision_id || recipeRow.published_revision_id;
    const revision = await loadRevision(db, revisionId);
    const presented = await presentRecipe(db, recipeRow, { revision });
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.render(
      'recipe-detail',
      recipePageLocals({
        pageTitle: presented.revision?.title || 'Recipe preview',
        metaDescription: presented.revision?.summary || '',
        canonicalUrl: presented.canonical_url,
        noindex: true,
        recipe: presented,
        isPreview: true,
        userReaction: false,
        currentUser: req.user,
      }),
    );
  });

  app.get('/recipes/:slug', async (req, res) => {
    try {
      const db = await getDatabase();
      const recipe = await getPublishedRecipeBySlug(db, req.params.slug);
      if (!recipe) {
        return res.status(404).render('404', { title: 'Recipe Not Found' });
      }
      const user = await getOptionalAuthUser(req);
      let userReaction = false;
      if (user) {
        const row = await dbGet(
          db,
          'SELECT id FROM recipe_reactions WHERE recipe_id = ? AND user_id = ?',
          [recipe.id, user.id],
        );
        userReaction = Boolean(row);
      }
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: recipe.revision.title,
        description: recipe.revision.summary,
        datePublished: recipe.published_at,
        dateModified: recipe.updated_at,
        author: {
          '@type': 'Person',
          name: recipe.author?.name || 'Contributor',
          url: `${SITE_BASE_URL}${recipe.author?.profile_url || ''}`,
        },
        url: recipe.canonical_url,
        publisher: {
          '@type': 'Organization',
          name: 'Influzer.ai',
          url: SITE_BASE_URL,
        },
      };
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.render(
        'recipe-detail',
        recipePageLocals({
          pageTitle: `${recipe.revision.title} — MCP Recipe`,
          metaDescription: recipe.revision.summary,
          canonicalUrl: recipe.canonical_url,
          recipe,
          isPreview: false,
          userReaction,
          currentUser: user,
          jsonLd,
        }),
      );
    } catch (error) {
      console.error('Recipe detail error:', error);
      return res.status(500).render('404', { title: 'Recipe Unavailable' });
    }
  });

  app.get('/contributors/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(404).render('404', { title: 'Contributor Not Found' });
    }
    const db = await getDatabase();
    const page = await getContributorPage(db, userId);
    if (!page || (!page.recipes.length && !(await dbGet(db, 'SELECT id FROM users WHERE id = ?', [userId])))) {
      return res.status(404).render('404', { title: 'Contributor Not Found' });
    }
    // Only show public page if they have published recipes or a profile
    if (!page.recipes.length) {
      const profile = await dbGet(db, 'SELECT user_id FROM contributor_profiles WHERE user_id = ?', [
        userId,
      ]);
      if (!profile) {
        return res.status(404).render('404', { title: 'Contributor Not Found' });
      }
    }
    res.render(
      'contributor',
      recipePageLocals({
        pageTitle: `${page.author.name} — MCP contributor`,
        metaDescription: page.author.bio || `Recipes by ${page.author.name} on Influzer.`,
        canonicalUrl: `${SITE_BASE_URL}/contributors/${userId}`,
        contributor: page.author,
        recipes: page.recipes,
      }),
    );
  });

  // —— JSON APIs ——
  app.get('/api/recipes', async (req, res) => {
    try {
      const db = await getDatabase();
      const result = await listPublishedRecipes(db, {
        q: cleanText(String(req.query.q || ''), 120),
        useCase: cleanText(String(req.query.use_case || ''), 60),
        server: cleanText(String(req.query.server || ''), 120).toLowerCase(),
        client: cleanText(String(req.query.client || ''), 40),
        limit: Math.min(100, parseInt(req.query.limit, 10) || 50),
        offset: Math.max(0, parseInt(req.query.offset, 10) || 0),
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: clientErrorMessage(error, 'Request failed') });
    }
  });

  app.get('/api/recipes/servers/search', requireAuth, async (req, res) => {
    try {
      const q = cleanText(String(req.query.q || ''), 80);
      if (q.length < 1) return res.json({ results: [] });
      const found = searchMcpServers({ q, scope: 'all', limit: 12 });
      const results = (found.servers || []).map((s) => ({
        slug: s.slug,
        name: s.name,
        description: s.description,
        category: s.category,
      }));
      res.json({ results });
    } catch (error) {
      res.status(500).json({ error: clientErrorMessage(error, 'Request failed') });
    }
  });

  app.post('/api/recipes', requireAuth, async (req, res) => {
    try {
      const db = await getDatabase();
      const ip = getClientIp(req);
      if (!(await checkRate(db, req.user.id, ip, 'recipe-create', RATE_CREATE_PER_HOUR))) {
        return res.status(429).json({ error: 'Too many recipe saves. Try again later.' });
      }
      const submit = Boolean(req.body?.submit);
      const recipe = await createRecipe(db, req.user.id, req.body, { submit });
      res.status(201).json({ recipe, submitted: submit });
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({
        error: error.message || 'Request failed',
        errors: error.errors || undefined,
      });
    }
  });

  app.put('/api/recipes/profile', requireAuth, async (req, res) => {
    try {
      const db = await getDatabase();
      const profile = await upsertContributorProfile(db, req.user.id, req.body);
      res.json({ profile });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || 'Request failed' });
    }
  });

  app.put('/api/recipes/:id', requireAuth, async (req, res) => {
    try {
      const db = await getDatabase();
      const id = parseInt(req.params.id, 10);
      if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
      const ip = getClientIp(req);
      if (!(await checkRate(db, req.user.id, ip, 'recipe-update', RATE_CREATE_PER_HOUR))) {
        return res.status(429).json({ error: 'Too many recipe saves. Try again later.' });
      }
      const submit = Boolean(req.body?.submit);
      const recipe = await updateRecipeDraft(db, id, req.user.id, req.body, { submit });
      res.json({ recipe, submitted: submit });
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({
        error: error.message || 'Request failed',
        errors: error.errors || undefined,
      });
    }
  });

  app.post('/api/recipes/:id/withdraw', requireAuth, async (req, res) => {
    try {
      const db = await getDatabase();
      const id = parseInt(req.params.id, 10);
      const recipe = await withdrawPending(db, id, req.user.id);
      res.json({ recipe });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || 'Request failed' });
    }
  });

  app.post('/api/recipes/:id/reactions', requireAuth, async (req, res) => {
    try {
      const db = await getDatabase();
      const id = parseInt(req.params.id, 10);
      const ip = getClientIp(req);
      if (!(await checkRate(db, req.user.id, ip, 'recipe-react', RATE_REACT_PER_HOUR))) {
        return res.status(429).json({ error: 'Too many reactions. Try again later.' });
      }
      const result = await toggleWorkedReaction(db, id, req.user.id);
      res.json(result);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || 'Request failed' });
    }
  });

  app.post('/api/recipes/:id/reports', requireAuth, async (req, res) => {
    try {
      const db = await getDatabase();
      const id = parseInt(req.params.id, 10);
      const ip = getClientIp(req);
      if (!(await checkRate(db, req.user.id, ip, 'recipe-report', RATE_REPORT_PER_HOUR))) {
        return res.status(429).json({ error: 'Too many reports. Try again later.' });
      }
      const reason = cleanText(String(req.body?.reason || ''), 40);
      const details = cleanText(String(req.body?.details || ''), 2000);
      const result = await createIssueReport(db, id, req.user.id, reason, details);
      res.status(201).json(result);
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || 'Request failed' });
    }
  });

  // —— Admin APIs ——
  app.get('/admin/api/recipes/pending', requireAuth, requireAdmin, async (req, res) => {
    try {
      const db = await getDatabase();
      const pending = await listPendingForAdmin(db);
      const reports = await listOpenIssueReports(db);
      res.json({ pending, reports });
    } catch (error) {
      res.status(500).json({ error: clientErrorMessage(error, 'Request failed') });
    }
  });

  app.get('/admin/api/recipes/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const db = await getDatabase();
      const id = parseInt(req.params.id, 10);
      const recipe = await dbGet(db, 'SELECT * FROM recipes WHERE id = ?', [id]);
      if (!recipe) return res.status(404).json({ error: 'Not found' });
      const published = presentRevision(await loadRevision(db, recipe.published_revision_id));
      const pending = presentRevision(await loadRevision(db, recipe.pending_revision_id));
      const author = await getAuthorPublic(db, recipe.author_user_id);
      res.json({ recipe, published, pending, author });
    } catch (error) {
      res.status(500).json({ error: clientErrorMessage(error, 'Request failed') });
    }
  });

  app.post('/admin/api/recipes/:id/approve', requireAuth, requireAdmin, async (req, res) => {
    try {
      const db = await getDatabase();
      const id = parseInt(req.params.id, 10);
      const recipe = await approvePending(db, id, req.user.id);
      res.json({ success: true, recipe });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || 'Request failed' });
    }
  });

  app.post('/admin/api/recipes/:id/reject', requireAuth, requireAdmin, async (req, res) => {
    try {
      const db = await getDatabase();
      const id = parseInt(req.params.id, 10);
      const recipe = await rejectPending(db, id, req.user.id, req.body?.feedback);
      res.json({ success: true, recipe });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || 'Request failed' });
    }
  });

  app.post('/admin/api/recipes/:id/unpublish', requireAuth, requireAdmin, async (req, res) => {
    try {
      const db = await getDatabase();
      const id = parseInt(req.params.id, 10);
      const recipe = await unpublishRecipe(db, id, req.user.id);
      res.json({ success: true, recipe });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || 'Request failed' });
    }
  });

  app.post('/admin/api/recipes/:id/verify', requireAuth, requireAdmin, async (req, res) => {
    try {
      const db = await getDatabase();
      const id = parseInt(req.params.id, 10);
      const recipe = await setVerification(db, id, req.user.id, {
        verified: Boolean(req.body?.verified),
        notes: req.body?.notes,
      });
      res.json({ success: true, recipe });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || 'Request failed' });
    }
  });

  app.post('/admin/api/recipes/reports/:id/resolve', requireAuth, requireAdmin, async (req, res) => {
    try {
      const db = await getDatabase();
      const id = parseInt(req.params.id, 10);
      const status = req.body?.status === 'dismissed' ? 'dismissed' : 'resolved';
      const result = await dbRun(
        db,
        `UPDATE recipe_issue_reports SET status = ?, resolved_at = ?, resolved_by_user_id = ? WHERE id = ?`,
        [status, nowIso(), req.user.id, id],
      );
      if (!result.changes) return res.status(404).json({ error: 'Report not found' });
      res.json({ success: true, id, status });
    } catch (error) {
      res.status(500).json({ error: clientErrorMessage(error, 'Request failed') });
    }
  });
}

async function initializeMcpRecipeService(app) {
  const db = await getDatabase();
  await initializeRecipeTables(db);
  registerMcpRecipeRoutes(app);
  console.log('✅ MCP Recipes service initialized');
}

module.exports = {
  initializeMcpRecipeService,
  initializeRecipeTables,
  registerMcpRecipeRoutes,
  validateRecipePayload,
  listPublishedRecipes,
  listRecipesForServer,
  getPublishedRecipeBySlug,
  getSitemapRecipeEntries,
  createRecipe,
  updateRecipeDraft,
  approvePending,
  rejectPending,
  unpublishRecipe,
  setVerification,
  toggleWorkedReaction,
  createIssueReport,
  getRecipeForAuthor,
  listPendingForAdmin,
  presentRecipe,
  loadRevision,
  USE_CASES,
  COMPATIBLE_CLIENTS,
  ISSUE_REASONS,
  // exposed for tests
  _internals: {
    ensureUniqueSlug,
    insertRevision,
    parseClients,
    parseServerSlugs,
    dbRun,
    dbGet,
    dbAll,
  },
};
