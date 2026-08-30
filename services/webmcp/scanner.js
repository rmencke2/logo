'use strict';

/**
 * Headless WebMCP scanner using system Chrome + puppeteer-core.
 * Captures document.modelContext.registerTool() calls via an early polyfill.
 */

const path = require('path');
const puppeteer = require('puppeteer-core');
const { assertSafePublicUrl, isSameOrigin } = require('./ssrf');
const { normalizeKind } = require('./normalize');

const fs = require('fs');

const CANDIDATE_CHROMES = [
  process.env.WEBMCP_CHROME_PATH,
  '/usr/local/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
].filter(Boolean);

function resolveChromePath() {
  for (const candidate of CANDIDATE_CHROMES) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return CANDIDATE_CHROMES[0] || '/usr/bin/chromium';
}

const CHROME_PATH = resolveChromePath();
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
  // Returned string is injected via evaluateOnNewDocument(captureBootstrap()) —
  // passing the function itself only returns the string in-page and installs nothing.
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
      if (!target || typeof target !== 'object') return target;
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
      return target;
    }
    function ensurePolyfill(owner, prop) {
      try {
        const existing = owner[prop];
        if (existing && typeof existing.registerTool === 'function') {
          window.__INFLUZER_WEBMCP_SCAN__.native = true;
          install(existing);
          return;
        }
      } catch (_) { /* ignore */ }
      const poly = install({});
      try {
        Object.defineProperty(owner, prop, {
          configurable: true,
          enumerable: true,
          get() { return poly; },
          set(v) {
            if (v && typeof v === 'object') install(v);
          },
        });
      } catch (_) {
        try { owner[prop] = poly; } catch (__) { /* ignore */ }
      }
    }
    try {
      ensurePolyfill(document, 'modelContext');
      // Legacy / compatibility entry point still used by some demos
      ensurePolyfill(navigator, 'modelContext');
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
    try {
      if (
        (!fromApi || !fromApi.length) &&
        navigator.modelContext &&
        typeof navigator.modelContext.getTools === 'function'
      ) {
        fromApi = await navigator.modelContext.getTools();
      }
    } catch {
      /* ignore */
    }

    // Declarative WebMCP: annotated forms
    const declarative = [];
    const nodes = document.querySelectorAll(
      'form[toolname], form[toolName], form[tooldescription], form[toolDescription], [toolname], [toolName]',
    );
    for (const el of nodes) {
      const name =
        el.getAttribute('toolname') ||
        el.getAttribute('toolName') ||
        el.getAttribute('data-toolname');
      if (!name) continue;
      const description =
        el.getAttribute('tooldescription') ||
        el.getAttribute('toolDescription') ||
        el.getAttribute('data-tooldescription') ||
        '';
      const properties = {};
      const required = [];
      for (const control of el.querySelectorAll('input[name], select[name], textarea[name]')) {
        const key = control.getAttribute('name');
        if (!key || properties[key]) continue;
        const type =
          control.tagName === 'SELECT'
            ? 'string'
            : control.getAttribute('type') === 'number'
              ? 'number'
              : control.getAttribute('type') === 'checkbox'
                ? 'boolean'
                : 'string';
        properties[key] = {
          type,
          description: control.getAttribute('aria-label') || control.getAttribute('placeholder') || '',
        };
        if (control.required) required.push(key);
      }
      declarative.push({
        name: String(name),
        description: String(description),
        inputSchema: { type: 'object', properties, required, additionalProperties: false },
        outputSchema: null,
      });
    }

    const merged = new Map();
    for (const t of [...(scan.tools || []), ...(fromApi || []), ...declarative]) {
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

    const origin = window.location.origin;
    const navLinks = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      const text = (a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!href || !text || text.length < 2) continue;
      try {
        const u = new URL(href, origin);
        if (u.origin !== origin) continue;
        if (/\.(css|js|png|jpe?g|gif|svg|webp|ico|pdf)$/i.test(u.pathname)) continue;
        navLinks.push({ path: `${u.pathname}${u.search}` || '/', text });
      } catch {
        /* ignore */
      }
    }

    const searchInputs = [];
    for (const el of document.querySelectorAll(
      'input[type="search"], input[name*="search" i], input[id*="search" i], [role="search"] input',
    )) {
      searchInputs.push({
        name: el.getAttribute('name') || el.getAttribute('id') || 'search',
        placeholder: el.getAttribute('placeholder') || '',
        aria_label: el.getAttribute('aria-label') || '',
      });
    }

    const formSignals = [];
    for (const form of document.querySelectorAll('form')) {
      const hasTool =
        form.getAttribute('toolname') ||
        form.getAttribute('toolName') ||
        form.getAttribute('data-toolname');
      const action = form.getAttribute('action') || '';
      const method = (form.getAttribute('method') || 'get').toLowerCase();
      const fields = [];
      for (const control of form.querySelectorAll('input[name], select[name], textarea[name]')) {
        const key = control.getAttribute('name');
        if (!key || key.startsWith('_')) continue;
        fields.push({
          name: key,
          type:
            control.tagName === 'SELECT'
              ? 'string'
              : control.getAttribute('type') === 'email'
                ? 'string'
                : control.getAttribute('type') === 'number'
                  ? 'number'
                  : control.getAttribute('type') === 'checkbox'
                    ? 'boolean'
                    : 'string',
          placeholder: control.getAttribute('placeholder') || '',
          required: Boolean(control.required),
        });
      }
      if (!fields.length && !hasTool) continue;
      const legend =
        form.getAttribute('aria-label') ||
        form.querySelector('legend')?.textContent?.trim() ||
        form.id ||
        '';
      formSignals.push({
        id: form.id || '',
        action,
        method,
        legend: String(legend).slice(0, 120),
        fields: fields.slice(0, 12),
        has_declarative_tool: Boolean(hasTool),
      });
    }

    const headings = Array.from(document.querySelectorAll('h1, h2'))
      .map((h) => (h.textContent || '').trim().replace(/\s+/g, ' '))
      .filter((t) => t.length >= 2)
      .slice(0, 8);

    const buttons = Array.from(
      document.querySelectorAll('button, input[type="submit"], [role="button"]'),
    )
      .map((el) => (el.textContent || el.getAttribute('value') || '').trim().replace(/\s+/g, ' '))
      .filter((t) => t.length >= 2 && t.length <= 80)
      .slice(0, 12);

    return {
      tools: [...merged.values()],
      title: document.title || '',
      description:
        document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      anchors,
      signals: {
        nav_links: navLinks.slice(0, 24),
        search_inputs: searchInputs.slice(0, 4),
        forms: formSignals.slice(0, 6),
        headings,
        buttons,
      },
      native: Boolean(scan.native),
      bootError: scan.bootError || null,
      bootInstalled: Boolean(window.__INFLUZER_WEBMCP_SCAN__),
    };
  });
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
  // Preserve caller order; only reorder paths already present.
  const set = new Set(paths.filter(Boolean));
  const ordered = [];
  for (const p of paths) {
    if (!p || !set.has(p)) continue;
    if (ordered.includes(p)) continue;
    // Keep non-preferred (deep demo URLs) ahead of generic seeds.
    if (!preferred.includes(p)) {
      ordered.push(p);
      set.delete(p);
    }
  }
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
    // Use a normal Chrome UA — some sites gate scripts on bot-looking agents.
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 InfluzerWebMcpScanner/1.1 (+https://www.influzer.ai/webmcp/about)',
    );
    await page.setViewport({ width: 1280, height: 800 });
    // IMPORTANT: pass the script string, not the factory function.
    await page.evaluateOnNewDocument(captureBootstrap());

    // Start at the submitted path (demo hubs are often deep), then crawl.
    const startPath =
      normalizePagePath(safe.href, safe.origin) ||
      (() => {
        try {
          const u = new URL(safe.href);
          return `${u.pathname}${u.search}` || '/';
        } catch {
          return '/';
        }
      })();
    const seed = startPath === '/' ? ['/'] : [startPath, '/'];
    const queue = prioritizePaths(seed);
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

        // Poll briefly — SPAs often register tools after hydration.
        pageResult = await collectFromPage(page);
        if (!(pageResult.tools || []).length) {
          for (let i = 0; i < 3 && !(pageResult.tools || []).length; i += 1) {
            await new Promise((r) => setTimeout(r, 700));
            pageResult = await collectFromPage(page);
          }
        }

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
            // Prefer paths that look like WebMCP demos / tool hosts
            if (/webmcp|theme|demo|tool|agent|mcp/i.test(p)) queue.unshift(p);
            else queue.push(p);
          }
        }

        // Seed useful first-party paths even if not linked (after discovered links)
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
          description: pageResult.description || '',
          tool_count: (pageResult.tools || []).length,
          native_webmcp: pageResult.native,
          signals: pageResult.signals || null,
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

    const siteSignals = aggregatePageSignals(pages);

    return {
      ok: true,
      host: safe.host,
      canonical_url: safe.canonical,
      site_signals: siteSignals,
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

function aggregatePageSignals(pages = []) {
  const navByPath = new Map();
  const searchInputs = [];
  const forms = [];
  const headings = [];
  const buttons = new Set();

  for (const page of pages) {
    if (!page.ok || !page.signals) continue;
    const sig = page.signals;
    for (const link of sig.nav_links || []) {
      if (!navByPath.has(link.path)) navByPath.set(link.path, { ...link, page_url: page.path });
    }
    for (const s of sig.search_inputs || []) {
      searchInputs.push({ ...s, page_url: page.path });
    }
    for (const f of sig.forms || []) {
      forms.push({ ...f, page_url: page.path });
    }
    for (const h of sig.headings || []) headings.push(h);
    for (const b of sig.buttons || []) buttons.add(b);
  }

  return {
    nav_links: [...navByPath.values()].slice(0, 32),
    search_inputs: searchInputs.slice(0, 8),
    forms: forms.slice(0, 12),
    headings: [...new Set(headings)].slice(0, 12),
    buttons: [...buttons].slice(0, 16),
  };
}

module.exports = {
  scanWebsite,
  aggregatePageSignals,
  CHROME_PATH,
  MAX_PAGES,
};
