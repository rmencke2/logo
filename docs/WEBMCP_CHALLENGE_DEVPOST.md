# Devpost submission text — Agent Discovery Copilot

Copy sections into https://webmcp.devpost.com/ when submitting.

---

## Project name

**Agent Discovery Copilot** (by Influzer.ai)

---

## Tagline (short)

Discover WebMCP sites + MCP servers while you build — inside ChatGPT’s browser.

---

## Inspiration

Building with AI agents breaks down at discovery. You’re coding in ChatGPT, you need a Postgres MCP and a WebMCP site with checkout — but the agent can’t see registries. You open five tabs, copy slugs, lose context.

We run two directories on Influzer.ai — **358 WebMCP websites** (browser-native tools) and **14,000+ classic MCP servers** (backend integrations). We exposed both as **WebMCP tools on the page itself**, so when ChatGPT’s browser is on influzer.ai, the agent searches, compares, and opens the right site **while you keep building**.

---

## What it does

Open **https://www.influzer.ai/webmcp/challenge** in ChatGPT’s in-app browser.

1. You describe an app: *“booking flow + Postgres + email.”*
2. The agent calls **`recommend_agent_stack`** — searches **both** directories at once.
3. You ask for details → **`get_webmcp_site`** (tool schemas) + **`get_mcp_server`** (install steps).
4. You pick a site → **`open_webmcp_site`** navigates the tab so you and the agent use **that site’s own WebMCP tools**.

**Bonus — list your own site:**  
5. You say *“Submit https://mysite.com — email me@co.com”* → agent calls **`start_webmcp_listing_scan`** (with `user_confirmed: true`) → polls **`get_webmcp_listing_scan`** until tools + scorecard return.

No OAuth. No scraping the UI. Structured tools via `document.modelContext`.

---

## Why WebMCP (fit for the challenge)

WebMCP is for **sites that become better when an agent is in the room**. Influzer is a discovery layer — but the challenge entry is the **build-session copilot**: the directory isn’t a static list, it’s **callable tools on the page** while you ship an app.

- **Answer tools** — search, recommend, inspect schemas  
- **Act tools** — navigate to Influzer paths or open external WebMCP sites  
- **Human + agent** — you choose; the agent executes discovery; you stay in one chat  

---

## How we built it

- **`public/js/influzer-webmcp.js`** — registers 11 tools with `document.modelContext.registerTool()`
- **`data/influzer-webmcp-tools.json`** — manifest (schemas, descriptions, kinds)
- **APIs** — `/api/webmcp/v1/*`, `/api/mcp/search`, `/api/mcp/server/:slug`
- **Challenge additions (Aug 28)** — `recommend_agent_stack`, `get_mcp_server`, `open_webmcp_site`, `/webmcp/challenge`

Polyfill included for browsers without native WebMCP; ChatGPT in-app browser uses native discovery.

---

## What’s difficult or impossible without WebMCP

Before: agent guesses UI, hallucinates server names, or you paste directory links manually.  
After: agent calls **`search_webmcp_tools`** by capability, **`get_mcp_server`** for install commands, **`open_webmcp_site`** to continue on a live site — **in one browser session while building**.

---

## Testing instructions (for judges)

| Field | Value |
|-------|--------|
| **Live URL** | https://www.influzer.ai/webmcp/challenge |
| **Browser** | ChatGPT desktop in-app browser **or** Chrome 149+ with `#enable-webmcp-testing` |
| **Auth** | None |

**Prompt 1:**  
*Use recommend_agent_stack — I'm building an e-commerce app with cart and Postgres. Show WebMCP sites and MCP servers to combine.*

**Prompt 2:**  
*Get tool schemas for the top WebMCP site and setup details for the top MCP server.*

**Prompt 3:**  
*Open the best WebMCP site in this tab.*

**Repo:** https://github.com/rmencke2/logo (ISC license)  
**New work:** `docs/WEBMCP_CHALLENGE.md` + commits after Aug 25, 2026 on `cursor/webmcp-challenge-d046`

---

## Built with

- WebMCP (`document.modelContext`)
- Node.js / Express
- Influzer catalog JSON pipelines

---

## License

ISC — see LICENSE in repository root.
