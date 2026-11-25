'use strict';

/**
 * Claim an existing directory listing (self-service when proof passes).
 * A verified account plus one of:
 * - email domain matches the listing host
 * - /.well-known/owners.json lists the account email (VerifyMCP / OpenAI-style)
 * - one-time /.well-known/influzer-claim.txt on that host
 * - the same one-time line in the listing's GitHub repo
 * When any check passes, ownership is granted immediately. No listing copy is changed.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { assertSafePublicUrl } = require('./webmcp/ssrf');
const { fetchLimited } = require('./mcpListingCopy');

function directoryApi() {
  return require('./mcpDirectoryService');
}

function manualApi() {
  return require('./mcpCatalogAdminService');
}

const CLAIMS_DIR = path.join(__dirname, '..', 'data', 'mcp-claims');
const CLAIM_FILE = '.well-known/influzer-claim.txt';
const OWNERS_FILE = '.well-known/owners.json';
const MAX_NOTE = 2000;
const MAX_PROOF_BYTES = 4096;
const MAX_OWNERS = 50;
const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'hey.com',
  'pm.me',
]);
const RELATIONSHIPS = new Set(['maintainer', 'company', 'author']);

function ensureClaimsDir() {
  if (!fs.existsSync(CLAIMS_DIR)) fs.mkdirSync(CLAIMS_DIR, { recursive: true });
}

function claimFilePath(id) {
  const safe = path.basename(String(id || ''));
  if (!/^[a-z0-9-]+$/i.test(safe)) return null;
  return path.join(CLAIMS_DIR, `${safe}.json`);
}

function readClaim(id) {
  const filePath = claimFilePath(id);
  if (!filePath || !fs.existsSync(filePath)) return null;
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { ...data, id: path.basename(filePath, '.json') };
}

function writeClaim(claim) {
  ensureClaimsDir();
  const filePath = claimFilePath(claim.id);
  if (!filePath) throw new Error('Invalid claim id');
  const { id: _id, ...rest } = claim;
  fs.writeFileSync(filePath, `${JSON.stringify({ id: claim.id, ...rest }, null, 2)}\n`, 'utf8');
  return readClaim(claim.id);
}

function listClaims() {
  ensureClaimsDir();
  return fs
    .readdirSync(CLAIMS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readClaim(name.replace(/\.json$/, '')))
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function hostKey(hostname) {
  return String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
}

function emailDomain(email) {
  const value = String(email || '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at < 1) return '';
  return hostKey(value.slice(at + 1));
}

function hostsForListing(server) {
  const hosts = [];
  for (const raw of [server?.mcp_endpoint, server?.deployment_url, server?.docs_url]) {
    if (!raw) continue;
    try {
      const host = hostKey(new URL(raw).hostname);
      if (!host || host === 'github.com' || host === 'gitlab.com') continue;
      hosts.push(host);
    } catch {
      /* skip bad urls */
    }
  }
  return [...new Set(hosts)];
}

function domainMatchesHost(domain, host) {
  if (!domain || !host) return false;
  if (domain === host) return true;
  return domain.endsWith(`.${host}`) || host.endsWith(`.${domain}`);
}

function emailDomainMatch(email, server) {
  const domain = emailDomain(email);
  if (!domain || PUBLIC_EMAIL_DOMAINS.has(domain)) {
    return { pass: false, domain, host: null };
  }
  const host = hostsForListing(server).find((item) => domainMatchesHost(domain, item)) || null;
  return { pass: Boolean(host), domain, host };
}

function githubRepo(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (hostKey(parsed.hostname) !== 'github.com') return null;
    const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
    if (!owner || !repo) return null;
    return {
      owner,
      repo: repo.replace(/\.git$/i, ''),
    };
  } catch {
    return null;
  }
}

function claimLine(code) {
  return `influzer-claim ${code}`;
}

function bodyHasClaim(body, code) {
  const line = claimLine(code);
  return String(body || '')
    .split(/\r?\n/)
    .some((row) => row.trim() === line);
}

