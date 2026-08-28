# WebMCP Challenge entry — Agent Discovery Copilot

**OpenAI WebMCP Challenge:** https://openai.com/webmcp-challenge/  
**Devpost:** https://webmcp.devpost.com/  
**Live URL (judges):** https://www.influzer.ai/webmcp/challenge  
**Repo:** https://github.com/rmencke2/logo  
**Deadline:** September 3, 2026 @ 1:00 PM PT  

## One-line pitch

**Build your app inside ChatGPT while your agent discovers WebMCP websites and classic MCP servers from Influzer — inspect tools, pick a stack, open the site, wire MCP — without tab-hopping.**

## What we built (Aug 25 – Sep 3, 2026)

Pre-existing Influzer had a WebMCP directory (Aug 17). **Challenge-period work** adds collaborative discovery for app builders:

| Date | Change |
|------|--------|
| Aug 28 | `recommend_agent_stack` — dual-directory search for a build goal |
| Aug 28 | `get_mcp_server` — setup metadata for one classic MCP server |
| Aug 28 | `open_webmcp_site` — navigate browser tab to a catalogued WebMCP site |
| Aug 28 | `start_webmcp_listing_scan` + `get_webmcp_listing_scan` — agent-driven site submission |
| Aug 28 | `/webmcp/challenge` — ChatGPT-browser judge page + submission docs |
| Aug 28 | `GET /api/mcp/server/:slug` — API backing `get_mcp_server` |
| Aug 27 | WebMCP catalog sync → 358 sites (supporting data, not scored alone) |

See git log on branch `cursor/webmcp-challenge-d046` from `2026-08-25` onward.

## Judge testing (copy into Devpost)

**URL:** https://www.influzer.ai/webmcp/challenge  

**Browser:** ChatGPT desktop **in-app browser** (WebMCP enabled by default)  
**Alternative:** Chrome 149+ → `chrome://flags/#enable-webmcp-testing` → restart  

**Suggested flow (2–3 min):**

1. Open the URL in ChatGPT browser.
2. Ask: *“Use recommend_agent_stack — I'm building a booking app with calendar and email reminders. Show WebMCP sites and MCP servers to combine.”*
3. Ask: *“Get full tool schemas for the top WebMCP site and setup details for the top MCP server.”*
4. Ask: *“Open the best WebMCP site in this tab.”* (confirms `open_webmcp_site`)

**Manual console:** use presets on the same page → **Run executeTool()**.

## WebMCP implementation

Tools register via `document.modelContext.registerTool()` in `public/js/influzer-webmcp.js`:

```javascript
await document.modelContext.registerTool({
  name: 'recommend_agent_stack',
  description: 'Given an app goal, search WebMCP sites and classic MCP servers…',
  inputSchema: { type: 'object', properties: { goal: { type: 'string' } }, required: ['goal'] },
  async execute(args) {
    // … calls Influzer JSON APIs, returns structured stack
  },
});
```

Manifest: `data/influzer-webmcp-tools.json` · Self API: `GET /api/webmcp/v1/self`

### Tool list (13)

| Tool | Kind | Purpose |
|------|------|---------|
| `recommend_agent_stack` | answer | Dual discovery for build goals |
| `get_mcp_server` | answer | One MCP server + install steps |
| `open_webmcp_site` | act | Open catalogued site in tab |
| `start_webmcp_listing_scan` | act | **New** — submit URL + email for scan/listing |
| `get_webmcp_listing_scan` | answer | **New** — poll scan status + scorecard |
| `search_webmcp_sites` | answer | Search 358+ WebMCP websites |
| `search_webmcp_tools` | answer | Search tools across all sites |
| `get_webmcp_site` | answer | Site detail + schemas |
| `search_mcp_servers` | answer | Search 14k+ classic MCP servers |
| `get_webmcp_directory_stats` | answer | Live counts |
| `get_influzer_overview` | answer | Entry point for agents |
| `list_latest_insights` | answer | Agent briefings |
| `navigate_influzer` | act | Same-origin navigation |

## Human + agent together

- **Human:** describes the app they’re building in ChatGPT.
- **Agent:** calls Influzer WebMCP tools on the open page (no scraping).
- **Together:** pick WebMCP for browser UX + MCP for backend; open the site and continue building.

## Docs for submission

- Devpost description: `docs/WEBMCP_CHALLENGE_DEVPOST.md`
- Video shot list: `docs/WEBMCP_CHALLENGE_VIDEO.md`

## Local verify

```bash
npm run test-influzer-webmcp
node scripts/demo-influzer-webmcp.js
npm run upsert-influzer-webmcp   # refresh catalog listing for influzer.ai
```

## License

ISC — see `LICENSE` in repo root.
