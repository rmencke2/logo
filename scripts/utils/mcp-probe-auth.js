'use strict';

/**
 * Reviewer-only auth for an MCP handshake.
 *
 * Three paths, all optional:
 * 1. A bearer token the submitter stored on the submission. It is sent only
 *    to the endpoint already cleared by the SSRF check. It is never returned
 *    to the browser.
 * 2. OAuth 2.0 Dynamic Client Registration (RFC 7591) when the 401 advertises
 *    resource metadata and the authorization server publishes a
 *    registration_endpoint. The contact is MCP_PROBE_ACCOUNT_EMAIL.
 * 3. A same-host email signup with no captcha. The probe mailbox confirms
 *    that signup over IMAP. The Gmail app password stays in the environment.
 *
 * client_secret and access_token stay in this process. A gitignored file may
 * keep the client so a later probe can retry client_credentials without
 * registering again. Callers that speak HTTP must use publicAuthAttempt.
 */

const fs = require('fs');
const path = require('path');

const PROBE_CONTACT_ENV = 'MCP_PROBE_ACCOUNT_EMAIL';
const CLIENT_NAME = 'Influzer MCP probe';
const CLIENT_URI = 'https://www.influzer.ai';
const REDIRECT_URI = 'https://www.influzer.ai/mcp/probe/oauth/callback';
const DEFAULT_ACCOUNTS_PATH = path.join(__dirname, '..', '..', 'data', 'mcp-probe-accounts.json');
const MAX_METADATA_BYTES = 65536;

function parseResourceMetadataUrl(header) {
  const raw = String(header || '');
  const match = raw.match(/resource_metadata=(?:"([^"]+)"|'([^']+)'|([^\s,]+))/i);
  const url = match && (match[1] || match[2] || match[3]);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function authorizationServerMetadataUrl(issuer) {
  const url = new URL(issuer);
  const suffix = url.pathname.replace(/\/$/, '');
  url.pathname = suffix
    ? `/.well-known/oauth-authorization-server${suffix}`
    : '/.well-known/oauth-authorization-server';
  url.search = '';
  url.hash = '';
  return url.href;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function probeContactEmail(explicit) {
  const raw = explicit === undefined ? process.env[PROBE_CONTACT_ENV] : explicit;
  return String(raw || '').trim().toLowerCase();
}

async function readJsonLimited(res) {
  const text = await res.text();
  if (text.length > MAX_METADATA_BYTES) {
    throw new Error('OAuth response was too large');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('OAuth response was not JSON');
  }
}

async function fetchJson(url, { fetchImpl, assertUrl, timeoutMs }) {
  const href = assertUrl ? await assertUrl(url) : url;
  const target = typeof href === 'string' && href ? href : url;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(target, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'manual',
      signal: controller.signal,
    });
    if (res.status >= 300 && res.status < 400) {
      throw new Error('OAuth metadata redirect was not followed');
    }
    if (!res.ok) throw new Error(`OAuth metadata HTTP ${res.status}`);
    return await readJsonLimited(res);
  } finally {
    clearTimeout(timer);
  }
}

function publicAuthAttempt(attempt) {
  if (!attempt) return null;
  return {
    mode: attempt.mode || 'oauth_client',
    attempted: Boolean(attempt.attempted),
    registered: Boolean(attempt.registered),
    tokenAcquired: Boolean(attempt.tokenAcquired),
    clientId: attempt.clientId ? String(attempt.clientId).slice(0, 200) : null,
    reason: String(attempt.reason || '').slice(0, 500),
  };
}

function readStoredClient(filePath, endpoint) {
  try {
    const store = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const row = store[endpoint];
    if (!row || !row.client_id || !row.client_secret || !row.token_endpoint) return null;
    return row;
  } catch {
    return null;
  }
}

