#!/usr/bin/env node
// ================================
//  Reset a local account password (server CLI)
// ================================
// Usage: node scripts/reset-password.js <email> <new-password>
// Example: node scripts/reset-password.js mencke@gmail.com 'MyNewSecurePass1'

const { getDatabase } = require('../database');
const { hashPassword } = require('../auth');

async function resetPassword() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('❌ Usage: node scripts/reset-password.js <email> <new-password>');
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

    if (user.provider && user.provider !== 'local' && !user.password_hash) {
      console.error(
        `❌ This account uses ${user.provider} sign-in, not email/password.`,
      );
      console.error('   Use “Sign in with Google” on the login page, or create a separate local account.');
      process.exit(1);
    }

    const passwordHash = await hashPassword(newPassword);
    await db.updateUser(user.id, {
      password_hash: passwordHash,
      email_verified: 1,
    });

    console.log(`✅ Password updated for ${user.email} (user id ${user.id})`);
    console.log('   Log in at https://www.influzer.ai/login');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

resetPassword();
