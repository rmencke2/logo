#!/usr/bin/env node
// ================================
//  Reset a local account password (server CLI)
// ================================
// Usage: node scripts/reset-password.js <email> <new-password> [--force]
// Example: node scripts/reset-password.js mencke@gmail.com 'MyNewSecurePass1'
// Use --force if the account was created with Google but you want email/password login too.

const { getDatabase } = require('../database');
const { hashPassword } = require('../auth');

async function resetPassword() {
  const args = process.argv.slice(2).filter((a) => a !== '--force');
  const force = process.argv.includes('--force');
  const email = args[0];
  const newPassword = args[1];

  if (!email || !newPassword) {
    console.error('❌ Usage: node scripts/reset-password.js <email> <new-password> [--force]');
    process.exit(1);
  }

  if (newPassword.length < 8) {
    console.error('❌ Password must be at least 8 characters');
    process.exit(1);
  }

  try {
    const db = await getDatabase();
    const user = await db.getUserByEmail(email.toLowerCase().trim());

    if (!user) {
      console.error(`❌ No user found for: ${email}`);
      process.exit(1);
    }

    if (user.provider && user.provider !== 'local' && !user.password_hash && !force) {
      console.error(
        `❌ This account uses ${user.provider} sign-in, not email/password.`,
      );
      console.error('   Use Google login, or re-run with --force to add a password for this email.');
      process.exit(1);
    }

    const passwordHash = await hashPassword(newPassword);
    const updates = {
      password_hash: passwordHash,
      email_verified: 1,
    };
    if (force && user.provider !== 'local') {
      updates.provider = 'local';
    }
    await db.updateUser(user.id, updates);

    console.log(`✅ Password updated for ${user.email} (user id ${user.id})`);
    console.log('   Log in at https://www.influzer.ai/login');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

resetPassword();
