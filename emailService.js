// ================================
//  Email Service for Verification
// ================================

const nodemailer = require('nodemailer');

let transporter;
let transporterMode = 'unknown';

function normalizeEmailPass(pass) {
  return String(pass || '').replace(/\s/g, '');
}

function isEmailConfigured() {
  if (process.env.EMAIL_SERVICE === 'gmail' && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return true;
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return true;
  }
  return false;
}

// Create transporter (supports multiple email providers)
function createTransporter() {
  // Gmail example
  if (process.env.EMAIL_SERVICE === 'gmail' && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    console.log('✅ Email service: Gmail configured');
    transporterMode = 'gmail';
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: normalizeEmailPass(process.env.EMAIL_PASS),
      },
    });
  }

  // SMTP configuration
  if (process.env.SMTP_HOST) {
    console.log('✅ Email service: SMTP configured');
    transporterMode = 'smtp';
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: normalizeEmailPass(process.env.SMTP_PASS),
      },
    });
  }

  // Development: console transporter (logs emails instead of sending)
  console.log('⚠️  WARNING: No email configuration found!');
  console.log('⚠️  Email service requires one of:');
  console.log('   - EMAIL_SERVICE=gmail + EMAIL_USER + EMAIL_PASS');
  console.log('   - SMTP_HOST + SMTP_USER + SMTP_PASS');
  console.log('⚠️  Using console transporter (emails will be logged, not sent)');
  transporterMode = 'console';
  return nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true,
  });
}

function getTransporter() {
  if (!transporter) {
    transporter = createTransporter();
  }
  return transporter;
}

function resetTransporter() {
  transporter = null;
  transporterMode = 'unknown';
}

function getFromAddress() {
  let fromAddress = process.env.EMAIL_FROM || 'noreply@logogenerator.com';
  if (process.env.EMAIL_SERVICE === 'gmail' && process.env.EMAIL_USER) {
    fromAddress = process.env.EMAIL_USER;
  }
  return fromAddress;
}

