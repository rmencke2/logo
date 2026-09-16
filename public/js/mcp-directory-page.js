/**
 * MCP directory page — search, category, quality filters, sort, pagination.
 */
(function () {
  const PAGE_SIZE = 60;
  const grid = document.getElementById('mcpGrid');
  if (!grid || typeof window.renderRegistryDirCard !== 'function') return;

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
  const toolsOnlyToggle = document.getElementById('mcpToolsOnly');
  const catalogScope = grid.dataset.scope || 'top';
  const defaultToolsOnly = grid.dataset.toolsOnly !== '0';
  const preferredCats = (grid.dataset.preferredCats || '')
    .split('|')
    .map((s) => s.trim())
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

  let data = { categories: [], servers: [] };
  let servers = [];
  let categories = ['All'];
  let visibleCount = PAGE_SIZE;
  let query = '';
  let category = 'All';
  let quality = 'all';
  let sort = sortEl ? sortEl.value : 'stars';
  let toolsOnly = catalogScope === 'top' || defaultToolsOnly;
  let filteredList = [];

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildCategoryList() {
    const fromData = data.categories || [];
    const ordered = [];
    preferredCats.forEach((cat) => {
      if (fromData.includes(cat) && !ordered.includes(cat)) ordered.push(cat);
    });
    fromData.forEach((cat) => {
      if (!ordered.includes(cat)) ordered.push(cat);
    });
    categories = ['All'].concat(ordered);
  }

  function buildFilters() {
    if (!filtersEl) return;
    filtersEl.innerHTML = '';
    categories.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dir-pill' + (cat === category ? ' is-active' : '');
      btn.dataset.category = cat;
      btn.textContent = cat;
      btn.addEventListener('click', () => {
        category = cat;
        filtersEl.querySelectorAll('.dir-pill').forEach((b) => {
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
    QUALITY_FILTERS.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'dir-pill dir-pill--quality' + (item.id === quality ? ' is-active' : '');
      btn.dataset.quality = item.id;
      btn.textContent = item.label;
      btn.addEventListener('click', () => {
        quality = item.id;
        qualityFiltersEl.querySelectorAll('.dir-pill').forEach((b) => {
          b.classList.toggle('is-active', b.dataset.quality === item.id);
        });
        render(true);
      });
      qualityFiltersEl.appendChild(btn);
    });
  }

  function matchesQuality(s) {
    if (quality === 'all') return true;
    const q = s.quality || {};
    if (quality === 'indexed') return Boolean(q.tools_indexed) || (s.tools && s.tools.length);
    if (quality === 'ready') return q.demoware_tier === 'ready';
    if (quality === 'thin') return q.demoware_tier === 'thin';
    if (quality === 'unverified') return q.demoware_tier === 'unverified';
    if (quality === 'probed') {
      return q.live_status === 'live_ok' || q.live_status === 'auth_required' || q.live_status === 'unreachable';
    }
    if (quality === 'auth_required') {
      return q.live_status === 'auth_required' || q.auth_gate === 'required';
    }
    return true;
  }

  function matches(s) {
    const q = query.trim().toLowerCase();
    if (category !== 'All' && s.category !== category) return false;
    if (toolsOnly && !(s.tools && s.tools.length)) return false;
    if (!matchesQuality(s)) return false;
    if (!q) return true;
    if ((s.name || '').toLowerCase().includes(q)) return true;
    if ((s.description || '').toLowerCase().includes(q)) return true;
    if ((s.category || '').toLowerCase().includes(q)) return true;
    return (s.tools || []).some(
      (t) =>
        (t.name || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q),
    );
  }

  function tierRank(tier) {
    if (tier === 'ready') return 4;
    if (tier === 'indexed') return 3;
    if (tier === 'thin') return 2;
    return 1;
  }

  function sortList(list) {
    const copy = list.slice();
    if (sort === 'stars' || sort === 'popular') {
      return copy.sort(
        (a, b) => (b.stars || 0) - (a.stars || 0) || a.name.localeCompare(b.name),
      );
    }
    if (sort === 'tools') {
      return copy.sort((a, b) => (b.tools?.length || 0) - (a.tools?.length || 0));
    }
    if (sort === 'official') {
      return copy.sort((a, b) => {
        if (Boolean(a.official) !== Boolean(b.official)) return a.official ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    if (sort === 'quality') {
      return copy.sort((a, b) => {
        const ta = tierRank(a.quality && a.quality.demoware_tier);
        const tb = tierRank(b.quality && b.quality.demoware_tier);
        if (tb !== ta) return tb - ta;
        return (b.tools?.length || 0) - (a.tools?.length || 0);
      });
    }
    return copy.sort((a, b) => a.name.localeCompare(b.name));
  }

  function hasActiveFilters() {
    return query.trim() !== '' || category !== 'All' || quality !== 'all';
  }

  function clearFilters() {
    query = '';
    category = 'All';
    quality = 'all';
    if (searchEl) searchEl.value = '';
    if (filtersEl) {
      filtersEl.querySelectorAll('.dir-pill').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.category === 'All');
      });
    }
    if (qualityFiltersEl) {
      qualityFiltersEl.querySelectorAll('.dir-pill').forEach((b) => {
        b.classList.toggle('is-active', b.dataset.quality === 'all');
      });
    }
    render(true);
  }

  function render(resetVisible) {
    if (resetVisible) visibleCount = PAGE_SIZE;
    filteredList = sortList(servers.filter(matches));
    const list = filteredList.slice(0, visibleCount);
    const total = filteredList.length;

    if (countEl) {
      countEl.textContent =
        total === servers.length
          ? total.toLocaleString() + ' servers'
          : total.toLocaleString() + ' of ' + servers.length.toLocaleString() + ' servers';
    }
    if (clearBtn) clearBtn.hidden = !hasActiveFilters();
    if (loadMoreBtn) loadMoreBtn.hidden = visibleCount >= total;

    if (!total) {
      grid.innerHTML = '';
      grid.hidden = true;
      if (emptyEl) {
        emptyEl.hidden = false;
        const tip = query.trim()
          ? 'No servers match “' + esc(query.trim()) + '”. Try a tool name like “scrape” or “create_issue”, or browse the full directory.'
          : 'No servers match your filters.';
        const tipEl = emptyEl.querySelector('[data-empty-tip]');
        if (tipEl) tipEl.innerHTML = tip;
      }
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    grid.hidden = false;
    grid.innerHTML = list.map((s) => window.renderRegistryDirCard(s)).join('');
  }

  function catalogUrl() {
    let url = '/api/mcp/catalog?scope=' + encodeURIComponent(catalogScope);
    if (catalogScope === 'all' && !toolsOnly) url += '&tools_only=0';
    return url;
  }

  function applyCatalog(payload) {
    data = payload || { categories: [], servers: [] };
    servers = data.servers || [];
    buildCategoryList();
    buildFilters();
    buildQualityFilters();
    if (loadingEl) loadingEl.hidden = true;
    render(true);
  }

  function loadCatalog() {
    const inline = document.getElementById('mcpCatalogData');
    if (inline && inline.textContent.trim()) {
      try {
        applyCatalog(JSON.parse(inline.textContent));
        return;
      } catch (_) {
        /* fall through */
      }
    }
    if (loadingEl) loadingEl.hidden = false;
    fetch(catalogUrl())
      .then((r) => r.json())
      .then(applyCatalog)
      .catch(() => {
        if (loadingEl) {
          loadingEl.hidden = false;
          loadingEl.textContent = 'Could not load catalog. Refresh to try again.';
        }
      });
  }

  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      query = e.target.value || '';
      render(true);
    });
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
      searchEl.value = q;
      query = q;
    }
    const qualityParam = params.get('quality');
    if (qualityParam && QUALITY_FILTERS.some((f) => f.id === qualityParam)) {
      quality = qualityParam;
    }
  }

  if (sortEl) {
    sortEl.addEventListener('change', (e) => {
      sort = e.target.value;
      render(true);
    });
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      visibleCount += PAGE_SIZE;
      render(false);
    });
  }

  if (clearBtn) clearBtn.addEventListener('click', clearFilters);
  if (clearEmptyBtn) clearEmptyBtn.addEventListener('click', clearFilters);

  if (toolsOnlyToggle) {
    toolsOnlyToggle.addEventListener('change', () => {
      toolsOnly = toolsOnlyToggle.checked;
      loadCatalog();
    });
  }

  loadCatalog();
})();
