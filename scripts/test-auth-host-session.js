'use strict';

const assert = require('node:assert/strict');
const {
  getPublicSiteOrigin,
  absoluteSiteUrl,
  isSafeInternalRedirect,
  getConfiguredBaseUrl,
} = require('../utils/siteUrl');

function main() {
  const prev = process.env.BASE_URL;

  process.env.BASE_URL = 'https://influzer.ai';
  assert.equal(getConfiguredBaseUrl(), 'https://influzer.ai');
  assert.equal(getPublicSiteOrigin(), 'https://www.influzer.ai');
  assert.equal(absoluteSiteUrl('/admin'), 'https://www.influzer.ai/admin');
  assert.equal(absoluteSiteUrl('/login?redirect=/admin'), 'https://www.influzer.ai/login?redirect=/admin');

  process.env.BASE_URL = 'https://www.influzer.ai/';
  assert.equal(getPublicSiteOrigin(), 'https://www.influzer.ai');

  assert.equal(isSafeInternalRedirect('/admin'), true);
  assert.equal(isSafeInternalRedirect('//evil.com'), false);
  assert.equal(isSafeInternalRedirect('https://evil.com'), false);

  if (prev === undefined) delete process.env.BASE_URL;
  else process.env.BASE_URL = prev;

  const core = require('fs').readFileSync(require('path').join(__dirname, '..', 'services', 'core.js'), 'utf8');
  assert.match(core, /domain:\s*cookieDomain|\.\.\.\(cookieDomain/);
  assert.match(core, /\.influzer\.ai/);
  assert.match(core, /startsWith\('\/auth'\)/);

  console.log('Auth host / siteUrl tests passed');
}

main();
