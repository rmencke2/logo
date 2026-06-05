// ================================
//  Static File Service
// ================================

const express = require('express');
const path = require('path');
const fs = require('fs');

const BLOG_POSTS_DIR = path.join(__dirname, '..', 'content', 'blog');
const SITE_BASE_URL = 'https://www.influzer.ai';
const SITE_DEFAULT_OG_IMAGE = `${SITE_BASE_URL}/images/blog/ai-weekly-operating-review-for-executives-cover.png`;
const {
  getAllMcpServers,
  getTop100McpServers,
  getMcpCategories,
  findMcpServerBySlug,
  getMcpIconEmoji,
  transportLabel,
  getMcpLastUpdated,
  getMcpCatalogPayload,
  getMcpHomepagePreview,
  getMcpCatalogTotals,
  getMcpHeroStats,
  isInTop100,
} = require('./mcpDirectoryService');
const { registerMcpSubmissionRoutes, isReservedMcpPath } = require('./mcpSubmissionService');
const { getSitePromo } = require('../data/mcp-affiliate-links');
const { getHomeSeoContent, getMcpSeoContent, appendFaqToJsonLd } = require('../data/mcp-seo-content');

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

function estimateReadMinutes(contentHtml) {
  const words = stripHtml(contentHtml).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function formatPostDate(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function mapPostForDisplay(post) {
  return {
    ...post,
    dateDisplay: formatPostDate(post.date),
    readMinutes: estimateReadMinutes(post.contentHtml),
    coverImageAbsolute: toAbsoluteUrl(post.coverImage),
    articleUrl: `${SITE_BASE_URL}/insights/${post.slug}`,
  };
}

function toAbsoluteUrl(url) {
  if (!url) return `${SITE_BASE_URL}/favicon.svg`;
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
}

function getHomeBlogContent() {
  const all = getAllBlogPosts();
  const featuredRaw = all.find((post) => post.featured) || all[0] || null;
  const featuredPost = featuredRaw ? mapPostForDisplay(featuredRaw) : null;
  const morePosts = all
    .filter((post) => !featuredPost || post.slug !== featuredPost.slug)
    .slice(0, 2)
    .map(mapPostForDisplay);
  return { featuredPost, morePosts };
}

function buildHomeSeo({ heroStats, featuredPost }) {
  const registryCount = heroStats.totalServers.toLocaleString();
  const indexedCount = heroStats.serversWithIndexedTools.toLocaleString();
  const metaDescription = featuredPost
    ? `${registryCount} MCP servers in our registry (${indexedCount} with indexed tools). Featured insight: ${featuredPost.title}`
    : `Browse ${registryCount} Model Context Protocol servers (${indexedCount} with indexed tools). Weekly directory updates and executive AI insights from Influzer.ai.`;
  const pageTitle = 'MCP Server Directory & AI Insights | Influzer.ai';
  const metaKeywords = [
    'MCP server directory',
    'Model Context Protocol',
    'MCP tools',
    'AI agents',
    'AI workflows',
    'Claude MCP',
    'Cursor MCP',
    'AI insights',
    'executive AI strategy',
  ].join(', ');
  const ogImage = featuredPost?.coverImageAbsolute || SITE_DEFAULT_OG_IMAGE;
  return { pageTitle, metaDescription, metaKeywords, ogImage };
}

function buildMcpCollectionJsonLd({ pageUrl, pageName, description, servers }) {
  const graph = [
    {
      '@type': 'CollectionPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: pageName,
      description,
      isPartOf: { '@id': `${SITE_BASE_URL}/#website` },
    },
  ];
  if (servers.length) {
    graph.push({
      '@type': 'ItemList',
      '@id': `${pageUrl}#itemlist`,
      name: pageName,
      numberOfItems: servers.length,
      itemListElement: servers.slice(0, 100).map((server, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: server.name,
        url: `${SITE_BASE_URL}/mcp/${server.slug}`,
      })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

function buildHomeJsonLd({ heroStats, topServers, featuredPost, morePosts }) {
  const graph = [
    {
      '@type': 'WebSite',
      '@id': `${SITE_BASE_URL}/#website`,
      url: SITE_BASE_URL,
      name: 'Influzer.ai',
      description:
        'MCP server directory and executive insights on AI agents, workflows, and operating systems.',
      publisher: { '@id': `${SITE_BASE_URL}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_BASE_URL}/mcp?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_BASE_URL}/#organization`,
      name: 'Influzer.ai',
      url: SITE_BASE_URL,
      logo: `${SITE_BASE_URL}/favicon.svg`,
      sameAs: ['https://x.com/Influzerai'],
    },
    {
      '@type': 'CollectionPage',
      '@id': `${SITE_BASE_URL}/#webpage`,
      url: SITE_BASE_URL,
      name: 'MCP Server Directory & AI Insights',
      description: `Browse ${heroStats.totalServers} MCP servers (${heroStats.serversWithIndexedTools} with indexed tools) and read weekly AI execution insights.`,
      isPartOf: { '@id': `${SITE_BASE_URL}/#website` },
      about: [
        { '@type': 'Thing', name: 'Model Context Protocol' },
        { '@type': 'Thing', name: 'AI agent tooling' },
      ],
      mainEntity: { '@id': `${SITE_BASE_URL}/#mcp-list` },
    },
  ];

  if (topServers.length) {
    graph.push({
      '@type': 'ItemList',
      '@id': `${SITE_BASE_URL}/#mcp-list`,
      name: 'Top MCP servers this week',
      numberOfItems: topServers.length,
      itemListElement: topServers.map((server, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: server.name,
        url: `${SITE_BASE_URL}/mcp/${server.slug}`,
      })),
    });
  }

  if (featuredPost) {
    graph.push({
      '@type': 'BlogPosting',
      '@id': `${featuredPost.articleUrl}#article`,
      headline: featuredPost.title,
      description: featuredPost.excerpt,
      datePublished: featuredPost.date,
      dateModified: featuredPost.date,
      image: featuredPost.coverImageAbsolute,
      author: {
        '@type': 'Person',
        name: 'Rasmus Mencke',
      },
      publisher: { '@id': `${SITE_BASE_URL}/#organization` },
      mainEntityOfPage: featuredPost.articleUrl,
      url: featuredPost.articleUrl,
    });
  }

  const blogItems = [featuredPost, ...morePosts].filter(Boolean);
  if (blogItems.length) {
    graph.push({
      '@type': 'Blog',
      '@id': `${SITE_BASE_URL}/insights#blog`,
      name: 'Influzer.ai Insights',
      url: `${SITE_BASE_URL}/insights`,
      blogPost: blogItems.map((post) => ({ '@id': `${post.articleUrl}#article` })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

function formatHomeToolCount(totalTools) {
  if (totalTools >= 1000) {
    const k = totalTools / 1000;
    return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return totalTools.toLocaleString();
}

function renderHomepage(req, res) {
  const preview = getMcpHomepagePreview(6);
  const heroStats = getMcpHeroStats();
  const { featuredPost, morePosts } = getHomeBlogContent();
  const seo = buildHomeSeo({ heroStats, featuredPost });
  const seoContent = getHomeSeoContent(heroStats);
  const jsonLd = appendFaqToJsonLd(
    buildHomeJsonLd({
      heroStats,
      topServers: preview.servers,
      featuredPost,
      morePosts,
    }),
    seoContent.faqs,
    `${SITE_BASE_URL}/`,
  );
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.render('home', {
    heroStats,
    toolCountDisplay: formatHomeToolCount(heroStats.totalTools),
    topServers: preview.servers,
    featuredPost,
    morePosts,
    seo,
    seoContent,
    jsonLd,
    promo: getSitePromo(),
  });
}

/**
 * Initialize static file serving
 * @param {express.Application} app - Express application instance
 */
function initializeStaticService(app) {
  // Set up EJS as the view engine
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  app.use((req, res, next) => {
    res.locals.navPath = req.path;
    next();
  });

  app.get('/favicon-generator', (req, res) => {
    res.redirect(302, '/logo-generator#favicon');
  });

  app.get('/', (req, res) => {
    if (req.query.signup === 'true') {
      const params = new URLSearchParams(req.query);
      return res.redirect(302, `/logo-generator?${params.toString()}`);
    }
    renderHomepage(req, res);
  });

  app.get('/preview/newsletter-bar', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.render('preview-newsletter-card');
  });

  app.get('/logo-generator', (req, res) => {
    const indexPath = path.join(__dirname, '..', 'public', 'index.html');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(indexPath);
  });

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

  // Redirect /blog to /insights (301 permanent redirect to avoid duplicate content)
  app.get('/blog', (req, res) => {
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(301, `/insights${qs}`);
  });

  // Blog index
  app.get('/insights', (req, res) => {
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

  // Redirect /blog/:slug to /insights/:slug (301 permanent redirect)
  app.get('/blog/:slug', (req, res) => {
    res.redirect(301, `/insights/${req.params.slug}`);
  });

  // MCP catalog JSON (scope=top | all — loaded client-side)
  app.get('/api/mcp/catalog', (req, res) => {
    const scope = req.query.scope === 'top' ? 'top' : 'all';
    const toolsOnly =
      scope === 'top'
        ? true
        : !(req.query.tools_only === '0' || req.query.tools_only === 'false');
    res.setHeader('Cache-Control', scope === 'top' ? 'public, max-age=7200' : 'public, max-age=3600');
    res.json(getMcpCatalogPayload(scope, { toolsOnly }));
  });

  app.get('/api/mcp/preview', (req, res) => {
    const limit = Math.min(12, Math.max(1, parseInt(String(req.query.limit || '6'), 10) || 6));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(getMcpHomepagePreview(limit));
  });

  // MCP Server Directory (must be registered before /insights/:slug)
  app.get('/mcp/all', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const totals = getMcpCatalogTotals();
    const lastUpdated = getMcpLastUpdated();
    const catalogPayload = getMcpCatalogPayload('all', { toolsOnly: true });
    const previewServers = catalogPayload.servers.slice(0, 60);
    const heroStats = getMcpHeroStats();
    const canonicalUrl = `${SITE_BASE_URL}/mcp/all`;
    const metaDescription = `Search ${totals.total.toLocaleString()} MCP servers in our registry — ${catalogPayload.total_with_tools.toLocaleString()} with indexed tools, setup steps, and connection URLs.`;
    const seoContent = getMcpSeoContent(heroStats, { scope: 'all', pageTitle: 'Full MCP Server Directory' });
    res.render('mcp-index', {
      catalogScope: 'all',
      defaultToolsOnly: true,
      heroStats,
      pageTitle: 'Full MCP Server Directory',
      metaDescription,
      canonicalUrl,
      ogImage: SITE_DEFAULT_OG_IMAGE,
      seoContent,
      jsonLd: appendFaqToJsonLd(
        buildMcpCollectionJsonLd({
          pageUrl: canonicalUrl,
          pageName: 'Full MCP Server Directory',
          description: metaDescription,
          servers: previewServers,
        }),
        seoContent.faqs,
        canonicalUrl,
      ),
      categories: getMcpCategories(),
      lastUpdated: lastUpdated.display,
      totalInView: catalogPayload.total,
      totalCatalog: totals.total,
      totalWithTools: catalogPayload.total_with_tools,
      sisterHref: '/mcp',
      sisterLabel: 'Top 100 MCP servers',
      inlineCatalogJson: JSON.stringify(catalogPayload).replace(/</g, '\\u003c'),
      previewServers,
      promo: getSitePromo(),
    });
  });

  app.get('/mcp', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    const totals = getMcpCatalogTotals();
    const lastUpdated = getMcpLastUpdated();
    const catalogPayload = getMcpCatalogPayload('top');
    const previewServers = catalogPayload.servers.slice(0, 60);
    const heroStats = getMcpHeroStats();
    const canonicalUrl = `${SITE_BASE_URL}/mcp`;
    const metaDescription = `Top 100 Model Context Protocol servers for AI development — curated list with indexed tools, connection URLs, and setup steps. Full registry: ${totals.total.toLocaleString()} servers.`;
    const seoContent = getMcpSeoContent(heroStats, { scope: 'top', pageTitle: 'Top 100 MCP Servers' });
    res.render('mcp-index', {
      catalogScope: 'top',
      defaultToolsOnly: true,
      heroStats,
      pageTitle: 'Top 100 MCP Servers',
      metaDescription,
      canonicalUrl,
      ogImage: SITE_DEFAULT_OG_IMAGE,
      seoContent,
      jsonLd: appendFaqToJsonLd(
        buildMcpCollectionJsonLd({
          pageUrl: canonicalUrl,
          pageName: 'Top 100 MCP Servers',
          description: metaDescription,
          servers: previewServers,
        }),
        seoContent.faqs,
        canonicalUrl,
      ),
      categories: getMcpCategories(),
      lastUpdated: lastUpdated.display,
      totalInView: catalogPayload.total,
      totalCatalog: totals.total,
      totalWithTools: catalogPayload.total_with_tools,
      sisterHref: '/mcp/all',
      sisterLabel: `Browse all ${totals.total.toLocaleString()} servers`,
      inlineCatalogJson: JSON.stringify(catalogPayload).replace(/</g, '\\u003c'),
      previewServers,
      promo: getSitePromo(),
    });
  });

  // Before /mcp/:slug — otherwise "submit" is treated as a server slug
  registerMcpSubmissionRoutes(app);

  app.get('/mcp/:slug', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    if (isReservedMcpPath(req.params.slug)) {
      return res.status(404).render('404', { title: 'Page Not Found' });
    }
    const server = findMcpServerBySlug(req.params.slug);
    if (!server) {
      return res.status(404).render('mcp-server', {
        server: null,
        iconEmoji: '',
        transportLabel: '',
      });
    }
    return res.render('mcp-server', {
      server,
      iconEmoji: getMcpIconEmoji(server.icon),
      transportLabel: transportLabel(server.transport),
      inTop100: isInTop100(server.slug),
      catalogTotals: getMcpCatalogTotals(),
    });
  });

  // Blog post detail
  app.get('/insights/:slug', (req, res) => {
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
      { loc: `${SITE_BASE_URL}/mcp`, lastmod: '2026-06-03', changefreq: 'weekly', priority: '0.9' },
      { loc: `${SITE_BASE_URL}/mcp/all`, lastmod: '2026-06-03', changefreq: 'weekly', priority: '0.85' },
      { loc: `${SITE_BASE_URL}/mcp/submit`, lastmod: '2026-06-03', changefreq: 'monthly', priority: '0.6' },
      { loc: `${SITE_BASE_URL}/logo-generator`, lastmod: '2025-01-16', changefreq: 'monthly', priority: '0.7' },
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
    const lastUpdatedRaw = getMcpLastUpdated().iso;
    const mcpLastMod = lastUpdatedRaw ? String(lastUpdatedRaw).slice(0, 10) : '2026-06-03';
    const mcpUrls = getAllMcpServers().map((s) => ({
      loc: `${SITE_BASE_URL}/mcp/${s.slug}`,
      lastmod: mcpLastMod,
      changefreq: 'monthly',
      priority: '0.6',
    }));
    const allUrls = [...staticUrls, ...postUrls, ...mcpUrls];
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

