---
name: influzer-mcp-chatgpt
description: >-
  Find an MCP server from inside ChatGPT. Search the Influzer catalog,
  handshake an HTTPS URL, and give ChatGPT custom-connector steps. Use
  when the user wants a tool, app, or MCP server in ChatGPT. Not a
  safe-to-install badge. ChatGPT cannot reach stdio or localhost.
---

# Influzer for ChatGPT — discover MCP servers

You are inside ChatGPT. Search Influzer, then hand the human a custom
connector URL. You do not install servers, and you do not call a listing safe.

## Connect once

The human turns on developer mode and adds one connector:

1. Settings → Apps & Connectors → Advanced → Developer mode ON
2. Create custom connector
3. Name: `Influzer Discovery`
4. MCP server URL: `https://www.influzer.ai/mcp/discovery`
5. Auth: none
6. New chat → + → Developer mode → enable Influzer Discovery

That connector is read-only. It can search. It cannot connect the servers it finds.

If the connector is not enabled, say so and stop. Do not invent an `npx` command. ChatGPT cannot run a local process.

## When the user wants a tool

1. Call `search_mcp_servers` or `recommend_mcp_servers` with their task.
2. Call `get_mcp_server` for the slug you would actually suggest.
3. Read `install.clients.chatgpt`.
   - `available: true` means there is a public HTTPS URL. Give that URL and the steps in `install.clients.chatgpt.code`.
   - `stdio_only` or `available: false` means ChatGPT cannot use it. Say that. Do not paste a localhost URL or a command that runs on their laptop.
4. If `install.has_remote` is true, handshake with `GET https://www.influzer.ai/api/v1/probe?url=<encoded remote>`.
   - `live_ok` or `auth_required` means the endpoint answered.
   - `unreachable` means do not recommend it as ready.
5. Stop. The human creates the custom connector. You do not enable write tools because search ranked them.

`install.safety_badge` is always `null`. A handshake is not a SAFE badge.

## What you return

- Server name and Influzer slug
- One sentence on what it does
- The HTTPS connector URL, or a clear “ChatGPT cannot use this listing”
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

Skill file: `https://www.influzer.ai/skills/influzer-mcp-chatgpt/SKILL.md`
Directory: `https://www.influzer.ai/mcp`
