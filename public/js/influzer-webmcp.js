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
    mcpServer: (slug) => `/api/mcp/servers/${encodeURIComponent(slug)}`,
    mcpBest: '/api/mcp/best',
    mcpBestClient: (slug) => `/api/mcp/best/${encodeURIComponent(slug)}`,
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

  function mcpSlugFromPath() {
    const match = window.location.pathname.match(/^\/mcp\/([^/]+)\/?$/);
    if (!match) return null;
    const slug = decodeURIComponent(match[1]);
    // Reserved directory paths are not server detail pages.
    if (
      ['all', 'best', 'topics', 'categories', 'compare', 'submit', 'discovery', 'my-listings'].includes(
        slug,
      )
    ) {
      return null;
    }
    return slug;
  }

  function bestClientSlugFromPath() {
    const match = window.location.pathname.match(/^\/mcp\/best\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function pageMcpServer() {
    const ctx = window.__INFLUZER_MCP_SERVER__;
    return ctx && ctx.slug ? ctx : null;
  }

  function pageBestClient() {
    const ctx = window.__INFLUZER_BEST_CLIENT__;
    return ctx && ctx.slug ? ctx : null;
  }

  function mcpConnectionText(server) {
    if (!server) return null;
    return (
      server.install_command ||
      server.connection_url ||
      server.mcp_endpoint ||
      null
    );
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  const executors = {
    async get_influzer_overview() {
      return textResult({
        name: 'Influzer.ai',
        summary:
          'Influzer.ai catalogs MCP servers (backend AI integrations) and WebMCP websites (in-browser page tools for agents). Use search_webmcp_* for websites with document.modelContext tools, and search_mcp_servers for classic MCP servers.',
        urls: {
          home: 'https://www.influzer.ai/',
          mcp_directory: 'https://www.influzer.ai/mcp',
          best_for_claude: 'https://www.influzer.ai/mcp/best/claude',
          webmcp_directory: 'https://www.influzer.ai/webmcp',
          webmcp_demo: 'https://www.influzer.ai/webmcp/demo',
          insights: 'https://www.influzer.ai/insights',
          standard: 'https://github.com/webmachinelearning/webmcp',
        },
        tip: 'On /mcp/best/claude use get_current_best_mcp_client. On /mcp/{slug} use get_current_mcp_server. Open /webmcp/demo to try tools interactively.',
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

    async get_mcp_server({ slug } = {}) {
      const id = String(slug || '').trim().toLowerCase();
      if (!id) throw new Error('slug is required');
      const data = await getJson(API.mcpServer(id));
      return textResult(data);
    },

    async get_current_mcp_server({ slug } = {}) {
      const page = pageMcpServer();
      const id = String(slug || page?.slug || mcpSlugFromPath() || '')
        .trim()
        .toLowerCase();
      if (page && (!slug || page.slug === id)) {
        return textResult({ source: 'page', server: page });
      }
      if (!id) {
        throw new Error('Not on an MCP server detail page. Pass slug or open /mcp/{slug}.');
      }
      const data = await getJson(API.mcpServer(id));
      return textResult({ source: 'api', ...data });
    },

    async copy_mcp_connection({ slug } = {}) {
      const page = pageMcpServer();
      const id = String(slug || page?.slug || mcpSlugFromPath() || '')
        .trim()
        .toLowerCase();

      let server = null;
      let source = 'page';

      if (page && (!slug || page.slug === id)) {
        server = page;
      } else {
        if (!id) throw new Error('slug is required when not on a server detail page');
        source = 'api';
        const data = await getJson(API.mcpServer(id));
        if (!data.server) throw new Error(data.error || `No server found for slug "${id}"`);
        server = data.server;
      }

      const connection = mcpConnectionText(server);
      if (!connection) {
        throw new Error(
          `No install command or connection URL for ${server.name || server.slug}. Open GitHub or docs instead.`,
        );
      }

      await copyText(connection);
      return textResult({
        ok: true,
        source,
        server: server.name || server.slug,
        slug: server.slug,
        copied: connection,
        message: `Copied connection details for ${server.name || server.slug}`,
      });
    },

    async list_best_mcp_clients() {
      const data = await getJson(API.mcpBest);
      return textResult(data);
    },

    async get_best_mcp_client({ slug } = {}) {
      const id = String(slug || '').trim().toLowerCase();
      if (!id) throw new Error('slug is required (e.g. claude)');
      const data = await getJson(API.mcpBestClient(id));
      return textResult(data);
    },

    async get_current_best_mcp_client({ slug } = {}) {
      const page = pageBestClient();
      const id = String(slug || page?.slug || bestClientSlugFromPath() || '')
        .trim()
        .toLowerCase();
      if (page && (!slug || page.slug === id)) {
        return textResult({ source: 'page', client: page });
      }
      if (!id) {
        throw new Error('Not on a /mcp/best/{client} page. Pass slug (e.g. claude) or open the guide.');
      }
      const data = await getJson(API.mcpBestClient(id));
      return textResult({ source: 'api', ...data });
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
        let parsed = args;
        if (typeof args === 'string') {
          try {
            parsed = JSON.parse(args || '{}');
          } catch (err) {
            throw new Error(`Failed to parse input arguments: ${err.message}`);
          }
        }
        if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          parsed = {};
        }
        return entry.execute(parsed, { signal });
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
