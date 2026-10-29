/**
 * /llms.txt body. Counts come from catalog copy. Missing counts are omitted.
 */

function buildLlmsTxt(copy = {}) {
  const lines = [
    '# Influzer.ai',
    '',
    'MCP server directory. A handshake is a timed HTTPS initialize and tools/list. The verification grade is not a safety score.',
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
    '- https://www.influzer.ai/',
    '- https://www.influzer.ai/mcp',
    '- https://www.influzer.ai/mcp/all',
    '- https://www.influzer.ai/methodology',
    '- https://www.influzer.ai/mcp/discovery/setup',
    '- https://www.influzer.ai/mcp/scoreboard',
    '- https://www.influzer.ai/mcp/changes',
    '',
    '## Clients',
    'Discovery MCP is read-only and does not require auth: https://www.influzer.ai/mcp/discovery',
    'Install JSON for one listing: https://www.influzer.ai/api/v1/install/{slug}',
    'Probe badge: https://www.influzer.ai/api/v1/probe/badge',
    'robots.txt disallows /api/. Use the HTML pages and the Discovery setup guide instead of crawling those routes.',
    '',
    'Sitemap: https://www.influzer.ai/sitemap.xml',
    'The sitemap includes the Top 100, listings with indexed tools, manual listings, and featured listings. It does not include every catalog row.',
    '',
  );
  return lines.join('\n');
}

module.exports = { buildLlmsTxt };
