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
  assert.match(homeTpl, /Promote your MCP/);
  assert.equal(/safe-to-install stamp/i.test(homeTpl), true);

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
  assert.equal(board.rows[0].rank, 1);
  assert.equal(board.rows.every((r) => r.sponsored === false), true);
  assert.equal(board.rows.every((r) => r.safety_badge === null), true);

  const offer = getPromoteOffer();
  assert.equal(String(process.env.STRIPE_PROMOTE_MODE || 'subscription'), 'subscription');
  assert.equal(offer.product.price_usd, 249);
  assert.equal(offer.product.max_concurrent, 2);
  assert.equal(offer.monthly_if_sold_out_usd, 498);
  assert.equal(offer.safety_badge, null);
  assert.equal(offer.sold_out, false);
  assert.equal(slotsRemaining() >= 1, true);
  assert.ok(offer.excludes.some((line) => /SAFE/i.test(line)));

  assert.equal(isSlotActive({ slug: 'asana', ends_at: '2099-01-01T00:00:00.000Z' }), true);
  assert.equal(isSlotActive({ slug: 'asana', ends_at: '2001-01-01T00:00:00.000Z' }), false);
  assert.equal(isSlotActive({ active: false, slug: 'asana' }), false);

  assert.throws(() => validatePromoteInput({ email: 'nope' }), /email/i);
  const ok = validatePromoteInput({
    email: 'ops@example.com',
    slug: '/mcp/asana',
    url: 'https://mcp.asana.com/v2/mcp',
  });
  assert.equal(ok.slug, 'asana');

  const tmp = path.join(os.tmpdir(), `mcp-promote-requests-${Date.now()}.json`);
  process.env.MCP_PROMOTE_REQUESTS_PATH = tmp;
  const saved = await submitPromoteRequest({
    email: 'ops@example.com',
    slug: 'asana',
    company: 'Asana',
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.safety_badge, null);
  assert.equal(saved.invoice, true);
  const dumped = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  assert.equal(dumped[0].slug, 'asana');
  fs.rmSync(tmp, { force: true });

  console.log(
    `mcp scoreboard tests passed (${board.counts.live_ok} live_ok, ${board.https_hosts} https hosts)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
