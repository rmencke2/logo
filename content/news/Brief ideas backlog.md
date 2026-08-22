---
tags:
  - influzer
  - briefs
  - mcp
  - content-pipeline
status: backlog
created: 2026-07-20
updated: 2026-08-22
---

# Influzer MCP Briefs — idea backlog

Short takes for `/news`. Format: **one sharp claim + why it matters for builders**. Not a news dump; not a full Insight.

Related: [[MCP]] · Directory: https://www.influzer.ai/mcp · Publish path: `content/news/*.json`

---

## Shipped this batch (2026-08-22)

| Date | Slug | Title | Status |
|------|------|-------|--------|
| 2026-08-22 | `cursor-mcp-json-is-becoming-team-policy` | Project `.cursor/mcp.json` is becoming team policy | ✅ Drafted JSON |
| 2026-08-22 | Insight: `cursor-mcp-json-is-becoming-team-policy` | .cursor/mcp.json Is Becoming Team Policy — The New Perimeter for Which Tools Your Repo Allows | ✅ Featured Insight |
| 2026-08-22 | `discovery-mcp-is-the-new-app-store-search` | Discovery MCP is the new App Store search | ✅ Drafted JSON |
| 2026-08-22 | Insight: `discovery-mcp-is-the-new-app-store-search` | Discovery MCP Is the New App Store Search — Why Agents Find Integrations by Capability, Not Brand | ✅ Featured Insight |
| 2026-08-22 | `dont-put-secrets-in-mcp-headers` | Don't put secrets in MCP headers | ✅ Drafted JSON |
| 2026-08-22 | Insight: `dont-put-secrets-in-mcp-headers` | Don't Put Secrets in MCP Headers — Why Mcp-Method Routing Creates a New Leak Path | ✅ Featured Insight |

## Shipped previous batch (2026-08-20)

| Date | Slug | Title | Status |
|------|------|-------|--------|
| 2026-08-20 | `most-mcp-servers-are-still-demoware` | Most MCP servers are still demoware | ✅ Drafted JSON |
| 2026-08-20 | Insight: `most-mcp-servers-are-still-demoware` | Most MCP Servers Are Still Demoware — How to Spot Production-Ready in 30 Seconds | ✅ Featured Insight |

## Shipped previous batch (2026-08-05)

| Date | Slug | Title | Status |
|------|------|-------|--------|
| 2026-08-05 | `mcp-rip-out-list-before-deprecation-clock` | What to rip out before the MCP deprecation clock starts | ✅ Drafted JSON |
| 2026-08-05 | Insight: `mcp-deprecation-clock-what-to-rip-out-before-it-hits` | What to Rip Out of Your MCP Stack Before the Deprecation Clock Hits | ✅ Featured Insight |

## Shipped previous batch (2026-07-18 → 2026-07-20)

| Date | Slug | Title | Status |
|------|------|-------|--------|
| 2026-07-20 | `mcp-2026-07-28-stateless-spec-what-breaks` | MCP 2026-07-28 goes final: sessions die, HTTP wins | ✅ Drafted JSON |
| 2026-07-19 | `remote-vs-local-mcp-is-the-real-split` | Remote vs local is the real MCP split now | ✅ Drafted JSON |
| 2026-07-18 | `tools-indexed-beats-star-count-mcp` | “Tools indexed” beats star count for MCP servers | ✅ Drafted JSON |

---

## Already live (before this batch)

- Claude Tag brings MCP connectors into Slack workflows (Anthropic)
- Cursor teams standardize on MCP as the default agent perimeter
- Enterprise-managed MCP auth lands with Okta partnership
- The MCP long tail is real: 1,500+ servers indexed

---

## Backlog — next briefs to write

### Timely / protocol

#### 1. What to rip out before the deprecation clock starts
- **Angle:** Practical “stop relying on X” checklist after 2026-07-28 (session affinity, old Tasks experiments, auth shortcuts).
- **Source:** Influzer.ai (operator take)
- **Pairs with:** shipped spec brief · Insight: `mcp-deprecation-clock-what-to-rip-out-before-it-hits`
- **Status:** ✅ shipped 2026-08-05 (`mcp-rip-out-list-before-deprecation-clock`)

