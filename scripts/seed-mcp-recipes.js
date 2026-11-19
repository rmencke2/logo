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
      slugHint: 'discover-mcp-servers-from-claude-and-chatgpt',
      title: 'Discover MCP servers from Claude and ChatGPT',
      summary:
        'Influzer starter recipe: add the read-only Influzer Discovery connector in Claude and in ChatGPT, then ask either chat to find an HTTPS MCP server without leaving the conversation.',
      use_case: 'Engineering',
      server_slugs: requireServers(['influzer-mcp-discovery']),
      compatible_clients: ['Claude Desktop', 'ChatGPT'],
      prerequisites:
        '- Claude (web or desktop) or ChatGPT with custom connectors\n- Network access to `https://www.influzer.ai/mcp/discovery`\n- No API key for Discovery',
      permissions:
        'Read-only catalog search. Discovery does not install the servers it finds. Claude chat and ChatGPT can only use public HTTPS connectors, not local or stdio servers.',
      expected_result:
        'The chat names a matching MCP server, gives its Influzer slug, and returns the HTTPS URL to add as a second connector.',
      sample_output:
        'For website scraping, Firecrawl (`firecrawl`) has a public HTTPS connector.\nURL: https://mcp.firecrawl.dev/v2/mcp\nHandshake: live. Add it as a custom connector. I did not install it.',
      troubleshooting:
        '- No Discovery tools: start a new chat and enable the Influzer Discovery connector\n- ChatGPT: Developer mode must be on before a custom connector can be created\n- If the result says stdio or localhost, skip it in Claude chat and ChatGPT\n- Discovery is not a safe-to-install badge',
      source_repo_url: 'https://www.influzer.ai/mcp/discovery/skill',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Add Discovery in Claude',
          body: 'Claude → Settings → Connectors → Add → Custom → Web. Name it Influzer Discovery. URL: https://www.influzer.ai/mcp/discovery. No OAuth. Save, open a new chat, and enable the connector. Optional skill file: https://www.influzer.ai/skills/influzer-mcp-claude/SKILL.md',
        },
        {
          block_type: 'instruction',
          title: 'Add Discovery in ChatGPT',
          body: 'Settings → Apps & Connectors → Advanced → Developer mode ON. Create a custom connector named Influzer Discovery with MCP server URL https://www.influzer.ai/mcp/discovery and no auth. New chat → + → Developer mode → enable it. Optional skill file: https://www.influzer.ai/skills/influzer-mcp-chatgpt/SKILL.md',
        },
        {
          block_type: 'prompt',
          title: 'Ask for a server',
          language: 'markdown',
          body: 'Using Influzer Discovery, find an MCP server that can scrape a public documentation page. Return the name, Influzer slug, and the HTTPS connector URL. If the listing is local or stdio only, say ChatGPT and Claude chat cannot use it and pick another. Do not install it.',
        },
        {
          block_type: 'instruction',
          title: 'Add the server you picked',
          body: 'Open https://www.influzer.ai/mcp/<slug> and add that HTTPS URL as a second connector, the same way you added Discovery. Leave write tools off until you mean to allow them.',
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
    {
      slugHint: 'research-a-topic-with-exa-and-memory',
      title: 'Research a topic with Exa and Memory',
      summary:
        'Influzer starter recipe: use Exa to find high-signal sources on a topic, then store durable findings in Memory so the next chat starts from what you already learned.',
      use_case: 'Research',
      server_slugs: requireServers(['exa', 'memory']),
      compatible_clients: ['Cursor', 'Claude Desktop', 'Claude Code'],
      prerequisites:
        '- Exa remote MCP access (OAuth / API key as required by Exa)\n- Memory MCP installed locally (`@modelcontextprotocol/server-memory`)\n- A clear research question (audience, geography, time window)',
      permissions:
        'Exa searches the public web. Memory writes local persistent entities — store summaries and source URLs, never API keys or private customer data.',
      expected_result:
        'A short brief with cited sources, plus Memory entities you can reuse in a follow-up chat.',
      sample_output:
        '## Brief: agentic browser automation MCPs (2026)\nTop sources: …\nConsensus: …\nOpen questions: …\n\nMemory: entity “BrowserMcpResearch” with links to 5 sources.',
      troubleshooting:
        '- Exa auth errors: reconnect `https://mcp.exa.ai/mcp` and complete OAuth / key setup in the client\n- Memory is stdio/local — ChatGPT’s remote-only path will not run it\n- If results feel generic, constrain Exa to a date window or site class (docs, GitHub, papers)',
      source_repo_url: '',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Connect Exa (remote) and Memory (local)',
          body: 'Add Exa as a remote MCP at `https://mcp.exa.ai/mcp` and complete any auth Exa requires. Add Memory as a local/stdio MCP in Cursor or Claude Desktop.',
        },
        {
          block_type: 'config',
          title: 'Example Cursor config',
          language: 'json',
          body: `{
  "mcpServers": {
    "exa": {
      "url": "https://mcp.exa.ai/mcp"
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
          title: 'Search, cite, remember',
          language: 'markdown',
          body: 'Using Exa, research: “best remote MCP servers for website scraping and browser automation in 2026”.\nReturn 5–8 sources with title, URL, and one-line why it matters.\nWrite a 10–15 sentence brief with consensus vs disagreement.\nStore a Memory entity for this research thread (no secrets) including the source URLs.',
        },
      ],
    },
    {
      slugHint: 'implement-ui-from-figma-with-context7',
      title: 'Implement UI from Figma with Figma and Context7',
      summary:
        'Influzer starter recipe: read a Figma frame for layout and tokens, then use Context7 for current framework docs so the agent implements against the real component API — not training-data guesses.',
      use_case: 'Engineering',
      server_slugs: requireServers(['figma', 'context7']),
      compatible_clients: ['Cursor', 'Claude Desktop', 'Claude Code', 'ChatGPT'],
      prerequisites:
        '- Figma remote MCP access and a file you can open\n- Context7 remote MCP access\n- Agreement on framework (e.g. React + Tailwind) and target file paths',
      permissions:
        'Figma OAuth reads design files you authorize. Context7 reads public library docs. Do not paste design-system secrets or private tokens into prompts.',
      expected_result:
        'A component outline mapped to Figma layers, plus starter code that cites Context7 for the framework APIs used.',
      sample_output:
        'Frame “Pricing / Desktop” → sections Hero, Plans, FAQ.\nTokens: spacing 8/16/24, accent #0F766E.\nProposed `PricingCard.tsx` using Tailwind `grid` / `gap-6` per current docs…',
      troubleshooting:
        '- Figma tools missing: reconnect `https://mcp.figma.com/mcp` and re-authorize the file\n- Wrong frame: paste the Figma node URL / node id in the prompt\n- Context7 misses a library: use the canonical package name (`react`, `tailwindcss`, `next`)',
      source_repo_url: '',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Connect Figma and Context7',
          body: 'Add Figma (`https://mcp.figma.com/mcp`) and Context7 (`https://mcp.context7.com/mcp`) as remote MCPs. Complete Figma OAuth and open the design file you intend to implement.',
        },
        {
          block_type: 'config',
          title: 'Example dual-server mcp.json',
          language: 'json',
          body: `{
  "mcpServers": {
    "figma": {
      "url": "https://mcp.figma.com/mcp"
    },
    "context7": {
      "url": "https://mcp.context7.com/mcp"
    }
  }
}`,
        },
        {
          block_type: 'prompt',
          title: 'Read the frame, then code against current docs',
          language: 'markdown',
          body: '1) Using Figma MCP, inspect the selected frame (or the node URL I paste) and list sections, key text, spacing, and colors.\n2) Using Context7, fetch current React + Tailwind docs relevant to layout and responsive grids.\n3) Propose a component tree and implement the first section in TypeScript/React. Prefer Context7 for API shapes; prefer Figma for visual structure. Do not invent design tokens that are not in the file.',
        },
      ],
    },
    {
      slugHint: 'triage-a-sentry-error-with-context7',
      title: 'Triage a Sentry error with Sentry and Context7',
      summary:
        'Influzer starter recipe: pull a recent Sentry issue, map the stack to the likely code path, then check current library docs with Context7 before proposing a fix.',
      use_case: 'Engineering',
      server_slugs: requireServers(['sentry', 'context7']),
      compatible_clients: ['Cursor', 'Claude Desktop', 'Claude Code', 'ChatGPT'],
      prerequisites:
        '- Sentry remote MCP access to an org/project you own\n- Context7 remote MCP access\n- Local repo open in the client when you want code-level fixes',
      permissions:
        'Sentry OAuth can expose error payloads and PII depending on your project settings — scrub before sharing externally. Context7 is read-only docs lookup.',
      expected_result:
        'A triage note: issue summary, suspected root cause, Context7-backed API notes, and a minimal proposed fix.',
      sample_output:
        'Issue: TypeError on /checkout (24 events / 6h)\nSuspect: null `session.customer` after Stripe redirect\nContext7 (stripe): PaymentIntent status handling…\nProposed fix: guard + redirect to /login when customer is missing.',
      troubleshooting:
        '- Sentry auth loop: remove and re-add `https://mcp.sentry.dev/mcp`\n- Wrong project: name the org/project in the prompt\n- Never paste production DSN secrets into chat — configure them in Sentry / client settings',
      source_repo_url: '',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Connect Sentry and Context7',
          body: 'Add Sentry at `https://mcp.sentry.dev/mcp` and complete OAuth for your org. Add Context7 at `https://mcp.context7.com/mcp`.',
        },
        {
          block_type: 'config',
          title: 'Example dual-server mcp.json',
          language: 'json',
          body: `{
  "mcpServers": {
    "sentry": {
      "url": "https://mcp.sentry.dev/mcp"
    },
    "context7": {
      "url": "https://mcp.context7.com/mcp"
    }
  }
}`,
        },
        {
          block_type: 'prompt',
          title: 'Triage, then verify against current docs',
          language: 'markdown',
          body: 'Using Sentry, fetch the most frequent unresolved issue from the last 24 hours in my primary project.\nSummarize title, culprit, event count, and the top stack frames (scrub PII).\nIf a third-party library appears in the stack, use Context7 for that library’s current error-handling docs.\nPropose a minimal fix and a regression test idea. Do not deploy anything.',
        },
      ],
    },
    {
      slugHint: 'plan-the-week-with-calendar-and-notion',
      title: 'Plan the week with Google Calendar and Notion',
      summary:
        'Influzer starter recipe: read the next seven days from Google Calendar, pull priorities from a Notion database, and draft a realistic weekly plan you can paste back into Notion.',
      use_case: 'Productivity',
      server_slugs: requireServers(['google-calendar', 'notion']),
      compatible_clients: ['Cursor', 'Claude Desktop', 'ChatGPT'],
      prerequisites:
        '- Google Calendar remote MCP with access to the calendars you care about\n- Notion remote MCP with access to a tasks/projects database\n- Agreement on working hours and which Notion database is source of truth',
      permissions:
        'Both connectors can read (and potentially write) personal productivity data after OAuth. Start read-only: ask the agent to draft the plan before creating or editing Notion pages.',
      expected_result:
        'A day-by-day plan that respects existing meetings and surfaces the top Notion priorities that still fit.',
      sample_output:
        '## Week plan\nMon: deep work 9–12 on Launch checklist (Notion); standup 10:30…\nRisks: Thu is meeting-heavy — move writing block to Tue AM.',
      troubleshooting:
        '- Calendar empty: confirm the correct Google account and calendar are authorized\n- Notion misses pages: share the database with the Notion integration / re-authorize `https://mcp.notion.com/mcp`\n- Refuse bulk deletes or mass reschedules unless you explicitly ask',
      source_repo_url: '',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Connect Google Calendar and Notion',
          body: 'Add Google Calendar (`https://calendarmcp.googleapis.com/mcp/v1`) and Notion (`https://mcp.notion.com/mcp`) as remote MCPs. Complete OAuth for both and confirm the agent can list upcoming events and query your tasks database.',
        },
        {
          block_type: 'config',
          title: 'Example dual-server mcp.json',
          language: 'json',
          body: `{
  "mcpServers": {
    "google-calendar": {
      "url": "https://calendarmcp.googleapis.com/mcp/v1"
    },
    "notion": {
      "url": "https://mcp.notion.com/mcp"
    }
  }
}`,
        },
        {
          block_type: 'prompt',
          title: 'Read calendars and Notion, then draft the plan',
          language: 'markdown',
          body: 'Using Google Calendar, list my events for the next 7 days.\nUsing Notion, list open tasks/priorities from my main tasks database (ask me for the database name if unclear).\nDraft a realistic weekly plan that protects 2 deep-work blocks on lighter days.\nDo not create or edit Notion pages or calendar events until I approve the draft.',
        },
      ],
    },
    {
      slugHint: 'explore-a-supabase-project-before-writing-sql',
      title: 'Explore a Supabase project before writing SQL',
      summary:
        'Influzer starter recipe: connect the Supabase MCP, inspect projects/tables first, then ask for read-only SQL with an explanation — before any writes or schema changes.',
      use_case: 'Data & Analytics',
      server_slugs: requireServers(['supabase']),
      compatible_clients: ['Cursor', 'Claude Desktop', 'Claude Code', 'ChatGPT'],
      prerequisites:
        '- Supabase remote MCP access to an org/project you own\n- Prefer a read-only mindset (and restricted roles) while exploring\n- Know which project/ref is safe to inspect',
      permissions:
        'Supabase MCP can expose schema and run SQL depending on granted scopes. Keep production writes off until you review the query. Never paste service-role keys into chat.',
      expected_result:
        'A table/column overview and a proposed read-only query with an explanation — no destructive statements.',
      sample_output:
        'Project: acme-prod\nTables: profiles, subscriptions, events\nSuggested SELECT: daily active users last 14 days grouped by plan…',
      troubleshooting:
        '- Auth errors: reconnect `https://mcp.supabase.com/mcp` and re-authorize the org\n- Wrong project: name the project ref in the prompt\n- If the agent proposes DROP/UPDATE: stop and tighten the prompt to SELECT-only',
      source_repo_url: '',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Connect Supabase MCP',
          body: 'Add the Supabase remote MCP at `https://mcp.supabase.com/mcp` and complete OAuth for the org that owns the project you want to inspect.',
        },
        {
          block_type: 'config',
          title: 'Example mcp.json',
          language: 'json',
          body: `{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp"
    }
  }
}`,
        },
        {
          block_type: 'prompt',
          title: 'Schema first, then SELECT-only SQL',
          language: 'markdown',
          body: 'Using Supabase MCP, list my projects and inspect the schema for the primary app project (tables + key columns).\nThen propose a read-only SQL query to answer: “How many new signups per day for the last 14 days?”\nExplain the query before running any SELECT. Do not run INSERT/UPDATE/DELETE/DROP or change RLS policies.',
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
