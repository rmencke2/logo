// Source fetchers for external MCP-related articles.

const {
  canonicalizeUrl,
  truncate,
  daysAgoIso,
  isWithinRecency,
} = require('./utils');

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(options.timeoutMs || 20000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
      ...options.headers,
    },
    signal: AbortSignal.timeout(options.timeoutMs || 20000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function toArticle(partial) {
  if (!partial?.title || !partial?.url) return null;
  const canonical_url = canonicalizeUrl(partial.url);
  return {
    title: String(partial.title).trim(),
    url: partial.url,
    canonical_url,
    source: partial.source || 'unknown',
    author: partial.author || '',
    published_at: partial.published_at || null,
    score_signal: Number(partial.score_signal) || 0,
    raw_summary: truncate(partial.raw_summary || '', 500),
  };
}

async function fetchHackerNews(config) {
  const source = config.sources?.hackerNews;
  if (!source?.enabled) return [];

  const minPoints = source.minPoints ?? config.hnMinPoints ?? 8;
  const recencyDays = config.recencyDays ?? 14;
  const articles = [];

  for (const query of source.queries || []) {
    try {
      const params = new URLSearchParams({
        query,
        tags: source.tags || 'story',
        hitsPerPage: '50',
      });
      const data = await fetchJson(`https://hn.algolia.com/api/v1/search?${params}`);
      for (const hit of data.hits || []) {
        if ((Number(hit.points) || 0) < minPoints) continue;
        const article = toArticle({
          title: hit.title,
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          source: 'Hacker News',
          author: hit.author || '',
          published_at: hit.created_at || null,
          score_signal: Number(hit.points) || 0,
          raw_summary: hit.story_text || hit.comment_text || hit.title,
        });
        if (article && isWithinRecency(article.published_at, recencyDays)) {
          articles.push(article);
        }
      }
    } catch (error) {
      // Continue other queries; surfaced in pipeline sourceErrors via outer handler if all fail
      console.warn(`HN query failed (${query}):`, error.message);
    }
  }

  return articles;
}

async function fetchRedditRss(sub, config, minScore, recencyDays) {
  const source = config.sources?.reddit;
  const articles = [];
  const url = `https://www.reddit.com/r/${sub.name}/${sub.sort || 'top'}/.rss?t=${sub.t || 'week'}`;
  const xml = await fetchText(url, {
    headers: {
      'User-Agent': source.userAgent || 'influzer-other-news-bot/1.0 (contact: hello@influzer.ai)',
    },
  });
  for (const item of parseRssItems(xml)) {
    const article = toArticle({
      title: item.title,
      url: item.link,
      source: `r/${sub.name}`,
      author: '',
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      score_signal: minScore,
      raw_summary: truncate(item.description || item.title, 500),
    });
    if (article && isWithinRecency(article.published_at, recencyDays)) {
      articles.push(article);
    }
  }
  return articles;
}

async function fetchReddit(config) {
  const source = config.sources?.reddit;
  if (!source?.enabled) return [];

  const minScore = source.minScore ?? config.redditMinScore ?? 5;
  const recencyDays = config.recencyDays ?? 14;
  const articles = [];

  for (const sub of source.subreddits || []) {
    try {
      const url = `https://www.reddit.com/r/${sub.name}/${sub.sort || 'top'}.json?t=${sub.t || 'week'}&limit=30&raw_json=1`;
      const data = await fetchJson(url, {
        headers: {
          'User-Agent': source.userAgent || 'influzer-other-news-bot/1.0 (contact: hello@influzer.ai)',
          Accept: 'application/json',
        },
      });
      for (const child of data?.data?.children || []) {
        const post = child.data;
        if (!post || post.stickied) continue;
        if ((post.score || 0) < minScore) continue;
        const article = toArticle({
          title: post.title,
          url: post.url?.startsWith('http') ? post.url : `https://www.reddit.com${post.permalink}`,
          source: `r/${post.subreddit}`,
          author: post.author ? `u/${post.author}` : '',
          published_at: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
          score_signal: Number(post.score) || 0,
          raw_summary: truncate(post.selftext || post.title, 500),
        });
        if (article && isWithinRecency(article.published_at, recencyDays)) {
          articles.push(article);
        }
      }
    } catch (error) {
      console.warn(`Reddit JSON failed (r/${sub.name}):`, error.message);
      try {
        const rssArticles = await fetchRedditRss(sub, config, minScore, recencyDays);
        articles.push(...rssArticles);
      } catch (rssError) {
        console.warn(`Reddit RSS failed (r/${sub.name}):`, rssError.message);
      }
    }
  }

  return articles;
}

async function fetchDevTo(config) {
  const source = config.sources?.devTo;
  if (!source?.enabled) return [];

  const recencyDays = config.recencyDays ?? 14;
  const articles = [];

  for (const tag of source.tags || []) {
    const data = await fetchJson(
      `https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&per_page=${source.perPage || 25}`,
    );
    for (const item of data || []) {
      const article = toArticle({
        title: item.title,
        url: item.url,
        source: 'Dev.to',
        author: item.user?.name ? `@${item.user.name}` : '',
        published_at: item.published_at || null,
        score_signal: Number(item.positive_reactions_count) || 0,
        raw_summary: truncate(item.description || item.title, 500),
      });
      if (article && isWithinRecency(article.published_at, recencyDays)) {
        articles.push(article);
      }
    }
  }

  return articles;
}

function parseRssItems(xml) {
  const items = [];
  const chunks = xml.split(/<item[\s>]/i).slice(1);
  for (const chunk of chunks) {
    const title = (chunk.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i) || [])[1];
    const link = (chunk.match(/<link>([\s\S]*?)<\/link>/i) || [])[1];
    const pubDate = (chunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1];
    const description = (chunk.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i) || [])[1];
    if (!title || !link) continue;
    items.push({
      title: title.replace(/<[^>]+>/g, '').trim(),
      link: link.trim(),
      pubDate: pubDate?.trim() || null,
      description: description?.replace(/<[^>]+>/g, '').trim() || '',
    });
  }
  return items;
}

