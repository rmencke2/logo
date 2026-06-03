/**
 * Normalization helpers for MCP directory data pipeline.
 */

const STANDARD_CATEGORIES = [
  'Dev Tools',
  'Search & Web',
  'Databases',
  'Design',
  'Cloud & Infra',
  'Communication',
  'Data & Analytics',
  'Security & Monitoring',
  'Payments & Commerce',
  'AI & Memory',
  'Files & Docs',
  'Automation',
];

const FALLBACK_CATEGORY = 'Dev Tools';

const CATEGORY_KEYWORDS = [
  ['Search & Web', /\b(search|brave|fetch|crawl|scrape|web|browser|puppeteer|playwright|perplexity|exa|tavily|jina|firecrawl|serp|seo)\b/i],
  ['Databases', /\b(postgres|mysql|sqlite|mongo|redis|supabase|neon|duckdb|milvus|vector|sql|database|warehouse|snowflake|bigquery|mindsdb)\b/i],
  ['Design', /\b(figma|canva|design|ui|storybook|slide|tailwind|component)\b/i],
  ['Cloud & Infra', /\b(aws|azure|gcp|google cloud|kubernetes|k8s|docker|terraform|vercel|netlify|cloudflare|lambda|infra)\b/i],
  ['Communication', /\b(slack|gmail|email|calendar|teams|notion|confluence|jira|asana|monday|discord|chat)\b/i],
  ['Data & Analytics', /\b(analytics|amplitude|mixpanel|metabase|airtable|sheets|hex|keboola|vega|bi|dashboard)\b/i],
  ['Security & Monitoring', /\b(sentry|datadog|pagerduty|snyk|sonar|grafana|new relic|security|monitor|observability)\b/i],
  ['Payments & Commerce', /\b(stripe|shopify|payment|commerce|mercado|billing|checkout)\b/i],
  ['AI & Memory', /\b(memory|mem0|zep|openrouter|replicate|fal\.ai|deepseek|llm|model|agent|ai)\b/i],
  ['Files & Docs', /\b(drive|dropbox|box|onedrive|filesystem|file|document|pdf|obsidian|vault)\b/i],
  ['Automation', /\b(n8n|zapier|pipedream|make\.com|hubspot|salesforce|workflow|integrat|automate)\b/i],
  ['Dev Tools', /\b(git|github|gitlab|linear|code|dev|terminal|context7|e2b|replit|stackblitz|npm|debug)\b/i],
];

/**
 * @param {string} text
 * @returns {string}
 */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'server';
}

/**
 * @param {string} githubUrl
 * @returns {string|null}
 */
