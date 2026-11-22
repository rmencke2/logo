# X posts — developers → Influzer.ai

Voice matches the existing social notes: concrete, protocol-accurate, no SAFE badge.

Every post is at or under 280 characters once each URL is counted as 23 (X `t.co` wrapping). Paste the text as written. The link is the traffic path; do not add hashtags on top.

Counts below are from the catalog service on 22 Nov 2026 (Europe/Rome), catalog timestamp `2026-11-22T14:05:25Z`:

- 15,032 MCP servers listed
- 538 with at least one indexed tool
- 5,683 tools indexed
- 12 categories

WebMCP directory meta, refreshed 16 Nov 2026 (`2026-11-16T17:18:30Z`):

- 9,123 sites
- 56,089 in-page tools

Recount `getCatalogStats()` and `data/webmcp-meta.json` before reusing a post that cites a number. Leave the 7-day handshake total out of posts: almost every stored probe is `auth_required`, and that status is a response, not a successful `tools/list`.

Suggested pace: three posts a week, in the order below. Alternate the destination so the profile is not the same URL every time.

---

## Week 1 — the loop

### 1. Hallucinated install (181)

Most "find me an MCP" answers are a hallucinated npx line and a localhost URL.

Search the catalog. Handshake the remote. Paste the snippet for this client.

https://www.influzer.ai/mcp/discovery/skill

### 2. Catalog gap (161)

15,032 MCP servers are listed on Influzer. 538 have at least one indexed tool.

Agents call tools. Star count is a different scoreboard.

https://www.influzer.ai/mcp

### 3. Three failures (190)

Search without a handshake is a blog post.
A handshake without a paste target is a JSON souvenir.
Paste the snippet for this client, or localhost ends up in ChatGPT.

https://www.influzer.ai/mcp/discovery/skill

---

## Week 2 — protocol split

### 4. Four sockets (158)

Four sockets. Four jobs.

MCP: agent ↔ tool server
WebMCP: agent ↔ this webpage
MCP Apps: UI inside a host
ACP: editor ↔ coding agent

https://www.influzer.ai/insights/your-website-is-not-an-mcp-server

### 5. Website vs connector (180)

Your website is not an MCP server.

A page can expose WebMCP tools. A remote connector is a separate HTTPS endpoint that answers initialize and tools/list.

https://www.influzer.ai/insights/your-website-is-not-an-mcp-server

### 6. Stdio lane (163)

Stdio listings stay on Cursor and the CLI.

Claude and ChatGPT need an HTTPS remote. A 127.0.0.1 URL in a chat connector is a dead config.

https://www.influzer.ai/mcp/discovery/skill

---

## Week 3 — install it

### 7. Discovery URL (214)

Connect this once. Read-only. No auth.

https://www.influzer.ai/mcp/discovery

Then ask for an MCP by the job: "Postgres read", "GitHub issues", "scrape to markdown". The agent searches. You still paste.

https://www.influzer.ai/mcp/discovery/setup

### 8. Skill file (234)

Teach the agent the loop, instead of letting it invent an install:

mkdir -p .cursor/skills/influzer-mcp && curl -fsSL -o .cursor/skills/influzer-mcp/SKILL.md https://www.influzer.ai/skills/influzer-mcp/SKILL.md

Search. Handshake. Paste. safety_badge stays null.

### 9. What a handshake is (237)

A handshake is initialize, then tools/list.

live_ok: the endpoint spoke and listed tools.
auth_required: it spoke and wants a credential.
unreachable: open a ticket.

A live tools/list is still not a SAFE badge.

https://www.influzer.ai/mcp/probe

---

## Week 4 — before it hits the team config

### 10. Thirty-second filter (214)

30 seconds before a server joins team mcp.json:

1. Transport matches the client
2. tools/list is a job, not hello
3. Auth has an owner and a revoke path
4. A second engineer can install it

https://www.influzer.ai/insights/most-mcp-servers-are-still-demoware

### 11. Eyes before hands (151)

Ship eyes before hands.

