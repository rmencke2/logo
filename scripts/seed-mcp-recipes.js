#!/usr/bin/env node
'use strict';

/**
 * Seed Influzer starter MCP recipes (idempotent by slug).
 *
 * These are editorial starter guides — not community submissions and not
 * "Verified by Influzer" unless an admin separately marks verification.
 *
 * Usage:
 *   node scripts/seed-mcp-recipes.js
 *   node scripts/seed-mcp-recipes.js --dry-run
 *   node scripts/seed-mcp-recipes.js --force   # replace existing starter recipes
 */

const { getDatabase } = require('../database');
const {
  initializeRecipeTables,
  createRecipe,
  approvePending,
  _internals,
} = require('../services/mcpRecipeService');
const { findMcpServerBySlug } = require('../services/mcpDirectoryService');

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const AUTHOR_EMAIL = 'recipes@influzer.ai';
const AUTHOR_NAME = 'Influzer';

function requireServers(slugs) {
  const missing = slugs.filter((s) => !findMcpServerBySlug(s));
  if (missing.length) {
    throw new Error(`Catalog missing required servers: ${missing.join(', ')}`);
  }
  return slugs;
}

function starterRecipes() {
  return [
    {
      slugHint: 'search-the-mcp-directory-from-cursor',
      title: 'Search the MCP directory from Cursor with Influzer Discovery',
      summary:
        'Influzer starter recipe: add the free Influzer MCP Discovery server to Cursor and search the catalog by capability without leaving the agent.',
      use_case: 'Engineering',
      server_slugs: requireServers(['influzer-mcp-discovery']),
      compatible_clients: ['Cursor', 'Claude Desktop', 'Claude Code', 'ChatGPT'],
      prerequisites:
        '- An MCP-capable client (Cursor, Claude Desktop, Claude Code, or ChatGPT)\n- Network access to `https://www.influzer.ai/mcp/discovery`\n- No API key required for Discovery',
      permissions:
        'Read-only catalog search. Influzer Discovery does not install or connect other servers for you.',
      expected_result:
        'The agent can call Discovery tools and return matching MCP servers with slugs, descriptions, and links back to Influzer listings.',
      sample_output:
        'Found 3 servers for “browser automation”:\n1. Playwright (`playwright`)\n2. Chrome DevTools MCP (`chrome-devtools-mcp`)\n3. Firecrawl (`firecrawl`)',
      troubleshooting:
        '- If `tools/list` is empty, confirm the URL is exactly `https://www.influzer.ai/mcp/discovery`\n- Discovery is not a safe-to-install badge — still review each listing before connecting',
      source_repo_url: 'https://www.influzer.ai/mcp/discovery/setup',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Add Influzer Discovery to your client',
          body: 'Open your MCP settings and add a remote HTTP server named `influzer-mcp-discovery` pointing at `https://www.influzer.ai/mcp/discovery`. Restart the client if tools do not appear.',
        },
        {
          block_type: 'config',
          title: 'Cursor mcp.json snippet',
          language: 'json',
          body: `{
  "mcpServers": {
    "influzer-mcp-discovery": {
      "url": "https://www.influzer.ai/mcp/discovery"
    }
  }
}`,
        },
        {
          block_type: 'prompt',
          title: 'Ask the agent to search',
          language: 'markdown',
          body: 'Using Influzer MCP Discovery, find MCP servers that can scrape websites and summarize the top 3 with their Influzer slugs and whether they are remote HTTPS or local/stdio.',
        },
        {
          block_type: 'instruction',
          title: 'Open a listing before connecting',
          body: 'Pick a slug from the results and open `https://www.influzer.ai/mcp/<slug>` to review install details, handshake status, and docs. Discovery search is for discovery — not auto-install.',
        },
      ],
    },
    {
      slugHint: 'scrape-docs-then-check-current-api-with-firecrawl-and-context7',
      title: 'Scrape docs, then check the current API with Firecrawl and Context7',
      summary:
        'Influzer starter recipe: use Firecrawl to pull a documentation page, then Context7 to fetch versioned library docs so the agent answers against current APIs instead of training-data guesses.',
      use_case: 'Engineering',
      server_slugs: requireServers(['firecrawl', 'context7']),
      compatible_clients: ['Cursor', 'Claude Desktop', 'ChatGPT'],
      prerequisites:
        '- Firecrawl remote MCP access (account / API key as required by Firecrawl)\n- Context7 remote MCP access\n- A public docs URL you are allowed to scrape',
      permissions:
        'Firecrawl needs permission to fetch the target URL. Context7 needs access to its docs index. Do not paste API keys into recipe fields — configure them in your client secrets or OAuth flow.',
      expected_result:
        'A short answer that cites both the scraped page and Context7’s current docs, with library/version context when available.',
      sample_output:
        'From the scraped getting-started page, auth uses an Authorization header with an API secret.\nContext7 for `stripe` (current docs) shows the PaymentIntent create shape…',
      troubleshooting:
        '- Firecrawl auth errors: reconnect the Firecrawl MCP / rotate the key in the client, not in chat\n- Context7 misses a library: try the canonical package name (e.g. `next`, `stripe`)\n- Never paste live secrets into prompts',
      source_repo_url: '',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Connect both remote servers',
          body: 'Add Firecrawl (`https://mcp.firecrawl.dev/v2/mcp`) and Context7 (`https://mcp.context7.com/mcp`) in your client. Complete any OAuth or API-key setup those hosts require.',
        },
        {
          block_type: 'config',
          title: 'Example dual-server mcp.json',
          language: 'json',
          body: `{
  "mcpServers": {
    "firecrawl": {
      "url": "https://mcp.firecrawl.dev/v2/mcp"
    },
    "context7": {
      "url": "https://mcp.context7.com/mcp"
    }
  }
}`,
        },
        {
          block_type: 'prompt',
          title: 'Scrape, then verify against current docs',
          language: 'markdown',
          body: '1) Use Firecrawl to scrape https://docs.stripe.com/payments/accept-a-payment and extract the first-steps overview.\n2) Use Context7 to fetch current Stripe Node docs for creating a PaymentIntent.\n3) Summarize what changed or what I should implement first. Prefer Context7 for API shapes; use the scraped page for product flow.',
        },
        {
          block_type: 'instruction',
          title: 'Keep secrets out of the prompt',
          body: 'If the agent asks for keys, configure them in the MCP server settings. Use placeholders like `YOUR_STRIPE_SECRET_KEY` in any example code it writes.',
        },
      ],
    },
    {
      slugHint: 'draft-a-weekly-linear-update-with-memory',
      title: 'Draft a weekly Linear update with Linear and Memory',
      summary:
        'Influzer starter recipe: pull this week’s Linear issue activity, store durable team context in Memory, and draft a short status update you can paste into Slack or email.',
      use_case: 'Productivity',
      server_slugs: requireServers(['linear', 'memory']),
      compatible_clients: ['Cursor', 'Claude Desktop', 'Claude Code'],
      prerequisites:
        '- Linear workspace access via the official Linear remote MCP (OAuth)\n- Memory MCP installed locally (`@modelcontextprotocol/server-memory` or your client’s Memory integration)\n- Agreement on which Linear team/project to summarize',
      permissions:
        'Linear OAuth scopes for reading issues/projects. Memory writes local persistent entities — avoid storing secrets, tokens, or private customer data.',
      expected_result:
        'A concise weekly update (shipped / in progress / blocked) plus Memory entities you can reuse next week.',
      sample_output:
        '## Weekly update\nShipped: …\nIn progress: …\nBlocked: …\n\nMemory: created entity “TeamAlphaWeekly” with relations to active projects.',
      troubleshooting:
        '- Linear OAuth loop: remove and re-add `https://mcp.linear.app/mcp`\n- Memory is stdio/local — remote-only clients like ChatGPT may not support it\n- If the draft is too noisy, constrain the prompt to one team or label',
      source_repo_url: '',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Connect Linear (remote) and Memory (local)',
          body: 'Add Linear as a remote MCP at `https://mcp.linear.app/mcp` and complete OAuth. Add Memory as a local/stdio MCP in Cursor or Claude Desktop.',
        },
        {
          block_type: 'config',
          title: 'Example Cursor config',
          language: 'json',
          body: `{
  "mcpServers": {
    "linear": {
      "url": "https://mcp.linear.app/mcp"
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}`,
        },
        {
          block_type: 'prompt',
          title: 'Gather, remember, draft',
          language: 'markdown',
          body: 'Using Linear, list issues updated in the last 7 days for my primary team. Group them into shipped, in progress, and blocked.\nStore a Memory entity for this week’s themes (no secrets).\nDraft a 8–12 sentence weekly update in plain language for stakeholders.',
        },
      ],
    },
    {
      slugHint: 'inspect-a-postgres-schema-before-writing-sql',
      title: 'Inspect a Postgres schema before writing SQL',
      summary:
        'Influzer starter recipe: connect the PostgreSQL MCP server, inspect schemas/tables first, then ask the agent for read-only SQL with an explanation — before any writes.',
      use_case: 'Data & Analytics',
      server_slugs: requireServers(['postgres']),
      compatible_clients: ['Cursor', 'Claude Desktop', 'Claude Code'],
      prerequisites:
        '- A PostgreSQL database you can reach from your machine\n- Connection string available as a client secret / env var (never pasted into chat)\n- Prefer a read-only DB role for exploration',
      permissions:
        'The official Postgres MCP runs SQL you allow. Use a read-only role when exploring. Connection strings belong in MCP config, not prompts.',
      expected_result:
        'A schema overview and a proposed read-only query with an explanation of joins/filters — no destructive statements.',
      sample_output:
        'Tables: users, orders, order_items\nSuggested query: count orders by day for the last 14 days…',
      troubleshooting:
        '- Connection refused: check host/port/VPN and that the role can connect\n- Agent proposes DROP/UPDATE: stop and tighten the prompt to SELECT-only\n- Stdio server — not usable from ChatGPT’s remote-only MCP path',
      source_repo_url: '',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Add Postgres MCP with a placeholder DSN',
          body: 'Install the PostgreSQL MCP via your client. Put the real connection string only in local config or an environment variable.',
        },
        {
          block_type: 'config',
          title: 'Example stdio config (placeholder DSN)',
          language: 'json',
          body: `{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://READONLY_USER:YOUR_PASSWORD@127.0.0.1:5432/YOUR_DB"
      ]
    }
  }
}`,
        },
        {
          block_type: 'prompt',
          title: 'Schema first, then SELECT-only SQL',
          language: 'markdown',
          body: 'Inspect the available schemas and list the main tables with key columns.\nThen propose a read-only SQL query to answer: “How many new users signed up each day for the last 14 days?”\nDo not run INSERT/UPDATE/DELETE/DROP. Explain the query before executing any SELECT.',
        },
      ],
    },
    {
      slugHint: 'smoke-test-a-web-flow-with-playwright',
      title: 'Smoke-test a web flow with Playwright MCP',
      summary:
        'Influzer starter recipe: use Playwright MCP to open a staging URL, exercise a critical path, and return a pass/fail report with what the agent observed.',
      use_case: 'DevOps',
      server_slugs: requireServers(['playwright']),
      compatible_clients: ['Cursor', 'Claude Code', 'Claude Desktop'],
      prerequisites:
        '- Playwright MCP installed in a local client that can launch browsers\n- A staging URL you own or have permission to test\n- Test credentials only via env/config placeholders — never in the recipe body',
      permissions:
        'Browser automation can interact with whatever the page exposes. Restrict to staging. Do not automate production account recovery or payment confirmation flows with real cards.',
      expected_result:
        'A short report: steps taken, assertions, and pass/fail. Screenshots or console notes if your Playwright tools expose them.',
      sample_output:
        'PASS — opened /login, filled email/password placeholders, reached /dashboard within 5s.\nObserved nav: Home, Projects, Settings.',
      troubleshooting:
        '- Browser does not launch: install Playwright browsers for the MCP package your client uses\n- Auth walls: use staging test users via env vars\n- Flaky selectors: ask the agent to prefer role/label selectors',
      source_repo_url: '',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Install Playwright MCP locally',
          body: 'Add the Playwright MCP server to Cursor or Claude Desktop and ensure Chromium/Firefox dependencies for that package are installed.',
        },
        {
          block_type: 'prompt',
          title: 'Run a staging smoke test',
          language: 'markdown',
          body: 'Using Playwright MCP, open https://staging.example.com/login (replace with my staging URL).\nSteps:\n1) Confirm the login form is visible\n2) Fill email/password from my configured test env (do not invent credentials)\n3) Submit and assert the dashboard heading is visible within 10 seconds\nReturn a PASS/FAIL report with the selectors used. Do not change production data.',
        },
        {
          block_type: 'instruction',
          title: 'Keep credentials in env, not chat',
          body: 'If login is required, load test users from environment variables or your secret store. Reject any prompt that asks you to paste production passwords into the thread.',
        },
      ],
    },
  ];
}

