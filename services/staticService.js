// ================================
//  Static File Service
// ================================

const express = require('express');
const path = require('path');
const fs = require('fs');

/**
 * Initialize static file serving
 * @param {express.Application} app - Express application instance
 */
function initializeStaticService(app) {
  // Explicitly serve app.js FIRST to ensure it's accessible
  app.get('/app.js', (req, res) => {
    const appJsPath = path.join(__dirname, '..', 'public', 'app.js');
    console.log(`📦 Serving app.js from: ${appJsPath}`);
    if (fs.existsSync(appJsPath)) {
      res.type('application/javascript');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(appJsPath, (err) => {
        if (err) {
          console.error(`❌ Error serving app.js: ${err.message}`);
          if (!res.headersSent) {
            res.status(500).send('Error serving app.js');
          }
        } else {
          console.log(`✅ Successfully served app.js`);
        }
      });
    } else {
      console.error(`❌ app.js not found at: ${appJsPath}`);
      res.status(404).send('app.js not found');
    }
  });

  // Serve favicon requests
  app.get('/favicon.ico', (req, res) => {
    const svgFavicon = path.join(__dirname, '..', 'public', 'favicon.svg');
    if (fs.existsSync(svgFavicon)) {
      res.redirect('/favicon.svg');
    } else {
      res.status(204).end();
    }
  });

  // Serve static files from public directory
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    index: false,
  }));

  // Serve generated images
  const outputDir = path.join(__dirname, '..', 'generated_img');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  app.use(
    '/generated_img',
    express.static(outputDir, {
      maxAge: '1d',
      etag: true,
      lastModified: true,
    }),
  );

  // Serve index.html
  app.get('/', (req, res) => {
    console.log('🌐 Serving index.html');
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');
    
    // Add cache-busting headers to prevent stale homepage (always, not just in dev)
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.sendFile(indexPath);
  });

  // Serve policy pages
  app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'terms.html'));
  });

  app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'privacy.html'));
  });

  app.get('/cookie', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'cookie.html'));
  });

  // Serve Christmas video page
  app.get('/christmas-video', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'christmas-video.html'));
  });

  // Serve robots.txt
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.sendFile(path.join(__dirname, '..', 'public', 'robots.txt'));
  });

  // Serve sitemap.xml
  app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml');
    res.sendFile(path.join(__dirname, '..', 'public', 'sitemap.xml'));
  });

  // Serve footer.html with cache-busting headers
  app.get('/footer.html', (req, res) => {
    const footerPath = path.join(__dirname, '..', 'public', 'footer.html');
    // Add cache-busting headers to prevent stale footer
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(footerPath);
  });

  // Serve admin dashboard (protected by adminService middleware - must be after admin service is initialized)
  // Note: Admin route is handled in adminService.js
}

module.exports = { initializeStaticService };

