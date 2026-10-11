'use strict';

const assert = require('node:assert/strict');
const { buildMcpApprovalEmailContent } = require('../emailService');

function main() {
  const content = buildMcpApprovalEmailContent({
    submission: {
      submitterName: 'Alex',
      submitterEmail: 'alex@example.com',
      serverName: 'Example MCP',
      category: 'Dev Tools',
    },
    server: {
      name: 'Example MCP',
      slug: 'example-mcp',
      category: 'Dev Tools',
      tools: [{ name: 'ping' }, { name: 'pong' }],
    },
    pageUrl: '/mcp/example-mcp',
    baseUrl: 'https://www.influzer.ai',
  });

  assert.match(content.subject, /Example MCP/);
  assert.match(content.html, /View your listing/);
  assert.match(content.html, /Sponsored placement/);
  assert.match(content.html, /Share a recipe/);
  assert.match(content.html, /mcp\/promote\?slug=example-mcp/);
  assert.match(content.html, /recipes\/new\?server=example-mcp/);
  assert.match(content.text, /Grow the listing/);
  assert.match(content.text, /mcp\/promote\?slug=example-mcp/);
  assert.match(content.text, /recipes\/new\?server=example-mcp/);
  assert.equal(
    content.nextSteps.promoteUrl,
    'https://www.influzer.ai/mcp/promote?slug=example-mcp',
  );
  assert.equal(
    content.nextSteps.recipeUrl,
    'https://www.influzer.ai/recipes/new?server=example-mcp',
  );
  assert.ok(content.nextSteps.priceUsd >= 1);

  console.log('MCP approval email CTA tests passed');
}

main();
