'use strict';

/**
 * Headless WebMCP scanner using system Chrome + puppeteer-core.
 * Captures document.modelContext.registerTool() calls via an early polyfill.
 */

const path = require('path');
const puppeteer = require('puppeteer-core');
const { assertSafePublicUrl, isSameOrigin } = require('./ssrf');
const { normalizeKind } = require('./normalize');

const CHROME_PATH = process.env.WEBMCP_CHROME_PATH || '/usr/local/bin/google-chrome';
const MAX_PAGES = Number(process.env.WEBMCP_SCAN_MAX_PAGES || 6);
const PAGE_TIMEOUT_MS = Number(process.env.WEBMCP_SCAN_PAGE_TIMEOUT_MS || 25000);
const SETTLE_MS = Number(process.env.WEBMCP_SCAN_SETTLE_MS || 1800);

function inferKind(name, description) {
  const hay = `${name} ${description}`.toLowerCase();
  if (/buy|checkout|pay|purchase|order|subscribe|transact/.test(hay)) return 'transact';
  if (/navigate|open|set|update|create|delete|submit|add|remove|write|send|filter|show/.test(hay)) {
    return 'act';
  }
  return 'answer';
}

function captureBootstrap() {
  return `(() => {
    if (window.__INFLUZER_WEBMCP_SCAN__) return;
    window.__INFLUZER_WEBMCP_SCAN__ = { tools: [], native: false };
    const store = window.__INFLUZER_WEBMCP_SCAN__.tools;
    function remember(def) {
      if (!def || !def.name) return;
      store.push({
        name: String(def.name),
        description: String(def.description || ''),
        inputSchema: def.inputSchema || { type: 'object' },
        outputSchema: def.outputSchema || null,
        hasExecute: typeof def.execute === 'function',
      });
    }
    function install(target) {
      const original = target.registerTool ? target.registerTool.bind(target) : null;
      target.registerTool = async function(def, options) {
        remember(def);
        if (original) return original(def, options);
        return undefined;
      };
      if (!target.getTools) {
        target.getTools = async function() {
          return store.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          }));
        };
      }
      if (!target.executeTool) {
        target.executeTool = async function() {
          throw new Error('executeTool disabled during Influzer scan');
        };
      }
    }
    try {
      const existing = document.modelContext;
      if (existing && typeof existing.registerTool === 'function') {
        window.__INFLUZER_WEBMCP_SCAN__.native = true;
        install(existing);
      } else {
        const poly = {};
        install(poly);
        Object.defineProperty(document, 'modelContext', {
          configurable: true,
          enumerable: true,
          get() { return poly; },
          set(v) {
            if (v && typeof v === 'object') install(v);
          },
        });
      }
    } catch (err) {
      window.__INFLUZER_WEBMCP_SCAN__.bootError = String(err && err.message || err);
    }
  })();`;
}

async function launchBrowser() {
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
}

async function collectFromPage(page) {
  return page.evaluate(async () => {
    const scan = window.__INFLUZER_WEBMCP_SCAN__ || { tools: [], native: false };
    let fromApi = [];
    try {
      if (document.modelContext && typeof document.modelContext.getTools === 'function') {
        fromApi = await document.modelContext.getTools();
      }
    } catch {
      fromApi = [];
    }
    const merged = new Map();
    for (const t of [...(scan.tools || []), ...(fromApi || [])]) {
      if (!t?.name) continue;
      merged.set(t.name, {
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || t.input_schema || { type: 'object' },
        outputSchema: t.outputSchema || t.output_schema || null,
      });
    }
    const anchors = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => a.getAttribute('href'))
      .filter(Boolean)
      .slice(0, 40);
    return {
      tools: [...merged.values()],
      title: document.title || '',
      description:
        document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      anchors,
      native: Boolean(scan.native),
      bootError: scan.bootError || null,
    };
  });
}

function normalizePagePath(href, origin) {
  try {
    const u = new URL(href, origin);
    if (u.origin !== origin) return null;
    u.hash = '';
    // Skip assets
    if (/\.(css|js|mjs|map|png|jpe?g|gif|svg|webp|ico|pdf|zip|woff2?)$/i.test(u.pathname)) {
      return null;
    }
    if (u.pathname.startsWith('/api/')) return null;
    return `${u.pathname}${u.search}` || '/';
  } catch {
    return null;
  }
}

function prioritizePaths(paths) {
  const preferred = [
    '/',
    '/webmcp',
    '/webmcp/demo',
    '/mcp',
    '/insights',
    '/about',
    '/docs',
    '/tools',
  ];
  const set = new Set(paths);
  const ordered = [];
  for (const p of preferred) {
    if (set.has(p)) {
      ordered.push(p);
      set.delete(p);
    }
  }
  for (const p of set) ordered.push(p);
  return ordered;
}

/**
 * @param {object} opts
 * @param {string} opts.url
 * @param {(patch: object) => void} [opts.onProgress]
 */
