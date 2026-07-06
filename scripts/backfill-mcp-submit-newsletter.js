#!/usr/bin/env node
/**
 * Subscribe MCP submission submitter emails to the newsletter.
 * Usage:
 *   node scripts/backfill-mcp-submit-newsletter.js
 *   node scripts/backfill-mcp-submit-newsletter.js --status approved
 *   node scripts/backfill-mcp-submit-newsletter.js --email someone@example.com
 */

const fs = require('fs');
const path = require('path');
const { subscribeToNewsletter } = require('../services/newsletterService');

const SUBMISSIONS_DIR = path.join(__dirname, '..', 'data', 'mcp-submissions');

async function main() {
  const statusFilter = process.argv.includes('--status')
    ? process.argv[process.argv.indexOf('--status') + 1]
    : null;
  const emailArg = process.argv.includes('--email')
    ? process.argv[process.argv.indexOf('--email') + 1]
    : null;

  const emails = new Map();

  if (emailArg) {
    emails.set(emailArg.toLowerCase(), { email: emailArg.toLowerCase(), source: 'mcp-submit-backfill' });
  } else if (!fs.existsSync(SUBMISSIONS_DIR)) {
    console.error('No submissions directory:', SUBMISSIONS_DIR);
    process.exit(1);
  } else {
    for (const file of fs.readdirSync(SUBMISSIONS_DIR)) {
      if (!file.endsWith('.json')) continue;
      const sub = JSON.parse(fs.readFileSync(path.join(SUBMISSIONS_DIR, file), 'utf8'));
      if (statusFilter && sub.reviewStatus !== statusFilter) continue;
      const email = String(sub.submitterEmail || '').trim().toLowerCase();
      if (!email) continue;
      emails.set(email, {
        email,
        source: sub.reviewStatus === 'approved' ? 'mcp-submit-approved' : 'mcp-submit',
        serverName: sub.serverName,
      });
    }
  }

  if (!emails.size) {
    console.log('No submitter emails found.');
    return;
  }

  let added = 0;
  let already = 0;
  let failed = 0;

  for (const { email, source, serverName } of emails.values()) {
    try {
      const result = await subscribeToNewsletter(email, source, 'backfill-script');
      if (result.already) {
        already += 1;
        console.log(`  skip (already active): ${email}${serverName ? ` (${serverName})` : ''}`);
      } else if (result.success) {
        added += 1;
        console.log(`  subscribed: ${email}${serverName ? ` (${serverName})` : ''}`);
      } else {
        failed += 1;
        console.log(`  failed: ${email} — ${result.reason || 'unknown'}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`  error: ${email} — ${err.message}`);
    }
  }

  console.log(`\nDone. subscribed: ${added}, already active: ${already}, failed: ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
