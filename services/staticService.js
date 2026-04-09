// ================================
//  Static File Service
// ================================

const express = require('express');
const path = require('path');
const fs = require('fs');

const BLOG_POSTS_DIR = path.join(__dirname, '..', 'content', 'blog');

function getAllBlogPosts() {
  if (!fs.existsSync(BLOG_POSTS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BLOG_POSTS_DIR).filter((file) => file.endsWith('.json'));
  const posts = [];

  for (const file of files) {
    try {
      const fullPath = path.join(BLOG_POSTS_DIR, file);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const parsed = JSON.parse(raw);

      if (!parsed.slug || !parsed.title || !parsed.date || !parsed.excerpt || !parsed.contentHtml) {
        continue;
      }

      posts.push({
        slug: parsed.slug,
        title: parsed.title,
        date: parsed.date,
        excerpt: parsed.excerpt,
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        category: parsed.category || 'General',
        featured: Boolean(parsed.featured),
        coverImage: parsed.coverImage || '',
        coverImageAlt: parsed.coverImageAlt || parsed.title,
        videoEmbedUrl: parsed.videoEmbedUrl || '',
        contentHtml: parsed.contentHtml,
      });
    } catch (error) {
      console.error(`❌ Failed to load blog post file ${file}:`, error.message);
    }
  }

  posts.sort((a, b) => {
    if (a.featured !== b.featured) {
      return a.featured ? -1 : 1;
    }
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
  return posts;
}

function findBlogPostBySlug(slug) {
  return getAllBlogPosts().find((post) => post.slug === slug);
}

/**
 * Initialize static file serving
 * @param {express.Application} app - Express application instance
 */
function initializeStaticService(app) {
  // Set up EJS as the view engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

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

  // Serve main.js with cache control
  app.get('/js/main.js', (req, res) => {
    const mainJsPath = path.join(__dirname, '..', 'public', 'js', 'main.js');
    if (fs.existsSync(mainJsPath)) {
      res.type('application/javascript');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(mainJsPath);
    } else {
      res.status(404).send('main.js not found');
    }
  });

  // Serve styles.css with cache control
  app.get('/css/styles.css', (req, res) => {
    const cssPath = path.join(__dirname, '..', 'public', 'css', 'styles.css');
    if (fs.existsSync(cssPath)) {
      res.type('text/css');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(cssPath);
    } else {
      res.status(404).send('styles.css not found');
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

  // Blog index
  app.get(['/insights', '/blog'], (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const allPosts = getAllBlogPosts();
    const selectedCategory = req.query.category ? String(req.query.category) : '';
    const categories = [...new Set(allPosts.map((post) => post.category))].sort((a, b) =>
      a.localeCompare(b),
    );
    const posts = selectedCategory
      ? allPosts.filter((post) => post.category === selectedCategory)
      : allPosts;
    const featuredPost = posts.find((post) => post.featured) || null;

    res.render('blog-index', {
      title: 'Insights',
      posts,
      featuredPost,
      categories,
      selectedCategory,
    });
  });

  // Blog post detail
  app.get(['/insights/:slug', '/blog/:slug'], (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const post = findBlogPostBySlug(req.params.slug);

    if (!post) {
      return res.status(404).render('blog-post', {
        title: 'Post Not Found',
        post: null,
      });
    }

    return res.render('blog-post', {
      title: post.title,
      post,
    });
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

  // ================================
  // Service Pages (EJS Templates)
  // ================================

  // Video Converter (AVI to MP4)
  app.get('/video-converter', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.render('video-converter');
  });

  // Video to GIF Converter
  app.get('/video-to-gif', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.render('video-to-gif');
  });

  // Video Metadata Extractor
  app.get('/video-metadata', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.render('video-metadata');
  });

  // Meme Generator
  app.get('/meme-generator', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.render('meme-generator');
  });

  // Serve admin dashboard (protected by adminService middleware - must be after admin service is initialized)
  // Note: Admin route is handled in adminService.js
}

module.exports = { initializeStaticService };