async function scanWebsite({ url, onProgress = () => {} } = {}) {
  const started = Date.now();
  const safe = await assertSafePublicUrl(url);
  const toolsByKey = new Map();
  const pages = [];
  let crashes = 0;
  let browser;

  onProgress({
    status: 'running',
    phase: 'launching',
    message: 'Launching scanner…',
    elapsed_ms: 0,
    pages_scanned: 0,
    pages_total: MAX_PAGES,
    tools_detected: 0,
    crashes: 0,
  });

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setUserAgent(
      'InfluzerWebMcpScanner/1.0 (+https://www.influzer.ai/webmcp/about; research; not executing tools)',
    );
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument(captureBootstrap);

    const queue = prioritizePaths(['/']);
    const seen = new Set();

    while (queue.length && pages.length < MAX_PAGES) {
      const pagePath = queue.shift();
      if (seen.has(pagePath)) continue;
      seen.add(pagePath);
      const target = new URL(pagePath, safe.origin).toString();

      onProgress({
        status: 'running',
        phase: 'scanning',
        message: `Reading page ${pages.length + 1} of ${MAX_PAGES}…`,
        current_url: target,
        elapsed_ms: Date.now() - started,
        pages_scanned: pages.length,
        pages_total: MAX_PAGES,
        tools_detected: toolsByKey.size,
        crashes,
      });

      let pageResult = null;
      try {
        const response = await page.goto(target, {
          waitUntil: 'domcontentloaded',
          timeout: PAGE_TIMEOUT_MS,
        });
        await new Promise((r) => setTimeout(r, SETTLE_MS));
        await new Promise((r) => setTimeout(r, 500));

        pageResult = await collectFromPage(page);

        const finalUrl = page.url();
        if (!isSameOrigin(finalUrl, safe.origin)) {
          // Cross-origin redirect — skip tool merge from this page
          pages.push({
            path: pagePath,
            url: target,
            ok: false,
            status: response?.status() || null,
            error: 'cross_origin_redirect',
            tool_count: 0,
          });
          continue;
        }

        for (const t of pageResult.tools || []) {
          const key = `${t.name}::${pagePath}`;
          if (!toolsByKey.has(t.name)) {
            toolsByKey.set(t.name, {
              name: t.name,
              description: t.description,
              kind: inferKind(t.name, t.description),
              implementation_type: 'imperative',
              page_url: pagePath,
              input_schema: t.inputSchema || { type: 'object' },
              output_schema: t.outputSchema || null,
            });
          } else {
            // Prefer first page; note multi-page presence in scorecard via pages
            const existing = toolsByKey.get(t.name);
            if (existing.page_url === '/' && pagePath !== '/') {
              // keep root registration as canonical page_url
            }
          }
        }

        for (const href of pageResult.anchors || []) {
          const p = normalizePagePath(href, safe.origin);
          if (p && !seen.has(p) && queue.length + seen.size < MAX_PAGES * 3) {
            queue.push(p);
          }
        }

        // Seed useful first-party paths even if not linked
        if (pages.length === 0) {
          for (const extra of ['/webmcp', '/webmcp/demo', '/mcp', '/insights', '/about']) {
            if (!seen.has(extra) && !queue.includes(extra)) queue.push(extra);
          }
        }

        pages.push({
          path: pagePath,
          url: finalUrl,
          ok: true,
          status: response?.status() || null,
          title: pageResult.title,
          tool_count: (pageResult.tools || []).length,
          native_webmcp: pageResult.native,
        });
      } catch (err) {
        crashes += 1;
        pages.push({
          path: pagePath,
          url: target,
          ok: false,
          status: null,
          error: String(err.message || err).slice(0, 240),
          tool_count: 0,
        });
      }

      onProgress({
        status: 'running',
        phase: 'scanning',
        message: `Scanned ${pages.length} / ${MAX_PAGES} pages`,
        current_url: target,
        elapsed_ms: Date.now() - started,
        pages_scanned: pages.length,
        pages_total: MAX_PAGES,
        tools_detected: toolsByKey.size,
        crashes,
      });
    }

    const tools = [...toolsByKey.values()].map((t) => ({
      ...t,
      kind: normalizeKind(t.kind),
    }));

    const description =
      pages.find((p) => p.ok && p.title)?.title ||
      `WebMCP tools discovered on ${safe.host}`;

    return {
      ok: true,
      host: safe.host,
      canonical_url: safe.canonical,
      started_at: new Date(started).toISOString(),
      finished_at: new Date().toISOString(),
      elapsed_ms: Date.now() - started,
      pages_scanned: pages.length,
      crashes,
      tools,
      pages,
      site_guess: {
        name: safe.host,
        description: String(description).slice(0, 400),
        category: 'Uncategorized',
      },
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = {
  scanWebsite,
  CHROME_PATH,
  MAX_PAGES,
};