// Send verification email
async function sendVerificationEmail(email, token, name) {
  const verificationUrl = `${process.env.BASE_URL || 'http://localhost:4000'}/auth/verify-email?token=${token}`;
  const fromAddress = getFromAddress();

  const mailOptions = {
    from: fromAddress,
    to: email,
    subject: 'Verify your email address',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #10a37f; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Welcome to Logo Generator!</h1>
            <p>Hi ${name || 'there'},</p>
            <p>Thank you for signing up. Please verify your email address by clicking the button below:</p>
            <a href="${verificationUrl}" class="button">Verify Email Address</a>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all;">${verificationUrl}</p>
            <p>This link will expire in 24 hours.</p>
            <div class="footer">
              <p>If you didn't create an account, please ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Welcome to Logo Generator!
      
      Hi ${name || 'there'},
      
      Thank you for signing up. Please verify your email address by visiting:
      ${verificationUrl}
      
      This link will expire in 24 hours.
      
      If you didn't create an account, please ignore this email.
    `,
  };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    if (info.messageId) {
      console.log('✅ Verification email sent successfully');
      console.log('   From:', fromAddress);
      console.log('   To:', email);
      console.log('   Message ID:', info.messageId);
      console.log('   Verification URL:', verificationUrl);
    } else {
      console.log('⚠️  Email logged to console (no email service configured)');
      console.log('   From:', fromAddress);
      console.log('   To:', email);
      console.log('   Verification URL:', verificationUrl);
      console.log('   Token:', token);
    }
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    console.error('   Error details:', error.message);
    if (error.response) {
      console.error('   SMTP Response:', error.response);
    }
    throw error;
  }
}

// Send password reset email
async function sendPasswordResetEmail(email, token, name) {
  const resetUrl = `${process.env.BASE_URL || 'http://localhost:4000'}/reset-password?token=${token}`;
  const fromAddress = getFromAddress();

  const mailOptions = {
    from: fromAddress,
    to: email,
    subject: 'Reset your password',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #10a37f; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
            .warning { color: #d32f2f; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Password Reset Request</h1>
            <p>Hi ${name || 'there'},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all;">${resetUrl}</p>
            <p class="warning">This link will expire in 1 hour.</p>
            <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
            <div class="footer">
              <p>For security reasons, never share this link with anyone.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Password Reset Request
      
      Hi ${name || 'there'},
      
      We received a request to reset your password. Visit this link to create a new password:
      ${resetUrl}
      
      This link will expire in 1 hour.
      
      If you didn't request a password reset, please ignore this email.
    `,
  };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    console.log('✅ Password reset email sent:', info.messageId || 'logged to console');
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    throw error;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSubmissionField(label, value) {
  const text = String(value || '').trim();
  if (!text) {
    return `<tr><td colspan="2" style="padding:8px 0;color:#888;"><em>${escapeHtml(label)}: (not provided)</em></td></tr>`;
  }
  return `<tr>
    <td style="padding:8px 12px 8px 0;vertical-align:top;font-weight:600;color:#444;white-space:nowrap;">${escapeHtml(label)}</td>
    <td style="padding:8px 0;word-break:break-word;">${escapeHtml(text).replace(/\n/g, '<br>')}</td>
  </tr>`;
}

function ensureMcpEmailTransportReady() {
  if (!isEmailConfigured()) {
    throw new Error(
      'Email is not configured on the server (set EMAIL_SERVICE=gmail, EMAIL_USER, EMAIL_PASS in .env and restart PM2).',
    );
  }
  if (transporterMode === 'console') {
    resetTransporter();
    getTransporter();
  }
  if (transporterMode === 'console') {
    throw new Error('Email transport is in console-only mode; no real SMTP/Gmail connection.');
  }
}

async function sendMcpSubmissionEmail(submission) {
  ensureMcpEmailTransportReady();

  const to = process.env.MCP_SUBMISSION_EMAIL || 'mencke@gmail.com';
  const fromAddress = getFromAddress();
  const toolsBlock = submission.toolsFormatted || '(none listed)';
  const mailOptions = {
    from: fromAddress,
    to,
    replyTo: submission.submitterEmail || undefined,
    subject: `[MCP Submit] ${submission.serverName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family:Arial,sans-serif;line-height:1.5;color:#333;">
          <div style="max-width:720px;margin:0 auto;padding:20px;">
            <h2 style="margin:0 0 8px;">New MCP server submission</h2>
            <p style="margin:0 0 20px;color:#666;">Submitted via influzer.ai — review and add manually to the catalog.</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              ${formatSubmissionField('Server name', submission.serverName)}
              ${formatSubmissionField('Suggested slug', submission.suggestedSlug)}
              ${formatSubmissionField('Category', submission.category)}
              ${formatSubmissionField('Transport', submission.transport)}
              ${formatSubmissionField('Official server', submission.official ? 'Yes' : 'No')}
              ${formatSubmissionField('GitHub URL', submission.githubUrl)}
              ${formatSubmissionField('Docs URL', submission.docsUrl)}
              ${formatSubmissionField('Primary / install URL', submission.primaryUrl)}
              ${formatSubmissionField('Stars (estimate)', submission.stars)}
              ${formatSubmissionField('Submitter name', submission.submitterName)}
              ${formatSubmissionField('Submitter email', submission.submitterEmail)}
              ${formatSubmissionField('Description', submission.description)}
              ${formatSubmissionField('Setup instructions', submission.setupInstructions)}
              ${formatSubmissionField('Additional notes', submission.additionalNotes)}
            </table>
            <h3 style="margin:24px 0 8px;font-size:15px;">Tools</h3>
            <pre style="background:#f5f5f5;padding:12px;border-radius:8px;overflow:auto;font-size:13px;white-space:pre-wrap;">${escapeHtml(toolsBlock)}</pre>
            <p style="margin-top:24px;font-size:12px;color:#888;">IP: ${escapeHtml(submission.ip)} · ${escapeHtml(submission.submittedAt)}</p>
          </div>
        </body>
      </html>
    `,
    text: [
      'New MCP server submission',
      '',
      `Server name: ${submission.serverName}`,
      `Suggested slug: ${submission.suggestedSlug || '(none)'}`,
      `Category: ${submission.category}`,
      `Transport: ${submission.transport}`,
      `Official: ${submission.official ? 'Yes' : 'No'}`,
      `GitHub: ${submission.githubUrl || '(none)'}`,
      `Docs: ${submission.docsUrl || '(none)'}`,
      `Primary URL: ${submission.primaryUrl || '(none)'}`,
      `Stars: ${submission.stars || '(none)'}`,
      `Submitter: ${submission.submitterName || '(none)'} <${submission.submitterEmail}>`,
      '',
      'Description:',
      submission.description,
      '',
      'Setup:',
      submission.setupInstructions || '(none)',
      '',
      'Tools:',
      toolsBlock,
      '',
      'Notes:',
      submission.additionalNotes || '(none)',
      '',
      `IP: ${submission.ip}`,
      `At: ${submission.submittedAt}`,
    ].join('\n'),
  };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    console.log('✅ MCP submission email sent');
    console.log('   Mode:', transporterMode);
    console.log('   From:', fromAddress);
    console.log('   To:', to);
    console.log('   Subject:', mailOptions.subject);
    console.log('   Message ID:', info.messageId || '(none)');
    return { success: true, messageId: info.messageId, to };
  } catch (error) {
    console.error('❌ MCP submission email failed:', error.message);
    if (error.response) console.error('   SMTP response:', error.response);
    throw error;
  }
}

