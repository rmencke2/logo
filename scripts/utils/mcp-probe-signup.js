'use strict';

/**
 * Sign the probe mailbox up when an auth-gated MCP server publishes a simple
 * email signup on its own host.
 *
 * The form must be a POST, stay on the same site, and contain an email field.
 * Captcha, login, and off-site forms are skipped. A generated password is
 * stored in the gitignored probe-account file and is never returned to the
 * browser. Verification links are read from the probe mailbox and opened once.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  parseResourceMetadataUrl,
  authorizationServerMetadataUrl,
  DEFAULT_ACCOUNTS_PATH,
} = require('./mcp-probe-auth');
const {
  probeMailboxStatus,
  preferVerificationLink,
  readProbeInbox,
} = require('./mcp-probe-mailbox');

const SIGNUP_PATHS = ['/signup', '/register', '/sign-up', '/api/signup', '/api/auth/signup', '/api/register'];
const MAX_PAGE_BYTES = 65536;
const MAX_LOOKUPS = 6;

function hasCaptcha(html) {
  return /recaptcha|hcaptcha|cf-turnstile|data-sitekey|g-recaptcha|\bcaptcha\b/i.test(String(html || ''));
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function tagAttrs(raw) {
  const attrs = {};
  const re = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match;
  while ((match = re.exec(String(raw || '')))) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function looksLikeSignup(url, html) {
  let pathName = '';
  try {
    pathName = new URL(url).pathname.toLowerCase();
  } catch {
    return false;
  }
  const signupPath = /signup|register|sign-up|create-account|join/.test(pathName);
  const loginPath = /login|sign-in|signin/.test(pathName);
  if (loginPath && !signupPath) return false;
  if (signupPath) return true;
  const title = (String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const heading = (String(html || '').match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '';
  const text = `${title} ${heading}`.replace(/<[^>]+>/g, ' ');
  if (/log\s*in|sign\s*in/i.test(text)) return false;
  return /sign\s*up|create (an )?account|register/i.test(text);
}

function parseSignupForm(html, pageUrl) {
  if (hasCaptcha(html)) return { blocked: 'captcha' };
  const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match;
  while ((match = formRe.exec(String(html || '')))) {
    const formAttrs = tagAttrs(match[1]);
    const inputs = [];
    const inputRe = /<input\b([^>]*)>/gi;
    let inputMatch;
    while ((inputMatch = inputRe.exec(match[2]))) inputs.push(tagAttrs(inputMatch[1]));
    const email = inputs.find((input) => {
      const type = (input.type || '').toLowerCase();
      return type === 'email' || /email/i.test(input.name || '');
    });
    if (!email?.name) continue;
    let action;
    try {
      action = new URL(formAttrs.action || pageUrl, pageUrl);
    } catch {
      return { blocked: 'bad-action' };
    }
    if (action.origin !== new URL(pageUrl).origin) return { blocked: 'offsite' };
    const method = (formAttrs.method || 'get').toLowerCase();
    if (method !== 'post') return { blocked: 'get-form' };
    const passwords = inputs.filter((input) => (input.type || '').toLowerCase() === 'password' && input.name);
    const fields = {};
    for (const input of inputs) {
      if (!input.name) continue;
      const type = (input.type || '').toLowerCase();
      if (type === 'submit' || type === 'button' || type === 'image' || type === 'file' || type === 'password') continue;
      if (input === email) continue;
      if (type === 'checkbox' || type === 'radio') {
        if (input.checked !== undefined) fields[input.name] = input.value || 'on';
        continue;
      }
      fields[input.name] = input.value || '';
    }
    const submit = inputs.find((input) => (input.type || '').toLowerCase() === 'submit' && input.name);
    if (submit) fields[submit.name] = submit.value || 'Sign up';
    return {
      action: action.href,
      emailField: email.name,
      passwordField: passwords[0]?.name || null,
      confirmField: passwords[1]?.name || null,
      fields,
    };
  }
  return null;
}

function tokenFromText(text) {
  const raw = String(text || '');
  try {
    const url = new URL(raw);
    const queryToken = url.searchParams.get('access_token') || url.searchParams.get('api_key');
    if (acceptableToken(queryToken)) return queryToken;
  } catch {
    /* not a URL */
  }
  const match = raw.match(/"access_token"\s*:\s*"([^"]{8,4096})"/);
  if (match && acceptableToken(match[1])) return match[1];
  return null;
}

function acceptableToken(value) {
  const token = String(value || '');
  return token.length >= 8 && token.length <= 4096 && !/[\s\r\n]/.test(token);
}

function generateSignupPassword() {
  return `Aa1${crypto.randomBytes(18).toString('base64url')}`;
}

function readAccountFile(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeAccountPatch(filePath, endpoint, patch) {
  const store = readAccountFile(filePath);
  store[endpoint] = { ...(store[endpoint] || {}), ...patch };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    /* mode on write is enough */
  }
}

