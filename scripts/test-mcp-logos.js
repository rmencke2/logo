#!/usr/bin/env node
'use strict';

/**
 * MCP server icons must not request Clearbit (or a favicon proxy).
 * A listing with no logo renders the letter tile. Synento uses the
 * same-origin color icon committed under public/images/mcp-logos/.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ejs = require('ejs');
const { attachBranding } = require('../utils/mcpBranding');

const ROOT = path.join(__dirname, '..');
const SYNENTO_LOGO = '/images/mcp-logos/synento.png';

function renderLogoPartial(server) {
  const tpl = fs.readFileSync(path.join(ROOT, 'views/partials/mcp-server-logo.ejs'), 'utf8');
  return ejs.render(tpl, {
    logoUrl: server.logoUrl,
    logoFallbackUrl: server.logoFallbackUrl,
    logoInitial: server.logoInitial,
    categoryStyle: server.categoryStyle,
  });
}

function renderDetailIcon(server) {
  const page = fs.readFileSync(path.join(ROOT, 'views/mcp-server.ejs'), 'utf8');
  const start = page.indexOf('<div class="mcp-detail-icon"');
  const end = page.indexOf('</div>', start);
  assert.ok(start !== -1 && end !== -1, 'detail icon markup missing');
  const tpl = page.slice(start, end + '</div>'.length);
  return ejs.render(tpl, { server });
}

function renderClientCard(server) {
  const code = fs.readFileSync(path.join(ROOT, 'public/js/mcp-cards.js'), 'utf8');
  const context = {};
  vm.runInNewContext(code, context);
  assert.strictEqual(typeof context.renderMcpServerCard, 'function');
  return context.renderMcpServerCard(server);
}

function assertNoLogoCdn(html, label) {
  const lower = String(html).toLowerCase();
  assert.ok(!lower.includes('clearbit'), `${label} must not mention clearbit`);
  assert.ok(!lower.includes('/s2/favicons'), `${label} must not request a favicon proxy`);
  assert.ok(!lower.includes('logo.dev'), `${label} must not use another logo host`);
}

const noLogo = attachBranding({
  name: 'No Logo',
  slug: 'no-logo-server',
  category: 'Dev Tools',
  description: 'A server with no stored icon.',
  docs_url: 'https://example.com',
  github_url: 'https://github.com/example/no-logo',
  transport: 'stdio',
  tools: [],
});
assert.ok(!noLogo.logoUrl, 'a server with no logo has no image URL');
assert.ok(!noLogo.logoFallbackUrl, 'a server with no logo has no fallback image URL');
assertNoLogoCdn(JSON.stringify(noLogo), 'branded server');

const noLogoPartial = renderLogoPartial(noLogo);
assertNoLogoCdn(noLogoPartial, 'logo partial');
assert.ok(!noLogoPartial.includes('<img'), 'logo partial omits the image when there is no logo');
assert.ok(noLogoPartial.includes('is-visible'), 'letter tile is visible when there is no logo');
assert.ok(noLogoPartial.includes('>N<'), 'letter tile uses the server initial');

const noLogoDetail = renderDetailIcon(noLogo);
assertNoLogoCdn(noLogoDetail, 'detail icon');
assert.ok(!noLogoDetail.includes('<img'), 'detail icon omits the image when there is no logo');
assert.ok(noLogoDetail.includes('N'), 'detail icon shows the letter');

const noLogoCard = renderClientCard(noLogo);
assertNoLogoCdn(noLogoCard, 'client card');
assert.ok(!noLogoCard.includes('<img'), 'client card omits the image when there is no logo');
assert.ok(noLogoCard.includes('is-visible'), 'client card shows the letter tile');

const poisoned = attachBranding({
  name: 'Poisoned',
  slug: 'poisoned-logo',
  category: 'Dev Tools',
  description: 'Stored logo CDN URL must be dropped.',
  logo_url: 'https://logo.clearbit.com/example.com',
  logoFallbackUrl: 'https://www.google.com/s2/favicons?domain=example.com&sz=64',
  tools: [],
});
assert.ok(!poisoned.logoUrl, 'a stored Clearbit URL is not emitted');
assert.ok(!poisoned.logoFallbackUrl, 'a stored favicon-proxy URL is not emitted');
assertNoLogoCdn(renderLogoPartial(poisoned), 'poisoned partial');
assertNoLogoCdn(renderDetailIcon(poisoned), 'poisoned detail');
assertNoLogoCdn(
  renderClientCard({
    ...poisoned,
    logoUrl: 'https://logo.clearbit.com/example.com',
    logoFallbackUrl: 'https://www.google.com/s2/favicons?domain=example.com&sz=64',
  }),
  'client card drops a Clearbit payload',
);

const stored = attachBranding({
  name: 'Stored',
  slug: 'stored-logo',
  category: 'Design',
  description: 'Uses the logo field already on the listing.',
  logo_url: '/images/mcp-logos/stored.png',
  tools: [],
});
assert.strictEqual(stored.logoUrl, '/images/mcp-logos/stored.png');
const storedPartial = renderLogoPartial(stored);
assert.ok(storedPartial.includes('src="/images/mcp-logos/stored.png"'), 'stored logo is escaped into src');
assertNoLogoCdn(storedPartial, 'stored partial');

const quoted = attachBranding({
  name: 'Quoted',
  slug: 'quoted-logo',
  category: 'Dev Tools',
  description: 'Unsafe logo URL is ignored.',
  logo_url: '/images/mcp-logos/a.png" onload="alert(1)',
  tools: [],
});
assert.ok(!quoted.logoUrl, 'a logo URL with a quote is not emitted');

const synentoFile = path.join(ROOT, 'public', SYNENTO_LOGO);
assert.ok(fs.existsSync(synentoFile), 'Synento color icon is committed');
const synento = attachBranding({
  name: 'Synento',
  slug: 'synento',
  category: 'Communication',
  description: 'Agent-native video API.',
  docs_url: 'https://synento.com',
  mcp_endpoint: 'https://api.synento.com/mcp',
  transport: 'http',
  tools: [],
});
assert.strictEqual(synento.logoUrl, SYNENTO_LOGO);
assert.strictEqual(synento.name, 'Synento');
assert.strictEqual(synento.docs_url, 'https://synento.com');
const synentoPartial = renderLogoPartial(synento);
assert.ok(synentoPartial.includes(`src="${SYNENTO_LOGO}"`), 'Synento partial uses the local icon');
assertNoLogoCdn(synentoPartial, 'Synento partial');
const synentoDetail = renderDetailIcon(synento);
assert.ok(synentoDetail.includes(`src="${SYNENTO_LOGO}"`), 'Synento detail page uses the local icon');
assertNoLogoCdn(synentoDetail, 'Synento detail');
const synentoCard = renderClientCard(synento);
assert.ok(synentoCard.includes(`src="${SYNENTO_LOGO}"`), 'Synento card uses the local icon');
assertNoLogoCdn(synentoCard, 'Synento card');

console.log('mcp logo tests passed');
