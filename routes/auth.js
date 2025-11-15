// ================================
//  Authentication Routes
// ================================

const express = require('express');
const passport = require('passport');
const { body, validationResult } = require('express-validator');
const { getDatabase } = require('../database');
const { hashPassword, comparePassword } = require('../auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../emailService');
const { abuseProtectionMiddleware, logUsage, authRateLimiter } = require('../abuseProtection');
const crypto = require('crypto');

const router = express.Router();

// Helper to get client IP
function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.connection.remoteAddress ||
    'unknown'
  );
}

// Register new user (email/password)
router.post(
  '/register',
  authRateLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').optional().trim().isLength({ min: 1, max: 100 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, name } = req.body;
      const db = await getDatabase();

      // Check if user already exists
      const existingUser = await db.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      // Create user
      const passwordHash = await hashPassword(password);
      const { id, emailVerificationToken } = await db.createUser({
        email,
        passwordHash,
        provider: 'local',
        name: name || email.split('@')[0],
        emailVerified: false,
      });

      // Send verification email
      try {
        await sendVerificationEmail(email, emailVerificationToken, name);
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        // Don't fail registration if email fails
      }

      // Create session
      const sessionId = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await db.createSession(id, sessionId, expiresAt.toISOString());

      req.session.userId = id;
      req.session.sessionId = sessionId;
      req.user = { id, email, name: name || email.split('@')[0], subscription_tier: 'free', email_verified: false };

      res.json({
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
        user: {
          id,
          email,
          name: name || email.split('@')[0],
          emailVerified: false,
        },
        needsVerification: true,
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ error: 'Registration failed', details: err.message });
    }
  }
);

// Login (email/password)
router.post(
  '/login',
  authRateLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;
      const db = await getDatabase();

      const user = await db.getUserByEmail(email);
      if (!user || user.provider !== 'local') {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (!user.password_hash) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const passwordMatch = await comparePassword(password, user.password_hash);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // Update last login
      await db.updateUser(user.id, { last_login: new Date().toISOString() });

      // Create session
      const sessionId = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await db.createSession(user.id, sessionId, expiresAt.toISOString());

      req.session.userId = user.id;
      req.session.sessionId = sessionId;
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        subscription_tier: user.subscription_tier,
        email_verified: !!user.email_verified,
      };

      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatar_url,
          subscriptionTier: user.subscription_tier,
          emailVerified: !!user.email_verified,
        },
        needsVerification: !user.email_verified,
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed', details: err.message });
    }
  }
);

// Logout
router.post('/logout', async (req, res) => {
  try {
    if (req.session.sessionId) {
      const db = await getDatabase();
      await db.deleteSession(req.session.sessionId);
    }
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
      }
    });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  try {
    // Debug session
    console.log(`🔍 /auth/me - Session ID: ${req.sessionID}`);
    console.log(`🔍 /auth/me - req.session.userId: ${req.session.userId}`);
    console.log(`🔍 /auth/me - req.session keys: ${Object.keys(req.session).join(', ')}`);
    
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const db = await getDatabase();
    const user = await db.getUserById(req.session.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatar_url,
        subscriptionTier: user.subscription_tier,
        emailVerified: !!user.email_verified,
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Verify email
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: 'Verification token required' });
    }

    const db = await getDatabase();
    const user = await db.verifyEmail(token);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    // If user is logged in, update session
    if (req.session.userId === user.id) {
      const updatedUser = await db.getUserById(user.id);
      res.json({
        success: true,
        message: 'Email verified successfully',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          emailVerified: true,
        },
      });
    } else {
      res.json({
        success: true,
        message: 'Email verified successfully. Please log in.',
      });
    }
  } catch (err) {
    console.error('Email verification error:', err);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

// Resend verification email
router.post(
  '/resend-verification',
  authRateLimiter,
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email } = req.body;
      const db = await getDatabase();
      const user = await db.getUserByEmail(email);

      if (!user) {
        // Don't reveal if email exists
        return res.json({ success: true, message: 'If the email exists, a verification link has been sent.' });
      }

      if (user.email_verified) {
        return res.json({ success: true, message: 'Email is already verified' });
      }

      // Generate new token
      const token = crypto.randomBytes(32).toString('hex');
      const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

      await db.updateUser(user.id, {
        email_verification_token: token,
        email_verification_expires: expires,
      });

      try {
        await sendVerificationEmail(email, token, user.name);
        res.json({ success: true, message: 'Verification email sent' });
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        res.status(500).json({ error: 'Failed to send verification email' });
      }
    } catch (err) {
      console.error('Resend verification error:', err);
      res.status(500).json({ error: 'Failed to resend verification email' });
    }
  }
);

