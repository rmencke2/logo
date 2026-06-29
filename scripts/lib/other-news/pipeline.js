// Orchestrates fetch → dedupe → score → LLM → match → persist.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const { fetchAllSources } = require('./fetchers');
const { scoreHeuristic, enrichWithLlm, dedupeArticles, fallbackBlurb } = require('./scoring');
const { attachDirectoryMatches } = require('./matching');
const {
  loadConfig,
  readJson,
  writeJson,
  ARTICLES_PATH,
  normalizeTitle,
  isWithinRecency,
} = require('./utils');

function resolveStatus(article, config, existingOverride) {
  if (existingOverride === 'pinned' || existingOverride === 'hidden') {
    return existingOverride;
  }
  if (existingOverride === 'published') {
    return 'published';
  }
  const threshold = config.autoPublishThreshold ?? 0.52;
  const inWindow = isWithinRecency(article.published_at, config.recencyDays ?? 14);
  if (inWindow && article.relevance_score >= threshold) {
    return 'published';
  }
  return 'hidden';
}

function mergeWithExisting(freshArticles, existingPayload, overrides, config) {
  const existingByUrl = new Map((existingPayload.articles || []).map((a) => [a.canonical_url, a]));
  const now = new Date().toISOString();
  const merged = [];

  for (const article of freshArticles) {
    const prior = existingByUrl.get(article.canonical_url);
    const override = overrides[article.canonical_url];
    const status = resolveStatus(article, config, override || prior?.status);

    merged.push({
      ...prior,
      ...article,
      title_normalized: normalizeTitle(article.title),
      status,
      updated_at: now,
      fetched_at: prior?.fetched_at || now,
    });
    existingByUrl.delete(article.canonical_url);
  }

  // Keep recent hidden/pinned items not re-fetched but still within recency
  for (const leftover of existingByUrl.values()) {
    if (!isWithinRecency(leftover.published_at, (config.recencyDays ?? 14) + 7)) continue;
    if (leftover.status === 'pinned' || overrides[leftover.canonical_url]) {
      merged.push(leftover);
    }
  }

  return merged.sort((a, b) => {
    const pinA = a.status === 'pinned' ? 1 : 0;
    const pinB = b.status === 'pinned' ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    const scoreDiff = (b.relevance_score || 0) - (a.relevance_score || 0);
    if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
    return new Date(b.published_at || 0) - new Date(a.published_at || 0);
  });
}

async function runOtherNewsPipeline(options = {}) {
  const config = loadConfig();
  const overrides = readJson(
    path.join(__dirname, '..', '..', '..', 'data', 'other-news-overrides.json'),
    {},
  );
  const existingPayload = readJson(ARTICLES_PATH, { articles: [], lastRunAt: null });

  const { articles: rawArticles, errors } = await fetchAllSources(config);
  let articles = dedupeArticles(rawArticles, config);

  articles = articles.map((article) => {
    const relevance_score = scoreHeuristic(article, config);
    return {
      ...article,
      relevance_score,
      editorial_blurb: fallbackBlurb(article),
      status: 'hidden',
    };
  });

  articles = await enrichWithLlm(articles, config);
  articles = attachDirectoryMatches(articles);
  articles = mergeWithExisting(articles, existingPayload, overrides, config);

  const payload = {
    lastRunAt: new Date().toISOString(),
    configVersion: config,
    sourceErrors: errors,
    stats: {
      fetched: rawArticles.length,
      deduped: articles.length,
      published: articles.filter((a) => a.status === 'published' || a.status === 'pinned').length,
    },
    articles,
  };

  if (!options.dryRun) {
    writeJson(ARTICLES_PATH, payload);
  }

  return payload;
}

module.exports = {
  runOtherNewsPipeline,
};
