'use strict';

/**
 * Server-side adapter for the public webmcp.com discovery API.
 * Never call this from browser clients.
 */

const DEFAULT_BASE = process.env.WEBMCP_DISCOVERY_BASE_URL || 'https://webmcp.com';
const DEFAULT_TIMEOUT_MS = Number(process.env.WEBMCP_DISCOVERY_TIMEOUT_MS || 20000);
const DEFAULT_PAGE_LIMIT = 100;
// Safety ceiling only. A default of 50 pages × 100 sites stopped the import at
// exactly 5,000 while webmcp.com reported a larger total. Page until that
// reported total, and stop here so a bad `total` cannot loop forever.
const DEFAULT_MAX_PAGES = 200;

async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS, attempt = 1 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'InfluzerWebMcpDirectoryBot/1.0 (+https://www.influzer.ai/webmcp/about)',
      },
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 4) {
        throw new Error(`Upstream ${res.status} for ${url}`);
      }
      const delay = Math.min(8000, 500 * 2 ** (attempt - 1));
      await new Promise((r) => setTimeout(r, delay));
      return fetchJson(url, { timeoutMs, attempt: attempt + 1 });
    }
    if (!res.ok) {
      throw new Error(`Upstream ${res.status} for ${url}`);
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

class WebMcpDiscoveryProvider {
  constructor({ baseUrl = DEFAULT_BASE } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
  }

  async getStats() {
    return fetchJson(`${this.baseUrl}/api/v1/stats`);
  }

  async listSitesPage({ offset = 0, limit = DEFAULT_PAGE_LIMIT, fields = 'full', type = 'all' } = {}) {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(Math.min(limit, 500)),
      fields,
      type,
    });
    return fetchJson(`${this.baseUrl}/api/v1/sites?${params}`);
  }

  /**
   * Paginate until the upstream `total`, or until maxPages (a safety ceiling).
   * `truncated` is true when fewer sites came back than that reported total.
   * Returns raw upstream site objects.
   */
  async listAllSites({ fields = 'full', type = 'all', maxPages = DEFAULT_MAX_PAGES, pageDelayMs = 150 } = {}) {
    const sites = [];
    let offset = 0;
    let total = null;
    let pages = 0;
    const pageCap = Math.max(1, Number(maxPages) || DEFAULT_MAX_PAGES);

    while ((total == null || offset < total) && pages < pageCap) {
      const page = await this.listSitesPage({ offset, limit: DEFAULT_PAGE_LIMIT, fields, type });
      const batch = Array.isArray(page?.sites) ? page.sites : [];
      const reported = Number(page?.total);
      if (Number.isFinite(reported) && reported >= 0) {
        total = Math.trunc(reported);
      } else if (total == null) {
        total = offset + batch.length;
      }
      sites.push(...batch);
      pages += 1;
      offset += batch.length;
      if (!batch.length) break;
      if (total != null && offset < total && pageDelayMs > 0) {
        await new Promise((r) => setTimeout(r, pageDelayMs));
      }
    }

    const reportedTotal = Number.isFinite(total) ? total : sites.length;
    return {
      sites,
      total: reportedTotal,
      pages,
      truncated: sites.length < reportedTotal,
      generatedAt: new Date().toISOString(),
    };
  }

  async getSite(host) {
    const h = encodeURIComponent(String(host || '').trim().toLowerCase());
    return fetchJson(`${this.baseUrl}/api/v1/sites/${h}`);
  }

  async lookup(url) {
    const params = new URLSearchParams({ url: String(url || '') });
    return fetchJson(`${this.baseUrl}/api/v1/lookup?${params}`);
  }
}

module.exports = {
  WebMcpDiscoveryProvider,
  fetchJson,
  DEFAULT_PAGE_LIMIT,
  DEFAULT_MAX_PAGES,
};