async function sendMcpFeedbackEmail({ submission, note }) {
  ensureMcpEmailTransportReady();

  const to = String(submission.submitterEmail || '').trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error('Submitter email is missing or invalid');
  }

  const feedback = String(note || '').trim();
  if (!feedback) {
    throw new Error('A message is required to email the submitter');
  }

  const base = (process.env.BASE_URL || 'https://www.influzer.ai').replace(/\/$/, '');
  const submitUrl = `${base}/mcp/submit`;
  const fromAddress = getFromAddress();
  const greeting = submission.submitterName || 'there';
  const serverName = submission.serverName || 'your MCP server';

  const mailOptions = {
    from: fromAddress,
    to,
    replyTo: process.env.MCP_SUBMISSION_EMAIL || process.env.EMAIL_USER || undefined,
    subject: `Quick follow-up on your MCP submission — ${serverName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
          <div style="max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="margin:0 0 12px;">We need a bit more info</h2>
            <p>Hi ${escapeHtml(greeting)},</p>
            <p>Thanks for submitting <strong>${escapeHtml(serverName)}</strong> to the Influzer.ai MCP directory. We're holding it for approval and need a quick update from you:</p>
            <div style="margin:20px 0;padding:16px;background:#f5f5f5;border-radius:8px;font-size:14px;white-space:pre-wrap;">${escapeHtml(feedback).replace(/\n/g, '<br>')}</div>
            <p style="font-size:14px;color:#444;"><strong>Easiest next step:</strong> reply to this email with the missing details (for example your tool list). We'll update your existing submission — no need to start over unless you prefer to <a href="${escapeHtml(submitUrl)}">resubmit</a>.</p>
            <p style="font-size:14px;color:#666;">Questions? Just reply — happy to help you get listed.</p>
            <p style="margin-top:28px;font-size:13px;color:#888;">— Influzer.ai MCP Directory</p>
          </div>
        </body>
      </html>
    `,
    text: [
      `Hi ${greeting},`,
      '',
      `Thanks for submitting ${serverName} to the Influzer.ai MCP directory. We're holding it for approval and need a quick update from you:`,
      '',
      feedback,
      '',
      'Easiest next step: reply to this email with the missing details (for example your tool list). We will update your existing submission.',
      `Or resubmit at: ${submitUrl}`,
      '',
      '— Influzer.ai MCP Directory',
    ].join('\n'),
  };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    console.log('✅ MCP feedback email sent to submitter');
    console.log('   To:', to);
    console.log('   Message ID:', info.messageId || '(none)');
    return { success: true, messageId: info.messageId, to };
  } catch (error) {
    console.error('❌ MCP feedback email failed:', error.message);
    if (error.response) console.error('   SMTP response:', error.response);
    throw error;
  }
}

