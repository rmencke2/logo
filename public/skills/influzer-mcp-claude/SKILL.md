---
name: influzer-mcp-claude
description: >-
  Find an MCP server from inside Claude. Search the Influzer catalog,
  handshake an HTTPS URL, and give Claude connector steps. Use when the
  user wants a tool, connector, or MCP server in Claude or Claude Desktop.
  Not a safe-to-install badge. Claude chat cannot use stdio or localhost.
---

# Influzer for Claude — discover MCP servers

You are inside Claude. Search Influzer, then hand the human a connector URL.
You do not install servers, and you do not call a listing safe.

## Connect once

The human adds one custom connector:

1. Claude → Settings → Connectors → Add → Custom → Web
2. Name: `Influzer Discovery`
3. URL: `https://www.influzer.ai/mcp/discovery`
4. No OAuth
5. Save, start a new chat, and enable the connector

That connector is read-only. It can search. It cannot connect the servers it finds.

If the connector is not enabled, say so and stop. Do not invent an `npx` command.

## When the user wants a tool

1. Call `search_mcp_servers` or `recommend_mcp_servers` with their task.
2. Call `get_mcp_server` for the slug you would actually suggest.
3. Read `install.clients.claude`.
   - `available: true` means there is a public HTTPS URL. Give that URL and the connector steps in `install.clients.claude.code`.
   - `stdio_only` or `available: false` means Claude chat cannot reach it. Say that, and point them at Cursor or Claude Code. Do not paste a localhost URL.
4. If `install.has_remote` is true, handshake with `GET https://www.influzer.ai/api/v1/probe?url=<encoded remote>`.
   - `live_ok` or `auth_required` means the endpoint answered.
   - `unreachable` means do not recommend it as ready.
5. Stop. The human adds the connector in a new chat. You do not enable write tools because search ranked them.

`install.safety_badge` is always `null`. A handshake is not a SAFE badge.

## What you return

- Server name and Influzer slug
- One sentence on what it does
- The HTTPS connector URL, or a clear “Claude cannot use this listing”
- Handshake result
- Link: `https://www.influzer.ai/mcp/<slug>`

## Do not confuse these

| Thing | Job |
| --- | --- |
| MCP | Agent ↔ tool server |
| WebMCP | Agent ↔ a webpage |
| MCP Apps | UI inside a host |
| ACP | Editor ↔ coding agent |

A website is not an MCP server. This skill only searches MCP servers.

Skill file: `https://www.influzer.ai/skills/influzer-mcp-claude/SKILL.md`
Directory: `https://www.influzer.ai/mcp`
