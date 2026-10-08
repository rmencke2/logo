'use strict';

const assert = require('node:assert/strict');
const { fetchLiveMcpTools, parseMcpResponseBody } = require('./utils/mcp-live-client');

async function main() {
  const json = parseMcpResponseBody('{"jsonrpc":"2.0","id":1,"result":{}}', 'application/json');
  assert.equal(json[0].id, 1);

  const sse = parseMcpResponseBody(
    'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n',
    'text/event-stream',
  );
  assert.equal(sse[0].result.ok, true);

  assert.throws(() => parseMcpResponseBody('Unauthorized', 'text/plain; charset=utf-8'));

  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response('Unauthorized', {
      status: 401,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'www-authenticate':
          'Bearer resource_metadata="https://mcp.figma.com/.well-known/oauth-protected-resource"',
      },
    });
  try {
    const gated = await fetchLiveMcpTools('https://mcp.figma.com/mcp');
    assert.equal(gated.status, 'auth_required');
    assert.equal(gated.httpStatus, 401);
    assert.match(String(gated.reason), /Unauthorized/i);
  } finally {
    global.fetch = originalFetch;
  }

  console.log('mcp live client tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
