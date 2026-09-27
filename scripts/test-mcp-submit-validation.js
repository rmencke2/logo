'use strict';

const assert = require('node:assert/strict');
const { validateSubmission } = require('../services/mcpSubmissionService');

function validBody(overrides = {}) {
  return {
    submitter_email: 'owner@example.com',
    submitter_name: 'Owner',
    server_name: 'Example MCP',
    description: 'A server that lists repositories and opens pull requests for agents.',
    category: 'Other',
    transport: 'http',
    github_url: 'https://github.com/org/example-mcp',
    tools: 'list_repos — List repositories\nopen_pr — Open a pull request',
    ...overrides,
  };
}

function main() {
  const ok = validateSubmission(validBody());
  assert.ok(!ok.errors, 'valid payload should not return errors');
  assert.equal(ok.data.tools.length, 2);
  assert.equal(ok.data.githubUrl, 'https://github.com/org/example-mcp');

  const noUrl = validateSubmission(
    validBody({ github_url: '', docs_url: '', primary_url: '' }),
  );
  assert.ok(noUrl.errors?.some((e) => /at least one MCP server URL/i.test(e)));

  const docsOnly = validateSubmission(
    validBody({ github_url: '', docs_url: 'https://docs.example.com/mcp', primary_url: '' }),
  );
  assert.ok(!docsOnly.errors, 'docs URL alone should satisfy the URL requirement');

  const noTools = validateSubmission(validBody({ tools: '   \n  ' }));
  assert.ok(noTools.errors?.some((e) => /at least one tool/i.test(e)));

  const invalidUrl = validateSubmission(validBody({ github_url: 'not-a-url' }));
  assert.ok(invalidUrl.errors?.some((e) => /GitHub URL must be a valid/i.test(e)));

  console.log('MCP submit validation tests passed');
}

main();