Search, docs, screenshots, read-only SQL. A write tool comes after it has an owner and a kill switch.

https://www.influzer.ai/insights/eyes-before-hands-readonly-mcp-starter-stack

### 12. Shared PAT (165)

A personal PAT in a shared .cursor/mcp.json is a weekend setup wearing a team badge.

Write tools need a scope, an owner, and a revoke path.

https://www.influzer.ai/insights/paste-a-key-is-dead-mcp-auth-checklist-it-will-sign

---

## Week 5 — Cursor and the agent boundary

### 13. Blind outside the repo (187)

The Cursor agent is sharp inside the repo and blind outside it.

Filesystem, GitHub, docs, search, browser. Add one server. Confirm tools/list. Then add the next.

https://www.influzer.ai/insights/how-to-set-up-your-first-mcp-servers-in-cursor

### 14. REST stays (166)

REST stays the contract between your services.

MCP is the agent boundary: one client, tools/list at runtime, servers you can swap in config.

https://www.influzer.ai/insights/mcp-servers-vs-rest-apis-why-developers-should-care

### 15. OpenAPI vs tools/list (160)

OpenAPI is for humans and codegen.

The agent needs the tools enabled in this session, with this credential. That answer is tools/list.

https://www.influzer.ai/mcp/all

---

## Week 6 — builders and WebMCP

### 16. The SDK you ship now (190)

If agents are a customer, the MCP server is the SDK.

Name the tools for a job. State stdio or HTTPS honestly. Publish a remote if Claude or ChatGPT should reach it.

https://www.influzer.ai/mcp/submit

### 17. WebMCP count (174)

9,123 sites in the WebMCP directory. 56,089 in-page tools. Refreshed 16 Nov 2026.

Declared tools on the page beat hoping the agent guesses your DOM.

https://www.influzer.ai/webmcp

### 18. Both layers (189)

WebMCP: the agent is on your site and should call that page's tools.
MCP: the agent needs GitHub, Postgres, or Slack across sessions.

Most products grow into both.

https://www.influzer.ai/insights/webmcp-vs-mcp-which-do-you-need

---

## Spare posts

Use these when a thread needs a reply, or when a scheduled post should wait because the cited number moved.

### 19. Headers (196)

Mcp-Method and Mcp-Name exist so a gateway can route without parsing the body.

A token or tenant id in those headers lands in access logs. Keep secrets in the auth layer.

https://www.influzer.ai/insights/dont-put-secrets-in-mcp-headers

### 20. Discovery does not install (147)

Discovery searches. It does not install.

Rank in the catalog is not a team allowlist. A human still turns write tools on.

https://www.influzer.ai/insights/policy-before-plugins-mcp-allowlist

### 21. Where to start (192)

Start at the Top 100 when you want a shortlist.

Open the full catalog (15,032 listings, 12 categories) when the job is niche: a database, a scraper, a SaaS connector.

https://www.influzer.ai/mcp

### 22. Reply bait (211)

Which MCP would you remove from a shared .cursor/mcp.json first?

Reply with the failure: no tools/list, stdio sold as remote, or a write tool with no owner.

The 30-second filter we use:
https://www.influzer.ai/insights/most-mcp-servers-are-still-demoware

Post 22 as its own post. Reply to the useful answers with post 10 or post 20, not with a second link to the same URL.

---

## Thread — builder checklist

Post in order, a few minutes apart. Each one stands alone if someone only sees that post.

### T1

Shipping an MCP server this week? The bar that gets you used:

- tools a model can select by name
- stdio or HTTPS, stated honestly
- auth with a revoke path
- setup a stranger finishes

### T2

Claude and ChatGPT cannot reach your laptop.

If those clients are the audience, the listing needs a public HTTPS remote. Stdio stays a Cursor and CLI install.

https://www.influzer.ai/insights/mcp-builders-the-producer-playbook

### T3

Submit the live endpoint. Indexed tools are what an agent can search. A README star count is not.

https://www.influzer.ai/mcp/submit
