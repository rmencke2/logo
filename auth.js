// ================================
//  Authentication & Session Management
// ================================

const bcrypt = require('bcrypt');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { getDatabase } = require('./database');
const crypto = require('crypto');

// Initialize Passport strategies
async function initializeAuth(app, sessionMiddleware) {
  const db = await getDatabase();

  // Serialize user for session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await db.getUserById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });

  // Google OAuth Strategy
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    // Always use BASE_URL in production, ensure it's HTTPS
    let googleCallbackURL = '/auth/google/callback';
    
    if (process.env.BASE_URL) {
      // Ensure BASE_URL uses HTTPS and construct callback URL
      const baseUrl = process.env.BASE_URL.replace(/^http:\/\//, 'https://');
      googleCallbackURL = `${baseUrl}/auth/google/callback`;
    }
    
    console.log(`🔐 Google OAuth callback URL: ${googleCallbackURL}`);
    
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: googleCallbackURL,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            let user = await db.getUserByProvider('google', profile.id);
            
            if (!user) {
              try {
                const { id, emailVerificationToken } = await db.createUser({
                  email: profile.emails?.[0]?.value,
                  provider: 'google',
                  providerId: profile.id,
                  name: profile.displayName,
                  avatarUrl: profile.photos?.[0]?.value,
                  emailVerified: true, // OAuth providers verify email
                });
                user = await db.getUserById(id);
              } catch (createErr) {
                // If user already exists (race condition or duplicate), try to fetch again
                if (createErr.message && createErr.message.includes('already exists')) {
                  console.log('⚠️  User creation failed (already exists), fetching existing user...');
                  user = await db.getUserByProvider('google', profile.id);
                  // If still not found, try by email as fallback
                  if (!user && profile.emails?.[0]?.value) {
                    user = await db.getUserByEmail(profile.emails[0].value);
                  }
                  if (!user) {
                    throw createErr; // Re-throw if we still can't find the user
                  }
                } else {
                  throw createErr; // Re-throw other errors
                }
              }
            }
            
            // Update last login and avatar for existing users
            if (user) {
              await db.updateUser(user.id, {
                last_login: new Date().toISOString(),
                avatar_url: profile.photos?.[0]?.value || user.avatar_url,
              });
              user = await db.getUserById(user.id);
            }
            
            return done(null, user);
          } catch (err) {
            console.error('❌ Google OAuth strategy error:', err);
            return done(err, null);
          }
        }
      )
    );
  }

  // Facebook OAuth Strategy
  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    // Always use BASE_URL in production, ensure it's HTTPS
    let facebookCallbackURL = '/auth/facebook/callback';
    
    if (process.env.BASE_URL) {
      // Ensure BASE_URL uses HTTPS and construct callback URL
      const baseUrl = process.env.BASE_URL.replace(/^http:\/\//, 'https://');
      facebookCallbackURL = `${baseUrl}/auth/facebook/callback`;
    }
    
    console.log(`🔐 Facebook OAuth callback URL: ${facebookCallbackURL}`);
    
    passport.use(
      new FacebookStrategy(
        {
          clientID: process.env.FACEBOOK_APP_ID,
          clientSecret: process.env.FACEBOOK_APP_SECRET,
          callbackURL: facebookCallbackURL,
          profileFields: ['id', 'displayName', 'email', 'picture'],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            let user = await db.getUserByProvider('facebook', profile.id);
            
            if (!user) {
              try {
                const { id } = await db.createUser({
                  email: profile.emails?.[0]?.value,
                  provider: 'facebook',
                  providerId: profile.id,
                  name: profile.displayName,
                  avatarUrl: profile.photos?.[0]?.value,
                  emailVerified: true,
                });
                user = await db.getUserById(id);
              } catch (createErr) {
                // If user already exists (race condition or duplicate), try to fetch again
                if (createErr.message && createErr.message.includes('already exists')) {
                  console.log('⚠️  User creation failed (already exists), fetching existing user...');
                  user = await db.getUserByProvider('facebook', profile.id);
                  // If still not found, try by email as fallback
                  if (!user && profile.emails?.[0]?.value) {
                    user = await db.getUserByEmail(profile.emails[0].value);
                  }
                  if (!user) {
                    throw createErr; // Re-throw if we still can't find the user
                  }
                } else {
                  throw createErr; // Re-throw other errors
                }
              }
            }
            
            // Update last login and avatar for existing users
            if (user) {
              await db.updateUser(user.id, {
                last_login: new Date().toISOString(),
                avatar_url: profile.photos?.[0]?.value || user.avatar_url,
              });
              user = await db.getUserById(user.id);
            }
            
            return done(null, user);
          } catch (err) {
            console.error('❌ Facebook OAuth strategy error:', err);
            return done(err, null);
          }
        }
      )
    );
  }

  // Apple OAuth Strategy (simplified - Apple requires more complex setup)
  // Note: Apple Sign In requires additional configuration and certificates
  // This is a placeholder that would need proper Apple configuration
  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID) {
    // Apple Sign In implementation would go here
    // Requires additional setup with Apple Developer account
    console.log('⚠️  Apple Sign In configured but requires additional setup');
  }

  app.use(passport.initialize());
  app.use(passport.session());
}

// Email/Password authentication helpers
async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Middleware to check if user is authenticated
async function requireAuth(req, res, next) {
  // Check Passport session
  if (req.isAuthenticated && req.isAuthenticated()) {
    req.user = req.user; // Passport user
    return next();
  }
  
  // Check custom session
  if (req.session && req.session.userId) {
    try {
      const db = await getDatabase();
      const user = await db.getUserById(req.session.userId);
      if (user) {
        req.user = user;
        return next();
      }
    } catch (err) {
      console.error('Error loading user from session:', err);
    }
  }
  
  res.status(401).json({ error: 'Authentication required' });
}

// Middleware to check if user is verified (for email/password users)
async function requireVerified(req, res, next) {
  // Check if authenticated
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
  }
  
  const db = await getDatabase();
  const userId = req.user?.id || req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const user = await db.getUserById(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  if (!user.email_verified && user.provider === 'local') {
    return res.status(403).json({ 
      error: 'Email verification required',
      needsVerification: true 
    });
  }
  
  next();
}

// Middleware to check subscription tier
async function requireTier(minTier = 'free') {
  const tierLevels = { free: 0, premium: 1, pro: 2 };
  
  return async (req, res, next) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const db = await getDatabase();
    const user = await db.getUserById(req.user.id);
    const userTier = tierLevels[user.subscription_tier] || 0;
    const requiredTier = tierLevels[minTier] || 0;
    
    if (userTier < requiredTier) {
      return res.status(403).json({ 
        error: `This feature requires ${minTier} tier or higher` 
      });
    }
    
    next();
  };
}

module.exports = {
  initializeAuth,
  hashPassword,
  comparePassword,
  requireAuth,
  requireVerified,
  requireTier,
};

