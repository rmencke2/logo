#!/usr/bin/env node
'use strict';

/**
 * Unit tests for classic MCP external source helpers (no network).
 */

const assert = require('assert');
const {
  makeCandidate,
  candidateToServer,
  candidateKey,
  parseAwesomeMarkdown,
  parseOfficialMcpReadme,
  normalizeEndpointKey,
  findInCatalog,
} = require('../services/mcpExternalSources');

const c = makeCandidate({
  name: 'Fetch',
  slug: 'mcp-fetch',
  description: 'Web content fetching',
  github_url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
  source_id: 'official-mcp-servers',
  source_name: 'modelcontextprotocol/servers',
  official: true,
});
assert.equal(c.slug, 'mcp-fetch');
assert.ok(candidateKey(c).startsWith('gh:') || candidateKey(c).startsWith('slug:'));

const server = candidateToServer(c);
assert.equal(server.slug, 'mcp-fetch');
assert.equal(server.source, 'discovered');
assert.equal(server.official, true);
assert.ok(server.description.length >= 12);

assert.equal(
  normalizeEndpointKey('https://api.example.com/mcp/'),
  'api.example.com/mcp',
);
assert.equal(normalizeEndpointKey('not a url'), null);

const awesome = parseAwesomeMarkdown(
  `
- **[Brave Search](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/brave-search)** - Web search
- [Other](https://github.com/foo/bar-mcp) — helper
`,
  { id: 'awesome-mcp', name: 'awesome' },
);
assert.ok(awesome.length >= 2);
assert.ok(awesome.some((x) => /brave/i.test(x.name)));

const official = parseOfficialMcpReadme(
  `
## Reference Servers
- **[Memory](src/memory)** - Knowledge graph memory
- **[Fetch](src/fetch)** - Web fetch
- **[Brave Search](https://github.com/modelcontextprotocol/servers-archived/tree/main/src/brave-search)** - Search
`,
  { id: 'official-mcp-servers', name: 'official' },
);
assert.equal(official.length, 3);
assert.ok(official.some((x) => x.name === 'Memory'));
assert.ok(official.some((x) => x.name === 'Fetch'));
assert.ok(official.some((x) => /brave/i.test(x.name)));
assert.ok(official.find((x) => x.name === 'Memory').github_url.includes('src/memory'));
assert.ok(
  candidateKey(official.find((x) => x.name === 'Memory')) !==
    candidateKey(official.find((x) => x.name === 'Fetch')),
);

const index = {
  bySlug: new Map([['mcp-fetch', { slug: 'mcp-fetch' }]]),
  byGithub: new Map(),
  byQualified: new Map([['io.github.example/server', { slug: 'example' }]]),
  byEndpoint: new Map([['api.example.com/mcp', { slug: 'remote-ex' }]]),
};
assert.ok(findInCatalog(c, index));
assert.ok(
  findInCatalog(
    makeCandidate({
      name: 'Ex',
      registry_name: 'io.github.example/server',
      source_id: 't',
      source_name: 't',
    }),
    index,
  ),
);
assert.ok(
  findInCatalog(
    makeCandidate({
      name: 'Remote',
      mcp_endpoint: 'https://api.example.com/mcp',
      source_id: 't',
      source_name: 't',
    }),
    index,
  ),
);
assert.equal(
  findInCatalog(
    makeCandidate({ name: 'Missing', slug: 'nope', source_id: 't', source_name: 't' }),
    index,
  ),
  null,
);

console.log('mcp external sources tests OK');