async function ensureAuthor(db) {
  const existing = await _internals.dbGet(db, 'SELECT * FROM users WHERE email = ?', [
    AUTHOR_EMAIL,
  ]);
  if (existing) {
    await _internals.dbRun(
      db,
      `UPDATE users SET name = ?, email_verified = 1 WHERE id = ?`,
      [AUTHOR_NAME, existing.id],
    );
    return existing.id;
  }
  const created = await _internals.dbRun(
    db,
    `INSERT INTO users (email, password_hash, provider, name, email_verified, is_admin)
     VALUES (?, NULL, 'local', ?, 1, 0)`,
    [AUTHOR_EMAIL, AUTHOR_NAME],
  );
  return created.lastID;
}

async function ensureAuthorProfile(db, userId) {
  const profile = await _internals.dbGet(
    db,
    'SELECT user_id FROM contributor_profiles WHERE user_id = ?',
    [userId],
  );
  const bio =
    'Editorial starter recipes from Influzer.ai — practical MCP examples to help you get something working. Not independently verified unless marked “Verified by Influzer”.';
  if (profile) {
    await _internals.dbRun(
      db,
      `UPDATE contributor_profiles SET display_name = ?, bio = ?, website_url = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
      [AUTHOR_NAME, bio, 'https://www.influzer.ai', userId],
    );
  } else {
    await _internals.dbRun(
      db,
      `INSERT INTO contributor_profiles (user_id, display_name, bio, website_url)
       VALUES (?, ?, ?, ?)`,
      [userId, AUTHOR_NAME, bio, 'https://www.influzer.ai'],
    );
  }
}

async function findBySlug(db, slug) {
  return _internals.dbGet(db, 'SELECT * FROM recipes WHERE slug = ?', [slug]);
}

async function seedOne(db, authorId, adminId, recipeDef) {
  // Prefer stable slug from hint
  const desiredSlug = recipeDef.slugHint;
  const existing = await findBySlug(db, desiredSlug);
  if (
    existing &&
    existing.status === 'published' &&
    existing.published_revision_id &&
    !FORCE
  ) {
    return { slug: desiredSlug, action: 'skipped-exists' };
  }

  if (DRY_RUN) {
    return { slug: desiredSlug, action: FORCE ? 'dry-run-force' : 'dry-run' };
  }

  if (existing) {
    // Replace prior seed row (cascade removes revisions/blocks)
    await _internals.dbRun(db, 'DELETE FROM recipes WHERE id = ?', [existing.id]);
  }

  const created = await createRecipe(db, authorId, recipeDef, { submit: true });
  // Force stable slug for seeds
  if (created.slug !== desiredSlug) {
    const clash = await findBySlug(db, desiredSlug);
    if (!clash) {
      await _internals.dbRun(db, 'UPDATE recipes SET slug = ? WHERE id = ?', [
        desiredSlug,
        created.id,
      ]);
    }
  }
  await approvePending(db, created.id, adminId);
  const finalSlug =
    (await _internals.dbGet(db, 'SELECT slug FROM recipes WHERE id = ?', [created.id]))?.slug ||
    created.slug;
  return { slug: finalSlug, action: 'published' };
}

async function reviewerId(db, authorId) {
  // HTTP admin routes enforce is_admin; seed approval only records reviewed_by.
  const admin = await _internals.dbGet(
    db,
    'SELECT id FROM users WHERE is_admin = 1 ORDER BY id ASC LIMIT 1',
  );
  return admin?.id || authorId;
}

async function main() {
  const db = await getDatabase();
  await initializeRecipeTables(db);
  const recipes = starterRecipes();
  const authorId = await ensureAuthor(db);
  await ensureAuthorProfile(db, authorId);
  const adminId = await reviewerId(db, authorId);

  console.log(DRY_RUN ? 'Dry run — no writes for recipe rows' : 'Seeding recipes…');
  console.log(`Author user id=${authorId} (${AUTHOR_EMAIL})`);

  const results = [];
  for (const def of recipes) {
    const result = await seedOne(db, authorId, adminId, def);
    results.push(result);
    console.log(`  ${result.action}: /recipes/${result.slug}`);
  }

  const published = await _internals.dbAll(
    db,
    `SELECT slug, status FROM recipes WHERE author_user_id = ? ORDER BY id`,
    [authorId],
  );
  console.log(`Done. Author has ${published.length} recipe row(s).`);
  published.forEach((r) => console.log(`  - ${r.status} ${r.slug}`));

  await new Promise((resolve) => db.db.close(() => resolve()));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
