// ================================
//  MCP server submission (email to admin)
// ================================

const fs = require('fs');
const path = require('path');
const { getMcpCategories } = require('./mcpDirectoryService');
const { sendMcpSubmissionEmail } = require('../emailService');

const SUBMISSIONS_DIR = path.join(__dirname, '..', 'data', 'mcp-submissions');
const MAX_FIELD = 8000;
const MAX_TOOLS_FIELD = 20000;
const RATE_LIMIT_PER_HOUR = 5;
const recentByIp = new Map();

const TRANSPORTS = ['stdio', 'http', 'sse', 'unknown'];

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) return String(forwardedFor).split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

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
  const lines = cleanText(raw, MAX_TOOLS_FIELD)
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

function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const entry = recentByIp.get(ip) || [];
  const recent = entry.filter((t) => now - t < windowMs);
  if (recent.length >= RATE_LIMIT_PER_HOUR) return false;
  recent.push(now);
  recentByIp.set(ip, recent);
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
    errors.push('Provide at least one of GitHub URL, docs URL, or primary/install URL.');
  }

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
    },
  };
}

/** Reserved MCP path segments — must not be handled as server slugs */
const RESERVED_MCP_PATHS = new Set(['submit', 'all']);

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
      if (!checkRateLimit(ip)) {
        return res.status(429).json({
          error: 'Too many submissions from this address. Please try again in an hour.',
        });
      }

      const { errors, data } = validateSubmission(req.body || {});
      if (errors?.length) {
        return res.status(400).json({ error: errors.join(' ') });
      }

      const submittedAt = new Date().toISOString();
      const payload = {
        ...data,
        ip,
        submittedAt,
        reviewStatus: 'pending',
      };

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
        await sendMcpSubmissionEmail(payload);
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
        message:
          'Thanks! Your submission was received and will be reviewed shortly. You are also subscribed to Influzer Insights for listing updates and new MCP servers.',
        reference,
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
};
