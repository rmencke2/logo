'use strict';

/**
 * Best-effort Resend alert for the health watchdog.
 * Usage: node scripts/watchdog-alert-email.js <to> <subject> <body>
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function main() {
  const [, , to, subject, body] = process.argv;
  if (!to || !subject) {
    process.exit(0);
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) process.exit(0);

  const from = process.env.RESEND_FROM || process.env.EMAIL_FROM || 'Influzer Watchdog <onboarding@resend.dev>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: String(subject).slice(0, 200),
      text: String(body || '').slice(0, 4000),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('watchdog email failed', res.status, text.slice(0, 200));
    process.exit(1);
  }
}

main().catch(() => process.exit(0));