async function sendMcpApprovalEmail({ submission, server, pageUrl }) {
  ensureMcpEmailTransportReady();

  const to = String(submission.submitterEmail || '').trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error('Submitter email is missing or invalid');
  }

  const base = (process.env.BASE_URL || 'https://www.influzer.ai').replace(/\/$/, '');
  const listingUrl = `${base}${pageUrl}`;
  const fromAddress = getFromAddress();
  const greeting = submission.submitterName || 'there';
  const serverName = server.name || submission.serverName;
  const toolCount = Array.isArray(server.tools) ? server.tools.length : 0;

  const mailOptions = {
    from: fromAddress,
    to,
    replyTo: process.env.MCP_SUBMISSION_EMAIL || process.env.EMAIL_USER || undefined,
    subject: `Your MCP server is live on Influzer.ai — ${serverName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;">
          <div style="max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="margin:0 0 12px;">You're listed in the MCP directory</h2>
            <p>Hi ${escapeHtml(greeting)},</p>
            <p>Thanks for submitting <strong>${escapeHtml(serverName)}</strong>. We've reviewed and published it in the Influzer.ai MCP server directory.</p>
            <p style="margin:24px 0;">
              <a href="${escapeHtml(listingUrl)}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;">View your listing</a>
            </p>
            <p style="word-break:break-all;font-size:14px;color:#555;">${escapeHtml(listingUrl)}</p>
            <ul style="font-size:14px;color:#444;padding-left:20px;">
              <li><strong>Category:</strong> ${escapeHtml(server.category || submission.category || '—')}</li>
              <li><strong>Tools indexed:</strong> ${toolCount}</li>
            </ul>
            <p style="font-size:14px;color:#666;">Share the link with your users or add it to your docs. If anything looks wrong, reply to this email.</p>
            <p style="margin-top:28px;font-size:13px;color:#888;">— Influzer.ai MCP Directory</p>
          </div>
        </body>
      </html>
    `,
    text: [
      `Hi ${greeting},`,
      '',
      `Thanks for submitting ${serverName}. We've reviewed and published it in the Influzer.ai MCP server directory.`,
      '',
      `View your listing: ${listingUrl}`,
      '',
      `Category: ${server.category || submission.category || '—'}`,
      `Tools indexed: ${toolCount}`,
      '',
      'If anything looks wrong, reply to this email.',
      '',
      '— Influzer.ai MCP Directory',
    ].join('\n'),
  };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    console.log('✅ MCP approval email sent to submitter');
    console.log('   To:', to);
    console.log('   Listing:', listingUrl);
    console.log('   Message ID:', info.messageId || '(none)');
    return { success: true, messageId: info.messageId, to, listingUrl };
  } catch (error) {
    console.error('❌ MCP approval email failed:', error.message);
    if (error.response) console.error('   SMTP response:', error.response);
    throw error;
  }
}

