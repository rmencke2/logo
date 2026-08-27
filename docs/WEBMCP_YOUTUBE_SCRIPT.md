# YouTube: WebMCP on Influzer.ai — recording script

**Status:** Ready to film after PRs deploy (see checklist below)  
**Length:** ~8–10 minutes  
**Working title options:**
- “WebMCP in 10 minutes — tools on your website for AI agents”
- “How Influzer ships WebMCP (demo + setup)”
- “Native WebMCP: Chrome flag, origin trial, and a live demo”

**Live pages (after deploy):**
| Page | URL |
|------|-----|
| Demo + video tour | https://www.influzer.ai/webmcp/demo?tour=1 |
| Setup & launch guide | https://www.influzer.ai/webmcp/setup |
| About (WebMCP ≠ MCP) | https://www.influzer.ai/webmcp/about |
| Best MCP for Claude | https://www.influzer.ai/mcp/best/claude |
| Example server detail | https://www.influzer.ai/mcp/playwright |
| Submit / scan | https://www.influzer.ai/webmcp/submit |
| Tool manifest JSON | https://www.influzer.ai/api/webmcp/v1/self |

**Related PRs (merge order):**
1. Best-for-Claude stack (categories → comparisons → best Claude)
2. #45 — WebMCP origin trial + MCP detail / best-client tools
3. #46 — Setup guide + video tour + Chrome flag docs + `executeTool` JSON-string fix

---

## Before you hit record

### Browser (native mode — preferred for the video)
1. Install **Chrome Canary or Beta** (version **146+**).
2. Open `chrome://flags/#enable-webmcp-testing`.
3. Set **WebMCP for testing** → **Enabled**.
4. Relaunch Chrome.
5. Open https://www.influzer.ai/webmcp/demo  
   → **Mode** should say: `Native WebMCP (document.modelContext)`.

