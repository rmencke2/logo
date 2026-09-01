#!/usr/bin/env node
/**
 * Verify outbound email (Resend, Gmail, or SMTP) with a single test message.
 *
 * Usage:
 *   node scripts/test-email-config.js --to you@example.com
 *   node scripts/test-email-config.js --to you@example.com --newsletter
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  isEmailConfigured,
  deliverEmail,
  getFromAddress,
  getNewsletterFromAddress,
  getNewsletterReplyTo,
} = require('../emailService');

function parseArgs(argv) {
  const options = { to: '', newsletter: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--to') options.to = argv[++i] || '';
    else if (arg === '--newsletter') options.newsletter = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.to) {
    console.log(`Usage:
  node scripts/test-email-config.js --to <email> [--newsletter]

  --newsletter  use NEWSLETTER_FROM / insights sender (same as broadcast)`);
    process.exit(options.to ? 0 : 1);
  }

  if (!isEmailConfigured()) {
    console.error('Email not configured. Set EMAIL_SERVICE=resend + RESEND_API_KEY in .env');
    process.exit(1);
  }

  const from = options.newsletter ? getNewsletterFromAddress() : getFromAddress();
  const replyTo = options.newsletter ? getNewsletterReplyTo() : undefined;
  const provider = process.env.EMAIL_SERVICE || 'smtp';

  const info = await deliverEmail({
    from,
    to: options.to,
    replyTo,
    subject: `Influzer email test (${provider})`,
    html: `<p>If you received this, <strong>${provider}</strong> outbound mail is working.</p><p>From: ${from}${replyTo ? `<br>Reply-To: ${replyTo}` : ''}</p>`,
    text: `Influzer email test (${provider}). From: ${from}${replyTo ? `\nReply-To: ${replyTo}` : ''}`,
  });

  console.log(JSON.stringify({
    success: true,
    to: options.to,
    from,
    replyTo: replyTo || null,
    provider: info.provider,
    messageId: info.messageId,
  }, null, 2));
}

main().catch((error) => {
  console.error('Test email failed:', error.message);
  process.exit(1);
});
