// ================================
//  Static File Service
// ================================

const express = require('express');
const path = require('path');
const fs = require('fs');

const BLOG_POSTS_DIR = path.join(__dirname, '..', 'content', 'blog');
const SITE_BASE_URL = 'https://www.influzer.ai';

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

function getRelatedBlogPosts(currentPost, limit = 3) {
  const allPosts = getAllBlogPosts();
  if (!currentPost) {
    return [];
  }
  const otherPosts = allPosts.filter((post) => post.slug !== currentPost.slug);
  const sameCategory = otherPosts.filter((post) => post.category === currentPost.category);
  const remaining = otherPosts.filter((post) => post.category !== currentPost.category);
  return [...sameCategory, ...remaining].slice(0, limit);
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toRfc822Date(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return new Date().toUTCString();
  }
  return date.toUTCString();
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

  // Latest insight summary for homepage hero freshness
  app.get('/api/insights/latest', (req, res) => {
    try {
      const posts = getAllBlogPosts();
      if (!posts.length) {
        return res.status(404).json({ error: 'No posts found' });
      }
      const [latest] = posts;
      return res.json({
        slug: latest.slug,
        title: latest.title,
        excerpt: latest.excerpt,
        date: latest.date,
        tags: latest.tags || [],
        category: latest.category || 'General',
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Latest insight list for homepage freshness
  app.get('/api/insights/recent', (req, res) => {
    try {
      const posts = getAllBlogPosts();
      const limit = Math.max(1, Math.min(6, Number(req.query.limit) || 3));
      const recent = posts.slice(0, limit).map((post) => ({
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        date: post.date,
        tags: post.tags || [],
        category: post.category || 'General',
      }));
      return res.json({ posts: recent });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
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
        turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
      });
    }

    return res.render('blog-post', {
      title: post.title,
      post,
      relatedPosts: getRelatedBlogPosts(post, 3),
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
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
    const posts = getAllBlogPosts();
    const latestPostDate = posts.length ? posts[0].date : new Date().toISOString().slice(0, 10);
    const staticUrls = [
      { loc: `${SITE_BASE_URL}/`, lastmod: latestPostDate, changefreq: 'weekly', priority: '1.0' },
      { loc: `${SITE_BASE_URL}/video-converter`, lastmod: '2025-01-16', changefreq: 'monthly', priority: '0.8' },
      { loc: `${SITE_BASE_URL}/video-to-gif`, lastmod: '2025-01-16', changefreq: 'monthly', priority: '0.8' },
      { loc: `${SITE_BASE_URL}/video-metadata`, lastmod: '2025-01-16', changefreq: 'monthly', priority: '0.8' },
      { loc: `${SITE_BASE_URL}/meme-generator`, lastmod: '2025-01-16', changefreq: 'monthly', priority: '0.8' },
      { loc: `${SITE_BASE_URL}/insights`, lastmod: latestPostDate, changefreq: 'daily', priority: '0.9' },
      { loc: `${SITE_BASE_URL}/terms`, lastmod: '2025-01-16', changefreq: 'yearly', priority: '0.5' },
      { loc: `${SITE_BASE_URL}/privacy`, lastmod: '2025-01-16', changefreq: 'yearly', priority: '0.5' },
      { loc: `${SITE_BASE_URL}/cookie`, lastmod: '2025-01-16', changefreq: 'yearly', priority: '0.5' },
    ];
    const postUrls = posts.map((post) => ({
      loc: `${SITE_BASE_URL}/insights/${post.slug}`,
      lastmod: post.date,
      changefreq: 'monthly',
      priority: '0.7',
    }));
    const allUrls = [...staticUrls, ...postUrls];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (url) => `  <url>
    <loc>${escapeXml(url.loc)}</loc>
    <lastmod>${escapeXml(url.lastmod)}</lastmod>
    <changefreq>${escapeXml(url.changefreq)}</changefreq>
    <priority>${escapeXml(url.priority)}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>`;
    res.type('application/xml');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(xml);
  });

  // Serve RSS feed for insight discovery and indexing
  app.get('/insights/rss.xml', (req, res) => {
    const posts = getAllBlogPosts().slice(0, 25);
    const latest = posts.length ? posts[0].date : new Date().toISOString();
    const itemsXml = posts
      .map((post) => {
        const postUrl = `${SITE_BASE_URL}/insights/${post.slug}`;
        const description = post.excerpt || stripHtml(post.contentHtml).slice(0, 220);
        return `<item>
  <title>${escapeXml(post.title)}</title>
  <link>${escapeXml(postUrl)}</link>
  <guid>${escapeXml(postUrl)}</guid>
  <pubDate>${escapeXml(toRfc822Date(post.date))}</pubDate>
  <description>${escapeXml(description)}</description>
</item>`;
      })
      .join('\n');
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>Influzer.ai Insights</title>
  <link>${SITE_BASE_URL}/insights</link>
  <description>Thoughts on AI, leadership, scaling teams, and product-led execution.</description>
  <language>en-us</language>
  <lastBuildDate>${escapeXml(toRfc822Date(latest))}</lastBuildDate>
${itemsXml}
</channel>
</rss>`;
    res.type('application/rss+xml');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(rssXml);
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