function writeStoredClient(filePath, endpoint, row) {
  let store = {};
  try {
    store = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!store || typeof store !== 'object' || Array.isArray(store)) store = {};
  } catch {
    store = {};
  }
  store[endpoint] = {
    ...(store[endpoint] || {}),
    client_id: String(row.client_id).slice(0, 200),
    client_secret: String(row.client_secret).slice(0, 2048),
    token_endpoint: String(row.token_endpoint).slice(0, 500),
    contact: row.contact ? String(row.contact).slice(0, 254) : null,
    registered_at: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    /* mode on write is enough when chmod is unavailable */
  }
}

async function requestClientCredentialsToken({
  tokenEndpoint,
  clientId,
  clientSecret,
  fetchImpl = global.fetch,
  assertUrl,
  timeoutMs = 8000,
}) {
  if (!tokenEndpoint || !clientId || !clientSecret) {
    return { accessToken: null };
  }
  const href = assertUrl ? await assertUrl(tokenEndpoint) : tokenEndpoint;
  const target = typeof href === 'string' && href ? href : tokenEndpoint;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: String(clientId),
    client_secret: String(clientSecret),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
      redirect: 'manual',
      signal: controller.signal,
    });
    if (res.status >= 300 && res.status < 400) return { accessToken: null };
    if (!res.ok) return { accessToken: null };
    const parsed = await readJsonLimited(res);
    const token = String(parsed.access_token || '');
    if (!token || token.length > 4096 || /[\r\n\0]/.test(token)) return { accessToken: null };
    return { accessToken: token };
  } finally {
    clearTimeout(timer);
  }
}

