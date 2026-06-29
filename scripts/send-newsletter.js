#!/usr/bin/env node
/**
 * Send a blog post newsletter from the command line.
 *
 * Usage:
 *   node scripts/send-newsletter.js --slug my-post-slug
 *   node scripts/send-newsletter.js --slug my-post-slug --intro "Optional hook"
 *   node scripts/send-newsletter.js --slug my-post-slug --test you@example.com
 *   node scripts/send-newsletter.js --slug my-post-slug --resend
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { sendBlogNewsletter } = require('../services/newsletterService');

function parseArgs(argv) {
  const options = { slug: '', intro: '', testEmail: '', resend: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--slug') options.slug = argv[++i] || '';
    else if (arg === '--intro') options.intro = argv[++i] || '';
    else if (arg === '--test') options.testEmail = argv[++i] || '';
    else if (arg === '--resend') options.resend = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.slug) {
    console.log(`Usage:
  node scripts/send-newsletter.js --slug <blog-slug> [--intro "text"] [--test email@example.com] [--resend]`);
    process.exit(options.slug ? 0 : 1);
  }

  try {
    const result = await sendBlogNewsletter({
      slug: options.slug,
      customIntro: options.intro,
      testEmail: options.testEmail,
      confirmResend: options.resend,
    });

    console.log(JSON.stringify(result, null, 2));
    if (result.failed > 0) process.exit(2);
  } catch (error) {
    if (error.code === 'ALREADY_SENT') {
      console.error(`Already sent for "${options.slug}". Use --resend to send again.`);
      console.error(JSON.stringify(error.previousSend, null, 2));
      process.exit(3);
    }
    console.error(`Newsletter send failed: ${error.message}`);
    process.exit(1);
  }
}

main();