### Site (already on Influzer after #44/#45/#46)
- `Origin-Trial` HTTP header for `www.influzer.ai` (Edge / trial path).
- Demo must stringify args for native `executeTool` (fixed in #46).  
  Native API wants a **JSON string**, not a JS object:
  ```js
  // ✅ correct
  await document.modelContext.executeTool(tool, JSON.stringify({ q: "chat", limit: 5 }));
  // ❌ UnknownError: Failed to parse input arguments
  await document.modelContext.executeTool(tool, { q: "chat", limit: 5 });
  ```

### Tabs to pre-open
1. `/webmcp/demo?tour=1`
2. `/webmcp/setup`
3. `/webmcp/about`
4. `chrome://flags/#enable-webmcp-testing` (for a short B-roll cut)
5. Optional: `/mcp/best/claude`, `/mcp/playwright`
6. Optional terminal: `curl -sI https://www.influzer.ai/webmcp/demo | grep -i origin-trial`

### Fallback
If native isn’t available, the demo **polyfill** still runs tools — fine for filming, but call out “polyfill mode” on camera.

---

## Shot list (Say / Do)

### 0:00 — Hook
**Say:**  
Websites can now expose tools to AI agents in the browser. This is WebMCP — and I’ll show how Influzer ships it.

**Do:**  
Open `/webmcp/demo` in Chrome Canary with the flag on. Point at **Status = tools ready** and **Mode = Native WebMCP**.

---

### 0:40 — Browser prerequisite (Chrome)
**Say:**  
Stable Chrome is not enough yet. You need Canary or Beta 146+, then enable the WebMCP for testing flag and relaunch.

**Do:**  
Brief cut to `chrome://flags/#enable-webmcp-testing` set to **Enabled**, then back to the demo.

---

### 1:10 — What WebMCP is (and isn’t)
**Say:**  
MCP servers are backends you connect once. WebMCP tools live on the page — agents discover them while browsing. Influzer catalogs both, separately.

**Do:**  
Cut to `/webmcp/about`. Highlight **“WebMCP is not an MCP server.”**

---

### 1:50 — Video tour (live tools)
**Say:**  
Let’s run the same path an in-page agent uses: `getTools`, then `executeTool` with a JSON string.

**Do:**  
On `/webmcp/demo` click **Start video tour** (or open `?tour=1`). Narrate each scene:

| Scene | Tool / action | What to point at |
|-------|----------------|------------------|
| 1 | Detect | Mode + tool list from `getTools()` |
| 2 | Orient | `get_influzer_overview` |
| 3 | Search WebMCP sites | `search_webmcp_sites` `{ "q": "chat", "limit": 5 }` |
| 4 | Best for Claude | `get_best_mcp_client` `{ "slug": "claude" }` |
| 5 | Server profile | `get_mcp_server` `{ "slug": "playwright" }` |

Pause ~5–10s after each result so viewers can read the JSON.

---

### 4:15 — Setup: Chrome flag + origin trial
**Say:**  
For Chrome, flip the testing flag. For Edge and site-wide native unlocks, serve an Origin-Trial header — Influzer already does for www.influzer.ai.

**Do:**  
Show `/webmcp/setup` steps:
- **Enable WebMCP in Chrome (Canary / Beta)**
- **Enable the Edge / site origin trial**

Optional B-roll:
```bash
curl -sI https://www.influzer.ai/webmcp/demo | grep -i origin-trial
```

---

### 5:45 — Setup: registerTool
**Say:**  
Here’s the minimal `registerTool` call. Feature-detect, return structured content, degrade gracefully when the API isn’t there.

**Do:**  
On `/webmcp/setup`, show the registerTool code block. Optional: open `/api/webmcp/v1/self`.

**Key talking point:** Native `executeTool` second argument must be a **JSON string** (`"{}"`, not `{}`).

---

### 7:15 — Where it shows up on Influzer
**Say:**  
Server detail pages and Best-for-Claude guides also register tools — so agents get context where users already land.

**Do:**  
Quick cuts:
- `/mcp/playwright` (page context + WebMCP script)
- `/mcp/best/claude` (client guide tools)
- DevTools: `await document.modelContext.getTools()`

---

### 8:45 — CTA
**Say:**  
Try the demo, follow the setup guide, and list your site so agents can find you.

**Do — end cards / description links:**
1. https://www.influzer.ai/webmcp/demo  
2. https://www.influzer.ai/webmcp/setup  
3. https://www.influzer.ai/webmcp/submit  
4. Spec: https://github.com/webmachinelearning/webmcp  
5. Chrome docs: https://developer.chrome.com/docs/ai/webmcp  

---

## Suggested YouTube description (paste later)

```text
WebMCP lets websites expose tools to AI agents in the browser — no separate MCP server install.

In this video I show Influzer’s live WebMCP demo, how to enable native support in Chrome Canary, how the Origin-Trial header works, and how to register tools with document.modelContext.

Timestamps:
0:00 Hook — live demo (Native WebMCP)
0:40 Chrome Canary flag (chrome://flags/#enable-webmcp-testing)
1:10 WebMCP vs MCP servers
1:50 Video tour — getTools + executeTool
4:15 Setup guide — flag + origin trial
5:45 registerTool walkthrough
7:15 Tools on /mcp pages and Best for Claude
8:45 Try it yourself

Links:
• Demo: https://www.influzer.ai/webmcp/demo
• Setup: https://www.influzer.ai/webmcp/setup
• Submit your site: https://www.influzer.ai/webmcp/submit
• Best MCP for Claude: https://www.influzer.ai/mcp/best/claude
• WebMCP standard: https://github.com/webmachinelearning/webmcp
• Chrome docs: https://developer.chrome.com/docs/ai/webmcp

Chrome native setup:
1. Chrome Canary or Beta 146+
2. chrome://flags/#enable-webmcp-testing → Enabled → relaunch
```

---

## Suggested tags

`WebMCP`, `MCP`, `Model Context Protocol`, `AI agents`, `Chrome Canary`, `Influzer`, `Claude`, `document.modelContext`, `origin trial`, `browser AI`

---

## Context from the build conversation (don’t lose this)

- **Origin trial:** HTTP `Origin-Trial` header in Express (`services/core.js`) for `www.influzer.ai` — prefer header over meta tag.
- **Native executeTool bug we hit:** Passing a JS object → `UnknownError: Failed to parse input arguments`. Demo now stringifies; polyfill accepts both.
- **Chrome flag was missing from docs initially** — now on `/webmcp/setup#step-chrome-flag`, demo tip, About, and this script.
- **WebMCP surfaces wired:** home, `/mcp`, `/webmcp/*`, `/mcp/{slug}`, `/mcp/best`, `/mcp/best/claude`.
- **New tools include:** `get_mcp_server`, `get_current_mcp_server`, `copy_mcp_connection`, `list_best_mcp_clients`, `get_best_mcp_client`, `get_current_best_mcp_client`.
- **Polyfill:** Always available for filming if native isn’t on; banner on demo points to Chrome setup when in polyfill mode.

**On-site copy of the short outline also lives in:** `data/webmcp-setup-guide.js` → rendered at `/webmcp/setup#video-outline`.