function newClaimCode() {
  return crypto.randomBytes(16).toString('hex');
}

function httpsListingOrigins(server) {
  const origins = [];
  for (const raw of [server?.mcp_endpoint, server?.deployment_url, server?.docs_url]) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:') continue;
      if (hostKey(url.hostname) === 'github.com') continue;
      origins.push(url);
    } catch {
      /* skip */
    }
  }
  return origins;
}

function proofUrls(server) {
  const urls = [];
  for (const url of httpsListingOrigins(server)) {
    const proof = new URL(url.origin);
    proof.pathname = `/${CLAIM_FILE}`;
    urls.push(proof.toString());
  }
  return [...new Set(urls)];
}

/** Host-level and path-level owners.json URLs (VerifyMCP shape). */
function ownersUrls(server) {
  const urls = [];
  for (const url of httpsListingOrigins(server)) {
    const hostLevel = new URL(url.origin);
    hostLevel.pathname = `/${OWNERS_FILE}`;
    urls.push(hostLevel.toString());

    const basePath = url.pathname.replace(/\/+$/, '');
    if (basePath && basePath !== '/') {
      const pathLevel = new URL(url.origin);
      pathLevel.pathname = `${basePath}/${OWNERS_FILE}`;
      urls.push(pathLevel.toString());
    }
  }
  return [...new Set(urls)];
}

function ownersListFromBody(body) {
  let data;
  try {
    data = JSON.parse(String(body || ''));
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.owners)) return null;
  return data.owners
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAX_OWNERS);
}

function bodyHasOwnerEmail(body, email) {
  const owners = ownersListFromBody(body);
  if (!owners) return false;
  const target = String(email || '').trim().toLowerCase();
  return Boolean(target) && owners.includes(target);
}

function githubContentsUrl(repo) {
  return `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/contents/${CLAIM_FILE}`;
}

async function fetchProofBody(url, opts = {}) {
  let safeHref = url;
  try {
    safeHref = (await assertSafePublicUrl(url, { allowHttp: false })).href;
  } catch (err) {
    return { ok: false, url, error: err.message || 'URL is not allowed' };
  }
  const response = await fetchLimited(safeHref, {
    ...opts,
    maxBytes: MAX_PROOF_BYTES,
    headers: {
      accept: 'text/plain, application/json;q=0.5',
      'user-agent': 'InfluzerListingClaim/1.0',
    },
  });
  return { ...response, url: safeHref };
}

function decodeGithubContent(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (!data || data.encoding !== 'base64' || typeof data.content !== 'string') return null;
  if (Number(data.size) > MAX_PROOF_BYTES) return null;
  return Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf8');
}

async function collectEvidence(server, { email, code }, opts = {}) {
  const emailCheck = emailDomainMatch(email, server);
  const site = { pass: false, url: null, error: null };
  for (const url of proofUrls(server)) {
    const response = await fetchProofBody(url, opts);
    site.url = response.url || url;
    if (response.ok && bodyHasClaim(response.body, code)) {
      site.pass = true;
      site.error = null;
      break;
    }
    site.error = response.ok ? 'code_missing' : response.error || `HTTP ${response.status}`;
  }
  if (!site.url) site.error = 'no_https_origin';

  const owners = { pass: false, url: null, error: null };
  for (const url of ownersUrls(server)) {
    const response = await fetchProofBody(url, opts);
    owners.url = response.url || url;
    if (response.ok && bodyHasOwnerEmail(response.body, email)) {
      owners.pass = true;
      owners.error = null;
      break;
    }
    if (response.ok) {
      owners.error = ownersListFromBody(response.body) ? 'email_missing' : 'invalid_owners_json';
    } else {
      owners.error = response.error || `HTTP ${response.status}`;
    }
  }
  if (!owners.url) owners.error = 'no_https_origin';

  const repo = githubRepo(server?.github_url);
  const github = { pass: false, url: null, repo: repo ? `${repo.owner}/${repo.repo}` : null, error: null };
  if (repo) {
    const url = githubContentsUrl(repo);
    const response = await fetchProofBody(url, opts);
    github.url = response.url || url;
    const text = response.ok ? decodeGithubContent(response.body) : null;
    if (text && bodyHasClaim(text, code)) {
      github.pass = true;
    } else {
      github.error = response.ok ? 'code_missing' : response.error || `HTTP ${response.status}`;
    }
  } else {
    github.error = 'no_github_repo';
  }

  return {
    emailDomain: emailCheck,
    ownersFile: owners,
    siteFile: site,
    githubFile: github,
    anyPass: Boolean(emailCheck.pass || owners.pass || site.pass || github.pass),
    checkedAt: new Date().toISOString(),
  };
}

