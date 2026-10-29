/**
 * MCP directory page — search, filters, sort, pagination.
 * Filter and sort rules live in mcp-directory-query.js.
 */
(function () {
  const PAGE_SIZE = 60;
  const queryApi = window.mcpDirectoryQuery;
  const grid = document.getElementById('mcpGrid');
  if (!grid || typeof window.renderRegistryDirCard !== 'function' || !queryApi) return;

  const countEl = document.getElementById('mcpCount');
  const emptyEl = document.getElementById('mcpEmpty');
  const filtersEl = document.getElementById('mcpFilters');
  const qualityFiltersEl = document.getElementById('mcpQualityFilters');
  const clearBtn = document.getElementById('mcpClear');
  const clearEmptyBtn = document.getElementById('mcpClearEmpty');
  const loadingEl = document.getElementById('mcpLoading');
  const loadMoreBtn = document.getElementById('mcpLoadMore');
  const searchEl = document.getElementById('mcpSearch');
  const sortEl = document.getElementById('mcpSort');
  const sortCaptionEl = document.getElementById('mcpSortCaption');
  const statusEl = document.getElementById('mcpStatus');
  const verifiedEl = document.getElementById('mcpVerified');
  const authEl = document.getElementById('mcpAuth');
  const transportEl = document.getElementById('mcpTransport');
  const emptyTipEl = emptyEl ? emptyEl.querySelector('[data-empty-tip]') : null;
  const emptyHintEl = emptyEl ? emptyEl.querySelector('[data-empty-hint]') : null;
  const emptyBrowseEl = document.getElementById('mcpEmptyBrowse');
  let sortCaptions = {};
  if (sortCaptionEl) {
    try {
      sortCaptions = JSON.parse(sortCaptionEl.getAttribute('data-captions') || '{}');
    } catch (err) {
      sortCaptions = {};
    }
  }
  const toolsOnlyToggle = document.getElementById('mcpToolsOnly');
  const catalogScope = grid.dataset.scope || 'top';
  const defaultToolsOnly = grid.dataset.toolsOnly !== '0';
  const preferredCats = (grid.dataset.preferredCats || '')
    .split('|')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);

  const QUALITY_FILTERS = [
    { id: 'all', label: 'All quality' },
    { id: 'ready', label: 'Ready surface' },
    { id: 'indexed', label: 'Tools indexed' },
    { id: 'probed', label: 'Live probed' },
    { id: 'auth_required', label: 'Auth required' },
    { id: 'thin', label: 'Thin listing' },
    { id: 'unverified', label: 'Unverified' },
  ];

  const initial = queryApi.parseDirectoryQuery(
    Object.fromEntries(new URLSearchParams(window.location.search).entries()),
  );

  let data = { categories: [], servers: [] };
  let servers = [];
  let categories = ['All'];
  let visibleCount = PAGE_SIZE;
  let query = initial.q;
  let category = initial.category || 'All';
  let quality = initial.quality || 'all';
  let status = initial.status || '';
  let verified = initial.verified || '';
  let auth = initial.auth || '';
  let transport = initial.transport || '';
  let sort = initial.sort || (sortEl ? sortEl.value : 'stars');
  let toolsOnly = catalogScope === 'top' ? true : initial.toolsOnly == null ? defaultToolsOnly : initial.toolsOnly;
  let viewsAvailable = false;
  let filteredList = [];

  function currentFilters() {
    return {
      q: query,
      category: category,
      status: status,
      verified: verified,
      auth: auth,
      transport: transport,
      quality: quality,
      sort: sort,
      toolsOnly: toolsOnly,
    };
  }

  function syncControls() {
    if (searchEl) searchEl.value = query;
    if (sortEl) sortEl.value = sort;
    if (statusEl) statusEl.value = status;
    if (verifiedEl) verifiedEl.value = verified;
    if (authEl) authEl.value = auth;
    if (transportEl) transportEl.value = transport;
    if (toolsOnlyToggle) toolsOnlyToggle.checked = toolsOnly;
  }

  function writeUrl() {
    const qs = queryApi.toQueryString(currentFilters(), { includeTools: catalogScope === 'all' });
    const next = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
    const current = window.location.pathname + window.location.search + window.location.hash;
    if (next !== current) history.replaceState(null, '', next);
  }

  function buildCategoryList() {
    const fromData = data.categories || [];
    const ordered = [];
    preferredCats.forEach(function (cat) {
      if (fromData.indexOf(cat) >= 0 && ordered.indexOf(cat) < 0) ordered.push(cat);
    });
    fromData.forEach(function (cat) {
      if (ordered.indexOf(cat) < 0) ordered.push(cat);
    });
    categories = ['All'].concat(ordered);
  }

  function buildFilters() {
    if (!filtersEl) return;
    filtersEl.innerHTML = '';
    categories.forEach(function (cat) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dir-pill' + (cat === category ? ' is-active' : '');
      btn.dataset.category = cat;
      btn.textContent = cat;
      btn.addEventListener('click', function () {
        category = cat;
        filtersEl.querySelectorAll('.dir-pill').forEach(function (b) {
          b.classList.toggle('is-active', b.dataset.category === cat);
        });
        render(true);
      });
      filtersEl.appendChild(btn);
    });
  }

  function buildQualityFilters() {
    if (!qualityFiltersEl) return;
    qualityFiltersEl.innerHTML = '';
    QUALITY_FILTERS.forEach(function (item) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dir-pill dir-pill--quality' + (item.id === quality ? ' is-active' : '');
      btn.dataset.quality = item.id;
      btn.textContent = item.label;
      btn.addEventListener('click', function () {
        quality = item.id;
        qualityFiltersEl.querySelectorAll('.dir-pill').forEach(function (b) {
          b.classList.toggle('is-active', b.dataset.quality === item.id);
        });
        render(true);
      });
      qualityFiltersEl.appendChild(btn);
    });
  }

  function hasActiveFilters() {
    return queryApi.directoryQueryIsFiltered(currentFilters()) || (catalogScope === 'all' && toolsOnly === false);
  }

  function clearFilters() {
    const reloadTools = catalogScope === 'all' && toolsOnly === false;
    query = '';
    category = 'All';
    quality = 'all';
    status = '';
    verified = '';
    auth = '';
    transport = '';
    sort = 'stars';
    if (catalogScope === 'all') toolsOnly = true;
    syncControls();
    if (filtersEl) {
      filtersEl.querySelectorAll('.dir-pill').forEach(function (b) {
        b.classList.toggle('is-active', b.dataset.category === 'All');
      });
    }
    if (qualityFiltersEl) {
      qualityFiltersEl.querySelectorAll('.dir-pill').forEach(function (b) {
        b.classList.toggle('is-active', b.dataset.quality === 'all');
      });
    }
    if (reloadTools) {
      loadCatalog();
      return;
    }
    render(true);
  }

  function updateSortCaption(key) {
    if (!sortCaptionEl) return;
    sortCaptionEl.textContent = sortCaptions[key] || sortCaptions[sort] || sortCaptions.stars || '';
  }

  function render(resetVisible) {
    if (resetVisible) visibleCount = PAGE_SIZE;
    const filters = currentFilters();
    const applied = queryApi.applyDirectoryQuery(servers, filters, {
      now: new Date(),
      viewsAvailable: viewsAvailable,
      toolsOnlyDefault: toolsOnly,
    });
    filteredList = applied.servers;
    const list = filteredList.slice(0, visibleCount);
    const total = filteredList.length;

    updateSortCaption(applied.captionKey);
    writeUrl();
    if (countEl) {
      countEl.textContent =
        total === servers.length
          ? total.toLocaleString('en-US') + ' servers'
          : total.toLocaleString('en-US') + ' of ' + servers.length.toLocaleString('en-US') + ' servers';
    }
    if (clearBtn) clearBtn.hidden = !hasActiveFilters();
    if (loadMoreBtn) loadMoreBtn.hidden = visibleCount >= total || !total;

    if (!total) {
      grid.innerHTML = '';
      grid.hidden = true;
      if (emptyEl) {
        emptyEl.hidden = false;
        const copy = queryApi.emptyDirectoryMessage(filters, catalogScope);
        if (emptyTipEl) emptyTipEl.textContent = copy.message;
        if (emptyHintEl) emptyHintEl.textContent = copy.hint;
        if (emptyBrowseEl) {
          const qs = queryApi.toQueryString(filters, { includeTools: true });
          emptyBrowseEl.hidden = catalogScope !== 'top';
          emptyBrowseEl.href = '/mcp/all' + (qs ? '?' + qs : '');
        }
      }
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    grid.hidden = false;
    grid.innerHTML = list.map(function (s) { return window.renderRegistryDirCard(s); }).join('');
  }

  function catalogUrl() {
    let url = '/api/mcp/catalog?scope=' + encodeURIComponent(catalogScope);
    if (catalogScope === 'all' && !toolsOnly) url += '&tools_only=0';
    return url;
  }

  function applyCatalog(payload) {
    data = payload || { categories: [], servers: [] };
    servers = data.servers || [];
    viewsAvailable = queryApi.catalogHasViews(servers);
    buildCategoryList();
    buildFilters();
    buildQualityFilters();
    if (loadingEl) loadingEl.hidden = true;
    render(true);
    loadViews();
  }

  function loadViews() {
    fetch('/api/mcp/listing-views')
      .then(function (r) { return r.json(); })
      .then(function (payload) {
        if (!payload || payload.available !== true || !payload.views || typeof payload.views !== 'object') return;
        const applied = queryApi.applyViewCounts(servers, payload.views);
        servers = applied.servers;
        viewsAvailable = applied.viewsAvailable;
        render(false);
      })
      .catch(function () {});
  }

  function loadCatalog() {
    const inline = document.getElementById('mcpCatalogData');
    const skipInline = catalogScope === 'all' && !toolsOnly;
    if (!skipInline && inline && inline.textContent.trim()) {
      try {
        applyCatalog(JSON.parse(inline.textContent));
        return;
      } catch (_) {
        /* fall through */
      }
    }
    if (loadingEl) loadingEl.hidden = false;
    fetch(catalogUrl())
      .then(function (r) { return r.json(); })
      .then(applyCatalog)
      .catch(function () {
        if (loadingEl) {
          loadingEl.hidden = false;
          loadingEl.textContent = 'Could not load catalog. Refresh to try again.';
        }
      });
  }

  if (searchEl) {
    searchEl.addEventListener('input', function (e) {
      query = e.target.value || '';
      render(true);
    });
  }

  function bindSelect(el, assign) {
    if (!el) return;
    el.addEventListener('change', function (e) {
      assign(e.target.value);
      render(true);
    });
  }

  bindSelect(sortEl, function (value) { sort = value; });
  bindSelect(statusEl, function (value) { status = value; });
  bindSelect(verifiedEl, function (value) { verified = value; });
  bindSelect(authEl, function (value) { auth = value; });
  bindSelect(transportEl, function (value) { transport = value; });

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', function () {
      visibleCount += PAGE_SIZE;
      render(false);
    });
  }

  if (clearBtn) clearBtn.addEventListener('click', clearFilters);
  if (clearEmptyBtn) clearEmptyBtn.addEventListener('click', clearFilters);

  if (toolsOnlyToggle) {
    toolsOnlyToggle.addEventListener('change', function () {
      toolsOnly = toolsOnlyToggle.checked;
      loadCatalog();
    });
  }

  syncControls();
  loadCatalog();
})();