// Request password reset
router.post(
  '/forgot-password',
  authRateLimiter,
  [body('email').isEmail().normalizeEmail()],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email } = req.body;
      const db = await getDatabase();
      const user = await db.getUserByEmail(email);

      if (!user || user.provider !== 'local') {
        // Don't reveal if email exists
        return res.json({ success: true, message: 'If the email exists, a password reset link has been sent.' });
      }

      // Generate reset token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store reset token
      await db.db.run(
        'INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)',
        [user.id, token, expiresAt.toISOString()]
      );

      try {
        await sendPasswordResetEmail(email, token, user.name);
        res.json({ success: true, message: 'Password reset email sent' });
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError);
        res.status(500).json({ error: 'Failed to send password reset email' });
      }
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Failed to process password reset request' });
    }
  }
);

// Reset password
router.post(
  '/reset-password',
  authRateLimiter,
  [
    body('token').notEmpty(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { token, password } = req.body;
      const db = await getDatabase();

      // Find valid reset token
      const resetRecord = await new Promise((resolve, reject) => {
        db.db.get(
          'SELECT * FROM password_resets WHERE token = ? AND expires_at > ? AND used = 0',
          [token, new Date().toISOString()],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!resetRecord) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      // Update password
      const passwordHash = await hashPassword(password);
      await db.updateUser(resetRecord.user_id, { password_hash: passwordHash });

      // Mark token as used
      await new Promise((resolve, reject) => {
        db.db.run(
          'UPDATE password_resets SET used = 1 WHERE id = ?',
          [resetRecord.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      res.json({ success: true, message: 'Password reset successfully' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  }
);

// OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth_error=google_failed' }),
  async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.user.id) {
        console.error('❌ Google OAuth callback: req.user is missing');
        return res.redirect('/?auth_error=user_not_found');
      }

      // Regenerate session to ensure a fresh session ID
      req.session.regenerate((err) => {
        if (err) {
          console.error('❌ Session regenerate error:', err);
          return res.redirect('/?auth_error=session_error');
        }
        
        // Create database session
        const sessionId = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        
        (async () => {
          try {
            const db = await getDatabase();
            await db.createSession(req.user.id, sessionId, expiresAt.toISOString());
            
            // Set session data
            req.session.userId = req.user.id;
            req.session.sessionId = sessionId;
            
            console.log(`🔐 Setting session - userId: ${req.user.id}`);
            console.log(`🔐 Express session ID: ${req.sessionID}`);
            
            // Save session and redirect
            req.session.save((err) => {
              if (err) {
                console.error('❌ Session save error:', err);
                return res.redirect('/?auth_error=session_error');
              }
              
              console.log(`✅ Session saved - Session ID: ${req.sessionID}`);
              console.log(`✅ User ID in session: ${req.session.userId}`);
              
              // Check headers before redirect
              const headers = res.getHeaders();
              const setCookie = headers['set-cookie'];
              console.log(`🔐 Set-Cookie in headers: ${setCookie ? 'YES' : 'NO'}`);
              if (setCookie) {
                console.log(`🔐 Cookie: ${Array.isArray(setCookie) ? setCookie[0].substring(0, 80) : setCookie.substring(0, 80)}...`);
              }
              
              res.redirect('/?auth_success=true');
            });
          } catch (err) {
            console.error('❌ Database error:', err);
            res.redirect('/?auth_error=server_error');
          }
        })();
      });
    } catch (err) {
      console.error('❌ Google OAuth callback error:', err);
      res.redirect('/?auth_error=server_error');
    }
  }
);

router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));

router.get(
  '/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/?auth_error=facebook_failed' }),
  async (req, res) => {
    try {
      // Check if user is authenticated
      if (!req.user || !req.user.id) {
        console.error('❌ Facebook OAuth callback: req.user is missing');
        return res.redirect('/?auth_error=user_not_found');
      }

      // Create session
      const sessionId = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const db = await getDatabase();
      
      await db.createSession(req.user.id, sessionId, expiresAt.toISOString());
      
      req.session.userId = req.user.id;
      req.session.sessionId = sessionId;
      
      // Save session before redirecting
      req.session.save((err) => {
        if (err) {
          console.error('❌ Session save error:', err);
          return res.redirect('/?auth_error=session_error');
        }
        console.log(`✅ Facebook OAuth success for user: ${req.user.id}`);
        res.redirect('/?auth_success=true');
      });
    } catch (err) {
      console.error('❌ Facebook OAuth callback error:', err);
      res.redirect('/?auth_error=server_error');
    }
  }
);

module.exports = router;

