// ================================
//  Core Service - Express App Setup
// ================================

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { getDatabase } = require('../database');
const { initializeAuth } = require('../auth');
const authRoutes = require('../routes/auth');

require('dotenv').config();

/**
 * Initialize core Express app with middleware
 * @param {express.Application} app - Express application instance
 * @returns {Promise<void>}
 */
async function initializeCore(app) {
  // Trust proxy - required when behind Nginx to detect HTTPS correctly
  app.set('trust proxy', true);

  // Increase server timeout for long-running video processing tasks
  app.timeout = 600000; // 10 minutes in milliseconds

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: false,
      originAgentCluster: false
    })
  );

  // Global rate limiter with bypass for specific users
  const globalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: async (req) => {
      const bypassEmails = ['rasmusmencke', 'mencke'];
      
      try {
        // Check Passport authenticated user
        if (req.isAuthenticated && req.isAuthenticated() && req.user) {
          const email = (req.user.email || '').toLowerCase();
          for (const bypassEmail of bypassEmails) {
            if (email.includes(bypassEmail)) {
              console.log(`✅ Rate limit bypassed for user: ${req.user.email}`);
              return true;
            }
          }
        }
        
        // Check session-based auth (for local auth)
        if (req.session && req.session.userId) {
          const db = await getDatabase();
          const user = await db.getUserById(req.session.userId);
          if (user && user.email) {
            const email = user.email.toLowerCase();
            for (const bypassEmail of bypassEmails) {
              if (email.includes(bypassEmail)) {
                console.log(`✅ Rate limit bypassed for user: ${user.email}`);
                return true;
              }
            }
          }
        }
      } catch (err) {
        console.error('Error checking rate limit bypass:', err);
      }
      
      return false;
    },
  });

  app.use(globalRateLimiter);

  // Initialize database
  const db = await getDatabase();
  console.log('✅ Database initialized');

  // Session configuration with persistent SQLite store
  const SQLiteSessionStore = require('../sessionStore');
  const sessionConfig = {
    name: 'connect.sid',
    secret: process.env.SESSION_SECRET || (() => {
      console.warn('⚠️  WARNING: Using default SESSION_SECRET. Set SESSION_SECRET in .env for production!');
      return 'your-secret-key-change-in-production';
    })(),
    resave: false, // Don't resave unchanged sessions
    saveUninitialized: false, // Don't save uninitialized sessions
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax',
      path: '/',
    },
    store: new SQLiteSessionStore(), // Use persistent SQLite store instead of MemoryStore
  };

  app.use(session(sessionConfig));

  // Initialize authentication
  await initializeAuth(app, session);
  console.log('✅ Authentication initialized');

  // Structured JSON logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const logEntry = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        duration: Date.now() - start,
      };
      console.log(JSON.stringify(logEntry));
    });
    next();
  });

  // Body parser middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // CORS configuration
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Credentials', 'true');
    if (process.env.ALLOWED_ORIGINS) {
      const origins = process.env.ALLOWED_ORIGINS.split(',');
      const origin = req.headers.origin;
      if (origins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
      }
    }
    next();
  });

  // Authentication routes
  app.use('/auth', authRoutes);
}

module.exports = { initializeCore };