function publicClaim(claim) {
  return {
    id: claim.id,
    slug: claim.slug,
    serverName: claim.serverName,
    status: claim.status,
    relationship: claim.relationship,
    note: claim.note,
    statedGithub: claim.statedGithub || '',
    code: claim.code,
    claimLine: claimLine(claim.code),
    proofUrls: claim.proofUrls || [],
    ownersUrls: claim.ownersUrls || [],
    githubRepo: claim.evidence?.githubFile?.repo || null,
    evidence: claim.evidence || null,
    createdAt: claim.createdAt,
    updatedAt: claim.updatedAt,
    pageUrl: `/mcp/${claim.slug}`,
    myListingsUrl: '/mcp/my-listings',
  };
}

function applyAutoApprove(claim, server) {
  if (!claim?.evidence?.anyPass || claim.status !== 'pending') return claim;
  const manual = manualApi().findManualServer(server.slug);
  if (manual?.owner_user_id && Number(manual.owner_user_id) !== Number(claim.userId)) {
    claim.evidence.autoApproveBlocked = 'another_owner';
    return claim;
  }
  assignOwner(server, claim.userId);
  claim.status = 'approved';
  claim.reviewNote = 'Auto-approved: ownership proof passed';
  claim.reviewedBy = 'system';
  claim.reviewedAt = new Date().toISOString();
  claim.updatedAt = claim.reviewedAt;
  return claim;
}

function adminClaim(claim) {
  return {
    ...publicClaim(claim),
    userId: claim.userId,
    email: claim.email,
    name: claim.name || '',
    reviewNote: claim.reviewNote || '',
    reviewedAt: claim.reviewedAt || null,
  };
}

