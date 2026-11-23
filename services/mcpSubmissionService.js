// ================================
//  MCP server submission (email to admin)
// ================================

const fs = require('fs');
const path = require('path');
const { getMcpCategories } = require('./mcpDirectoryService');
const { sendMcpSubmissionEmail } = require('../emailService');
const { getOptionalAuthUser } = require('../auth');
const { getDatabase } = require('../database');
const { scanListingText } = require('./mcpSourceSafety');

const SUBMISSIONS_DIR = path.join(__dirname, '..', 'data', 'mcp-submissions');
const MAX_FIELD = 8000;
const MAX_TOOLS_FIELD = 20000;
const RATE_LIMIT_PER_HOUR = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MCP_SUBMIT_ENDPOINT = 'mcp-submit';

const TRANSPORTS = ['stdio', 'http', 'sse', 'unknown'];

const { getClientIp } = require('../utils/clientIp');

function cleanText(input, maxLen = MAX_FIELD) {
  if (typeof input !== 'string') return '';
  return input.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, maxLen);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidUrl(url) {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function slugify(value) {
  return cleanText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseTools(raw) {
  if (typeof raw !== 'string') return [];
  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .slice(0, MAX_TOOLS_FIELD)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const tools = [];
  for (const line of lines) {
    const sep = line.includes(' — ') ? ' — ' : line.includes(' - ') ? ' - ' : null;
    if (sep) {
      const [name, ...rest] = line.split(sep);
      tools.push({ name: name.trim(), description: rest.join(sep).trim() });
    } else {
      tools.push({ name: line, description: '' });
    }
  }
  return tools;
}

function formatToolsForEmail(tools) {
  if (!tools.length) return '';
  return tools
    .map((t) => (t.description ? `${t.name} — ${t.description}` : t.name))
    .join('\n');
}

async function checkMcpSubmitRateLimit(ip) {
  const db = await getDatabase();
  const count = await db.getIPUsageCountForEndpoint(ip, MCP_SUBMIT_ENDPOINT, RATE_LIMIT_WINDOW_MS);
  if (count >= RATE_LIMIT_PER_HOUR) {
    return false;
  }
  await db.logUsage(null, ip, MCP_SUBMIT_ENDPOINT);
  return true;
}

function persistSubmission(payload) {
  if (!fs.existsSync(SUBMISSIONS_DIR)) {
    fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });
  }
  const file = path.join(
    SUBMISSIONS_DIR,
    `${Date.now()}-${slugify(payload.serverName) || 'submission'}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

function validateSubmission(body) {
  const errors = [];
  const submitterEmail = cleanText(body.submitter_email, 254).toLowerCase();
  const submitterName = cleanText(body.submitter_name, 120);
  const serverName = cleanText(body.server_name, 200);
  const suggestedSlug = slugify(body.suggested_slug || body.server_name);
  const description = cleanText(body.description, MAX_FIELD);
  const category = cleanText(body.category, 80);
  const transport = cleanText(body.transport, 20).toLowerCase() || 'unknown';
  const githubUrl = cleanText(body.github_url, 500);
  const docsUrl = cleanText(body.docs_url, 500);
  const primaryUrl = cleanText(body.primary_url, 500);
  const setupInstructions = cleanText(body.setup_instructions, MAX_FIELD);
  const additionalNotes = cleanText(body.additional_notes, MAX_FIELD);
  const starsRaw = cleanText(body.stars, 12);
  const official = Boolean(body.official);
  const tools = parseTools(body.tools);

  const categories = [...getMcpCategories(), 'Other'];

  if (!submitterEmail || !isValidEmail(submitterEmail)) {
    errors.push('A valid submitter email is required.');
  }
  if (!serverName) errors.push('Server name is required.');
  if (!description || description.length < 20) {
    errors.push('Description must be at least 20 characters.');
  }
  if (!category || !categories.includes(category)) {
    errors.push('Please select a valid category.');
  }
  if (!TRANSPORTS.includes(transport)) {
    errors.push('Please select a valid transport type.');
  }
  if (!isValidUrl(githubUrl)) errors.push('GitHub URL must be a valid http(s) link.');
  if (!isValidUrl(docsUrl)) errors.push('Docs URL must be a valid http(s) link.');
  if (!isValidUrl(primaryUrl)) errors.push('Primary URL must be a valid http(s) link.');
  if (!githubUrl && !docsUrl && !primaryUrl) {
    errors.push('Provide at least one MCP server URL (GitHub, docs, or primary/install).');
  }
  if (!tools.length) {
    errors.push('Add at least one tool (one tool name per line).');
  }

  const testAccount = readTestAccount(body, errors, {
    description,
    setupInstructions,
    additionalNotes,
    tools: body.tools,
  });

  let stars = '';
  if (starsRaw) {
    const n = parseInt(starsRaw, 10);
    if (Number.isNaN(n) || n < 0) errors.push('Stars must be a non-negative number.');
    else stars = String(n);
  }

  if (errors.length) return { errors };

  return {
    data: {
      submitterEmail,
      submitterName,
      serverName,
      suggestedSlug,
      description,
      category,
      transport,
      githubUrl,
      docsUrl,
      primaryUrl,
      setupInstructions,
      additionalNotes,
      stars,
      official,
      tools,
      toolsFormatted: formatToolsForEmail(tools),
      testAccount,
    },
  };
}

const TEST_ACCOUNT_KINDS = new Set(['bearer', 'login']);

function readTestAccount(body, errors, publicFields) {
  const kind = cleanText(body.test_account_kind, 20).toLowerCase();
  const label = cleanText(body.test_account_label, 254);
  const secret = cleanText(body.test_account_secret, 2048);
  const loginUrl = cleanText(body.test_account_login_url, 500);
  const notes = cleanText(body.test_account_notes, 500);
  const consent = body.test_account_consent === true || body.test_account_consent === '1' || body.test_account_consent === 1;

  if (!kind && !secret && !label && !loginUrl && !notes) return null;
  if (kind && !TEST_ACCOUNT_KINDS.has(kind)) {
    errors.push('Test account type must be a bearer token or a username and password.');
  }
  if ((kind || label || loginUrl || notes) && !secret) {
    errors.push('Add the test credential, or leave the test account blank.');
  }
  if (secret && !TEST_ACCOUNT_KINDS.has(kind)) {
    errors.push('Choose bearer token or username and password when you include a test credential.');
  }
  if (secret && secret.length < 8) {
    errors.push('Test credential must be at least 8 characters.');
  }
  if (secret && !consent) {
    errors.push('Confirm that this test credential may be used only to call initialize and tools/list.');
  }
  if (kind === 'login' && secret && !label) {
    errors.push('A login test account needs a username or email.');
  }
  if (loginUrl && !isValidUrl(loginUrl)) {
    errors.push('Test account login URL must be a valid http(s) link.');
  }
  if (loginUrl && !/^https:\/\//i.test(loginUrl)) {
    errors.push('Test account login URL must use https.');
  }
  if (secret && secret.length >= 8) {
    const leaked = ['description', 'setupInstructions', 'additionalNotes', 'tools'].some((key) =>
      String(publicFields[key] || '').includes(secret),
    );
    if (leaked || (notes && notes.includes(secret))) {
      errors.push('Keep the test credential in the secret field only.');
    }
  }
  if (errors.length) return null;
  if (!secret) return null;
  return { kind, label, secret, loginUrl, notes, consent: true };
}

function testAccountSummary(testAccount) {
  if (!testAccount?.secret) return 'None';
  const kind = testAccount.kind === 'login' ? 'username and password' : 'bearer token';
  const label = testAccount.label ? ` for ${testAccount.label}` : '';
  return `Stored with the submission (${kind}${label}). Not included in this email.`;
}

function submissionNotification(data) {
  const notification = { ...data };
  notification.testAccountSummary = testAccountSummary(data.testAccount);
  delete notification.testAccount;
  return notification;
}

function bearerFromSubmission(sub) {
  const account = sub?.testAccount;
  if (!account || account.kind !== 'bearer' || account.consent !== true) return null;
  const secret = String(account.secret || '').trim();
  if (!secret || secret.length > 2048 || secret.length < 8 || /[\r\n\0]/.test(secret)) return null;
  return secret;
}

function redactSubmission(sub) {
  if (!sub) return sub;
  const { testAccount, ...rest } = sub;
  delete rest.filePath;
  return {
    ...rest,
    testAccount: {
      provided: Boolean(testAccount?.secret),
      kind: testAccount?.kind || '',
      label: testAccount?.label || '',
      loginUrl: testAccount?.loginUrl || '',
      notes: testAccount?.notes || '',
    },
  };
}

/** List-row flag. Never includes the secret. */
function testAccountListFields(testAccount) {
  const provided = Boolean(testAccount?.secret);
  return {
    testAccountProvided: provided,
    testAccountKind: provided ? (testAccount.kind === 'login' ? 'login' : 'bearer') : '',
  };
}

/** Reserved MCP path segments — must not be handled as server slugs */
const RESERVED_MCP_PATHS = new Set([
  'submit',
  'all',
  'my-listings',
  'topics',
  'discovery',
  'probe',
  'check',
  'install',
  'skill',
  'scoreboard',
  'allowlist',
  'promote',
  'changes',
  'claim',
]);

function isReservedMcpPath(slug) {
  return RESERVED_MCP_PATHS.has(String(slug || '').toLowerCase());
}

function renderMcpSubmitPage(req, res) {
  res.render('mcp-submit', {
    pageTitle: 'Submit an MCP Server',
    metaDescription:
      'Suggest a Model Context Protocol server for the Influzer.ai MCP directory. We review submissions manually.',
    categories: [...getMcpCategories(), 'Other'],
    transports: TRANSPORTS,
    canonicalUrl: 'https://www.influzer.ai/mcp/submit',
  });
}

function registerMcpSubmissionRoutes(app) {
  app.get('/mcp/submit', renderMcpSubmitPage);

  app.post('/api/mcp/submit', async (req, res) => {
    try {
      const honeypot = String(req.body?.website || '').trim();
      if (honeypot) {
        return res.status(400).json({ error: 'Submission rejected.' });
      }

      const ip = getClientIp(req);
      let allowed;
      try {
        allowed = await checkMcpSubmitRateLimit(ip);
      } catch (rateErr) {
        console.error('MCP submit rate limit check failed:', rateErr);
        return res.status(503).json({
          error: 'Submission service temporarily unavailable. Please try again shortly.',
        });
      }
      if (!allowed) {
        return res.status(429).json({
          error: 'Too many submissions from this address. Please try again in an hour.',
        });
      }

      const { errors, data } = validateSubmission(req.body || {});
      if (errors?.length) {
        return res.status(400).json({ error: errors.join(' ') });
      }

      const authUser = await getOptionalAuthUser(req);
      const submittedAt = new Date().toISOString();
      const payload = {
        ...data,
        ip,
        submittedAt,
        reviewStatus: 'pending',
        sourceSafety: scanListingText({
          description: data.description,
          setupInstructions: data.setupInstructions,
          additionalNotes: data.additionalNotes,
          tools: data.tools,
        }),
      };
      if (authUser?.id) {
        payload.submitterUserId = authUser.id;
        if (!payload.submitterEmail && authUser.email) {
          payload.submitterEmail = authUser.email;
        }
        if (!payload.submitterName && authUser.name) {
          payload.submitterName = authUser.name;
        }
      }

      const savedPath = persistSubmission(payload);
      const reference = path.basename(savedPath, '.json');

      try {
        const { subscribeToNewsletter } = require('./newsletterService');
        const subResult = await subscribeToNewsletter(data.submitterEmail, 'mcp-submit', ip);
        if (!subResult?.success) {
          console.warn('MCP submit newsletter subscribe skipped:', data.submitterEmail, subResult?.reason);
        }
      } catch (subscribeError) {
        console.error('MCP submit newsletter subscribe failed:', subscribeError.message);
      }

      try {
        await sendMcpSubmissionEmail(submissionNotification(payload));
      } catch (emailError) {
        console.error('MCP submission saved but email failed:', emailError.message);
        return res.status(500).json({
          error:
            'Your submission was saved but the notification email could not be sent. We will still review it — reference: ' +
            reference,
          reference,
          emailConfigured: false,
        });
      }

      return res.json({
        success: true,
        message: authUser?.id
          ? 'Thanks! Your submission was received and will be reviewed shortly. Once approved, you can edit your listing anytime from My MCP listings. You are also subscribed to Influzer Insights for listing updates.'
          : 'Thanks! Your submission was received and will be reviewed shortly. Without an account, you will not be able to edit this listing after it is published — log in before submitting next time to unlock self-service edits. You are also subscribed to Influzer Insights for listing updates.',
        reference,
        hasAccount: Boolean(authUser?.id),
      });
    } catch (error) {
      console.error('MCP submission error:', error);
      return res.status(500).json({
        error: 'Could not save your submission. Please try again or email mencke@gmail.com directly.',
      });
    }
  });
}

function initializeMcpSubmissionService(_app) {
  const { isEmailConfigured } = require('../emailService');
  console.log(
    'MCP submission service ready —',
    isEmailConfigured() ? 'email notifications on' : 'email OFF (check .env)',
  );
}

module.exports = {
  initializeMcpSubmissionService,
  registerMcpSubmissionRoutes,
  isReservedMcpPath,
  checkMcpSubmitRateLimit,
  validateSubmission,
  submissionNotification,
  bearerFromSubmission,
  redactSubmission,
  testAccountListFields,
  MCP_SUBMIT_ENDPOINT,
  RATE_LIMIT_PER_HOUR,
  RATE_LIMIT_WINDOW_MS,
};
