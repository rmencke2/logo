/**
 * Influzer.ai WebMCP provider
 * Registers document.modelContext tools for the MCP + WebMCP directories.
 * Spec: https://github.com/webmachinelearning/webmcp
 *
 * On browsers without native WebMCP, installs a local demo polyfill so
 * /webmcp/demo and getTools()/executeTool() still work for testing.
 */
(function () {
  'use strict';

  const API = {
    stats: '/api/webmcp/v1/stats',
    sites: '/api/webmcp/v1/sites',
    site: (host) => `/api/webmcp/v1/sites/${encodeURIComponent(host)}`,
    tools: '/api/webmcp/v1/tools',
    insights: '/api/insights/recent',
    mcpSearch: '/api/mcp/search',
    mcpServer: (slug) => `/api/mcp/server/${encodeURIComponent(slug)}`,
    scans: '/api/webmcp/v1/scans',
    scan: (id) => `/api/webmcp/v1/scans/${encodeURIComponent(id)}`,
    scanStarter: (id) => `/api/webmcp/v1/scans/${encodeURIComponent(id)}/starter`,
    selfTools: '/api/webmcp/v1/self',
  };

  function textResult(payload) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    return {
      content: [{ type: 'text', text }],
      structuredContent: typeof payload === 'string' ? { text: payload } : payload,
    };
  }

  async function getJson(url) {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status} for ${url}: ${body.slice(0, 180)}`);
    }
    return res.json();
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      const msg = data.message || data.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function coerceHttpsUrl(input) {
    let raw = String(input || '').trim().replace(/^['"]|['"]$/g, '');
    if (!raw) return '';
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
      raw = `https://${raw.replace(/^\/+/, '')}`;
    }
    return raw;
  }

  function clampInt(value, fallback, min, max) {
    const n = Number.parseInt(String(value ?? fallback), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function safePath(input) {
    const raw = String(input || '').trim();
    if (!raw.startsWith('/')) return null;
    if (raw.startsWith('//')) return null;
    if (raw.includes('://')) return null;
    if (raw.includes('\\')) return null;
    try {
      const u = new URL(raw, window.location.origin);
      if (u.origin !== window.location.origin) return null;
      return `${u.pathname}${u.search}`;
    } catch {
      return null;
    }
  }

  function safeExternalHost(host) {
    const h = String(host || '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split(':')[0];
    if (!h || !/^[a-z0-9.-]+\.[a-z]{2,24}$/i.test(h)) return null;
    if (h === 'localhost' || h.endsWith('.local') || h.includes('..')) return null;
    return h;
  }

  function safeExternalPath(input) {
    const raw = String(input || '/').trim() || '/';
    if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
    if (raw.includes('://') || raw.includes('\\')) return '/';
    return raw.split(/[\s#]/)[0] || '/';
  }

  const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'for', 'with', 'from', 'into', 'using', 'use', 'app', 'build',
    'building', 'need', 'want', 'that', 'this', 'my', 'our', 'your', 'agent', 'agents', 'mcp', 'webmcp',
  ]);

  function searchTermsFromGoal(goal) {
    const words = String(goal || '')
      .toLowerCase()
      .split(/[^a-z0-9+.#-]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
    const unique = [...new Set(words)];
    return unique.length ? unique : [String(goal || '').trim()].filter(Boolean);
  }

  const executors = {
    async get_influzer_overview() {
      return textResult({
        name: 'Influzer.ai',
        summary:
          'Influzer.ai catalogs MCP servers (backend AI integrations) and WebMCP websites (in-browser page tools for agents). Use recommend_agent_stack while building an app to shortlist both surfaces, search_webmcp_* for websites, search_mcp_servers/get_mcp_server for classic MCP, then open_webmcp_site to try a site in this tab.',
        urls: {
          home: 'https://www.influzer.ai/',
          mcp_directory: 'https://www.influzer.ai/mcp',
          webmcp_directory: 'https://www.influzer.ai/webmcp',
          webmcp_demo: 'https://www.influzer.ai/webmcp/demo',
          webmcp_challenge: 'https://www.influzer.ai/webmcp/challenge',
          webmcp_submit: 'https://www.influzer.ai/webmcp/submit',
          insights: 'https://www.influzer.ai/insights',
          standard: 'https://github.com/webmachinelearning/webmcp',
        },
        tip: 'Submit a new WebMCP site: start_webmcp_listing_scan (needs user email + user_confirmed:true), poll with get_webmcp_listing_scan, or open /webmcp/submit.',
      });
    },

    async get_webmcp_directory_stats() {
      const data = await getJson(API.stats);
      return textResult(data);
    },

    async search_webmcp_sites({ q = '', category = '', type = 'all', verified = 'any', limit = 10 } = {}) {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (category) params.set('category', category);
      if (type && type !== 'all') params.set('type', type);
      if (verified && verified !== 'any') params.set('verified', verified);
      params.set('limit', String(clampInt(limit, 10, 1, 25)));
      params.set('page', '1');
      const data = await getJson(`${API.sites}?${params}`);
      return textResult({
        total: data.total,
        returned: (data.sites || []).length,
        filters: data.filters,
        sites: (data.sites || []).map((s) => ({
          host: s.host,
          name: s.name,
          category: s.category,
          site_type: s.site_type,
          verification_status: s.verification_status,
          tool_count: s.tool_count,
          url: `https://www.influzer.ai/webmcp/sites/${s.host}`,
        })),
      });
    },

    async get_webmcp_site({ host, include_schemas = false } = {}) {
      if (!host) throw new Error('host is required');
      const data = await getJson(API.site(String(host).trim().toLowerCase().replace(/^www\./, '')));
      const site = data.site || {};
      const tools = (site.tools || []).map((t) => {
        const row = {
          name: t.name,
          description: t.description,
          kind: t.kind,
          page_url: t.page_url,
          implementation_type: t.implementation_type,
        };
        if (include_schemas) row.input_schema = t.input_schema;
        return row;
      });
      return textResult({
        host: site.host,
        name: site.name,
        description: site.description,
        category: site.category,
        site_type: site.site_type,
        verification_status: site.verification_status,
        tool_count: site.tool_count,
        directory_url: `https://www.influzer.ai/webmcp/sites/${site.host}`,
        canonical_url: site.canonical_url,
        tools,
        related: data.related || [],
      });
    },

    async search_webmcp_tools({ q = '', kind = 'any', host = '', limit = 15 } = {}) {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (kind && kind !== 'any') params.set('kind', kind);
      if (host) params.set('host', host);
      params.set('limit', String(clampInt(limit, 15, 1, 40)));
      params.set('page', '1');
      const data = await getJson(`${API.tools}?${params}`);
      return textResult({
        total: data.total,
        returned: (data.tools || []).length,
        tools: (data.tools || []).map((t) => ({
          name: t.name,
          host: t.host,
          kind: t.kind,
          description: t.description,
          page_url: t.page_url,
          site_url: t.host ? `https://www.influzer.ai/webmcp/sites/${t.host}` : null,
        })),
      });
    },

    async search_mcp_servers({ q, scope = 'top', limit = 10 } = {}) {
      if (!q) throw new Error('q is required');
      const params = new URLSearchParams({
        q: String(q),
        scope: scope === 'all' ? 'all' : 'top',
        limit: String(clampInt(limit, 10, 1, 25)),
      });
      const data = await getJson(`${API.mcpSearch}?${params}`);
      return textResult(data);
    },

    async get_mcp_server({ slug, include_tools = true } = {}) {
      if (!slug) throw new Error('slug is required');
      const data = await getJson(API.mcpServer(String(slug).trim().toLowerCase()));
      if (!data.ok) throw new Error(data.error || 'server not found');
      const server = data.server || {};
      if (!include_tools) {
        delete server.tools;
        delete server.top_tools;
      }
      return textResult(server);
    },

    async recommend_agent_stack({ goal, limit = 5, include_tool_details = false } = {}) {
      if (!goal) throw new Error('goal is required');
      const perLimit = clampInt(limit, 5, 1, 8);
      const terms = searchTermsFromGoal(goal);
      const primary = terms.slice(0, 4).join(' ') || String(goal).trim();

      const [webmcpSitesRes, webmcpToolsRes, mcpRes] = await Promise.all([
        getJson(`${API.sites}?${new URLSearchParams({ q: primary, limit: String(perLimit), page: '1' })}`),
        getJson(`${API.tools}?${new URLSearchParams({ q: primary, limit: String(perLimit * 2), page: '1' })}`),
        getJson(`${API.mcpSearch}?${new URLSearchParams({ q: primary, scope: 'all', limit: String(perLimit) })}`),
      ]);

      const siteRows = (webmcpSitesRes.sites || []).map((s) => ({
        host: s.host,
        name: s.name,
        category: s.category,
        site_type: s.site_type,
        tool_count: s.tool_count,
        verification_status: s.verification_status,
        directory_url: `https://www.influzer.ai/webmcp/sites/${s.host}`,
        live_url: s.canonical_url || `https://${s.host}/`,
      }));

      if (include_tool_details && siteRows.length) {
        await Promise.all(
          siteRows.slice(0, 3).map(async (row) => {
            try {
              const detail = await getJson(API.site(row.host));
              row.sample_tools = (detail.site?.tools || []).slice(0, 6).map((t) => ({
                name: t.name,
                kind: t.kind,
                description: String(t.description || '').slice(0, 120),
              }));
            } catch {
              row.sample_tools = [];
            }
          }),
        );
      }

      const toolRows = (webmcpToolsRes.tools || []).slice(0, perLimit * 2).map((t) => ({
        name: t.name,
        host: t.host,
        kind: t.kind,
        description: String(t.description || '').slice(0, 160),
        site_url: t.host ? `https://www.influzer.ai/webmcp/sites/${t.host}` : null,
      }));

      const mcpRows = (mcpRes.servers || []).map((s) => ({
        slug: s.slug,
        name: s.name,
        category: s.category,
        transport: s.transport,
        tool_count: s.tool_count,
        tools: (s.tools || []).slice(0, 6),
        page_url: s.url || `https://www.influzer.ai/mcp/${s.slug}`,
      }));

      return textResult({
        goal: String(goal).trim(),
        query_used: primary,
        search_terms: terms,
        summary:
          'WebMCP sites expose in-browser tools via document.modelContext; classic MCP servers are backend integrations for Cursor/Claude Desktop. Combine both while building: WebMCP for user-facing flows in the browser, MCP servers for repo/data/API work.',
        webmcp_sites: siteRows,
        webmcp_tools: toolRows,
        mcp_servers: mcpRows,
        suggested_workflow: [
          'Confirm the goal with the user (what the app should do end-to-end).',
          'Pick one WebMCP site for browser-native actions (cart, booking, forms) — call get_webmcp_site for schemas.',
          'Pick classic MCP servers for backend work (database, GitHub, scrape) — call get_mcp_server for install steps.',
          'Use open_webmcp_site after the user chooses a site to try its tools in this tab.',
          'Wire chosen MCP servers into the project config (.cursor/mcp.json or Claude connectors).',
        ],
        next_tool_calls: [
          { tool: 'get_webmcp_site', example: { host: siteRows[0]?.host, include_schemas: true } },
          { tool: 'get_mcp_server', example: { slug: mcpRows[0]?.slug } },
          { tool: 'open_webmcp_site', example: { host: siteRows[0]?.host } },
        ].filter((row) => row.example.host || row.example.slug),
      });
    },

    async open_webmcp_site({ host, path = '/' } = {}) {
      const safeHost = safeExternalHost(host);
      if (!safeHost) throw new Error('host must be a valid public hostname');
      const safePathPart = safeExternalPath(path);
      const target = `https://${safeHost}${safePathPart}`;
      setTimeout(() => {
        window.location.assign(target);
      }, 50);
      return textResult({
        ok: true,
        navigated_to: target,
        host: safeHost,
        message: `Navigating this tab to ${target} — the destination site may expose its own WebMCP tools via document.modelContext.`,
        influzer_listing: `https://www.influzer.ai/webmcp/sites/${safeHost}`,
      });
    },

    async start_webmcp_listing_scan({
      url,
      email,
      user_confirmed,
      relationship = 'owner',
      newsletter = true,
    } = {}) {
      if (!user_confirmed) {
        throw new Error(
          'user_confirmed must be true — ask the user to explicitly approve submitting their URL and email before calling this tool.',
        );
      }
      const safeUrl = coerceHttpsUrl(url);
      const safeEmail = String(email || '').trim().toLowerCase();
      if (!safeUrl) throw new Error('url is required');
      if (!safeEmail.includes('@')) throw new Error('a valid email is required');

      const data = await postJson(API.scans, {
        url: safeUrl,
        email: safeEmail,
        relationship: String(relationship || 'owner').slice(0, 40),
        newsletter: newsletter !== false,
      });

      const scan = data.scan || {};
      return textResult({
        ok: true,
        scan_id: scan.id,
        host: scan.host,
        url: scan.url,
        status: scan.status,
        message:
          'Scan started. Poll get_webmcp_listing_scan with scan_id every few seconds until status is completed or failed. A report is emailed when finished; sites with detected tools may be listed in the directory.',
        submit_page: scan.id
          ? `https://www.influzer.ai/webmcp/submit?scan=${encodeURIComponent(scan.id)}`
          : 'https://www.influzer.ai/webmcp/submit',
        next_tool_call: { tool: 'get_webmcp_listing_scan', scan_id: scan.id },
      });
    },

    async get_webmcp_listing_scan({ scan_id } = {}) {
      const id = String(scan_id || '').trim();
      if (!id) throw new Error('scan_id is required');
      const data = await getJson(API.scan(id));
      const scan = data.scan || {};
      const terminal = scan.status === 'completed' || scan.status === 'failed';
      return textResult({
        scan_id: scan.id,
        host: scan.host,
        url: scan.url,
        status: scan.status,
        progress: scan.progress,
        scorecard: scan.scorecard
          ? {
              score: scan.scorecard.score,
              grade: scan.scorecard.grade || scan.scorecard.readiness,
              label: scan.scorecard.label,
              summary: scan.scorecard.summary,
            }
          : null,
        tool_count: scan.result?.tool_count || 0,
        tools: (scan.result?.tools || []).slice(0, 12),
        published: Boolean(scan.published),
        directory_url: scan.directory_url,
        submit_page: `https://www.influzer.ai/webmcp/submit?scan=${encodeURIComponent(id)}`,
        starter: scan.starter || null,
        error: scan.error || null,
        terminal,
        poll_again: !terminal,
        newsletter_subscribed: Boolean(scan.newsletter_subscribed),
        next_tool_call: terminal && scan.starter
          ? { tool: 'generate_webmcp_starter_code', scan_id: scan.id }
          : null,
      });
    },

    async generate_webmcp_starter_code({ scan_id } = {}) {
      const id = String(scan_id || '').trim();
      if (!id) throw new Error('scan_id is required — run start_webmcp_listing_scan first');
      const data = await getJson(API.scanStarter(id));
      const starter = data.starter || {};
      return textResult({
        scan_id: id,
        host: starter.host,
        estimated_grade_after: starter.estimated_grade_after,
        tool_count: starter.tool_count,
        tools_suggested: starter.tools_suggested,
        install_steps: starter.install_steps,
        starter_js: starter.starter_js,
        html_snippet: starter.html_snippet,
        message:
          'Copy starter_js into your site before </body>, then rescan at influzer.ai/webmcp/submit to refresh your Agent Readiness grade.',
      });
    },

    async list_latest_insights({ limit = 5 } = {}) {
      const data = await getJson(`${API.insights}?limit=${clampInt(limit, 5, 1, 12)}`);
      const posts = Array.isArray(data) ? data : data.recent || data.posts || [];
      return textResult({
        count: posts.length,
        insights: posts.map((p) => ({
          title: p.title,
          slug: p.slug,
          excerpt: p.excerpt,
          date: p.date,
          url: `https://www.influzer.ai/insights/${p.slug}`,
          tags: p.tags || [],
        })),
      });
    },

    async navigate_influzer({ path } = {}) {
      const safe = safePath(path);
      if (!safe) {
        throw new Error('path must be a same-origin Influzer path starting with /');
      }
      const href = safe;
      // Defer so the tool result can return to the agent before navigation.
      setTimeout(() => {
        window.location.assign(href);
      }, 50);
      return textResult({
        ok: true,
        navigated_to: href,
        message: `Navigating this tab to ${href}`,
      });
    },
  };

  function installDemoPolyfill() {
    if (document.modelContext) {
      return { polyfill: false, native: true };
    }

    const registry = new Map();

    const modelContext = {
      async registerTool(def, options = {}) {
        if (!def || !def.name) throw new TypeError('registerTool requires a name');
        const entry = {
          name: def.name,
          description: def.description || '',
          inputSchema: def.inputSchema || { type: 'object' },
          execute: def.execute,
          origin: window.location.origin,
          window,
          _signal: options.signal || null,
        };
        registry.set(def.name, entry);
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            registry.delete(def.name);
          });
        }
        return undefined;
      },
      async getTools(options = {}) {
        const fromOrigins = options.fromOrigins;
        const tools = [...registry.values()].map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          origin: t.origin,
          window: t.window,
        }));
        if (!fromOrigins || !fromOrigins.length) return tools;
        return tools.filter((t) => fromOrigins.includes(t.origin));
      },
      async executeTool(tool, args = {}, options = {}) {
        const name = typeof tool === 'string' ? tool : tool?.name;
        const entry = registry.get(name);
        if (!entry) throw new Error(`Unknown tool: ${name}`);
        if (typeof entry.execute !== 'function') throw new Error(`Tool ${name} has no execute handler`);
        const signal = options.signal;
        if (signal?.aborted) {
          const err = new DOMException('Aborted', 'AbortError');
          throw err;
        }
        return entry.execute(args || {}, { signal });
      },
      __influzerPolyfill: true,
      __registry: registry,
    };

    try {
      Object.defineProperty(document, 'modelContext', {
        configurable: true,
        enumerable: true,
        value: modelContext,
      });
    } catch {
      document.modelContext = modelContext;
    }

    return { polyfill: true, native: false };
  }

  async function loadToolDefs() {
    try {
      const data = await getJson(API.selfTools);
      return Array.isArray(data.tools) ? data.tools : [];
    } catch (err) {
      console.warn('[influzer-webmcp] failed to load tool defs', err);
      return Object.keys(executors).map((name) => ({
        name,
        description: `Influzer tool ${name}`,
        input_schema: { type: 'object' },
      }));
    }
  }

  async function registerAll() {
    const mode = installDemoPolyfill();
    if (!document.modelContext || typeof document.modelContext.registerTool !== 'function') {
      console.info('[influzer-webmcp] document.modelContext unavailable');
      window.__INFLUZER_WEBMCP__ = { ok: false, reason: 'unavailable', ...mode };
      return window.__INFLUZER_WEBMCP__;
    }

    const defs = await loadToolDefs();
    const registered = [];
    const skipped = [];

    for (const def of defs) {
      const name = def.name;
      const execute = executors[name];
      if (!execute) {
        skipped.push(name);
        continue;
      }
      try {
        await document.modelContext.registerTool({
          name,
          description: def.description || '',
          inputSchema: def.input_schema || def.inputSchema || { type: 'object' },
          async execute(args, options) {
            return execute(args || {}, options || {});
          },
        });
        registered.push(name);
      } catch (err) {
        console.warn(`[influzer-webmcp] registerTool failed for ${name}:`, err);
        skipped.push(name);
      }
    }

    window.__INFLUZER_WEBMCP__ = {
      ok: true,
      registered,
      skipped,
      polyfill: Boolean(mode.polyfill),
      native: Boolean(mode.native) && !mode.polyfill,
      checked_at: new Date().toISOString(),
    };

    document.dispatchEvent(
      new CustomEvent('influzer-webmcp-ready', { detail: window.__INFLUZER_WEBMCP__ }),
    );

    return window.__INFLUZER_WEBMCP__;
  }

  window.InfluzerWebMCP = {
    register: registerAll,
    executors,
    installDemoPolyfill,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      registerAll().catch((err) => console.error('[influzer-webmcp]', err));
    });
  } else {
    registerAll().catch((err) => console.error('[influzer-webmcp]', err));
  }
})();
