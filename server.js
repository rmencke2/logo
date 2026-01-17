// ================================
//  Logo Generator Server - Main Entry Point
// ================================

const express = require('express');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Load services
const { initializeCore } = require('./services/core');
const { initializeStaticService } = require('./services/staticService');
const { initializeLogoService } = require('./services/logoService');
const { initializeFaviconService } = require('./services/faviconService');
const { initializeVideoService } = require('./services/videoService');
const { initializeUtilityService } = require('./services/utilityService');
const { initializeAdminService } = require('./services/adminService');
const { initializeAnalyticsService } = require('./services/analyticsService');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Initialize all services
(async () => {
  try {
    // 1. Core service (middleware, auth, session)
    await initializeCore(app);

    // 2. Analytics service (page views, service tracking) - must be early for tracking
    await initializeAnalyticsService(app);

    // 3. Static file service (HTML pages, static assets)
    initializeStaticService(app);
    
    // 4. Logo generation service
    initializeLogoService(app);

    // 5. Favicon generation service
    initializeFaviconService(app);

    // 6. Video processing service
    initializeVideoService(app);

    // 7. Utility service (health, location, usage limits)
    initializeUtilityService(app);

    // 8. Admin service (user management, monitoring)
    initializeAdminService(app);
    
    // Global error handling middleware (must be last)
    app.use((err, req, res, _next) => {
      console.error(err);
      
      // Handle Multer errors
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum size is 500MB.' });
        }
        return res.status(400).json({ error: err.message });
      }
      
      // Handle 413 Payload Too Large errors
      if (err.status === 413 || err.statusCode === 413) {
        return res.status(413).json({ 
          error: 'File too large. Maximum file size is 500MB. If using Nginx, ensure client_max_body_size is set to at least 500m.' 
        });
      }
      
      if (err.message) {
        return res.status(400).json({ error: err.message });
      }
      
      res.status(500).json({ error: 'Internal Server Error' });
    });
    
    console.log('✅ All services initialized');
  } catch (error) {
    console.error('❌ Error initializing services:', error);
    process.exit(1);
  }
})();

// --- Start server ---
// Note: If using Nginx as reverse proxy, keep Node.js on PORT (4000)
// Nginx will handle HTTPS on ports 80/443 and proxy to this app
// If NOT using Nginx, set USE_DIRECT_HTTPS=true in .env to have Node.js handle HTTPS directly

const USE_DIRECT_HTTPS = process.env.USE_DIRECT_HTTPS === 'true';
const HTTPS_PORT = 443;
const HTTP_PORT = 80;

if (USE_DIRECT_HTTPS && process.env.NODE_ENV === 'production') {
  // Direct HTTPS mode: Node.js handles HTTPS (requires root privileges or setcap)
  const certPath = '/etc/letsencrypt/live/influzer.ai';
  const hasSSL = fs.existsSync(`${certPath}/fullchain.pem`) && fs.existsSync(`${certPath}/privkey.pem`);

  if (hasSSL) {
    try {
      const httpsOptions = {
        key: fs.readFileSync(`${certPath}/privkey.pem`),
        cert: fs.readFileSync(`${certPath}/fullchain.pem`),
      };

      // Create HTTPS server
      https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
        console.log(`🚀 Logo Generator HTTPS server running on port ${HTTPS_PORT}`);
      });

      // Create HTTP redirect server on port 80 (redirects to HTTPS)
      http.createServer((req, res) => {
        const host = req.headers.host || 'influzer.ai';
        const url = req.url;
        res.writeHead(301, { 
          "Location": `https://${host}${url}`,
          "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
        });
        res.end();
      }).listen(HTTP_PORT, () => {
        console.log(`🔄 HTTP redirect server running on port ${HTTP_PORT} (redirects to HTTPS)`);
      });
    } catch (err) {
      console.error('❌ Error starting HTTPS server:', err.message);
      console.error('💡 Tip: If you get EACCES error, you need root privileges or use Nginx instead');
      console.error('💡 Falling back to HTTP on port', PORT);
      app.listen(PORT, () => {
        console.log(`🚀 Logo Generator running at http://localhost:${PORT}`);
      });
    }
  } else {
    console.warn('⚠️  SSL certificates not found, falling back to HTTP');
    app.listen(PORT, () => {
      console.log(`🚀 Logo Generator running at http://localhost:${PORT}`);
    });
  }
} else {
  // Standard mode: Use HTTP on configured PORT (Nginx handles HTTPS)
  app.listen(PORT, () => {
    console.log(`🚀 Logo Generator running at http://localhost:${PORT}`);
    if (process.env.NODE_ENV === 'production') {
      console.log('💡 Using Nginx for HTTPS - make sure Nginx is configured to proxy to this port');
    }
  });
}
