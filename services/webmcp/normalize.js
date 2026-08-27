'use strict';

/**
 * WebMCP catalog normalization helpers.
 */

function stripHtml(input) {
  return String(input || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeText(input, maxLen = 4000) {
  const text = stripHtml(input);
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trim()}…`;
}

function normalizeHost(input) {
  let raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    if (raw.includes('://')) {
      raw = new URL(raw).hostname;
    } else {
      raw = raw.split('/')[0].split('?')[0].split('#')[0];
    }
  } catch {
    return '';
  }
  raw = raw.replace(/\.$/, '');
  if (raw.startsWith('www.')) raw = raw.slice(4);
  // Multi-label hostnames
  if (/^[a-z0-9.-]+$/.test(raw) && raw.includes('.')) return raw;
  // Single-label demo hosts used by webmcp.com for path demos (e.g. "coffee-shop")
  if (/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(raw)) return raw;
  return '';
}

function normalizeHttpsUrl(input, fallbackHost) {
  const host = normalizeHost(fallbackHost || input);
  try {
    const u = new URL(String(input || ''), host ? `https://${host}/` : undefined);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return host ? `https://${host}/` : '';
    u.hash = '';
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.toString();
  } catch {
    return host ? `https://${host}/` : '';
  }
}

function slugifyCategory(name) {
  return String(name || 'uncategorized')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'uncategorized';
}

function toolStableKey(tool) {
  const name = String(tool?.name || '').trim().toLowerCase();
  const page = String(tool?.page || tool?.page_url || '').trim().toLowerCase();
  const impl = String(tool?.impl || tool?.implementation_type || 'unknown').trim().toLowerCase();
  return `${name}::${page}::${impl}`;
}

function schemaHash(schema) {
  try {
    return require('crypto')
      .createHash('sha256')
      .update(JSON.stringify(schema || null))
      .digest('hex')
      .slice(0, 16);
  } catch {
    return '';
  }
}

function normalizeKind(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'answer' || k === 'read') return 'answer';
  if (k === 'act' || k === 'write') return 'act';
  if (k === 'transact' || k === 'action') return 'transact';
  return 'unknown';
}

function normalizeImpl(impl) {
  const i = String(impl || '').toLowerCase();
  if (i === 'declarative') return 'declarative';
  if (i === 'imperative') return 'imperative';
  if (i === 'mixed') return 'mixed';
  return 'unknown';
}

function normalizeTool(raw, host) {
  const name = String(raw?.name || '').trim();
  if (!name) return null;
  const inputSchema = raw?.inputSchema && typeof raw.inputSchema === 'object' ? raw.inputSchema : { type: 'object' };
  const page = raw?.page || raw?.page_url || null;
  const tool = {
    name,
    description: sanitizeText(raw?.description || '', 2000),
    kind: normalizeKind(raw?.kind),
    implementation_type: normalizeImpl(raw?.impl || raw?.implementation_type),
    page_url: page ? String(page) : null,
    input_schema: inputSchema,
    output_schema: raw?.outputSchema || raw?.output_schema || null,
    annotations: raw?.annotations && typeof raw.annotations === 'object' ? raw.annotations : null,
    schema_hash: schemaHash(inputSchema),
    required: Array.isArray(inputSchema.required) ? inputSchema.required : [],
  };
  tool.stable_key = toolStableKey(tool);
  tool.host = host;
  return tool;
}

function countKinds(tools) {
  const counts = { answer: 0, act: 0, transact: 0, unknown: 0 };
  for (const t of tools) {
    counts[t.kind] = (counts[t.kind] || 0) + 1;
  }
  return counts;
}

function inferImplementation(tools) {
  const set = new Set(tools.map((t) => t.implementation_type).filter((x) => x && x !== 'unknown'));
  if (set.size === 0) return 'unknown';
  if (set.size > 1) return 'mixed';
  return [...set][0];
}

function resolveFavicon(rawFavicon, host) {
  if (!rawFavicon) return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  const fav = String(rawFavicon);
  if (fav.startsWith('http://') || fav.startsWith('https://')) return fav;
  if (fav.startsWith('/')) {
    // Upstream relative paths point at webmcp.com favicon cache — keep as absolute to their CDN
    return `https://webmcp.com${fav}`;
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
}

function normalizeSite(raw, options = {}) {
  const host = normalizeHost(raw?.host || raw?.url);
  if (!host) return null;

  const tools = (Array.isArray(raw?.tools) ? raw.tools : [])
    .map((t) => normalizeTool(t, host))
    .filter(Boolean);

  const kindCounts = countKinds(tools);
  const siteType = String(raw?.type || raw?.site_type || 'unknown').toLowerCase();
  const category = sanitizeText(raw?.category || 'Uncategorized', 120) || 'Uncategorized';

  return {
    host,
    slug: host,
    name: sanitizeText(raw?.name || host, 200),
    canonical_url: normalizeHttpsUrl(raw?.url || raw?.canonical_url, host),
    description: sanitizeText(raw?.desc || raw?.description || '', 2000),
    category,
    category_slug: slugifyCategory(category),
    site_type: siteType === 'demo' ? 'demo' : siteType === 'live' ? 'live' : 'unknown',
    verification_status: options.verification_status || 'unverified',
    availability_status: options.availability_status || 'active',
    favicon_url: resolveFavicon(raw?.favicon, host),
    tool_count: tools.length,
    answer_count: kindCounts.answer,
    act_count: kindCounts.act,
    transact_count: kindCounts.transact,
    implementation: inferImplementation(tools),
    api_surface: raw?.apiSurface || raw?.api_surface || null,
    score: null,
    grade: null,
    provenance: options.provenance || {
      source_name: 'webmcp.com',
      source_url: `https://webmcp.com/sites/${host}`,
    },
    source_scraped_at: raw?._scrape?.scrapedAt || null,
    first_seen_at: options.first_seen_at || new Date().toISOString(),
    last_seen_at: options.last_seen_at || new Date().toISOString(),
    last_verified_at: null,
    published: options.published !== false,
    tools,
  };
}

module.exports = {
  stripHtml,
  sanitizeText,
  normalizeHost,
  normalizeHttpsUrl,
  slugifyCategory,
  toolStableKey,
  schemaHash,
  normalizeKind,
  normalizeImpl,
  normalizeTool,
  normalizeSite,
  countKinds,
  inferImplementation,
};
