// Per-request CSP nonces. Inline scripts keep working; inline event handlers do not.
const crypto = require('crypto');
const fs = require('fs');
const helmet = require('helmet');

// Hosts already allowed to run scripts. A nonce would also allow a tag, so do not
// stamp one onto any other third-party src (that would widen script-src).
const ALLOWED_SCRIPT_HOSTS = ['challenges.cloudflare.com', 'www.googletagmanager.com'];

function createCspNonce() {
  return crypto.randomBytes(16).toString('base64url');
}

function scriptSrcAllowed(attrs) {
  const srcMatch = String(attrs || '').match(/\bsrc\s*=\s*(['"])([\s\S]*?)\1/i);
  if (!srcMatch) return true;
  const src = srcMatch[2].trim();
  if (!src || src.startsWith('/') || src.startsWith('./') || src.startsWith('../')) return true;
  let url;
  try {
    url = new URL(src, 'https://www.influzer.ai');
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.hostname === 'www.influzer.ai' || url.hostname === 'influzer.ai') return true;
  return ALLOWED_SCRIPT_HOSTS.includes(url.hostname);
}

function applyNoncesToHtml(html, nonce) {
  if (typeof html !== 'string' || !nonce || !html.includes('<script')) return html;
  const safe = String(nonce).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) return html;
  return html.replace(/<script\b([^>]*)>/gi, (match, attrs) => {
    if (/\bnonce\s*=/i.test(attrs)) return match;
    if (!scriptSrcAllowed(attrs)) return match;
    return `<script nonce="${safe}"${attrs}>`;
  });
}

function installHtmlNonceStamp(res) {
  if (res.__cspNonceStamp) return;
  res.__cspNonceStamp = true;

  // Stamp only files we own. Do not rewrite every HTML response: a nonce on a
  // script that arrived in page content would let that script run.
  const originalSend = res.send.bind(res);
  const originalSendFile = res.sendFile;
  res.sendFile = function sendFileWithCspNonce(filePath, options, callback) {
    let cb = callback;
    let opts = options;
    if (typeof options === 'function') {
      cb = options;
      opts = undefined;
    }
    const resolved = typeof filePath === 'string' ? filePath : '';
    if (resolved.endsWith('.html')) {
      fs.readFile(resolved, 'utf8', (err, html) => {
        if (err) {
          if (typeof cb === 'function') return cb(err);
          if (opts !== undefined) return originalSendFile.call(this, filePath, opts, cb);
          return originalSendFile.call(this, filePath, cb);
        }
        this.type('html');
        originalSend(applyNoncesToHtml(html, this.locals && this.locals.cspNonce));
        if (typeof cb === 'function') cb();
      });
      return;
    }
    if (opts !== undefined) return originalSendFile.call(this, filePath, opts, cb);
    return originalSendFile.call(this, filePath, cb);
  };
}

function cspNonceMiddleware(req, res, next) {
  res.locals.cspNonce = createCspNonce();
  installHtmlNonceStamp(res);
  next();
}

function scriptNonceSource(req, res) {
  const nonce = res.locals && res.locals.cspNonce;
  return `'nonce-${nonce}'`;
}

const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    scriptNonceSource,
    ...ALLOWED_SCRIPT_HOSTS.map((host) => `https://${host}`),
  ],
  // style-src stays permissive: pages use inline style attributes and <style> blocks.
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
  imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
  connectSrc: [
    "'self'",
    'https://challenges.cloudflare.com',
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://analytics.google.com',
    'https://*.google-analytics.com',
    'https://*.analytics.google.com',
  ],
  frameSrc: ["'self'", 'https://challenges.cloudflare.com'],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  // Inline handlers (onclick and similar) cannot carry a nonce.
  scriptSrcAttr: ["'none'"],
};

function mountCsp(app) {
  app.use(cspNonceMiddleware);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: cspDirectives,
      },
      crossOriginOpenerPolicy: false,
      originAgentCluster: false,
    }),
  );
}

module.exports = {
  ALLOWED_SCRIPT_HOSTS,
  applyNoncesToHtml,
  cspDirectives,
  cspNonceMiddleware,
  createCspNonce,
  mountCsp,
  scriptSrcAllowed,
};