function normalizeGithubUrl(githubUrl) {
  if (!githubUrl || typeof githubUrl !== 'string') return null;
  const trimmed = githubUrl.trim().replace(/\/$/, '');
  const match = trimmed.match(/^https?:\/\/github\.com\/[^/]+\/[^/#?]+/i);
  return match ? match[0].toLowerCase() : null;
}

/**
 * @param {string} name
 * @param {string} description
 * @param {string[]} [sourceCategories]
 * @returns {string}
 */
function mapCategory(name, description, sourceCategories = []) {
  if (Array.isArray(sourceCategories) && sourceCategories.length) {
    const joined = sourceCategories.join(' ').toLowerCase();
    for (const [cat, re] of CATEGORY_KEYWORDS) {
      if (re.test(joined)) return cat;
    }
  }

  const haystack = `${name} ${description}`;
  for (const [cat, re] of CATEGORY_KEYWORDS) {
    if (re.test(haystack)) return cat;
  }
  return FALLBACK_CATEGORY;
}

/**
 * @param {unknown} raw
 * @returns {'stdio' | 'http' | 'sse' | 'unknown'}
 */
function mapTransport(raw) {
  const t = String(raw || '').toLowerCase();
  if (t.includes('sse')) return 'sse';
  if (t.includes('http') || t.includes('remote')) return 'http';
  if (t.includes('stdio') || t.includes('local')) return 'stdio';
  return 'unknown';
}

/**
 * @param {unknown[]} tools
 * @returns {{ name: string; description: string }[]}
 */
function normalizeTools(tools) {
  if (!Array.isArray(tools)) return [];
  return tools
    .map((t) => {
      if (!t || typeof t !== 'object') return null;
      const name = t.name || t.toolName || '';
      const description = t.description || t.summary || '';
      if (!name) return null;
      return { name: String(name), description: String(description || '').slice(0, 500) };
    })
    .filter(Boolean)
    .slice(0, 50);
}

/**
 * @param {string[]} attributes
 * @returns {boolean}
 */
function isOfficial(attributes) {
  if (!Array.isArray(attributes)) return false;
  return attributes.some((a) => String(a).toLowerCase().includes('official'));
}

/**
 * Infer icon key for UI from category/name.
 * @param {string} category
 * @param {string} name
 * @returns {string}
 */
function inferIcon(category, name) {
  const n = name.toLowerCase();
  if (n.includes('github')) return 'github';
  if (n.includes('gitlab')) return 'gitlab';
  if (n.includes('postgres') || n.includes('sql')) return 'database';
  if (n.includes('figma')) return 'figma';
  if (n.includes('slack')) return 'message-square';
  if (n.includes('stripe')) return 'credit-card';
  if (n.includes('memory') || n.includes('mem0')) return 'brain';
  if (category === 'Search & Web') return 'search';
  if (category === 'Cloud & Infra') return 'cloud';
  if (category === 'Files & Docs') return 'folder';
  if (category === 'Data & Analytics') return 'bar-chart';
  if (category === 'Security & Monitoring') return 'shield-alert';
  if (category === 'Design') return 'figma';
  return 'boxes';
}

/**
 * @typedef {object} CatalogServer
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {boolean} official
 * @property {'stdio' | 'http' | 'sse' | 'unknown'} transport
 * @property {{ name: string; description: string }[]} tools
 * @property {string} [github_url]
 * @property {string} [docs_url]
 * @property {number} stars
 * @property {'glama' | 'smithery' | 'awesome-mcp' | 'manual'} source
 * @property {string} last_updated
 * @property {string} icon
 */

/**
 * @param {CatalogServer} server
 * @returns {CatalogServer}
 */
function finalizeServer(server) {
  const id = server.id || slugify(server.name);
  let slug = server.slug || id;
  slug = slugify(slug);

  return {
    ...server,
    id,
    slug,
    icon: server.icon || inferIcon(server.category, server.name),
    description: String(server.description || '').trim().slice(0, 2000),
    stars: Math.max(0, Number(server.stars) || 0),
    tools: normalizeTools(server.tools),
    last_updated: server.last_updated || new Date().toISOString().slice(0, 10),
  };
}

/**
 * Quality score for deduplication (higher wins).
 * @param {CatalogServer} s
 */
function qualityScore(s) {
  let score = 0;
  score += (s.tools?.length || 0) * 10;
  score += Math.min(s.description?.length || 0, 200);
  score += Math.min(s.stars || 0, 5000);
  if (s.source === 'manual') score += 500;
  if (s.source === 'glama') score += 50;
  if (s.github_url) score += 20;
  return score;
}

/**
 * @param {CatalogServer[]} servers
 * @returns {CatalogServer[]}
 */
function dedupeServers(servers) {
  const byGithub = new Map();
  const bySlug = new Map();
  const out = [];

  for (const raw of servers) {
    const s = finalizeServer(raw);
    const gh = normalizeGithubUrl(s.github_url);
    const keys = [];
    if (gh) keys.push(`gh:${gh}`);
    keys.push(`slug:${s.slug}`);

    let existing = null;
    for (const key of keys) {
      if (byGithub.has(key)) {
        existing = byGithub.get(key);
        break;
      }
      if (bySlug.has(key)) {
        existing = bySlug.get(key);
        break;
      }
    }

    if (existing) {
      if (qualityScore(s) > qualityScore(existing)) {
        const idx = out.indexOf(existing);
        if (idx >= 0) out[idx] = s;
        for (const key of keys) {
          byGithub.set(key, s);
          bySlug.set(key, s);
        }
      }
      continue;
    }

    out.push(s);
    for (const key of keys) {
      byGithub.set(key, s);
      bySlug.set(key, s);
    }
  }

  return out;
}

/**
 * @param {CatalogServer[]} servers
 * @returns {CatalogServer[]}
 */
function filterNoise(servers) {
  return servers.filter((s) => {
    const hasDescription = Boolean(s.description && s.description.length >= 12);
    const hasStars = (s.stars || 0) > 0;
    return hasDescription || hasStars;
  });
}

/**
 * Ensure unique slugs by suffixing duplicates.
 * @param {CatalogServer[]} servers
 */
function ensureUniqueSlugs(servers) {
  const seen = new Map();
  return servers.map((s) => {
    let slug = s.slug;
    if (seen.has(slug)) {
      const n = seen.get(slug) + 1;
      seen.set(slug, n);
      slug = `${slug}-${n}`;
    } else {
      seen.set(slug, 1);
    }
    return { ...s, slug, id: slug };
  });
}

module.exports = {
  STANDARD_CATEGORIES,
  FALLBACK_CATEGORY,
  slugify,
  normalizeGithubUrl,
  mapCategory,
  mapTransport,
  normalizeTools,
  isOfficial,
  inferIcon,
  finalizeServer,
  dedupeServers,
  filterNoise,
  ensureUniqueSlugs,
  qualityScore,
};
