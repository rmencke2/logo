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

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendMcpSubmissionEmail,
  sendMcpApprovalEmail,
  sendBlogNewsletterEmail,
  buildBlogNewsletterHtml,
  isEmailConfigured,
  getTransporter,
  resetTransporter,
};
