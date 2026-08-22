'use strict';

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Build a JSON error payload for API responses.
 * Includes `details` only outside production.
 */
function clientErrorPayload(publicMessage, err) {
  const payload = { error: publicMessage };
  if (!isProduction() && err?.message) {
    payload.details = err.message;
  }
  return payload;
}

/**
 * Message safe to return to API clients on 5xx responses.
 */
function clientErrorMessage(err, publicMessage = 'An error occurred') {
  if (isProduction()) {
    return publicMessage;
  }
  return err?.message || publicMessage;
}

module.exports = {
  isProduction,
  clientErrorPayload,
  clientErrorMessage,
};