async function fetchGoogleNewsRss(config) {
  const source = config.sources?.googleNewsRss;
  if (!source?.enabled) return [];

  const recencyDays = config.recencyDays ?? 14;
  const articles = [];

  for (const query of source.queries || []) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const xml = await fetchText(url);
    for (const item of parseRssItems(xml)) {
      const article = toArticle({
        title: item.title,
        url: item.link,
        source: 'Google News',
        author: '',
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        score_signal: 0,
        raw_summary: truncate(item.description || item.title, 500),
      });
      if (article && isWithinRecency(article.published_at, recencyDays)) {
        articles.push(article);
      }
    }
  }

  return articles;
}

async function fetchGithub(config) {
  const source = config.sources?.github;
  if (!source?.enabled) return [];

  const minStars = source.minStars ?? config.githubMinStars ?? 50;
  const recencyDays = config.recencyDays ?? 14;
  const since = daysAgoIso(recencyDays).slice(0, 10);
  const articles = [];

  for (const query of source.queries || []) {
    const params = new URLSearchParams({
      q: `${query} created:>=${since}`,
      sort: 'stars',
      order: 'desc',
      per_page: String(source.maxResults || 15),
    });
    const data = await fetchJson(`https://api.github.com/search/repositories?${params}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'influzer-other-news',
      },
    });
    for (const repo of data.items || []) {
      if ((repo.stargazers_count || 0) < minStars) continue;
      const article = toArticle({
        title: `GitHub: ${repo.full_name} — ${repo.description || 'MCP-related repository'}`,
        url: repo.html_url,
        source: 'GitHub',
        author: repo.owner?.login || '',
        published_at: repo.created_at || repo.updated_at || null,
        score_signal: Number(repo.stargazers_count) || 0,
        raw_summary: truncate(repo.description || '', 500),
      });
      if (article) articles.push(article);
    }
  }

  return articles;
}

async function fetchAllSources(config) {
  const results = await Promise.allSettled([
    fetchHackerNews(config),
    fetchReddit(config),
    fetchDevTo(config),
    fetchGoogleNewsRss(config),
    fetchGithub(config),
  ]);

  const articles = [];
  const errors = [];
  const labels = ['hackerNews', 'reddit', 'devTo', 'googleNewsRss', 'github'];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    } else {
      errors.push({ source: labels[index], error: result.reason?.message || String(result.reason) });
    }
  });

  return { articles, errors };
}

module.exports = {
  fetchAllSources,
};