function validateClaimInput(body, user) {
  const slug = String(body?.slug || '')
    .trim()
    .toLowerCase();
  const relationship = String(body?.relationship || '').trim().toLowerCase();
  const note = String(body?.note || '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, MAX_NOTE);
  const statedGithub = String(body?.githubLogin || '')
    .trim()
    .replace(/^@/, '');
  const { isReservedMcpPath } = require('./mcpSubmissionService');
  if (!/^[a-z0-9-]{1,80}$/.test(slug) || isReservedMcpPath(slug)) {
    return { error: 'Choose a published listing.' };
  }
  if (!RELATIONSHIPS.has(relationship)) {
    return { error: 'Say whether you are the maintainer, the company, or the author.' };
  }
  if (note.length < 20) {
    return { error: 'Describe how you own this listing (at least 20 characters).' };
  }
  if (statedGithub && !/^[A-Za-z0-9-]{1,39}$/.test(statedGithub)) {
    return { error: 'GitHub username looks wrong.' };
  }
  if (!user?.id || !user.email) return { error: 'A verified account is required.' };
  return { slug, relationship, note, statedGithub };
}

async function createClaim(user, body, opts = {}) {
  const input = validateClaimInput(body, user);
  if (input.error) {
    const err = new Error(input.error);
    err.status = 400;
    throw err;
  }
  const server = directoryApi().findMcpServerBySlug(input.slug);
  if (!server) {
    const err = new Error('That listing is not in the directory.');
    err.status = 404;
    throw err;
  }
  const manual = manualApi().findManualServer(server.slug);
  if (manual?.owner_user_id && Number(manual.owner_user_id) !== Number(user.id)) {
    const err = new Error('This listing already has an owner. Email us if that is a mistake.');
    err.status = 409;
    throw err;
  }
  if (manual?.owner_user_id && Number(manual.owner_user_id) === Number(user.id)) {
    const err = new Error('You already own this listing. Edit it from My listings.');
    err.status = 409;
    throw err;
  }
  const open = listClaims().find(
    (claim) =>
      claim.status === 'pending' &&
      claim.slug === server.slug &&
      Number(claim.userId) === Number(user.id),
  );
  if (open) return { claim: open, existing: true };

  const recent = listClaims().filter(
    (claim) =>
      Number(claim.userId) === Number(user.id) &&
      Date.now() - Date.parse(claim.createdAt || 0) < 24 * 60 * 60 * 1000,
  );
  if (recent.length >= 8) {
    const err = new Error('Too many claims from this account today. Try again tomorrow.');
    err.status = 429;
    throw err;
  }

  const code = newClaimCode();
  const evidence = await collectEvidence(server, { email: user.email, code }, opts);
  const now = new Date().toISOString();
  let claim = {
    id: `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}`,
    slug: server.slug,
    serverName: server.name,
    userId: user.id,
    email: String(user.email).trim().toLowerCase(),
    name: user.name || user.displayName || '',
    relationship: input.relationship,
    note: input.note,
    statedGithub: input.statedGithub,
    code,
    proofUrls: proofUrls(server),
    ownersUrls: ownersUrls(server),
    evidence,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  claim = applyAutoApprove(claim, server);
  claim = writeClaim(claim);
  return { claim, existing: false, server };
}

async function recheckClaim(id, user, opts = {}) {
  const claim = readClaim(id);
  if (!claim || Number(claim.userId) !== Number(user?.id)) {
    const err = new Error('Claim not found');
    err.status = 404;
    throw err;
  }
  if (claim.status !== 'pending') {
    const err = new Error('This claim is already reviewed.');
    err.status = 400;
    throw err;
  }
  const last = Date.parse(claim.evidence?.checkedAt || 0) || 0;
  if (Date.now() - last < 15000) {
    const err = new Error('Wait a few seconds before checking again.');
    err.status = 429;
    throw err;
  }
  const server = directoryApi().findMcpServerBySlug(claim.slug);
  if (!server) {
    const err = new Error('That listing is no longer public.');
    err.status = 404;
    throw err;
  }
  claim.evidence = await collectEvidence(server, { email: claim.email, code: claim.code }, opts);
  claim.proofUrls = proofUrls(server);
  claim.ownersUrls = ownersUrls(server);
  claim.updatedAt = new Date().toISOString();
  claim = applyAutoApprove(claim, server);
  return writeClaim(claim);
}

function snapshotManual(server, ownerUserId) {
  const tools = (server.tools || [])
    .map((tool) => ({
      name: String(tool.name || '').trim().slice(0, 120),
      description: String(tool.description || '').trim().slice(0, 4000),
    }))
    .filter((tool) => tool.name);
  const row = {
    name: server.name,
    slug: server.slug,
    category: server.category || 'Dev Tools',
    description: server.description || '',
    official: Boolean(server.official),
    transport: server.transport || 'unknown',
    icon: server.icon || 'globe',
    featured: Boolean(server.featured),
    stars: server.stars || 0,
    tools,
    owner_user_id: ownerUserId,
  };
  if (server.github_url) row.github_url = server.github_url;
  if (server.docs_url) row.docs_url = server.docs_url;
  if (server.mcp_endpoint) row.mcp_endpoint = server.mcp_endpoint;
  else if (server.deployment_url) row.mcp_endpoint = server.deployment_url;
  if (server.install_command) row.install_command = server.install_command;
  return row;
}

function assignOwner(server, ownerUserId) {
  const { findManualServer, upsertManualServer } = manualApi();
  const existing = findManualServer(server.slug);
  if (existing) {
    upsertManualServer({ ...existing, slug: server.slug, owner_user_id: ownerUserId });
    return;
  }
  upsertManualServer(snapshotManual(server, ownerUserId));
}

function reviewClaim(id, { status, note, reviewer }) {
  const claim = readClaim(id);
  if (!claim) {
    const err = new Error('Claim not found');
    err.status = 404;
    throw err;
  }
  if (claim.status !== 'pending') {
    const err = new Error('This claim is already reviewed.');
    err.status = 400;
    throw err;
  }
  if (status === 'approved') {
    const server = directoryApi().findMcpServerBySlug(claim.slug);
    if (!server) {
      const err = new Error('That listing is no longer public.');
      err.status = 404;
      throw err;
    }
    const manual = manualApi().findManualServer(server.slug);
    if (manual?.owner_user_id && Number(manual.owner_user_id) !== Number(claim.userId)) {
      const err = new Error('Another account already owns this listing.');
      err.status = 409;
      throw err;
    }
    assignOwner(server, claim.userId);
  }
  claim.status = status;
  claim.reviewNote = String(note || '').slice(0, 1000);
  claim.reviewedBy = reviewer || '';
  claim.reviewedAt = new Date().toISOString();
  claim.updatedAt = claim.reviewedAt;
  return writeClaim(claim);
}

function registerMcpClaimRoutes(app) {
  const { requireAuth, requireAuthPage, requireVerified } = require('../auth');
  const { ensureCsrfToken, requireCsrfToken } = require('../middleware/csrf');
  const { sendMcpClaimEmail } = require('../emailService');

  app.get('/mcp/claim', requireAuthPage, (req, res) => {
    res.render('mcp-claim', {
      pageTitle: 'Claim an MCP listing',
      metaDescription: 'Claim a published Influzer MCP listing you maintain.',
      canonicalUrl: 'https://www.influzer.ai/mcp/claim',
      slug: '',
      serverName: '',
      csrfToken: ensureCsrfToken(req) || '',
      verified: Boolean(req.user.email_verified || req.user.provider !== 'local'),
      email: req.user.email || '',
    });
  });

  app.get('/mcp/claim/:slug', requireAuthPage, (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    const server = /^[a-z0-9-]{1,80}$/.test(slug) ? directoryApi().findMcpServerBySlug(slug) : null;
    res.render('mcp-claim', {
      pageTitle: server ? `Claim ${server.name}` : 'Claim an MCP listing',
      metaDescription: 'Claim a published Influzer MCP listing you maintain.',
      canonicalUrl: `https://www.influzer.ai/mcp/claim/${encodeURIComponent(slug)}`,
      slug: server ? server.slug : '',
      serverName: server ? server.name : '',
      csrfToken: ensureCsrfToken(req) || '',
      verified: Boolean(req.user.email_verified || req.user.provider !== 'local'),
      email: req.user.email || '',
    });
  });

  app.post('/api/mcp/claims', requireAuth, requireVerified, requireCsrfToken, async (req, res) => {
    try {
      const { claim, existing } = await createClaim(req.user, req.body || {});
      if (!existing) {
        try {
          await sendMcpClaimEmail(claim);
        } catch (err) {
          console.error('MCP claim email failed:', err.message || err);
        }
      }
      res.status(existing ? 200 : 201).json({
        claim: publicClaim(claim),
        existing: Boolean(existing),
      });
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error('MCP claim create error:', err);
      res.status(status).json({ error: err.message || 'Could not save the claim' });
    }
  });

  app.post('/api/mcp/claims/:id/recheck', requireAuth, requireVerified, requireCsrfToken, async (req, res) => {
    try {
      const claim = await recheckClaim(req.params.id, req.user);
      res.json({ claim: publicClaim(claim) });
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error('MCP claim recheck error:', err);
      res.status(status).json({ error: err.message || 'Could not recheck the claim' });
    }
  });
}

function registerMcpClaimAdminRoutes(app, requireAdmin) {
  const { requireAuth } = require('../auth');
  const { readPublisherCopy, diffListingCopy } = require('./mcpListingCopy');
  const DRIFT_PATH = path.join(__dirname, '..', 'data', 'mcp-listing-drift.json');

  app.get('/admin/api/mcp/claims', requireAuth, requireAdmin, (req, res) => {
    const status = String(req.query.status || 'pending');
    const claims = listClaims().filter((claim) => status === 'all' || claim.status === status);
    res.json({ claims: claims.map(adminClaim) });
  });

  app.post('/admin/api/mcp/claims/:id/approve', requireAuth, requireAdmin, (req, res) => {
    try {
      const claim = reviewClaim(req.params.id, {
        status: 'approved',
        note: req.body?.note,
        reviewer: req.user?.email || 'admin',
      });
      res.json({ success: true, claim: adminClaim(claim) });
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message || 'Could not approve the claim' });
    }
  });

  app.post('/admin/api/mcp/claims/:id/reject', requireAuth, requireAdmin, (req, res) => {
    try {
      const claim = reviewClaim(req.params.id, {
        status: 'rejected',
        note: req.body?.note,
        reviewer: req.user?.email || 'admin',
      });
      res.json({ success: true, claim: adminClaim(claim) });
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message || 'Could not reject the claim' });
    }
  });

  app.get('/admin/api/mcp/listing-drift', requireAuth, requireAdmin, (req, res) => {
    if (!fs.existsSync(DRIFT_PATH)) {
      return res.json({ generated_at: null, checked: 0, drift: [], errors: [] });
    }
    try {
      const data = JSON.parse(fs.readFileSync(DRIFT_PATH, 'utf8'));
      res.json({
        generated_at: data.generated_at || null,
        checked: data.checked || 0,
        no_card: data.no_card || 0,
        drift: Array.isArray(data.drift) ? data.drift : [],
        errors: Array.isArray(data.errors) ? data.errors : [],
      });
    } catch (err) {
      res.status(500).json({ error: 'Drift report could not be read' });
    }
  });

  app.post('/admin/api/mcp/refresh-copy', requireAuth, requireAdmin, async (req, res) => {
    const endpoint = String(req.body?.endpoint || '').trim();
    if (!endpoint) return res.status(400).json({ error: 'Set the MCP endpoint URL first.' });
    const stored = {
      description: String(req.body?.description || ''),
      tools: Array.isArray(req.body?.tools) ? req.body.tools : [],
    };
    const card = await readPublisherCopy({
      endpoint,
      githubUrl: String(req.body?.githubUrl || req.body?.docsUrl || '').trim(),
    });
    if (!card.ok) {
      return res.status(502).json({
        error: card.error || 'No server card at /.well-known/mcp/server-card.json',
        cardUrl: card.cardUrl || null,
      });
    }
    const diff = diffListingCopy(stored, card.card);
    const compared = diff.drifted
      ? 'The published copy disagrees with this form. Listing copy is unchanged until you save.'
      : 'Tool text and prices match this form. The intro is left as written.';
    const sourceNote = card.source === 'github-server-json'
      ? `No server card at ${card.wellKnownUrl}. Compared server.json from the GitHub repo. `
      : '';
    res.json({
      success: true,
      source: card.source,
      cardUrl: card.cardUrl,
      liveDescription: diff.liveDescription,
      price: diff.price,
      tools: diff.tools,
      descriptionDiffers: diff.descriptionDiffers,
      drifted: diff.drifted,
      message: sourceNote + compared,
    });
  });
}

module.exports = {
  CLAIM_FILE,
  OWNERS_FILE,
  claimLine,
  bodyHasClaim,
  bodyHasOwnerEmail,
  ownersListFromBody,
  emailDomainMatch,
  githubRepo,
  proofUrls,
  ownersUrls,
  collectEvidence,
  decodeGithubContent,
  createClaim,
  recheckClaim,
  reviewClaim,
  assignOwner,
  snapshotManual,
  listClaims,
  readClaim,
  publicClaim,
  registerMcpClaimRoutes,
  registerMcpClaimAdminRoutes,
};