async function tryRegisterProbeClient({
  wwwAuthenticate,
  email,
  fetchImpl = global.fetch,
  assertUrl,
  timeoutMs = 8000,
} = {}) {
  const contact = probeContactEmail(email);
  if (!contact) {
    return {
      attempted: false,
      registered: false,
      tokenAcquired: false,
      reason: 'MCP_PROBE_ACCOUNT_EMAIL is not set, so automatic client registration was skipped.',
    };
  }
  if (!isEmail(contact)) {
    return {
      attempted: false,
      registered: false,
      tokenAcquired: false,
      reason: 'MCP_PROBE_ACCOUNT_EMAIL is not a valid email, so automatic client registration was skipped.',
    };
  }

  const metadataUrl = parseResourceMetadataUrl(wwwAuthenticate);
  if (!metadataUrl) {
    return {
      attempted: false,
      registered: false,
      tokenAcquired: false,
      reason: 'The 401 did not advertise OAuth resource metadata, so there is no registration endpoint to call.',
    };
  }

  let resourceDoc;
  try {
    resourceDoc = await fetchJson(metadataUrl, { fetchImpl, assertUrl, timeoutMs });
  } catch (err) {
    return {
      attempted: true,
      registered: false,
      tokenAcquired: false,
      reason: err.message || 'Could not read OAuth resource metadata',
    };
  }

  let asDoc = resourceDoc;
  if (!resourceDoc.registration_endpoint && Array.isArray(resourceDoc.authorization_servers) && resourceDoc.authorization_servers[0]) {
    let issuer;
    try {
      issuer = new URL(resourceDoc.authorization_servers[0]);
    } catch {
      return {
        attempted: true,
        registered: false,
        tokenAcquired: false,
        reason: 'Authorization server URL was not valid',
      };
    }
    const wellKnown = authorizationServerMetadataUrl(issuer.href);
    try {
      asDoc = await fetchJson(wellKnown, { fetchImpl, assertUrl, timeoutMs });
    } catch (err) {
      try {
        asDoc = await fetchJson(issuer.href, { fetchImpl, assertUrl, timeoutMs });
      } catch {
        return {
          attempted: true,
          registered: false,
          tokenAcquired: false,
          reason: err.message || 'Could not read authorization server metadata',
        };
      }
    }
  }

  const registrationEndpoint = asDoc.registration_endpoint;
  if (!registrationEndpoint) {
    return {
      attempted: true,
      registered: false,
      tokenAcquired: false,
      reason: 'The authorization server does not advertise dynamic client registration. A human test account is still required.',
    };
  }

  const registrationBody = {
    client_name: CLIENT_NAME,
    client_uri: CLIENT_URI,
    contacts: [contact],
    redirect_uris: [REDIRECT_URI],
    grant_types: ['authorization_code', 'refresh_token', 'client_credentials'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  };

  let registered;
  try {
    const href = assertUrl ? await assertUrl(registrationEndpoint) : registrationEndpoint;
    const target = typeof href === 'string' && href ? href : registrationEndpoint;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(registrationBody),
        redirect: 'manual',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      return {
        attempted: true,
        registered: false,
        tokenAcquired: false,
        reason: 'OAuth registration redirect was not followed',
      };
    }
    if (!res.ok) {
      return {
        attempted: true,
        registered: false,
        tokenAcquired: false,
        reason: `Dynamic client registration returned HTTP ${res.status}. A human test account is still required.`,
      };
    }
    registered = await readJsonLimited(res);
  } catch (err) {
    return {
      attempted: true,
      registered: false,
      tokenAcquired: false,
      reason: err.message || 'Client registration failed',
    };
  }

  const clientId = String(registered.client_id || '').slice(0, 200);
  const clientSecret = String(registered.client_secret || '');
  const tokenEndpoint = String(asDoc.token_endpoint || registered.token_endpoint || '');
  if (!clientId) {
    return {
      attempted: true,
      registered: false,
      tokenAcquired: false,
      reason: 'Dynamic client registration did not return a client id.',
    };
  }

  const grants = Array.isArray(asDoc.grant_types_supported) ? asDoc.grant_types_supported : null;
  const allowsClientCredentials = !grants || grants.includes('client_credentials');
  let accessToken = null;
  let reason = 'Registered an OAuth client. The server still requires a user login before tools/list.';
  if (allowsClientCredentials && tokenEndpoint && clientSecret) {
    try {
      const token = await requestClientCredentialsToken({
        tokenEndpoint,
        clientId,
        clientSecret,
        fetchImpl,
        assertUrl,
        timeoutMs,
      });
      if (token.accessToken) {
        accessToken = token.accessToken;
        reason = 'Registered an OAuth client and obtained a client-credentials token.';
      } else {
        reason = 'Registered an OAuth client. Client-credentials was rejected, so a user grant is still required.';
      }
    } catch (err) {
      reason = `Registered an OAuth client. Token request failed: ${err.message || 'error'}`;
    }
  }

  return {
    attempted: true,
    registered: true,
    tokenAcquired: Boolean(accessToken),
    clientId,
    clientSecret: clientSecret || null,
    tokenEndpoint: tokenEndpoint || null,
    accessToken,
    contact,
    reason,
  };
}