function buildRecentMcpServersHtml(recentMcpServers, baseUrl) {
  const browseUrl = `${baseUrl}/mcp`;
  const sectionHead = `<p style="margin:0 0 12px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;font-weight:700;">New in the MCP directory</p>`;

  if (!recentMcpServers?.length) {
    return `
      <div style="margin-top:28px;padding-top:24px;border-top:1px solid #e7e5e4;">
        ${sectionHead}
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#444;">Fresh MCP servers are added every week. Browse the full catalog on Influzer.ai.</p>
        <a href="${escapeHtml(browseUrl)}" style="display:inline-block;padding:10px 18px;border:1px solid #d4d4d8;color:#18181b;text-decoration:none;border-radius:999px;font-weight:600;font-size:14px;">Browse MCP servers →</a>
      </div>`;
  }

  const items = recentMcpServers
    .map((server) => {
      const pageUrl = `${baseUrl}/mcp/${encodeURIComponent(server.slug)}`;
      const desc = server.description
        ? `<p style="margin:4px 0 0;font-size:14px;line-height:1.5;color:#71717a;">${escapeHtml(server.description)}</p>`
        : '';
      const category = server.category
        ? `<span style="font-size:12px;color:#a1a1aa;"> · ${escapeHtml(server.category)}</span>`
        : '';
      return `<li style="margin:0 0 14px;">
        <a href="${escapeHtml(pageUrl)}" style="font-size:16px;font-weight:600;color:#18181b;text-decoration:none;">${escapeHtml(server.name)}</a>${category}
        ${desc}
      </li>`;
    })
    .join('');

  return `
    <div style="margin-top:28px;padding-top:24px;border-top:1px solid #e7e5e4;">
      ${sectionHead}
      <ul style="margin:0 0 16px;padding:0;list-style:none;">${items}</ul>
      <a href="${escapeHtml(browseUrl)}" style="font-size:14px;font-weight:600;color:#6366f1;text-decoration:none;">Browse all MCP servers →</a>
    </div>`;
}

function buildBlogNewsletterHtml({
  post,
  postUrl,
  coverImageUrl,
  customIntro,
  unsubscribeUrl,
  recentMcpServers = [],
}) {
  const baseUrl = (process.env.BASE_URL || 'https://www.influzer.ai').replace(/\/$/, '');
  const intro = customIntro
    ? `<p style="font-size:16px;line-height:1.6;color:#333;margin:0 0 20px;">${escapeHtml(customIntro).replace(/\n/g, '<br>')}</p>`
    : '';
  const coverBlock = coverImageUrl
    ? `<a href="${escapeHtml(postUrl)}" style="display:block;margin:0 0 20px;"><img src="${escapeHtml(coverImageUrl)}" alt="${escapeHtml(post.coverImageAlt || post.title)}" style="width:100%;max-width:560px;border-radius:12px;display:block;" /></a>`
    : '';
  const mcpServersBlock = buildRecentMcpServersHtml(recentMcpServers, baseUrl);

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,sans-serif;line-height:1.6;color:#333;">
    <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
      <div style="background:#fff;border-radius:16px;padding:28px 24px;border:1px solid #e7e5e4;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;font-weight:700;">Influzer Insights</p>
        <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#18181b;">${escapeHtml(post.title)}</h1>
        <p style="margin:0 0 20px;font-size:14px;color:#71717a;">${escapeHtml(post.date)}${post.category ? ` · ${escapeHtml(post.category)}` : ''}</p>
        ${intro}
        ${coverBlock}
        <p style="font-size:16px;line-height:1.6;color:#444;margin:0 0 20px;">${escapeHtml(post.excerpt)}</p>
        <p style="margin:0 0 24px;">
          <a href="${escapeHtml(postUrl)}" style="display:inline-block;padding:12px 24px;background:#18181b;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;">Read the article →</a>
        </p>
        ${mcpServersBlock}
      </div>
      <p style="margin:20px 0 0;font-size:12px;color:#a1a1aa;text-align:center;">
        You subscribed at influzer.ai · <a href="${escapeHtml(unsubscribeUrl)}" style="color:#71717a;">Unsubscribe</a>
      </p>
    </div>
  </body>
</html>`;
}

function buildBlogNewsletterText({
  post,
  postUrl,
  customIntro,
  unsubscribeUrl,
  recentMcpServers = [],
}) {
  const baseUrl = (process.env.BASE_URL || 'https://www.influzer.ai').replace(/\/$/, '');
  const intro = customIntro ? `${customIntro.trim()}\n\n` : '';
  const mcpLines = ['', 'New in the MCP directory', ''];

  if (recentMcpServers?.length) {
    for (const server of recentMcpServers) {
      mcpLines.push(`- ${server.name} (${baseUrl}/mcp/${server.slug})`);
      if (server.description) mcpLines.push(`  ${server.description}`);
    }
    mcpLines.push('', `Browse all: ${baseUrl}/mcp`);
  } else {
    mcpLines.push(`Browse the latest servers: ${baseUrl}/mcp`);
  }

  return [
    'Influzer Insights',
    '',
    post.title,
    post.date + (post.category ? ` · ${post.category}` : ''),
    '',
    intro + post.excerpt,
    '',
    `Read the article: ${postUrl}`,
    ...mcpLines,
    '',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');
}

async function sendBlogNewsletterEmail({
  to,
  post,
  postUrl,
  coverImageUrl,
  customIntro,
  unsubscribeUrl,
  recentMcpServers = [],
}) {
  ensureMcpEmailTransportReady();

  const fromAddress = getFromAddress();
  const subject = `New on Influzer Insights: ${post.title}`;
  const html = buildBlogNewsletterHtml({
    post,
    postUrl,
    coverImageUrl,
    customIntro,
    unsubscribeUrl,
    recentMcpServers,
  });
  const text = buildBlogNewsletterText({
    post,
    postUrl,
    customIntro,
    unsubscribeUrl,
    recentMcpServers,
  });

  const mailOptions = {
    from: fromAddress,
    to,
    subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
    },
  };

  const info = await getTransporter().sendMail(mailOptions);
  return { success: true, messageId: info.messageId, to };
}

function starsHtml(count) {
  const n = Math.max(0, Math.min(5, Number(count) || 0));
  return `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;
}