#### 2. New MCP headers are a security footgun
- **Angle:** Routable / `Mcp-Method`-style headers help ops — and can leak secrets into proxies/logs if teams map tokens into headers.
- **Source:** SecurityWeek / Akamai framing, Influzer voice
- **Pairs with:** `mcp-builders-oauth-tokens-and-the-over-permission-trap`
- **Status:** ✅ shipped 2026-08-22 (`dont-put-secrets-in-mcp-headers`)

### Catalog / Influzer-native

#### 3. Discovery MCP as the new “App Store search”
- **Angle:** Agents search by capability (“scrape to markdown”, “Postgres”) instead of humans browsing directories — what that changes for server authors.
- **Source:** Influzer.ai
- **CTA:** `/mcp/discovery/setup`
- **Pairs with:** `search-mcp-servers-from-claude-chatgpt-cursor-influzer-discovery`
- **Status:** ✅ shipped 2026-08-22 (`discovery-mcp-is-the-new-app-store-search`)

#### 4. Most MCP servers are still demoware
- **Angle:** Huge catalog, thin tool quality — how to spot production-ready in 30 seconds (transport, tool count, auth, docs).
- **Source:** Influzer.ai
- **Pairs with:** Insight `most-mcp-servers-are-still-demoware` · `mcp-server-audit-seven-questions-before-you-connect-another-tool`
- **Status:** ✅ shipped 2026-08-20 (`most-mcp-servers-are-still-demoware`)

### Client / workflow

#### 5. Project-level `.cursor/mcp.json` is becoming team policy
- **Angle:** Shared MCP configs in git = the new “which tools does this repo allow?” perimeter.
- **Source:** Influzer.ai / Cursor
- **Pairs with:** `how-to-set-up-your-first-mcp-servers-in-cursor`
- **Status:** ✅ shipped 2026-08-22 (`cursor-mcp-json-is-becoming-team-policy`)

#### 6. One connector, three surfaces
- **Angle:** Same remote MCP in Claude + ChatGPT + Cursor — why “works in Cursor” ≠ “works for the org.”
- **Source:** Influzer.ai
- **CTA:** setup guide tabs
- **Status:** ⬜todo

#### 7. Claude Code CLI vs Desktop connectors
- **Angle:** When to use `claude mcp add --transport http` vs web connectors; fallback when flags differ.
- **Source:** Influzer.ai
- **CTA:** `/mcp/discovery/setup` Claude Code tab
- **Status:** ⬜todo

### Enterprise / buyer

#### 8. MCP auth is moving from paste-a-key to IdP
- **Angle:** Follow-on to Okta brief — what IT will approve that engineering already ships.
- **Source:** Anthropic
- **Pairs with:** `enterprise-managed-mcp-auth-changes-the-game`
- **Status:** ⬜todo

#### 9. Policy before plugins
- **Angle:** Allowlisted MCP servers + no arbitrary `npx` in prod agents.
- **Source:** Influzer.ai
- **Status:** ⬜todo

### Contrarian / sharp

#### 10. Stdio isn’t dead — it’s just not enterprise
- **Angle:** Local still wins for secrets and air-gapped repos; remote wins for chat products. Stop treating them as one market.
- **Source:** Influzer.ai
- **Note:** Overlaps shipped “remote vs local” — only write if you want a sharper second cut or update with new data.
- **Status:** ⏸️parked (covered by shipped brief)

---

## Drafting checklist (when you pick one)

- [ ] One-sentence `excerpt` that can stand alone on `/news`
- [ ] `contentHtml` ~3 short paragraphs + bullets + **Why it matters**
- [ ] Link directory / Discovery / related Insight
- [ ] `date` ISO · `sourceName` · optional `sourceUrl` · `relatedInsightSlug`
- [ ] File: `content/news/<slug>.json`

## Cadence ideas

- **Mon:** protocol / vendor news
- **Wed:** Influzer catalog signal (tools, remotes, Discovery)
- **Fri:** client workflow (Cursor / Claude / ChatGPT)

---

## Quick copy seeds (titles only)

- What to rip out before the MCP deprecation clock starts
- Don’t put secrets in MCP headers
- Agents don’t browse GitHub — they search capabilities
- Most MCP servers are still demoware
- `.cursor/mcp.json` is becoming team policy
- One MCP, three surfaces — Claude, ChatGPT, Cursor
- Claude Code CLI vs Desktop connectors
- From paste-a-key to IdP: MCP auth grows up
- Policy before plugins: allowlists for agent tools
