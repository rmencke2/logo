'use strict';

const crypto = require('crypto');

function ensureCsrfToken(req) {
  if (!req.session) return null;
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

function csrfTokenHandler(req, res) {
  const token = ensureCsrfToken(req);
  if (!token) {
    return res.status(500).json({ error: 'Session unavailable' });
  }
  res.json({ token });
}

function requireCsrfToken(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const expected = req.session?.csrfToken;
  const provided =
    req.get('x-csrf-token') ||
    req.get('X-CSRF-Token') ||
    req.body?._csrf;

  if (!expected || !provided || provided !== expected) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }

  return next();
}

module.exports = {
  ensureCsrfToken,
  csrfTokenHandler,
  requireCsrfToken,
};
