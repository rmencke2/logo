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
          body: '1) Using Figma MCP, inspect the selected frame (or the node URL I paste) and list sections, key text, spacing, and colors.\n2) Using Context7, fetch current React + Tailwind docs relevant to layout and responsive grids.\n3) Propose a component tree and implement the first section in TypeScript/React, starting from the React snippet in this recipe.\nPrefer Context7 for API shapes; prefer Figma for visual structure. Do not invent design tokens that are not in the file.',
        },
        {
          block_type: 'instruction',
          title: 'Starter snippet (React)',
          body: 'Skeleton only — replace labels, spacing, and colors from the Figma frame. Prefer Context7 for current React/Tailwind APIs.',
        },
        {
          block_type: 'code',
          title: 'React — section starter',
          language: 'tsx',
          body: `type PricingCardProps = {
  title: string;
  priceLabel: string;
  features: string[];
  ctaLabel?: string;
};

export function PricingCard({
  title,
  priceLabel,
  features,
  ctaLabel = 'Get started',
}: PricingCardProps) {
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-6">
      <header>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-3xl font-bold tracking-tight">{priceLabel}</p>
      </header>
      <ul className="flex flex-col gap-2 text-sm text-zinc-600">
        {features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <button type="button" className="mt-auto rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white">
        {ctaLabel}
      </button>
    </article>
  );
}`,
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
    {
      slugHint: 'implement-a-stripe-paymentintent-with-context7',
      title: 'Implement a Stripe PaymentIntent with Context7',
      summary:
        'Influzer starter recipe: use Stripe MCP for account/product context, then pull current Stripe API docs via Context7 before writing PaymentIntent code — test mode only.',
      use_case: 'Engineering',
      server_slugs: requireServers(['stripe', 'context7']),
      compatible_clients: ['Cursor', 'Claude Desktop', 'Claude Code', 'ChatGPT'],
      prerequisites:
        '- Stripe remote MCP authorized for a **test-mode** account you own\n- Context7 remote MCP access\n- Never paste live secret keys into chat — configure OAuth / client secrets in MCP settings',
      permissions:
        'Stripe MCP can read and mutate payment objects depending on scopes. Stay in test mode. Context7 is read-only docs lookup. This is not a PCI or security approval.',
      expected_result:
        'A minimal PaymentIntent create flow (server-side) grounded in current Stripe docs, plus the client confirm steps — with test-mode caveats called out.',
      sample_output:
        'Context7 (stripe-node): paymentIntents.create({ amount, currency, automatic_payment_methods })\nProposed route: POST /api/checkout/intent → returns client_secret\nTest card: use Stripe test PANs only; do not charge live customers from this recipe.',
      troubleshooting:
        '- Auth / empty tools: re-add `https://mcp.stripe.com` and complete OAuth for the test account\n- Wrong API shape: prefer Context7 over training memory for Stripe SDK versions\n- If the agent suggests live keys or skipping webhooks: stop and tighten the prompt',
      source_repo_url: '',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Connect Stripe and Context7',
          body: 'Add Stripe at `https://mcp.stripe.com` (test-mode account) and Context7 at `https://mcp.context7.com/mcp`. Confirm tools appear before asking for payment code.',
        },
        {
          block_type: 'config',
          title: 'Example dual-server mcp.json',
          language: 'json',
          body: `{
  "mcpServers": {
    "stripe": {
      "url": "https://mcp.stripe.com"
    },
    "context7": {
      "url": "https://mcp.context7.com/mcp"
    }
  }
}`,
        },
        {
          block_type: 'prompt',
          title: 'Docs first, then a test-mode PaymentIntent',
          language: 'markdown',
          body: 'Using Context7, fetch the current Stripe docs for creating a PaymentIntent (server SDK + client confirm).\nUsing Stripe MCP in **test mode only**, list whether any products/prices already exist that fit a $20 one-time checkout (do not create live charges).\nStart from the Node / Python / PHP snippets in this recipe, then adapt them to my stack.\nPrefer Context7 over the snippets if the API shape differs.\nDo not use live secret keys, do not disable webhooks guidance, and do not invent PCI-sensitive shortcuts.',
        },
        {
          block_type: 'instruction',
          title: 'Starter snippets (test mode)',
          body: 'Use these as copy-paste starting points for a $20.00 USD PaymentIntent. Replace `YOUR_STRIPE_SECRET_KEY` via env only. Confirm the final SDK calls with Context7 before shipping.',
        },
        {
          block_type: 'code',
          title: 'Node — create PaymentIntent',
          language: 'javascript',
          body: `// npm i stripe
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); // sk_test_...

export async function createCheckoutIntent() {
  const intent = await stripe.paymentIntents.create({
    amount: 2000, // $20.00
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
  });
  return { clientSecret: intent.client_secret };
}`,
        },
        {
          block_type: 'code',
          title: 'Python — create PaymentIntent',
          language: 'python',
          body: `# pip install stripe
import os
import stripe

stripe.api_key = os.environ["STRIPE_SECRET_KEY"]  # sk_test_...

def create_checkout_intent():
    intent = stripe.PaymentIntent.create(
        amount=2000,  # $20.00
        currency="usd",
        automatic_payment_methods={"enabled": True},
    )
    return {"client_secret": intent.client_secret}`,
        },
        {
          block_type: 'code',
          title: 'PHP — create PaymentIntent',
          language: 'php',
          body: `<?php
// composer require stripe/stripe-php
require 'vendor/autoload.php';

$stripe = new \\Stripe\\StripeClient(getenv('STRIPE_SECRET_KEY')); // sk_test_...

$intent = $stripe->paymentIntents->create([
  'amount' => 2000, // $20.00
  'currency' => 'usd',
  'automatic_payment_methods' => ['enabled' => true],
]);

return ['client_secret' => $intent->client_secret];`,
        },
        {
          block_type: 'instruction',
          title: 'Keep secrets out of the thread',
          body: 'Put Stripe secrets in MCP / env config. Reject prompts that ask you to paste `sk_live` or production customer PII into chat.',
        },
      ],
    },
    {
      slugHint: 'debug-a-staging-page-with-chrome-devtools-mcp',
      title: 'Debug a staging page with Chrome DevTools MCP',
      summary:
        'Influzer starter recipe: open a staging URL in Chrome DevTools MCP, capture console errors and failed network requests, and return a short triage note — without touching production sessions.',
      use_case: 'DevOps',
      server_slugs: requireServers(['chrome-devtools-mcp']),
      compatible_clients: ['Cursor', 'Claude Code', 'Claude Desktop'],
      prerequisites:
        '- Local Chrome + `chrome-devtools-mcp` via npx\n- A staging URL you own or have permission to inspect\n- Prefer a fresh browser profile — do not attach to your personal logged-in Chrome session',
      permissions:
        'DevTools MCP can see page content, cookies, and network for the controlled browser. Treat it like giving the agent your browser. Use staging only; avoid `--autoConnect` to personal profiles with banking or admin sessions.',
      expected_result:
        'A triage note: top console errors, failed requests (status + URL), and a hypothesized root cause with a next debug step.',
      sample_output:
        'FAIL — 1 console error, 2 failed XHRs\nconsole: TypeError: Cannot read properties of null (reading `id`) @ checkout.js:142\nnetwork: POST /api/cart 500; GET /api/me 401\nHypothesis: session cookie missing on staging subdomain — check SameSite + domain.',
      troubleshooting:
        '- Browser does not launch: ensure `npx -y chrome-devtools-mcp@latest` works in a terminal\n- Empty console: hard-reload after navigate; confirm the page actually errors\n- Stdio only — not usable from ChatGPT’s remote-only MCP path',
      source_repo_url: 'https://github.com/ChromeDevTools/chrome-devtools-mcp',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Install Chrome DevTools MCP locally',
          body: 'Add the official Chrome DevTools MCP (`chrome-devtools-mcp`) to Cursor or Claude Code. Use a dedicated/staging profile — do not connect the agent to your everyday logged-in Chrome.',
        },
        {
          block_type: 'config',
          title: 'Example stdio mcp.json',
          language: 'json',
          body: `{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}`,
        },
        {
          block_type: 'prompt',
          title: 'Capture console + network on staging',
          language: 'markdown',
          body: 'Using Chrome DevTools MCP, open https://staging.example.com/checkout (replace with my staging URL).\n1) Wait for the page to settle\n2) List console errors/warnings\n3) List failed network requests (status >= 400) with method + URL\n4) Summarize the most likely root cause and one concrete next check\nDo not submit payments, do not change account settings, and do not use production URLs.',
        },
      ],
    },
    {
      slugHint: 'triage-open-gitlab-merge-requests',
      title: 'Triage open GitLab merge requests',
      summary:
        'Influzer starter recipe: connect the official GitLab MCP, list open MRs for a project you own, and draft a review triage note — without merging or approving anything.',
      use_case: 'Engineering',
      server_slugs: requireServers(['gitlab']),
      compatible_clients: ['Cursor', 'Claude Desktop', 'Claude Code', 'ChatGPT'],
      prerequisites:
        '- GitLab.com (or self-managed) MCP at `/api/v4/mcp` with OAuth to projects you can read\n- Know the project path (e.g. `group/app`)\n- Agreement that the agent will not merge, approve, or push',
      permissions:
        'GitLab OAuth can expose source code, issues, and MRs in authorized projects. Start read-only: ask for a triage summary before any write actions. Not a security audit.',
      expected_result:
        'A ranked list of open MRs with age, author, risk notes, and a suggested review order — no merges.',
      sample_output:
        'Open MRs (3):\n1. !142 auth: fix session refresh (2d, @dev) — touches auth middleware; review first\n2. !140 docs: changelog (5d) — low risk\n3. !138 feat: billing UI (9d) — large diff; needs Context7/Stripe pass separately',
      troubleshooting:
        '- Auth loop: remove and re-add `https://gitlab.com/api/v4/mcp` (or your self-managed `/api/v4/mcp`)\n- Wrong project: put the full `group/project` path in the prompt\n- If the agent offers to merge: stop and restate read-only',
      source_repo_url: 'https://docs.gitlab.com/user/model_context_protocol/mcp_server/',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Connect GitLab MCP',
          body: 'Add the official GitLab MCP (`https://gitlab.com/api/v4/mcp` on GitLab.com, or `/api/v4/mcp` on self-managed) and complete OAuth for the projects you want to inspect.',
        },
        {
          block_type: 'config',
          title: 'Example mcp.json (GitLab.com)',
          language: 'json',
          body: `{
  "mcpServers": {
    "gitlab": {
      "url": "https://gitlab.com/api/v4/mcp"
    }
  }
}`,
        },
        {
          block_type: 'prompt',
          title: 'Read-only MR triage',
          language: 'markdown',
          body: 'Using GitLab MCP, list open merge requests for project `YOUR_GROUP/YOUR_PROJECT` (replace with mine).\nFor each MR: title, IID, author, age, labels, and a one-line risk note (auth/billing/migrations = higher risk).\nPropose a review order. Do not approve, merge, comment, or push unless I explicitly ask afterward.',
        },
      ],
    },
    {
      slugHint: 'inspect-redis-keys-before-mutating',
      title: 'Inspect Redis keys before mutating',
      summary:
        'Influzer starter recipe: connect Redis MCP to a non-production instance, survey key patterns and TTLs first, then ask for a safe read — before any SET/DEL/FLUSH.',
      use_case: 'Data & Analytics',
      server_slugs: requireServers(['redis']),
      compatible_clients: ['Cursor', 'Claude Code', 'Claude Desktop'],
      prerequisites:
        '- Redis reachable from your machine (prefer local/staging)\n- `uvx` available for `redis-mcp-server`\n- Connection URL only in MCP config — never in the chat\n- Prefer a read-limited Redis ACL user',
      permissions:
        'Redis MCP can read and write keys depending on the ACL. Point it at staging. Never run FLUSHALL/FLUSHDB. Secrets and session tokens in Redis are sensitive — do not dump values into public channels.',
      expected_result:
        'A keyspace overview (patterns + sample TTLs) and a proposed read-only inspection plan — no destructive commands.',
      sample_output:
        'Patterns: session:*, cache:product:*, lock:checkout:*\nsession:* ~12k keys, TTL ~1800s\nNext: GET one `cache:product:*` sample; do not DEL or FLUSH.',
      troubleshooting:
        '- `uvx` missing: install uv, or follow https://github.com/redis/mcp-redis install docs\n- Connection refused: check host/port/TLS (`rediss://`) and ACL user\n- Stdio only — not usable from ChatGPT’s remote-only MCP path',
      source_repo_url: 'https://github.com/redis/mcp-redis',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Add Redis MCP with a placeholder URL',
          body: 'Install the official Redis MCP (`redis-mcp-server` via `uvx`). Put the real Redis URL only in local MCP config or env. Use a staging instance and a restricted ACL when possible.',
        },
        {
          block_type: 'config',
          title: 'Example stdio config (placeholder URL)',
          language: 'json',
          body: `{
  "mcpServers": {
    "redis": {
      "command": "uvx",
      "args": [
        "--from",
        "redis-mcp-server@latest",
        "redis-mcp-server",
        "--url",
        "redis://127.0.0.1:6379/0"
      ]
    }
  }
}`,
        },
        {
          block_type: 'prompt',
          title: 'Survey keys, then read-only checks',
          language: 'markdown',
          body: 'Using Redis MCP against my staging instance, summarize the main key patterns (e.g. session:*, cache:*) and typical TTLs.\nThen propose a read-only plan to inspect one cache key and one session key metadata (type + TTL) without printing secrets.\nDo not run SET/DEL/FLUSHALL/FLUSHDB or overwrite keys unless I explicitly approve afterward.',
        },
      ],
    },
    {
      slugHint: 'check-deploy-health-with-datadog-and-sentry',
      title: 'Check deploy health with Datadog and Sentry',
      summary:
        'Influzer starter recipe: after a release, pull Datadog signals and recent Sentry issues for the same service window and draft a go/no-go health note — without changing monitors or resolving issues.',
      use_case: 'DevOps',
      server_slugs: requireServers(['datadog', 'sentry']),
      compatible_clients: ['Cursor', 'Claude Desktop', 'Claude Code', 'ChatGPT'],
      prerequisites:
        '- Datadog remote MCP (`https://mcp.datadoghq.com/v1/mcp`) authorized for the env you care about\n- Sentry remote MCP (`https://mcp.sentry.dev/mcp`) authorized for the matching project\n- Know the service name + deploy time window',
      permissions:
        'Both connectors can expose production telemetry and sometimes PII in error payloads. Scrub before sharing externally. Do not mute monitors, delete dashboards, or bulk-resolve issues from this recipe.',
      expected_result:
        'A short post-deploy health note: error-rate / latency signals from Datadog, top new Sentry issues, and a clear go / watch / rollback recommendation.',
      sample_output:
        'Window: last 30m since deploy `abc123`\nDatadog: p95 latency +12% vs prior hour; 5xx steady\nSentry: 1 new issue (TypeError on /checkout) — 18 events\nRecommendation: WATCH — fix checkout null guard; no rollback yet.',
      troubleshooting:
        '- Datadog auth: re-add `https://mcp.datadoghq.com/v1/mcp` (OAuth or API keys per Datadog docs)\n- Sentry auth: re-add `https://mcp.sentry.dev/mcp`\n- Wrong service: name the Datadog service + Sentry project explicitly in the prompt',
      source_repo_url: '',
      author_reports_tested: false,
      last_tested_at: null,
      blocks: [
        {
          block_type: 'instruction',
          title: 'Connect Datadog and Sentry',
          body: 'Add Datadog at `https://mcp.datadoghq.com/v1/mcp` and Sentry at `https://mcp.sentry.dev/mcp`. Complete auth for the org/env that received the deploy.',
        },
        {
          block_type: 'config',
          title: 'Example dual-server mcp.json',
          language: 'json',
          body: `{
  "mcpServers": {
    "datadog": {
      "url": "https://mcp.datadoghq.com/v1/mcp"
    },
    "sentry": {
      "url": "https://mcp.sentry.dev/mcp"
    }
  }
}`,
        },
        {
          block_type: 'prompt',
          title: 'Post-deploy go / watch / rollback',
          language: 'markdown',
          body: 'We deployed service `YOUR_SERVICE` about 30 minutes ago (replace with mine).\nUsing Datadog, summarize error rate, p95 latency, and any obvious anomalies vs the prior hour for that service.\nUsing Sentry, list new or spiking unresolved issues in the same window (scrub PII).\nReturn a go / watch / rollback recommendation with the top 3 evidence bullets. Do not mute monitors, delete dashboards, or resolve issues.',
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
