'use strict';

const { getDatabase } = require('../database');

const DEFAULT_SESSION_SECRETS = new Set([
  'your-secret-key-change-in-production',
  'local-dev-secret-change-in-production',
]);

function parseBypassEmails() {
  const raw = process.env.RATE_LIMIT_BYPASS_EMAILS || '';
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Load the current user from Passport session or custom session.
 * @param {import('express').Request} req
 * @returns {Promise<object|null>}
 */
async function getRequestUser(req) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user?.id) {
    return req.user;
  }
  if (req.session?.userId) {
    try {
      const db = await getDatabase();
      return await db.getUserById(req.session.userId);
    } catch (err) {
      console.error('Error loading user for rate-limit bypass:', err);
    }
  }
  return null;
}

/**
 * Whether this user should bypass global rate limits / abuse protection.
 * Admins always bypass. Others only if listed exactly in RATE_LIMIT_BYPASS_EMAILS.
 */
async function shouldBypassRateLimit(req) {
  const user = await getRequestUser(req);
  if (!user) return false;
  if (user.is_admin) return true;

  const email = (user.email || '').trim().toLowerCase();
  if (!email) return false;

  return parseBypassEmails().includes(email);
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (process.env.NODE_ENV === 'production') {
    if (!secret || DEFAULT_SESSION_SECRETS.has(secret)) {
      console.error(
        'FATAL: Set SESSION_SECRET to a strong random value in production (not the default from .env.example).',
      );
      process.exit(1);
    }
    return secret;
  }

  if (!secret) {
    console.warn(
      '⚠️  WARNING: Using default SESSION_SECRET. Set SESSION_SECRET in .env for production!',
    );
    return 'your-secret-key-change-in-production';
  }

  return secret;
}

module.exports = {
  parseBypassEmails,
  getRequestUser,
  shouldBypassRateLimit,
  getSessionSecret,
};
