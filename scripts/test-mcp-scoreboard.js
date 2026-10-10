'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildScoreboard } = require('../services/mcpScoreboardService');
const {
  getPromoteOffer,
  submitPromoteRequest,
  validatePromoteInput,
  isSlotActive,
  isSponsoredSlug,
  presentPin,
  presentOpenSlot,
  presentSponsorRail,
  slotsRemaining,
} = require('../services/mcpPromoteService');
const { isReservedMcpPath } = require('../services/mcpSubmissionService');

async function main() {
  assert.equal(isReservedMcpPath('scoreboard'), true);
  assert.equal(isReservedMcpPath('promote'), true);

  const homeTpl = fs.readFileSync(path.join(__dirname, '..', 'views', 'home.ejs'), 'utf8');
  assert.match(homeTpl, /home-board/);
  assert.match(homeTpl, /\/mcp\/scoreboard/);
  assert.match(homeTpl, /\/mcp\/promote/);
  assert.match(homeTpl, /Promote your server/);
  assert.match(homeTpl, /run by one person/);
  assert.match(homeTpl, /No pay-to-rank/);
  assert.match(homeTpl, /funded_usd/);
  assert.match(homeTpl, /home-sponsors/);
  assert.match(homeTpl, /mcp-sponsor-rail/);

  const dirTpl = fs.readFileSync(path.join(__dirname, '..', 'views', 'mcp-index.ejs'), 'utf8');
  assert.match(dirTpl, /mcp-sponsor-rail/);
  assert.match(dirTpl, /mcp-promote-pitch/);
  const webmcpTpl = fs.readFileSync(path.join(__dirname, '..', 'views', 'webmcp-index.ejs'), 'utf8');
  assert.match(webmcpTpl, /mcp-sponsor-rail/);
  assert.match(webmcpTpl, /mcp-promote-pitch/);
  assert.match(webmcpTpl, /promotePitchSurface: 'webmcp'/);
  assert.match(webmcpTpl, /promoteOffer/);
  const promoteTpl = fs.readFileSync(path.join(__dirname, '..', 'views', 'mcp-promote.ejs'), 'utf8');
  assert.match(promoteTpl, /Where you appear/);
  assert.match(promoteTpl, /offer\.placements/);
  assert.match(promoteTpl, /accept_terms/);
  assert.match(promoteTpl, /\/mcp\/promote\/terms/);
  assert.match(promoteTpl, /Advertising rules/);
  const termsTpl = fs.readFileSync(path.join(__dirname, '..', 'views', 'mcp-promote-terms.ejs'), 'utf8');
  assert.match(termsTpl, /What is not allowed/);
  assert.match(termsTpl, /porn, gambling/);
  assert.match(termsTpl, /keep money already paid/i);
  const listingTpl = fs.readFileSync(path.join(__dirname, '..', 'views', 'mcp-server.ejs'), 'utf8');
  assert.match(listingTpl, /mcp-pill--sponsored/);

  const board = buildScoreboard();
  assert.equal(board.total, 100);
  assert.equal(board.rows.length, 100);
  assert.equal(board.safety_badge, null);
  assert.match(board.note, /not a safe-to-install badge/i);
  const counted =
    board.counts.live_ok +
    board.counts.auth_required +
    board.counts.unreachable +
    board.counts.not_probed +
    board.counts.local_unprobed;
  assert.equal(counted, 100);
  assert.equal(board.https_hosts + board.missing_hosts, 100);
  assert.equal(
    board.https_hosts + board.template_hosts + board.local_hosts + board.unknown_hosts,
    100,
  );
  assert.equal(board.rows[0].rank, 1);
  assert.equal(board.rows.every((r) => r.sponsored === false), true);
  assert.equal(board.rows.every((r) => r.safety_badge === null), true);
  const mongodb = board.rows.find((r) => r.slug === 'mongodb');
  assert.ok(mongodb);
  assert.equal(mongodb.host_kind, 'fixed');
  assert.equal(mongodb.remote_url, 'https://mcp.mongodb.com');
  const shopify = board.rows.find((r) => r.slug === 'shopify');
  assert.ok(shopify);
  assert.equal(shopify.host_kind, 'template');
  assert.equal(shopify.remote_url, null);
  assert.match(shopify.remote_template, /\{shop\}/);
  const postgres = board.rows.find((r) => r.slug === 'postgres');
  assert.ok(postgres);
  assert.equal(postgres.host_kind, 'local');
  assert.equal(postgres.host_label, 'stdio / local');

  const offer = getPromoteOffer();
  assert.equal(String(process.env.STRIPE_PROMOTE_MODE || 'subscription'), 'subscription');
  assert.equal(offer.product.price_usd, 249);
  assert.equal(offer.product.max_concurrent, 2);
  assert.equal(offer.monthly_if_sold_out_usd, 498);
  assert.equal(offer.funded_usd, 0);
  assert.equal(offer.slots_sold, 0);
  assert.equal(offer.safety_badge, null);
  assert.equal(offer.sold_out, false);
  assert.equal(slotsRemaining() >= 1, true);
  assert.ok(offer.excludes.some((line) => /SAFE/i.test(line)));
  assert.equal(offer.product.name, 'Sponsored placement');
  assert.equal(offer.placements.length, 5);
  assert.ok(offer.includes.some((line) => /homepage/i.test(line)));
  assert.ok(offer.includes.some((line) => /\/mcp/i.test(line)));
  assert.ok(offer.includes.some((line) => /webmcp/i.test(line)));
  assert.ok(offer.placements.some((p) => p.id === 'webmcp'));

  const rail = presentSponsorRail();
  assert.equal(rail.items.length, 2);
  assert.equal(rail.filled.length, 0);
  assert.equal(rail.open.length, 2);
  assert.equal(rail.safety_badge, null);
  assert.equal(presentOpenSlot().open, true);
  const asanaPin = presentPin({ slug: 'asana', blurb: 'Paid Asana MCP slot.' });
  assert.equal(asanaPin.sponsor_label, 'Sponsored');
  assert.equal(asanaPin.filled, true);
  assert.equal(asanaPin.href, '/mcp/asana');
  assert.equal(isSponsoredSlug('asana'), false);

  assert.equal(isSlotActive({ slug: 'asana', ends_at: '2099-01-01T00:00:00.000Z' }), true);
  assert.equal(isSlotActive({ slug: 'asana', ends_at: '2001-01-01T00:00:00.000Z' }), false);
  assert.equal(isSlotActive({ active: false, slug: 'asana' }), false);

  assert.throws(() => validatePromoteInput({ email: 'nope', accept_terms: '1' }), /email/i);
  assert.throws(
    () =>
      validatePromoteInput({
        email: 'ops@example.com',
        slug: 'asana',
      }),
    /Sponsored Placement Terms/i,
  );
  const ok = validatePromoteInput({
    email: 'ops@example.com',
    slug: '/mcp/asana',
    url: 'https://mcp.asana.com/v2/mcp',
    accept_terms: '1',
  });
  assert.equal(ok.slug, 'asana');
  assert.equal(ok.accept_terms, true);
  assert.ok(ok.terms_version);

  assert.ok(offer.terms);
  assert.ok(offer.terms.prohibited.some((p) => /gambling/i.test(p.label)));
  assert.ok(offer.terms.prohibited.some((p) => /adult|sexual/i.test(p.label)));
  assert.ok(offer.terms.removal_rights.some((line) => /non-refundable/i.test(line)));

  const tmp = path.join(os.tmpdir(), `mcp-promote-requests-${Date.now()}.json`);
  process.env.MCP_PROMOTE_REQUESTS_PATH = tmp;
  await assert.rejects(
    () => submitPromoteRequest({ email: 'ops@example.com', slug: 'asana', company: 'Asana' }),
    /Sponsored Placement Terms/i,
  );
  const saved = await submitPromoteRequest({
    email: 'ops@example.com',
    slug: 'asana',
    company: 'Asana',
    accept_terms: true,
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.safety_badge, null);
  assert.equal(saved.invoice, true);
  assert.equal(saved.terms_path, '/mcp/promote/terms');
  const dumped = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  assert.equal(dumped[0].slug, 'asana');
  assert.equal(dumped[0].accept_terms, true);
  assert.ok(dumped[0].terms_accepted_at);
  fs.rmSync(tmp, { force: true });

  console.log(
    `mcp scoreboard tests passed (${board.counts.live_ok} live_ok, ${board.https_hosts} https hosts)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