function toneColor(tone) {
  if (tone === 'good') return '#0f766e';
  if (tone === 'bad') return '#e11d48';
  return '#d97706';
}

function statusChip(status) {
  if (status === 'strong') return { bg: '#ccfbf1', fg: '#115e59', label: 'Strong' };
  if (status === 'ok') return { bg: '#e0f2fe', fg: '#075985', label: 'OK' };
  return { bg: '#ffedd5', fg: '#9a3412', label: 'Improve' };
}

function buildWebmcpScanReportHtml({
  email,
  host,
  url,
  scorecard,
  result,
  published,
  directoryUrl,
  scanUrl,
  demoUrl,
}) {
  const grade = scorecard?.grade || '—';
  const label = scorecard?.label || 'Scanned';
  const score = scorecard?.score ?? '—';
  const findings = scorecard?.findings || [];
  const toolNotes = scorecard?.tool_notes || [];
  const nextActions = scorecard?.next_actions || [];
  const metrics = scorecard?.metrics || {};
  const summary = scorecard?.summary || '';
  const tools = result?.tools || [];

  const findingRows = findings
    .map(
      (f) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;vertical-align:top;width:18px;">
          <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${toneColor(f.tone)};"></span>
        </td>
        <td style="padding:10px 0 10px 10px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:14px;line-height:1.45;">
          ${escapeHtml(f.text)}
        </td>
      </tr>`,
    )
    .join('');

  const toolRows = toolNotes
    .slice(0, 12)
    .map((t) => {
      const chip = statusChip(t.status);
      return `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;vertical-align:top;">
          <div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;color:#0f172a;font-weight:700;">${escapeHtml(t.name)}</div>
          <div style="margin-top:4px;font-size:12px;color:#64748b;">${escapeHtml(t.kind)} · ${escapeHtml(t.page_url || '/')}</div>
        </td>
        <td style="padding:12px 0 12px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
          <span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${chip.bg};color:${chip.fg};font-size:11px;font-weight:700;letter-spacing:0.02em;">${chip.label}</span>
          <div style="margin-top:6px;color:#334155;font-size:13px;line-height:1.45;">${escapeHtml(t.headline)}</div>
        </td>
      </tr>`;
    })
    .join('');

  const actionItems = nextActions
    .map(
      (a, i) => `
      <li style="margin:0 0 10px;color:#334155;font-size:14px;line-height:1.45;">
        <strong style="color:#0f766e;">${i + 1}.</strong> ${escapeHtml(a.text)}
      </li>`,
    )
    .join('');

  const listingLine = published
    ? `Your site is <strong style="color:#0f766e;">listed & Influzer verified</strong> in the directory.`
    : `No tools were detected, so we did not auto-list yet — fix registration and rescan.`;

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Influzer WebMCP scorecard for ${escapeHtml(host || url)} — grade ${escapeHtml(String(grade))} (${escapeHtml(String(score))}/100).
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:linear-gradient(135deg,#0f766e 0%,#0e7490 100%);padding:28px 28px 24px;">
              <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#ccfbf1;font-weight:700;">Influzer WebMCP</div>
              <h1 style="margin:10px 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:26px;line-height:1.2;color:#ffffff;">Your WebMCP scorecard is ready</h1>
              <p style="margin:0;color:#e2e8f0;font-size:14px;">${escapeHtml(host || url)} · graded ${escapeHtml(scorecard?.graded_at || 'today')}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="88" valign="top">
                    <div style="width:72px;height:72px;border-radius:16px;background:#ccfbf1;color:#115e59;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:800;text-align:center;line-height:72px;">${escapeHtml(String(grade))}</div>
                  </td>
                  <td valign="middle" style="padding-left:14px;">
                    <div style="font-size:18px;font-weight:800;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(label)}</div>
                    <div style="margin-top:4px;color:#0f766e;font-size:16px;letter-spacing:1px;">${starsHtml(scorecard?.stars)} <span style="color:#64748b;letter-spacing:0;font-size:13px;">${escapeHtml(String(score))}/100</span></div>
                    <div style="margin-top:8px;color:#475569;font-size:14px;line-height:1.45;">${listingLine}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 4px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border-radius:14px;">
                <tr>
                  <td style="padding:14px;text-align:center;width:33%;">
                    <div style="font-size:22px;font-weight:800;color:#0f766e;">${escapeHtml(String(metrics.tool_count ?? tools.length ?? 0))}</div>
                    <div style="font-size:12px;color:#64748b;">Tools</div>
                  </td>
                  <td style="padding:14px;text-align:center;width:33%;border-left:1px solid #e2e8f0;">
                    <div style="font-size:22px;font-weight:800;color:#0f766e;">${escapeHtml(String(metrics.pages_scanned ?? result?.pages_scanned ?? 0))}</div>
                    <div style="font-size:12px;color:#64748b;">Pages scanned</div>
                  </td>
                  <td style="padding:14px;text-align:center;width:33%;border-left:1px solid #e2e8f0;">
                    <div style="font-size:22px;font-weight:800;color:#0f766e;">${escapeHtml(String(metrics.crashes ?? result?.crashes ?? 0))}</div>
                    <div style="font-size:12px;color:#64748b;">Crashes</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 8px;">
              <p style="margin:0;color:#334155;font-size:15px;line-height:1.55;">${escapeHtml(summary)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 28px 4px;">
              <h2 style="margin:0 0 8px;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#0f766e;font-family:Arial,Helvetica,sans-serif;">What we found</h2>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${findingRows || '<tr><td style="color:#64748b;font-size:14px;">No findings.</td></tr>'}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 4px;">
              <h2 style="margin:0 0 8px;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#0f766e;font-family:Arial,Helvetica,sans-serif;">Per-tool notes</h2>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${toolRows || '<tr><td style="color:#64748b;font-size:14px;">No tools detected.</td></tr>'}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 4px;">
              <h2 style="margin:0 0 8px;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:#0f766e;font-family:Arial,Helvetica,sans-serif;">Do this next</h2>
              <ol style="margin:0;padding-left:18px;">${actionItems || '<li style="color:#64748b;">Rescan after shipping tools.</li>'}</ol>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 28px 8px;" align="center">
              ${
                published && directoryUrl
                  ? `<a href="${escapeHtml(directoryUrl)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:999px;font-size:14px;">View your Influzer listing</a>`
                  : `<a href="${escapeHtml(scanUrl || 'https://www.influzer.ai/webmcp/submit')}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:999px;font-size:14px;">Rescan your site</a>`
              }
              <div style="height:10px;"></div>
              <a href="${escapeHtml(demoUrl || 'https://www.influzer.ai/webmcp/demo')}" style="display:inline-block;background:#ffffff;color:#0f766e;text-decoration:none;font-weight:700;padding:11px 18px;border-radius:999px;font-size:14px;border:1px solid #99f6e4;">Try Influzer’s live WebMCP demo</a>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 28px;">
              <div style="background:#ecfeff;border-radius:12px;padding:14px 16px;color:#155e75;font-size:13px;line-height:1.5;">
                You’re on the Influzer newsletter for community updates and new MCP/WebMCP listings.
                <a href="https://www.influzer.ai/newsletter/unsubscribe" style="color:#0f766e;">Unsubscribe anytime</a>.
              </div>
              <p style="margin:16px 0 0;color:#94a3b8;font-size:12px;line-height:1.45;">
                Sent to ${escapeHtml(email || '')} because you requested a WebMCP scan on Influzer.ai.
                We discover tool schemas only — we do not execute third-party act/transact tools.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildWebmcpScanReportText({ host, url, scorecard, published, directoryUrl }) {
  const lines = [
    `Influzer WebMCP scorecard for ${host || url}`,
    `Grade: ${scorecard?.grade || '—'} (${scorecard?.score ?? '—'}/100) — ${scorecard?.label || ''}`,
    '',
    scorecard?.summary || '',
    '',
    'Findings:',
    ...(scorecard?.findings || []).map((f) => `- [${f.tone}] ${f.text}`),
    '',
    'Next actions:',
    ...(scorecard?.next_actions || []).map((a, i) => `${i + 1}. ${a.text}`),
    '',
    published && directoryUrl ? `Listing: ${directoryUrl}` : 'Not auto-listed yet — rescan after adding tools.',
    'Demo: https://www.influzer.ai/webmcp/demo',
  ];
  return lines.join('\n');
}

async function sendWebmcpScanReportEmail({
  to,
  host,
  url,
  scorecard,
  result,
  published,
  directoryUrl,
  scanUrl,
  demoUrl,
}) {
  if (!to) return { success: false, reason: 'missing_email' };
  if (!isEmailConfigured()) {
    console.warn('WebMCP scan report skipped: email not configured');
    return { success: false, reason: 'email_not_configured' };
  }

  const html = buildWebmcpScanReportHtml({
    email: to,
    host,
    url,
    scorecard,
    result,
    published,
    directoryUrl,
    scanUrl,
    demoUrl,
  });
  const text = buildWebmcpScanReportText({ host, url, scorecard, published, directoryUrl });
  const mailOptions = {
    from: getFromAddress(),
    to,
    subject: `Your WebMCP scorecard: ${scorecard?.grade || 'Report'} for ${host || 'your site'}`,
    html,
    text,
  };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('WebMCP scan report email failed:', err.message);
    return { success: false, reason: err.message };
  }
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendMcpSubmissionEmail,
  sendMcpFeedbackEmail,
  sendMcpApprovalEmail,
  sendBlogNewsletterEmail,
  sendWebmcpScanReportEmail,
  buildWebmcpScanReportHtml,
  buildBlogNewsletterHtml,
  isEmailConfigured,
  getTransporter,
  resetTransporter,
};