async function probeEndpointForTools({
  endpoint,
  submission,
  timeoutMs,
  fetchLive,
  registerClient = tryRegisterProbeClient,
  requestToken = requestClientCredentialsToken,
  accountsPath,
  assertUrl,
  email,
  fetchImpl,
  trySignup,
} = {}) {
  if (typeof fetchLive !== 'function') {
    throw new Error('probeEndpointForTools requires fetchLive');
  }
  const { bearerFromSubmission } = require('../../services/mcpSubmissionService');
  const bearer = bearerFromSubmission(submission);
  let live = await fetchLive(endpoint, { timeoutMs, bearerToken: bearer || undefined });
  const listed = live && (live.status === 'ok' || live.status === 'ok_empty');
  if (listed) {
    return {
      live,
      authAttempt: bearer
        ? publicAuthAttempt({
            mode: 'submitted_bearer',
            attempted: true,
            registered: false,
            tokenAcquired: true,
            reason: 'Probed with the bearer token stored on this submission.',
          })
        : null,
    };
  }
  if (!live || live.status !== 'auth_required') {
    return {
      live,
      authAttempt: bearer
        ? publicAuthAttempt({
            mode: 'submitted_bearer',
            attempted: true,
            registered: false,
            tokenAcquired: false,
            reason: 'The submitted bearer token did not return a tool list.',
          })
        : null,
    };
  }

  const notes = [];
  if (submission?.testAccount?.kind === 'login') {
    notes.push('A username and password are stored for the reviewer. Influzer does not submit website signup or login forms.');
  } else if (bearer) {
    notes.push('The submitted bearer token was rejected.');
  }

  let accessToken = null;
  let clientId = null;
  let registered = false;
  const stored = accountsPath ? readStoredClient(accountsPath, endpoint) : null;
  if (stored) {
    try {
      const got = await requestToken({
        tokenEndpoint: stored.token_endpoint,
        clientId: stored.client_id,
        clientSecret: stored.client_secret,
        fetchImpl,
        assertUrl,
      });
      if (got.accessToken) {
        accessToken = got.accessToken;
        clientId = stored.client_id;
        registered = true;
        notes.push('Used the OAuth client registered earlier for this endpoint.');
      }
    } catch {
      /* fall through to a fresh registration */
    }
  }

  if (!accessToken) {
    const registration = await registerClient({
      wwwAuthenticate: live.wwwAuthenticate,
      email,
      fetchImpl,
      assertUrl,
    });
    if (registration?.accessToken) accessToken = registration.accessToken;
    if (registration?.clientId) {
      clientId = registration.clientId;
      registered = true;
    }
    if (registration?.reason) notes.push(registration.reason);
    if (
      accountsPath &&
      registration?.clientId &&
      registration?.clientSecret &&
      registration?.tokenEndpoint
    ) {
      try {
        writeStoredClient(accountsPath, endpoint, {
          client_id: registration.clientId,
          client_secret: registration.clientSecret,
          token_endpoint: registration.tokenEndpoint,
          contact: registration.contact,
        });
      } catch {
        /* the probe can still use the token from this request */
      }
    }
  }

  if (accessToken) {
    live = await fetchLive(endpoint, { timeoutMs, bearerToken: accessToken });
    if (live.status === 'ok' || live.status === 'ok_empty') {
      notes.push('tools/list succeeded with that client.');
    }
  }

  const listedAfterAuth = live && (live.status === 'ok' || live.status === 'ok_empty');
  if (!listedAfterAuth && !submission?.testAccount?.secret) {
    const signupFn = trySignup || require('./mcp-probe-signup').tryProbeSignup;
    const signup = await signupFn({
      endpoint,
      wwwAuthenticate: live.wwwAuthenticate,
      loginUrl: submission?.testAccount?.loginUrl,
      accountsPath,
      fetchImpl,
      assertUrl,
      email,
      timeoutMs,
    });
    if (signup?.reason) notes.push(signup.reason);
    if (signup?.accessToken) {
      accessToken = signup.accessToken;
      live = await fetchLive(endpoint, { timeoutMs, bearerToken: accessToken });
      if (live.status === 'ok' || live.status === 'ok_empty') {
        notes.push('tools/list succeeded after signup.');
      }
    }
  }

  return {
    live,
    authAttempt: publicAuthAttempt({
      mode: 'oauth_client',
      attempted: true,
      registered,
      tokenAcquired: Boolean(accessToken) && (live.status === 'ok' || live.status === 'ok_empty'),
      clientId,
      reason: notes.filter(Boolean).join(' '),
    }),
  };
}

module.exports = {
  PROBE_CONTACT_ENV,
  DEFAULT_ACCOUNTS_PATH,
  parseResourceMetadataUrl,
  authorizationServerMetadataUrl,
  publicAuthAttempt,
  tryRegisterProbeClient,
  requestClientCredentialsToken,
  probeEndpointForTools,
  readStoredClient,
};
