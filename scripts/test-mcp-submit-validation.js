'use strict';

const assert = require('node:assert/strict');
const {
  validateSubmission,
  submissionNotification,
  redactSubmission,
  bearerFromSubmission,
  testAccountListFields,
} = require('../services/mcpSubmissionService');

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

  assert.equal(ok.data.testAccount, null);

  const secret = 'super-secret-token-xyz';
  const withToken = validateSubmission(
    validBody({
      test_account_kind: 'bearer',
      test_account_secret: secret,
      test_account_consent: true,
      test_account_notes: 'Reads one demo workspace.',
    }),
  );
  assert.ok(!withToken.errors, 'optional bearer test account should be accepted');
  assert.equal(withToken.data.testAccount.secret, secret);
  assert.equal(bearerFromSubmission(withToken.data), secret);

  const notification = submissionNotification(withToken.data);
  assert.equal(JSON.stringify(notification).includes(secret), false);
  assert.match(notification.testAccountSummary, /bearer token/);
  assert.match(notification.testAccountSummary, /Not included in this email/);

  const redacted = redactSubmission({ ...withToken.data, filePath: '/tmp/secret.json' });
  assert.equal(JSON.stringify(redacted).includes(secret), false);
  assert.equal(redacted.filePath, undefined);
  assert.equal(redacted.testAccount.provided, true);
  assert.equal(redacted.testAccount.kind, 'bearer');

  const listed = testAccountListFields(withToken.data.testAccount);
  assert.equal(listed.testAccountProvided, true);
  assert.equal(listed.testAccountKind, 'bearer');
  assert.equal(JSON.stringify(listed).includes(secret), false);
  assert.deepEqual(testAccountListFields(null), {
    testAccountProvided: false,
    testAccountKind: '',
  });
  assert.equal(
    testAccountListFields({ kind: 'login', secret: 'read-only-pass' }).testAccountKind,
    'login',
  );

  const noConsent = validateSubmission(
    validBody({ test_account_kind: 'bearer', test_account_secret: secret }),
  );
  assert.ok(noConsent.errors?.some((e) => /initialize and tools\/list/i.test(e)));

  const login = validateSubmission(
    validBody({
      test_account_kind: 'login',
      test_account_label: 'reviewer@example.com',
      test_account_secret: 'read-only-pass',
      test_account_login_url: 'https://example.com/login',
      test_account_consent: true,
    }),
  );
  assert.ok(!login.errors);
  assert.equal(bearerFromSubmission(login.data), null);

  const httpLogin = validateSubmission(
    validBody({
      test_account_kind: 'login',
      test_account_label: 'reviewer@example.com',
      test_account_secret: 'read-only-pass',
      test_account_login_url: 'http://example.com/login',
      test_account_consent: true,
    }),
  );
  assert.ok(httpLogin.errors?.some((e) => /https/i.test(e)));

  const leaked = validateSubmission(
    validBody({
      description: `A server that lists repositories. Token ${secret} is in the description.`,
      test_account_kind: 'bearer',
      test_account_secret: secret,
      test_account_consent: true,
    }),
  );
  assert.ok(leaked.errors?.some((e) => /secret field only/i.test(e)));

  console.log('MCP submit validation tests passed');
}

main();
