/**
 * Directory filters and sorts. Shared by the directory page and Node tests.
 * Filters combine with AND. Missing measurements are not treated as zero.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.mcpDirectoryQuery = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const STATUS_VALUES = ['live_ok', 'auth_required', 'unreachable', 'not_probed', 'local_unprobed'];
  const QUALITY_VALUES = ['all', 'ready', 'indexed', 'probed', 'auth_required', 'thin', 'unverified'];
  const SORT_VALUES = [
    'stars',
    'popular',
    'quality',
    'name',
    'tools',
    'official',
    'views',
    'verified',
    'latency',
    'added',
    'grade',
  ];
  const DAY_MS = 24 * 60 * 60 * 1000;

  function one(value) {
    if (Array.isArray(value)) return value.length ? String(value[0]) : '';
    return value == null ? '' : String(value);
  }

  function parseDirectoryQuery(input) {
    const src = input || {};
    const status = one(src.status).trim();
    const verified = one(src.verified).trim();
    const auth = one(src.auth).trim();
    const transport = one(src.transport).trim();
    const quality = one(src.quality).trim().toLowerCase();
    const sort = one(src.sort).trim();
    const tools = one(src.tools).trim();
    const category = one(src.category).trim();
    return {
      q: one(src.q).trim(),
      category: category || 'All',
      status: STATUS_VALUES.indexOf(status) >= 0 ? status : '',
      verified: verified === '7' || verified === '30' ? verified : '',
      auth: auth === 'yes' || auth === 'no' ? auth : '',
      transport: transport === 'remote' || transport === 'local' ? transport : '',
      quality: QUALITY_VALUES.indexOf(quality) >= 0 ? quality : 'all',
      sort: SORT_VALUES.indexOf(sort) >= 0 ? sort : 'stars',
      toolsOnly: tools === '0' ? false : tools === '1' ? true : null,
    };
  }

  function toQueryString(state, opts) {
    const includeTools = Boolean(opts && opts.includeTools);
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category && state.category !== 'All') params.set('category', state.category);
    if (state.status) params.set('status', state.status);
    if (state.verified) params.set('verified', state.verified);
    if (state.auth) params.set('auth', state.auth);
    if (state.transport) params.set('transport', state.transport);
    if (state.quality && state.quality !== 'all') params.set('quality', state.quality);
    if (state.sort && state.sort !== 'stars') params.set('sort', state.sort);
    if (includeTools && state.toolsOnly === false) params.set('tools', '0');
    return params.toString();
  }

  function directoryQueryIsFiltered(input) {
    const state = parseDirectoryQuery(input || {});
    if (state.q) return true;
    if (state.category && state.category !== 'All') return true;
    if (state.status || state.verified || state.auth || state.transport) return true;
    if (state.quality && state.quality !== 'all') return true;
    if (state.sort && state.sort !== 'stars') return true;
    if (state.toolsOnly === false) return true;
    return false;
  }

  function probedWithin(iso, now, days) {
    const at = Date.parse(iso || '');
    const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
    if (!Number.isFinite(at) || !Number.isFinite(nowMs)) return false;
    const age = nowMs - at;
    return age >= 0 && age <= days * DAY_MS;
  }

  function isRemoteServer(server) {
    if (server && server.isRemote === true) return true;
    if (server && server.isRemote === false) return false;
    const transport = String((server && server.transport) || '').toLowerCase();
    if (transport === 'http' || transport === 'sse') return true;
    if (server && (server.mcp_endpoint || server.deployment_url || server.connection_url)) return true;
    return false;
  }

  function matchesQuality(server, quality) {
    if (!quality || quality === 'all') return true;
    const q = (server && server.quality) || {};
    if (quality === 'indexed') return Boolean(q.tools_indexed) || (server.tools && server.tools.length);
    if (quality === 'ready') return q.demoware_tier === 'ready';
    if (quality === 'thin') return q.demoware_tier === 'thin';
    if (quality === 'unverified') return q.demoware_tier === 'unverified';
    if (quality === 'probed') {
      return q.live_status === 'live_ok' || q.live_status === 'auth_required' || q.live_status === 'unreachable';
    }
    if (quality === 'auth_required') return q.live_status === 'auth_required' || q.auth_gate === 'required';
    return true;
  }

  function matchesDirectoryFilters(server, filters, now) {
    const q = (server && server.quality) || {};
    if (filters.category && filters.category !== 'All' && server.category !== filters.category) return false;
    if (filters.toolsOnly && !(server.tools && server.tools.length)) return false;
    if (filters.status && q.live_status !== filters.status) return false;
    if (filters.verified && !probedWithin(q.probed_at, now, Number(filters.verified))) return false;
    if (filters.auth === 'yes' && !(q.live_status === 'auth_required' || q.auth_gate === 'required')) return false;
    if (filters.auth === 'no' && (q.live_status === 'auth_required' || q.auth_gate === 'required')) return false;
    if (filters.transport === 'remote' && !isRemoteServer(server)) return false;
    if (filters.transport === 'local' && isRemoteServer(server)) return false;
    if (!matchesQuality(server, filters.quality)) return false;
    const needle = String(filters.q || '').trim().toLowerCase();
    if (!needle) return true;
    if (String(server.name || '').toLowerCase().indexOf(needle) >= 0) return true;
    if (String(server.description || '').toLowerCase().indexOf(needle) >= 0) return true;
    if (String(server.category || '').toLowerCase().indexOf(needle) >= 0) return true;
    return (server.tools || []).some(function (tool) {
      return (
        String(tool.name || tool || '').toLowerCase().indexOf(needle) >= 0 ||
        String(tool.description || '').toLowerCase().indexOf(needle) >= 0
      );
    });
  }

  function byName(a, b) {
    return String(a.name || '').localeCompare(String(b.name || ''));
  }

  function tierRank(tier) {
    if (tier === 'ready') return 4;
    if (tier === 'indexed') return 3;
    if (tier === 'thin') return 2;
    return 1;
  }

  function catalogHasViews(servers) {
    return (servers || []).some(function (server) {
      return typeof server.views_7d === 'number' && Number.isFinite(server.views_7d);
    });
  }

  function catalogHasLatency(servers) {
    return (servers || []).some(function (server) {
      return typeof server.latency_ms === 'number' && Number.isFinite(server.latency_ms);
    });
  }

  function sortDirectory(list, sort, opts) {
    const copy = (list || []).slice();
    const options = opts || {};
    const viewsAvailable = options.viewsAvailable != null ? options.viewsAvailable : catalogHasViews(copy);
    const latencyAvailable = options.latencyAvailable != null ? options.latencyAvailable : catalogHasLatency(copy);
    if (sort === 'stars' || sort === 'popular') {
      return copy.sort(function (a, b) {
        return (b.stars || 0) - (a.stars || 0) || byName(a, b);
      });
    }
    if (sort === 'tools') {
      return copy.sort(function (a, b) {
        return ((b.tools && b.tools.length) || 0) - ((a.tools && a.tools.length) || 0) || byName(a, b);
      });
    }
    if (sort === 'official') {
      return copy.sort(function (a, b) {
        if (Boolean(a.official) !== Boolean(b.official)) return a.official ? -1 : 1;
        return byName(a, b);
      });
    }
    if (sort === 'quality') {
      return copy.sort(function (a, b) {
        const ta = tierRank(a.quality && a.quality.demoware_tier);
        const tb = tierRank(b.quality && b.quality.demoware_tier);
        if (tb !== ta) return tb - ta;
        return ((b.tools && b.tools.length) || 0) - ((a.tools && a.tools.length) || 0);
      });
    }
    if (sort === 'name') return copy.sort(byName);
    if (sort === 'views') {
      if (!viewsAvailable) return copy;
      return copy.sort(function (a, b) {
        return (b.views_7d || 0) - (a.views_7d || 0) || byName(a, b);
      });
    }
    if (sort === 'verified') {
      return copy.sort(function (a, b) {
        const ta = Date.parse((a.quality && a.quality.probed_at) || '') || 0;
        const tb = Date.parse((b.quality && b.quality.probed_at) || '') || 0;
        return tb - ta || byName(a, b);
      });
    }
    if (sort === 'latency') {
      if (!latencyAvailable) return copy;
      return copy.sort(function (a, b) {
        const la = typeof a.latency_ms === 'number' ? a.latency_ms : Infinity;
        const lb = typeof b.latency_ms === 'number' ? b.latency_ms : Infinity;
        return la - lb || byName(a, b);
      });
    }
    if (sort === 'added') {
      return copy.sort(function (a, b) {
        return String(b.last_updated || '').localeCompare(String(a.last_updated || '')) || byName(a, b);
      });
    }
    if (sort === 'grade') {
      return copy.sort(function (a, b) {
        const ga = (a.quality && a.quality.verification_grade) || 0;
        const gb = (b.quality && b.quality.verification_grade) || 0;
        return gb - ga || byName(a, b);
      });
    }
    return copy.sort(byName);
  }

  function applyViewCounts(servers, counts) {
    if (!counts || typeof counts !== 'object') {
      return { servers: servers || [], viewsAvailable: false };
    }
    return {
      viewsAvailable: true,
      servers: (servers || []).map(function (server) {
        const views = Number(counts[server.slug]);
        return Object.assign({}, server, { views_7d: Number.isFinite(views) ? views : 0 });
      }),
    };
  }

  function captionKey(sort, opts) {
    const options = opts || {};
    if (sort === 'views' && !options.viewsAvailable) return 'viewsUnavailable';
    if (sort === 'latency' && !options.latencyAvailable) return 'latencyNone';
    if (sort === 'popular') return 'stars';
    return sort || 'stars';
  }

  function applyDirectoryQuery(servers, rawFilters, opts) {
    const options = opts || {};
    const filters = parseDirectoryQuery(rawFilters || {});
    if (filters.toolsOnly == null && options.toolsOnlyDefault != null) {
      filters.toolsOnly = Boolean(options.toolsOnlyDefault);
    }
    const now = options.now || new Date();
    const viewsAvailable = options.viewsAvailable != null ? options.viewsAvailable : catalogHasViews(servers);
    const latencyAvailable = options.latencyAvailable != null ? options.latencyAvailable : catalogHasLatency(servers);
    const matched = [];
    (servers || []).forEach(function (server) {
      if (matchesDirectoryFilters(server, filters, now)) matched.push(server);
    });
    return {
      filters: filters,
      total: matched.length,
      servers: sortDirectory(matched, filters.sort, { viewsAvailable: viewsAvailable, latencyAvailable: latencyAvailable }),
      viewsAvailable: viewsAvailable,
      latencyAvailable: latencyAvailable,
      captionKey: captionKey(filters.sort, { viewsAvailable: viewsAvailable, latencyAvailable: latencyAvailable }),
    };
  }

  function emptyDirectoryMessage(filters, scope) {
    const searching = Boolean(filters && String(filters.q || '').trim());
    return {
      message: searching
        ? 'No servers match “' + String(filters.q).trim() + '”.'
        : 'No servers match these filters.',
      hint:
        scope === 'top'
          ? 'Clear a filter, search the full directory, or submit the server if it should be listed.'
          : 'Clear a filter, or submit the server if it should be listed.',
      submitHref: '/mcp/submit',
      submitLabel: 'Submit an MCP server',
    };
  }

  return {
    STATUS_VALUES: STATUS_VALUES,
    parseDirectoryQuery: parseDirectoryQuery,
    toQueryString: toQueryString,
    directoryQueryIsFiltered: directoryQueryIsFiltered,
    matchesDirectoryFilters: matchesDirectoryFilters,
    sortDirectory: sortDirectory,
    applyViewCounts: applyViewCounts,
    captionKey: captionKey,
    applyDirectoryQuery: applyDirectoryQuery,
    emptyDirectoryMessage: emptyDirectoryMessage,
    catalogHasViews: catalogHasViews,
    catalogHasLatency: catalogHasLatency,
  };
});
