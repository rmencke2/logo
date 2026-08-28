# WebMCP Challenge — 3-minute demo video shot list

**Target length:** 2:45 (under 3:00 hard limit)  
**Format:** Screen recording + voiceover  
**Upload:** Public YouTube, link in Devpost  

---

## Pre-recording checklist

- [ ] ChatGPT desktop app updated, **in-app browser** works
- [ ] Or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled
- [ ] https://www.influzer.ai/webmcp/challenge loads (deploy challenge branch first)
- [ ] Mic test, 1080p display, hide notifications
- [ ] Script rehearsed once

---

## Shot list

### 0:00–0:20 — Hook (talking head optional, or voice over title card)

**VO:**  
*"You're building an app in ChatGPT. You need tools — a WebMCP site for checkout, an MCP server for Postgres. Today you open ten tabs. What if discovery lived on the page?"*

**Visual:** Title card → ChatGPT new chat

---

### 0:20–0:35 — Problem

**Visual:** Split screen or quick cuts — Glama, random README, empty agent shrug (optional)

**VO:**  
*"Agents can't search registries unless you give them structured tools. That's WebMCP."*

---

### 0:35–1:30 — Core demo (ChatGPT in-app browser) ⭐ MOST IMPORTANT

**Visual:** ChatGPT → open browser → navigate to `influzer.ai/webmcp/challenge`

**VO:**  
*"I open Influzer's challenge page in ChatGPT's browser. WebMCP tools register automatically."*

**Type in chat (show typing):**  
> Use recommend_agent_stack — I'm building a booking app with calendar sync and email reminders. Show WebMCP sites and MCP servers I should combine.

**Visual:** Agent calls tool, structured JSON returns — **zoom** on `webmcp_sites` and `mcp_servers` sections

**VO:**  
*"One call searches three hundred fifty-eight WebMCP websites and fourteen thousand MCP servers — by what they actually do, not their name."*

**Follow-up prompt:**  
> Get tool schemas for the top WebMCP site and setup details for the top MCP server.

**Visual:** Show `get_webmcp_site` + `get_mcp_server` results with tool names

**VO:**  
*"Schemas for browser tools, install steps for backend MCP — still in the same chat."*

---

### 1:30–2:05 — Human + agent act together

**Type:**  
> Open the best WebMCP site in this tab.

**Visual:** Tab navigates to external site (or influzer.ai if safer). If external site has tools, show agent noticing new tools (optional bonus)

**VO:**  
*"I confirm — the agent opens the site. Now we're building on the live app, not a bookmark."*

---

### 2:05–2:30 — WebMCP proof for judges

**Visual:** Quick cut to repo `public/js/influzer-webmcp.js` — scroll to `registerTool` for `recommend_agent_stack`

**VO:**  
*"Real document.modelContext.registerTool — eleven tools, answer and act kinds, open source on GitHub."*

**Visual:** Optional 5s of `/webmcp/challenge` tool console preset **recommend stack** → Run

---

### 2:30–2:45 — Close

**Visual:** Back to ChatGPT chat or challenge page hero

**VO:**  
*"Agent Discovery Copilot — build your app while Influzer finds WebMCP and MCP tools for you. influzer.ai/webmcp/challenge."*

**End card:** URL + GitHub link

---

## B-roll options (if short on time)

- `/webmcp` directory hero (358 sites)
- `/mcp` hero (14k servers)
- DevTools: `await document.modelContext.getTools()`

---

## What NOT to include

- Long catalog scrolling without agent interaction
- More than 3 minutes (judges may stop watching)
- Copyrighted music
- Claiming WebMCP is production-stable everywhere (say "ChatGPT browser + Chrome flag")

---

## After upload

1. Paste YouTube URL into Devpost  
2. Same URL in `WEBMCP_CHALLENGE.md`  
3. Double-check live URL matches deployed commit
