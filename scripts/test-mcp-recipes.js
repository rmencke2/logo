'use strict';

/**
 * MCP Recipes MVP tests — authz, moderation visibility, revisions,
 * safe rendering, validation, reaction dedupe, server relationships.
 * Uses an isolated temp SQLite DB (never production content).
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const tmpDb = path.join(
  os.tmpdir(),
  `mcp-recipes-test-${process.pid}-${crypto.randomBytes(4).toString('hex')}.db`,
);
process.env.DB_PATH = tmpDb;

// Reset module cache so database.js picks up DB_PATH
delete require.cache[require.resolve('../database')];

const { getDatabase } = require('../database');
const {
  initializeRecipeTables,
  validateRecipePayload,
  createRecipe,
  updateRecipeDraft,
  approvePending,
  rejectPending,
  unpublishRecipe,
  setVerification,
  toggleWorkedReaction,
  createIssueReport,
  listPublishedRecipes,
  getPublishedRecipeBySlug,
  listRecipesForServer,
  getRecipeForAuthor,
  listPendingForAdmin,
  getSitemapRecipeEntries,
} = require('../services/mcpRecipeService');
const {
  renderSafeMarkdown,
  detectSecrets,
  scanPayloadForSecrets,
  validateExternalUrl,
} = require('../services/mcpRecipeMarkdown');
const { findMcpServerBySlug, getTop100McpServers } = require('../services/mcpDirectoryService');

function pickServerSlugs(n = 2) {
  const top = getTop100McpServers();
  const slugs = [];
  for (const s of top) {
    if (findMcpServerBySlug(s.slug)) slugs.push(s.slug);
    if (slugs.length >= n) break;
  }
  assert.ok(slugs.length >= 1, 'need at least one catalog server for fixtures');
  return slugs;
}

function validPayload(overrides = {}) {
  const servers = pickServerSlugs(2);
  return {
    title: 'Create a weekly engineering update with Firecrawl and Postgres',
    summary:
      'Pull recent docs with Firecrawl, store notes in Postgres, and draft a weekly update for your team.',
    use_case: 'Engineering',
    prerequisites: '- MCP clients configured\n- Read access to docs',
    permissions: 'Use YOUR_API_KEY placeholder — never paste real secrets.',
    expected_result: 'A drafted weekly update summary.',
    sample_output: '## Week of …',
    troubleshooting: 'If tools/list fails, check the remote URL.',
    source_repo_url: 'https://example.com/recipe-source',
    compatible_clients: ['Cursor', 'Claude Desktop'],
    last_tested_at: '2026-10-01',
    author_reports_tested: true,
    tested_client_versions: 'Cursor 1.0',
    tested_server_versions: '',
    server_slugs: servers,
    blocks: [
      {
        block_type: 'instruction',
        title: 'Connect the servers',
        body: 'Add both MCP servers in your client settings.',
      },
      {
        block_type: 'prompt',
        title: 'Ask the agent',
        body: 'Summarize this week’s engineering changes.',
        language: 'markdown',
      },
    ],
    ...overrides,
  };
}

async function createUser(db, { email, isAdmin = false, name = 'Test User' }) {
  const result = await new Promise((resolve, reject) => {
    db.db.run(
      `INSERT INTO users (email, password_hash, provider, name, email_verified, is_admin)
       VALUES (?, ?, 'local', ?, 1, ?)`,
      [email, 'x', name, isAdmin ? 1 : 0],
      function onRun(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      },
    );
  });
  return result;
}

async function main() {
  const db = await getDatabase();
  await initializeRecipeTables(db);

  // —— Safe markdown & secrets ——
  const html = renderSafeMarkdown('Hello **world**\n\n[link](https://example.com)\n\n<script>alert(1)</script>');
  assert.match(html, /<strong>world<\/strong>/);
  assert.match(html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);

  const badLink = renderSafeMarkdown('[x](javascript:alert(1))');
  assert.doesNotMatch(badLink, /javascript:/);

  assert.ok(detectSecrets('token ghp_abcdefghijklmnopqrstuvwxyz123456').length);
  assert.ok(scanPayloadForSecrets(['password = "supersecretvalue"']).length);
  assert.equal(validateExternalUrl('ftp://evil').ok, false);
  assert.equal(validateExternalUrl('https://ok.example').ok, true);

  const secretValidation = validateRecipePayload(
    validPayload({
      blocks: [{ block_type: 'code', body: 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz', language: 'bash' }],
    }),
  );
  assert.ok(secretValidation.errors.some((e) => /secret|key|credential/i.test(e)));

  // —— Ownership / create / submit ——
  const authorId = await createUser(db, { email: 'author@example.com', name: 'Author' });
  const otherId = await createUser(db, { email: 'other@example.com', name: 'Other' });
  const adminId = await createUser(db, { email: 'admin@example.com', name: 'Admin', isAdmin: true });

  const created = await createRecipe(db, authorId, validPayload(), { submit: true });
  assert.equal(created.status, 'pending_review');
  assert.ok(created.pending_revision_id);
  assert.equal(created.published_revision_id, null);

  const publicBefore = await listPublishedRecipes(db);
  assert.equal(publicBefore.total, 0);
  assert.equal(await getPublishedRecipeBySlug(db, created.slug), null);

  const sitemapBefore = await getSitemapRecipeEntries(db);
  assert.equal(sitemapBefore.length, 0);

  // Other user cannot edit
  await assert.rejects(
    () => updateRecipeDraft(db, created.id, otherId, validPayload(), { submit: false }),
    (err) => err.status === 403,
  );

  // —— Approve ——
  await approvePending(db, created.id, adminId);
  const published = await getPublishedRecipeBySlug(db, created.slug);
  assert.ok(published);
  assert.equal(published.status, 'published');
  assert.equal(published.verified_by_influzer, false);
  assert.ok(published.revision.author_reports_tested);
  assert.ok(published.revision.servers.length >= 1);

  const listed = await listPublishedRecipes(db);
  assert.equal(listed.total, 1);

  const sitemapAfter = await getSitemapRecipeEntries(db);
  assert.equal(sitemapAfter.length, 1);
  assert.match(sitemapAfter[0].loc, /\/recipes\//);

  const serverSlug = published.revision.server_slugs[0];
  const forServer = await listRecipesForServer(db, serverSlug);
  assert.ok(forServer.some((r) => r.slug === created.slug));

  // —— Edit while published stays live ——
  const editTitle = 'Create a weekly engineering update (revised)';
  await updateRecipeDraft(
    db,
    created.id,
    authorId,
    validPayload({ title: editTitle }),
    { submit: true },
  );
  const duringReview = await getPublishedRecipeBySlug(db, created.slug);
  assert.ok(duringReview);
  assert.notEqual(duringReview.revision.title, editTitle);
  assert.match(duringReview.revision.title, /weekly engineering update/i);

  const pendingQueue = await listPendingForAdmin(db);
  assert.ok(pendingQueue.some((r) => r.id === created.id));

  await approvePending(db, created.id, adminId);
  const afterEdit = await getPublishedRecipeBySlug(db, created.slug);
  assert.equal(afterEdit.revision.title, editTitle);

  // —— Reject keeps published ——
  await updateRecipeDraft(
    db,
    created.id,
    authorId,
    validPayload({ title: 'Bad edit that should be rejected for review' }),
    { submit: true },
  );
  await rejectPending(db, created.id, adminId, 'Please clarify permissions.');
  const afterReject = await getPublishedRecipeBySlug(db, created.slug);
  assert.equal(afterReject.revision.title, editTitle);
  const authorView = await getRecipeForAuthor(db, created.id, authorId);
  assert.match(authorView.working_revision.moderation_feedback || '', /clarify permissions/i);

  // —— Verification separate from publish ——
  await setVerification(db, created.id, adminId, { verified: true, notes: 'Checked steps' });
  const verified = await getPublishedRecipeBySlug(db, created.slug);
  assert.equal(verified.verified_by_influzer, true);

  // —— Reactions dedupe ——
  const r1 = await toggleWorkedReaction(db, created.id, authorId);
  assert.equal(r1.reacted, true);
  assert.equal(r1.count, 1);
  const r2 = await toggleWorkedReaction(db, created.id, authorId);
  assert.equal(r2.reacted, false);
  assert.equal(r2.count, 0);
  await toggleWorkedReaction(db, created.id, authorId);
  await toggleWorkedReaction(db, created.id, otherId);
  const r3 = await toggleWorkedReaction(db, created.id, authorId);
  // author toggled off then... wait we toggled on, other on, author off?
  // sequence: on(author), off(author), on(author), on(other), off(author) => count 1 (other)
  assert.equal(r3.count, 1);
  assert.equal(r3.reacted, false);

  // —— Issue report ——
  const report = await createIssueReport(db, created.id, otherId, 'outdated', 'Steps 2 is stale');
  assert.ok(report.id);

  // —— Unpublish hides from public ——
  await unpublishRecipe(db, created.id, adminId);
  assert.equal(await getPublishedRecipeBySlug(db, created.slug), null);
  const listedGone = await listPublishedRecipes(db);
  assert.equal(listedGone.total, 0);

  // Draft never public
  const draft = await createRecipe(db, authorId, validPayload({ title: 'Draft only recipe for local fixtures' }), {
    submit: false,
  });
  assert.equal(draft.status, 'draft');
  assert.equal(await getPublishedRecipeBySlug(db, draft.slug), null);

  console.log('MCP Recipes tests passed');
}

main()
  .then(async () => {
    try {
      const db = await getDatabase();
      await new Promise((resolve) => db.db.close(() => resolve()));
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(tmpDb);
    } catch {
      /* ignore */
    }
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    try {
      fs.unlinkSync(tmpDb);
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
