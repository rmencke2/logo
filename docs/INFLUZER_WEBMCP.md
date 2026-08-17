# Influzer.ai WebMCP — demo & test guide

Influzer registers real browser tools with the emerging [WebMCP](https://github.com/webmachinelearning/webmcp) API (`document.modelContext`). Agents can search our directories and navigate the site without scraping the DOM.

## Try it in the browser

1. Open **https://www.influzer.ai/webmcp/demo**
2. Pick a tool, edit JSON args, click **Run executeTool()**
3. Or in DevTools:

```js
const tools = await document.modelContext.getTools();
console.table(tools.map(t => ({ name: t.name, description: t.description })));
await document.modelContext.executeTool(
  tools.find(t => t.name === 'search_webmcp_sites'),
  { q: 'chat', limit: 5 }
);
```

If your browser does not ship WebMCP yet, the page installs a **local polyfill** so the same console still works for demos and QA.

## Tool list

Manifest: `GET /api/webmcp/v1/self` · source: `data/influzer-webmcp-tools.json`

| Tool | Kind | Purpose |
|------|------|---------|
| `get_influzer_overview` | answer | Site summary + key URLs |
| `get_webmcp_directory_stats` | answer | Directory counts |
| `search_webmcp_sites` | answer | Search WebMCP websites |
| `get_webmcp_site` | answer | One site + tools/schemas |
| `search_webmcp_tools` | answer | Cross-site tool search |
| `search_mcp_servers` | answer | Search MCP server directory |
| `list_latest_insights` | answer | Recent articles |
| `navigate_influzer` | act | Navigate to a same-origin path |

## Node smoke test (same APIs the tools call)

```bash
# against local server
npm start
npm run demo-influzer-webmcp

# against production
BASE_URL=https://www.influzer.ai npm run demo-influzer-webmcp
```

Unit checks (no server required):

```bash
npm run test-influzer-webmcp
```

## Refresh catalog entry after editing tools

```bash
npm run upsert-influzer-webmcp
# or as part of a full upstream refresh:
npm run refresh-webmcp
```
