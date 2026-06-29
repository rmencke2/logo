// ================================
//  "In other news..." — read model + admin overrides
// ================================

const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../auth');
const { requireAdmin } = require('./adminService');
const {
  loadConfig,
  readJson,
  writeJson,
  appendUtm,
  ARTICLES_PATH,
  OVERRIDES_PATH,
} = require('../scripts/lib/other-news/utils');

function loadArticlesPayload() {
  return readJson(ARTICLES_PATH, { articles: [], lastRunAt: null, stats: {} });
}

function loadOverrides() {
  return readJson(OVERRIDES_PATH, {});
}

function saveOverrides(overrides) {
  writeJson(OVERRIDES_PATH, overrides);
}

function applyOverrides(articles, overrides, config) {
  return articles.map((article) => {
    const override = overrides[article.canonical_url];
    if (!override) return article;
    return { ...article, status: override };
  });
}

function getDisplayArticles(limit) {
  const config = loadConfig();
  const payload = loadArticlesPayload();
  const overrides = loadOverrides();
  const max = limit || config.maxDisplay || 12;
  const utm = config.utm || { source: 'influzer', medium: 'in_other_news' };

  const articles = applyOverrides(payload.articles || [], overrides, config)
    .filter((a) => a.status === 'published' || a.status === 'pinned')
    .sort((a, b) => {
      const pinA = a.status === 'pinned' ? 1 : 0;
      const pinB = b.status === 'pinned' ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;
      const scoreDiff = (b.relevance_score || 0) - (a.relevance_score || 0);
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
      return new Date(b.published_at || 0) - new Date(a.published_at || 0);
    })
    .slice(0, max)
    .map((article) => ({
      ...article,
      outbound_url: appendUtm(article.url, utm),
      display_date: formatDisplayDate(article.published_at),
      directory_url: article.matched_server_slug ? `/mcp/${article.matched_server_slug}` : '',
    }));

  return {
    articles,
    lastRunAt: payload.lastRunAt || null,
    isEmpty: articles.length === 0,
    hasData: (payload.articles || []).length > 0,
  };
}

function formatDisplayDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function listAllArticlesForAdmin() {
  const payload = loadArticlesPayload();
  const overrides = loadOverrides();
  return applyOverrides(payload.articles || [], overrides, loadConfig()).map((article) => ({
    canonical_url: article.canonical_url,
    title: article.title,
    source: article.source,
    published_at: article.published_at,
    relevance_score: article.relevance_score,
    status: article.status,
    matched_server_slug: article.matched_server_slug || '',
    matched_server_name: article.matched_server_name || '',
    editorial_blurb: article.editorial_blurb || '',
    url: article.url,
    has_override: Boolean(overrides[article.canonical_url]),
  }));
}

function setArticleOverride(canonicalUrl, status) {
  const allowed = new Set(['published', 'hidden', 'pinned']);
  if (!allowed.has(status)) {
    throw new Error('Status must be published, hidden, or pinned');
  }
  const url = String(canonicalUrl || '').trim();
  if (!url) throw new Error('canonical_url is required');

  const overrides = loadOverrides();
  overrides[url] = status;
  saveOverrides(overrides);

  const payload = loadArticlesPayload();
  const articles = (payload.articles || []).map((article) =>
    article.canonical_url === url ? { ...article, status } : article,
  );
  writeJson(ARTICLES_PATH, { ...payload, articles });

  return { canonical_url: url, status };
}

function clearArticleOverride(canonicalUrl) {
  const url = String(canonicalUrl || '').trim();
  const overrides = loadOverrides();
  delete overrides[url];
  saveOverrides(overrides);
  return { canonical_url: url, cleared: true };
}

function initializeOtherNewsService(app) {
  app.get('/api/other-news', (req, res) => {
    try {
      const limit = Math.min(20, parseInt(req.query.limit, 10) || 12);
      res.json(getDisplayArticles(limit));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/admin/api/other-news/items', requireAuth, requireAdmin, (req, res) => {
    try {
      const payload = loadArticlesPayload();
      res.json({
        items: listAllArticlesForAdmin(),
        lastRunAt: payload.lastRunAt,
        overridesPath: 'data/other-news-overrides.json',
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/admin/api/other-news/override', requireAuth, requireAdmin, (req, res) => {
    try {
      const { canonicalUrl, status } = req.body || {};
      if (req.body?.clear) {
        return res.json(clearArticleOverride(canonicalUrl));
      }
      const result = setArticleOverride(canonicalUrl, status);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  console.log('Other news service initialized');
}

module.exports = {
  initializeOtherNewsService,
  getDisplayArticles,
  listAllArticlesForAdmin,
  setArticleOverride,
  clearArticleOverride,
};
