// ================================
//  Email Service for Verification
// ================================

const nodemailer = require('nodemailer');

// Create transporter (supports multiple email providers)
function createTransporter() {
  // Gmail example
  if (process.env.EMAIL_SERVICE === 'gmail' && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    console.log('✅ Email service: Gmail configured');
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  }
  
  // SMTP configuration
  if (process.env.SMTP_HOST) {
    console.log('✅ Email service: SMTP configured');
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  
  // Development: console transporter (logs emails instead of sending)
  console.log('⚠️  WARNING: No email configuration found!');
  console.log('⚠️  Email service requires one of:');
  console.log('   - EMAIL_SERVICE=gmail + EMAIL_USER + EMAIL_PASS');
  console.log('   - SMTP_HOST + SMTP_USER + SMTP_PASS');
  console.log('⚠️  Using console transporter (emails will be logged, not sent)');
  return nodemailer.createTransport({
    streamTransport: true,
    newline: 'unix',
    buffer: true,
  });
}

const transporter = createTransporter();

// Send verification email
async function sendVerificationEmail(email, token, name) {
  const verificationUrl = `${process.env.BASE_URL || 'http://localhost:4000'}/verify-email?token=${token}`;
  
  // Use EMAIL_USER as "from" when using Gmail (Gmail requires this)
  // Otherwise use EMAIL_FROM or default
  let fromAddress = process.env.EMAIL_FROM || 'noreply@logogenerator.com';
  if (process.env.EMAIL_SERVICE === 'gmail' && process.env.EMAIL_USER) {
    fromAddress = process.env.EMAIL_USER;
  }
  
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
    const info = await transporter.sendMail(mailOptions);
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
  
  // Use EMAIL_USER as "from" when using Gmail (Gmail requires this)
  // Otherwise use EMAIL_FROM or default
  let fromAddress = process.env.EMAIL_FROM || 'noreply@logogenerator.com';
  if (process.env.EMAIL_SERVICE === 'gmail' && process.env.EMAIL_USER) {
    fromAddress = process.env.EMAIL_USER;
  }
  
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
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Password reset email sent:', info.messageId || 'logged to console');
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    throw error;
  }
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
};

