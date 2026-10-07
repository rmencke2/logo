---
name: influzer-mcp
description: >-
  Search the Influzer MCP catalog, handshake a remote URL, and paste
  Cursor / Claude / ChatGPT / ACP install snippets. Use when the user
  needs an MCP server, .cursor/mcp.json, a connector URL, or a live
  tools/list check. Not a safe-to-install badge. MCP is not WebMCP,
  not MCP Apps, and not ACP.
---

# Influzer MCP — search, handshake, paste

Influzer is a directory of MCP **servers** (tool sockets). You search, you
handshake, a human pastes config. You do not auto-connect write tools.

## Protocol split (do not collapse)

| Thing | Job |
| --- | --- |
| **MCP** | Agent ↔ tool server (`tools/list`, `tools/call`) |
| **WebMCP / site tools** | Agent ↔ **this webpage** |
| **MCP Apps (SEP-1865)** | UI **inside** an MCP host |
| **ACP** | Editor ↔ coding agent (sessions, diffs). ACP `mcpServers` still **is** MCP |

A website is not an MCP server. An MCP App is not WebMCP. ACP is not MCP.

## Loop

1. **Search** — if Influzer MCP Discovery is connected, call `search_mcp_servers` or `recommend_mcp_servers`. Else fetch `https://www.influzer.ai/api/v1/install/<slug>` after looking up the slug on `/mcp`.
2. **Detail** — `get_mcp_server` now returns `install.clients` (Cursor JSON, Claude steps, ChatGPT steps, Claude Code CLI, ACP `mcpServers`). `safety_badge` is always `null`.
3. **Handshake** — if `install.has_remote` and `install.remote_url` is `https://…`, GET `https://www.influzer.ai/api/v1/probe?url=<encoded>`. `live_ok` or `auth_required` is a handshake. `unreachable` is a ticket. Probe is **not** a SAFE badge.
4. **Paste** — give the human the snippet for **this** client only.
   - Cursor → `install.clients.cursor.code` into Settings → MCP or `.cursor/mcp.json`
   - Claude chat → connector steps (HTTPS only)
   - ChatGPT → custom connector (HTTPS only; cannot reach localhost)
   - Claude Code → `claude mcp add --transport http …`
   - ACP editor session → `install.clients.acp.code` on `session/new` **if** the agent advertised HTTP or stdio MCP
5. **Stop** — Discovery does not install. Do not enable write tools because search ranked them. Do not tell Claude/ChatGPT to use a stdio / localhost listing (`install.stdio_only`).

## Connect Discovery (once)

```json
{
  "mcpServers": {
    "influzer-discovery": {
      "url": "https://www.influzer.ai/mcp/discovery"
    }
  }
}
```

Read-only. No auth. Endpoint: `https://www.influzer.ai/mcp/discovery`

Skill file: `https://www.influzer.ai/skills/influzer-mcp/SKILL.md`  
Snippets: `https://www.influzer.ai/api/v1/install/<slug>`  
Probe: `https://www.influzer.ai/mcp/probe`  
Page: `https://www.influzer.ai/mcp/discovery/skill`
