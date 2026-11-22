/**
 * /llms.txt body. Counts come from catalog copy. Missing counts are omitted.
 *
 * PageSpeed / Lighthouse Agentic Browsing requires:
 * - a Markdown H1 (`# Title`)
 * - at least one Markdown link `[text](url)`
 * - 50+ characters
 */

function buildLlmsTxt(copy = {}) {
  const lines = [
    '# Influzer.ai',
    '',
    '> MCP server directory and WebMCP catalog for AI agents. A handshake is a timed HTTPS initialize and tools/list. The verification grade is not a safety score.',
    '',
  ];
  if (copy.countSentence) {
    lines.push(String(copy.countSentence));
    lines.push('');
  }
  if (copy.updated) {
    lines.push(`Catalog updated: ${copy.updated}`);
    lines.push('');
  }
  lines.push(
    '## Pages',
    '- [Home](https://www.influzer.ai/)',
    '- [MCP directory](https://www.influzer.ai/mcp)',
    '- [All MCP servers](https://www.influzer.ai/mcp/all)',
    '- [Handshake methodology](https://www.influzer.ai/methodology)',
    '- [Discovery MCP setup](https://www.influzer.ai/mcp/discovery/setup)',
    '- [Live handshake scoreboard](https://www.influzer.ai/mcp/scoreboard)',
    '- [MCP allowlist / policy pack](https://www.influzer.ai/mcp/allowlist)',
    '- [Handshake changes](https://www.influzer.ai/mcp/changes)',
    '- [WebMCP directory](https://www.influzer.ai/webmcp)',
    '- [MCP recipes](https://www.influzer.ai/recipes)',
    '- [Insights](https://www.influzer.ai/insights)',
    '- [Get started with MCP servers](https://www.influzer.ai/insights/get-started-with-mcp-servers)',
    '',
    '## Clients',
    '- [Discovery MCP endpoint](https://www.influzer.ai/mcp/discovery) — read-only, no auth',
    '- [Discovery setup guide](https://www.influzer.ai/mcp/discovery/setup)',
    '- Install JSON for one listing: `https://www.influzer.ai/api/v1/install/{slug}`',
    '- Allowlist pack API: `https://www.influzer.ai/api/v1/mcp/allowlist`',
    '- Probe badge: `https://www.influzer.ai/api/v1/probe/badge`',
    '',
    '[robots.txt](https://www.influzer.ai/robots.txt) disallows `/api/`. Prefer the HTML pages and Discovery setup guide over crawling API routes.',
    '',
    '[Sitemap](https://www.influzer.ai/sitemap.xml) includes the Top 100, listings with indexed tools, manual listings, and featured listings. It does not include every catalog row.',
    '',
  );
  return lines.join('\n');
}

module.exports = { buildLlmsTxt };
