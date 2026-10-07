# Social copy — Influzer MCP agent skill

Canonical: https://www.influzer.ai/insights/search-handshake-paste-influzer-mcp-skill
Skill: https://www.influzer.ai/mcp/discovery/skill
SKILL.md: https://www.influzer.ai/skills/influzer-mcp/SKILL.md

Do not send as newsletter unless asked.

---

## Reddit

**Title**

We shipped an MCP agent skill: search a catalog, handshake the URL, paste client config — and we still will not call it “safe”

**Body**

Most “find me an MCP for X” threads still end the same way: a hallucinated `npx` line, a localhost URL pasted into Claude, and zero `tools/list`.

Influzer already had three pieces:

1. **Discovery** — read-only MCP at `https://www.influzer.ai/mcp/discovery` (search the catalog from the agent)
2. **Probe** — `GET /api/v1/probe?url=…` does `initialize` + `tools/list`. `live_ok` / `auth_required` is a handshake. It is not a SAFE badge.
3. **Install snippets** — per listing, Cursor `.cursor/mcp.json`, Claude connector steps, ChatGPT custom connector, `claude mcp add --transport http`, ACP `mcpServers`. Stdio listings stay Cursor/CLI-only. Claude and ChatGPT cannot reach localhost.

What was missing: the agent still had to invent the loop.

So we published a `SKILL.md` that teaches that loop, and we put the snippets **inside** `get_mcp_server` so the agent does not need a second HTTP fetch.

```
mkdir -p .cursor/skills/influzer-mcp && curl -fsSL -o .cursor/skills/influzer-mcp/SKILL.md \
  https://www.influzer.ai/skills/influzer-mcp/SKILL.md
```

Also: MCP ≠ WebMCP ≠ MCP Apps ≠ ACP. A website is not an MCP server. An editor agent socket is not a tool socket.

Write-up: https://www.influzer.ai/insights/search-handshake-paste-influzer-mcp-skill

Happy to take “this SKILL.md is too cute / too long / wrong for Claude Code” as a comment. The catalog still will not stamp SAFE.

---

## LinkedIn

We keep shipping MCP “connect” buttons as if search were install.

This week Influzer closed the actual loop:

Search the catalog from the agent (Discovery). Handshake the HTTPS URL (`initialize` + `tools/list`). Paste the snippet for *this* client — Cursor, Claude, ChatGPT, Claude Code, or ACP `mcpServers`.

That loop is now a `SKILL.md`. Discovery’s `get_mcp_server` returns the snippets in-band. `safety_badge` is still null. Stdio stays laptop-only; Claude and ChatGPT do not get a localhost URL.

MCP is the tool socket. WebMCP is the page. MCP Apps are widgets in a host. ACP is the editor ↔ agent socket. Collapse those four and you will allowlist the wrong object.

Skill: https://www.influzer.ai/mcp/discovery/skill
Notes: https://www.influzer.ai/insights/search-handshake-paste-influzer-mcp-skill
