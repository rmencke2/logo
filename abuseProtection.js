// ================================
//  Abuse Protection & Rate Limiting
// ================================

const { getDatabase } = require('./database');
const rateLimit = require('express-rate-limit');

// Configuration
const ABUSE_CONFIG = {
  // Free tier limits
  FREE_TIER_DAILY_LIMIT: 10,
  FREE_TIER_HOURLY_LIMIT: 3,
  
  // Premium tier limits
  PREMIUM_TIER_DAILY_LIMIT: 100,
  PREMIUM_TIER_HOURLY_LIMIT: 20,
  
  // IP-based limits (for unauthenticated users)
  IP_DAILY_LIMIT: 5,
  IP_HOURLY_LIMIT: 2,
  
  // Abuse thresholds
  MAX_VIOLATIONS_BEFORE_BLOCK: 5,
  BLOCK_DURATION_HOURS: 24,
  
  // Time windows (in milliseconds)
  HOUR_MS: 60 * 60 * 1000,
  DAY_MS: 24 * 60 * 60 * 1000,
};

// Get client IP address
function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.headers['x-real-ip'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

// Check if identifier is blocked
async function isBlocked(identifier, identifierType) {
  const db = await getDatabase();
  return db.isBlocked(identifier, identifierType);
}

// Record abuse violation
async function recordAbuse(identifier, identifierType, violationType) {
  const db = await getDatabase();
  await db.recordAbuse(identifier, identifierType, violationType);
  
  // Check if we should block
  const abuseRecord = await db.checkAbuseStatus(identifier, identifierType);
  if (abuseRecord && abuseRecord.count >= ABUSE_CONFIG.MAX_VIOLATIONS_BEFORE_BLOCK) {
    const blockUntil = new Date(Date.now() + ABUSE_CONFIG.BLOCK_DURATION_HOURS * ABUSE_CONFIG.HOUR_MS);
    await db.blockIdentifier(identifier, identifierType, blockUntil.toISOString());
  }
}

// Check usage limits for authenticated user
async function checkUserLimits(userId, subscriptionTier) {
  const db = await getDatabase();
  
  // Check for custom limits first
  const customLimits = await db.getCustomUserLimits(userId);
  
  let limits;
  if (customLimits) {
    // Use custom limits if set
    limits = {
      daily: customLimits.daily_limit,
      hourly: customLimits.hourly_limit,
    };
  } else {
    // Use tier-based limits
    limits = subscriptionTier === 'premium' || subscriptionTier === 'pro'
      ? {
          daily: ABUSE_CONFIG.PREMIUM_TIER_DAILY_LIMIT,
          hourly: ABUSE_CONFIG.PREMIUM_TIER_HOURLY_LIMIT,
        }
      : {
          daily: ABUSE_CONFIG.FREE_TIER_DAILY_LIMIT,
          hourly: ABUSE_CONFIG.FREE_TIER_HOURLY_LIMIT,
        };
  }
  
  const dailyCount = await db.getUsageCount(userId, ABUSE_CONFIG.DAY_MS);
  const hourlyCount = await db.getUsageCount(userId, ABUSE_CONFIG.HOUR_MS);
  
  return {
    allowed: dailyCount < limits.daily && hourlyCount < limits.hourly,
    dailyCount,
    hourlyCount,
    dailyLimit: limits.daily,
    hourlyLimit: limits.hourly,
    remaining: {
      daily: Math.max(0, limits.daily - dailyCount),
      hourly: Math.max(0, limits.hourly - hourlyCount),
    },
    customLimits: !!customLimits,
  };
}

// Check usage limits for IP address
async function checkIPLimits(ipAddress) {
  const db = await getDatabase();
  
  const dailyCount = await db.getIPUsageCount(ipAddress, ABUSE_CONFIG.DAY_MS);
  const hourlyCount = await db.getIPUsageCount(ipAddress, ABUSE_CONFIG.HOUR_MS);
  
  return {
    allowed: dailyCount < ABUSE_CONFIG.IP_DAILY_LIMIT && hourlyCount < ABUSE_CONFIG.IP_HOURLY_LIMIT,
    dailyCount,
    hourlyCount,
    dailyLimit: ABUSE_CONFIG.IP_DAILY_LIMIT,
    hourlyLimit: ABUSE_CONFIG.IP_HOURLY_LIMIT,
    remaining: {
      daily: Math.max(0, ABUSE_CONFIG.IP_DAILY_LIMIT - dailyCount),
      hourly: Math.max(0, ABUSE_CONFIG.IP_HOURLY_LIMIT - hourlyCount),
    },
  };
}

// Middleware to check abuse protection
async function abuseProtectionMiddleware(req, res, next) {
  try {
    // Check if user should bypass abuse protection
    const bypassEmails = ['rasmusmencke', 'mencke'];
    let shouldBypass = false;
    
    // Check Passport authenticated user
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      const email = (req.user.email || '').toLowerCase();
      for (const bypassEmail of bypassEmails) {
        if (email.includes(bypassEmail)) {
          shouldBypass = true;
          console.log(`✅ Abuse protection bypassed for user: ${req.user.email}`);
          break;
        }
      }
    }
    
    // Check session-based auth (for local auth)
    if (!shouldBypass && req.session && req.session.userId) {
      try {
        const db = await getDatabase();
        const user = await db.getUserById(req.session.userId);
        if (user && user.email) {
          const email = user.email.toLowerCase();
          for (const bypassEmail of bypassEmails) {
            if (email.includes(bypassEmail)) {
              shouldBypass = true;
              console.log(`✅ Abuse protection bypassed for user: ${user.email}`);
              break;
            }
          }
        }
      } catch (dbErr) {
        console.error('Error checking user for bypass:', dbErr);
      }
    }
    
    // If bypass is enabled, skip all checks
    if (shouldBypass) {
      // Set unlimited usage limits for bypassed users
      req.usageLimits = {
        allowed: true,
        dailyCount: 0,
        dailyLimit: Infinity,
        hourlyCount: 0,
        hourlyLimit: Infinity,
        remaining: {
          daily: Infinity,
          hourly: Infinity,
        },
      };
      return next();
    }
    
    const ipAddress = getClientIP(req);
    
    // Check if IP is blocked
    if (await isBlocked(ipAddress, 'ip')) {
      return res.status(429).json({
        error: 'Access temporarily blocked due to abuse. Please try again later.',
        blocked: true,
      });
    }
    
    // Check if user is blocked (if authenticated)
    if (req.isAuthenticated && req.isAuthenticated()) {
      const userId = req.user.id.toString();
      if (await isBlocked(userId, 'user')) {
        return res.status(429).json({
          error: 'Account temporarily blocked due to abuse. Please contact support.',
          blocked: true,
        });
      }
      
      // Check if user is blocked in users table
      try {
        const db = await getDatabase();
        const user = await db.getUserById(req.user.id);
        if (user && user.is_blocked) {
          return res.status(429).json({
            error: user.blocked_reason || 'Account blocked by administrator. Please contact support.',
            blocked: true,
          });
        }
      } catch (dbErr) {
        console.error('Error checking user block status:', dbErr);
      }
    }
    
    // Check usage limits
    let limits;
    if (req.isAuthenticated && req.isAuthenticated()) {
      limits = await checkUserLimits(req.user.id, req.user.subscription_tier);
    } else {
      limits = await checkIPLimits(ipAddress);
    }
    
    if (!limits.allowed) {
      await recordAbuse(
        req.isAuthenticated && req.isAuthenticated() ? req.user.id.toString() : ipAddress,
        req.isAuthenticated && req.isAuthenticated() ? 'user' : 'ip',
        'rate_limit_exceeded'
      );
      
      return res.status(429).json({
        error: 'Rate limit exceeded',
        limits: {
          daily: { used: limits.dailyCount, limit: limits.dailyLimit },
          hourly: { used: limits.hourlyCount, limit: limits.hourlyLimit },
        },
        retryAfter: '1 hour',
      });
    }
    
    // Attach limit info to request
    req.usageLimits = limits;
    next();
  } catch (err) {
    console.error('Abuse protection error:', err);
    // On error, allow request but log it
    next();
  }
}

// Log usage after successful request
async function logUsage(req, endpoint) {
  try {
    const db = await getDatabase();
    const ipAddress = getClientIP(req);
    const userId = req.isAuthenticated && req.isAuthenticated() ? req.user.id : null;
    
    await db.logUsage(userId, ipAddress, endpoint);
  } catch (err) {
    console.error('Error logging usage:', err);
  }
}

// Enhanced rate limiter for specific endpoints
function createRateLimiter(options = {}) {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 minutes
    max: options.max || 100,
    message: options.message || 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: options.skip || (() => false),
  });
}

// Rate limiter for auth endpoints
const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 attempts per 15 minutes
  message: 'Too many authentication attempts. Please try again later.',
});

// Rate limiter for logo generation
const logoGenerationRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 requests per hour
  message: 'Too many logo generation requests. Please try again later.',
});

module.exports = {
  abuseProtectionMiddleware,
  logUsage,
  checkUserLimits,
  checkIPLimits,
  isBlocked,
  recordAbuse,
  createRateLimiter,
  authRateLimiter,
  logoGenerationRateLimiter,
  ABUSE_CONFIG,
};