async function fetchChecked(url, { fetchImpl, assertUrl, timeoutMs, method, headers, body }) {
  const href = assertUrl ? await assertUrl(url) : url;
  const target = typeof href === 'string' && href ? href : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 8000);
  try {
    return await fetchImpl(target, {
      method: method || 'GET',
      headers,
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readBody(res) {
  const text = await res.text();
  return text.length > MAX_PAGE_BYTES ? text.slice(0, MAX_PAGE_BYTES) : text;
}

function hostOf(value) {
  try {
    return new URL(value).host;
  } catch {
    return '';
  }
}

async function discoverSignup({
  endpoint,
  wwwAuthenticate,
  loginUrl,
  fetchImpl,
  assertUrl,
  timeoutMs,
}) {
  const explicit = [];
  const hosts = new Set();
  const endpointHost = hostOf(endpoint);
  if (endpointHost) hosts.add(endpointHost);

  const metadataUrl = parseResourceMetadataUrl(wwwAuthenticate);
  if (metadataUrl && hostOf(metadataUrl)) hosts.add(hostOf(metadataUrl));
  let tokenEndpoint = '';
  let grants = [];
  if (metadataUrl) {
    try {
      const res = await fetchChecked(metadataUrl, { fetchImpl, assertUrl, timeoutMs });
      if (res.ok) {
        const doc = JSON.parse(await readBody(res));
        for (const key of ['signup_endpoint', 'email_signup_endpoint']) {
          if (doc[key]) explicit.push(String(doc[key]));
        }
        const issuer = Array.isArray(doc.authorization_servers) ? doc.authorization_servers[0] : '';
        if (issuer && hostOf(issuer)) hosts.add(hostOf(issuer));
        if (issuer && !doc.signup_endpoint) {
          const wellKnown = authorizationServerMetadataUrl(issuer);
          const asRes = await fetchChecked(wellKnown, { fetchImpl, assertUrl, timeoutMs });
          if (asRes.ok) {
            const asDoc = JSON.parse(await readBody(asRes));
            for (const key of ['signup_endpoint', 'email_signup_endpoint']) {
              if (asDoc[key]) explicit.push(String(asDoc[key]));
            }
            tokenEndpoint = asDoc.token_endpoint || '';
            grants = Array.isArray(asDoc.grant_types_supported) ? asDoc.grant_types_supported : [];
            if (hostOf(asDoc.issuer || issuer)) hosts.add(hostOf(asDoc.issuer || issuer));
          }
        }
      }
    } catch {
      /* metadata is optional for a same-host signup page */
    }
  }

  if (loginUrl && /signup|register|sign-up|create-account/i.test(loginUrl)) explicit.push(loginUrl);

  const candidates = [];
  for (const url of explicit) {
    const host = hostOf(url);
    if (host) hosts.add(host);
    candidates.push({ url, explicit: true });
  }
  for (const host of hosts) {
    for (const signupPath of SIGNUP_PATHS) candidates.push({ url: `https://${host}${signupPath}`, explicit: false });
  }

  let lookups = 0;
  for (const candidate of candidates) {
    if (lookups >= MAX_LOOKUPS) break;
    if (!candidate.url || !hosts.has(hostOf(candidate.url))) continue;
    lookups += 1;
    let res;
    try {
      res = await fetchChecked(candidate.url, { fetchImpl, assertUrl, timeoutMs });
    } catch {
      continue;
    }
    if (res.status >= 300 && res.status < 400) continue;
    if (!res.ok) continue;
    const body = await readBody(res);
    const type = String(res.headers.get('content-type') || '');
    if (type.includes('text/html') || /<form\b/i.test(body)) {
      if (!candidate.explicit && !looksLikeSignup(candidate.url, body)) continue;
      const form = parseSignupForm(body, candidate.url);
      if (form?.blocked) {
        return {
          blocked: true,
          reason: form.blocked === 'captcha'
            ? 'The signup page uses a captcha, so a person still has to create the account.'
            : 'The signup form leaves this site or is not a POST, so it was skipped.',
          hosts,
          tokenEndpoint,
          grants,
        };
      }
      if (form) return { form, hosts, tokenEndpoint, grants };
    }
  }
  return null;
}

async function followVerificationLink(url, { fetchImpl, assertUrl, timeoutMs, hosts }) {
  if (!url || !hosts.has(hostOf(url))) return null;
  const res = await fetchChecked(url, { fetchImpl, assertUrl, timeoutMs });
  const fromUrl = tokenFromText(url);
  if (fromUrl) return fromUrl;
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (location && hosts.has(hostOf(new URL(location, url).href))) {
      return tokenFromText(new URL(location, url).href);
    }
    return null;
  }
  if (!res.ok) return null;
  return tokenFromText(await readBody(res));
}

async function passwordGrant({ tokenEndpoint, email, password, fetchImpl, assertUrl, timeoutMs }) {
  if (!tokenEndpoint || !email || !password) return null;
  const body = new URLSearchParams({
    grant_type: 'password',
    username: email,
    password,
  });
  const res = await fetchChecked(tokenEndpoint, {
    fetchImpl,
    assertUrl,
    timeoutMs,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  if (!res.ok) return null;
  return tokenFromText(await readBody(res));
}

async function tryProbeSignup({
  endpoint,
  wwwAuthenticate,
  loginUrl,
  accountsPath = DEFAULT_ACCOUNTS_PATH,
  fetchImpl = global.fetch,
  assertUrl,
  email,
  mailboxPassword,
  readInbox,
  timeoutMs = 8000,
  since = new Date(),
} = {}) {
  const mailbox = probeMailboxStatus({
    MCP_PROBE_ACCOUNT_EMAIL: email === undefined ? process.env.MCP_PROBE_ACCOUNT_EMAIL : email,
    MCP_PROBE_GMAIL_APP_PASSWORD: mailboxPassword === undefined
      ? process.env.MCP_PROBE_GMAIL_APP_PASSWORD
      : mailboxPassword,
  });
  if (!mailbox.email) {
    return { attempted: false, reason: '' };
  }

  const discovered = await discoverSignup({
    endpoint,
    wwwAuthenticate,
    loginUrl,
    fetchImpl,
    assertUrl,
    timeoutMs,
  });
  if (!discovered) return { attempted: false, reason: '' };
  if (discovered.blocked) return { attempted: true, reason: discovered.reason };
  if (!mailbox.configured) {
    return {
      attempted: true,
      reason: 'This server has an email signup. Set MCP_PROBE_GMAIL_APP_PASSWORD to a Google App Password so the probe mailbox can open the verification message.',
    };
  }

  const stored = readAccountFile(accountsPath)[endpoint] || {};
  const password = stored.signup_password || generateSignupPassword();
  if (accountsPath) {
    try {
      writeAccountPatch(accountsPath, endpoint, {
        signup_email: mailbox.email,
        signup_password: password,
        signup_host: hostOf(discovered.form.action),
      });
    } catch {
      return { attempted: true, reason: 'Signup was skipped because the generated password could not be stored on the server.' };
    }
  }

  const formBody = new URLSearchParams(discovered.form.fields);
  formBody.set(discovered.form.emailField, mailbox.email);
  if (discovered.form.passwordField) formBody.set(discovered.form.passwordField, password);
  if (discovered.form.confirmField) formBody.set(discovered.form.confirmField, password);

  let posted;
  try {
    posted = await fetchChecked(discovered.form.action, {
      fetchImpl,
      assertUrl,
      timeoutMs,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html, application/json',
        'User-Agent': 'Influzer MCP probe',
      },
      body: formBody.toString(),
    });
  } catch (err) {
    return { attempted: true, reason: err.message || 'Signup request failed.' };
  }
  if (posted.status >= 400) {
    return { attempted: true, reason: `The signup form returned HTTP ${posted.status}.` };
  }
  const postedBody = await readBody(posted);
  let accessToken = tokenFromText(postedBody);

  if (!accessToken) {
    const reader = readInbox || readProbeInbox;
    let link = null;
    try {
      const inbox = await reader({
        email: mailbox.email,
        password: mailboxPassword === undefined ? process.env.MCP_PROBE_GMAIL_APP_PASSWORD : mailboxPassword,
        since,
        hosts: discovered.hosts,
      });
      link = inbox.link || preferVerificationLink(inbox.links || [], discovered.hosts);
    } catch (err) {
      return { attempted: true, reason: err.message || 'Could not read the probe mailbox.' };
    }
    if (link) {
      try {
        accessToken = await followVerificationLink(link, {
          fetchImpl,
          assertUrl,
          timeoutMs,
          hosts: discovered.hosts,
        });
      } catch (err) {
        return { attempted: true, reason: err.message || 'Could not open the verification link.' };
      }
    }
  }

  if (!accessToken && discovered.grants.includes('password') && discovered.tokenEndpoint) {
    try {
      accessToken = await passwordGrant({
        tokenEndpoint: discovered.tokenEndpoint,
        email: mailbox.email,
        password,
        fetchImpl,
        assertUrl,
        timeoutMs,
      });
    } catch {
      /* the signup itself still happened */
    }
  }

  const verified = Boolean(accessToken);
  return {
    attempted: true,
    accessToken: accessToken || null,
    reason: verified
      ? 'Signed up with the probe mailbox and obtained a token.'
      : 'Submitted the probe mailbox to the server signup form. No token came back from the form, the verification message, or a password grant.',
  };
}

module.exports = {
  hasCaptcha,
  looksLikeSignup,
  parseSignupForm,
  tokenFromText,
  tryProbeSignup,
  discoverSignup,
};
