/**
 * Client-side MCP server card HTML (matches views/partials/mcp-server-card.ejs).
 */
(function (global) {
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function logoHtml(s) {
    const cs = s.categoryStyle || {};
    const src = s.logoUrl || s.logoFallbackUrl || '';
    const dataFallback =
      s.logoUrl && s.logoFallbackUrl
        ? ' data-fallback="' + esc(s.logoFallbackUrl) + '"'
        : '';
    const img = src
      ? '<img class="mcp-logo-img" src="' +
        esc(src) +
        '"' +
        dataFallback +
        ' alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="if(this.dataset.fallback&amp;&amp;!this.dataset.fallbackUsed){this.dataset.fallbackUsed=\'1\';this.src=this.dataset.fallback;return;}this.classList.add(\'is-hidden\');var f=this.parentElement.querySelector(\'.mcp-logo-fallback\');if(f)f.classList.add(\'is-visible\');">'
      : '';
    const fallbackVisible = src ? '' : ' is-visible';
    return (
      '<div class="mcp-logo-wrap"><div class="mcp-logo" style="--mcp-tile-bg:' +
      esc(cs.tileBg || '#3B82F6') +
      ';--mcp-tile-text:' +
      esc(cs.tileText || '#fff') +
      ';">' +
      img +
      '<span class="mcp-logo-fallback' +
      fallbackVisible +
      '" aria-hidden="true" style="background:' +
      esc(cs.tileBg || '#3B82F6') +
      ';color:' +
      esc(cs.tileText || '#fff') +
      ';">' +
      esc(s.logoInitial || '?') +
      '</span></div></div>'
    );
  }

  /**
   * @param {object} s — server with branding fields from API
   */
  function renderMcpServerCard(s) {
    const cs = s.categoryStyle || {};
    const toolList = s.tools || [];
    const tools = toolList.slice(0, 4);
    const extra = toolList.length - tools.length;
    const toolHtml = toolList.length
      ? tools.map((t) => '<span class="mcp-tool-pill" title="' + esc(t.description || t.name) + '">' + esc(t.name) + '</span>').join('') +
        (extra > 0 ? '<span class="mcp-tool-pill muted">+' + extra + ' more</span>' : '')
      : '<span class="mcp-tool-pill muted">Tools on detail page</span>';
    const stars =
      s.stars > 0
        ? '<span class="mcp-badge-stars">★ ' + esc(Number(s.stars).toLocaleString()) + '</span>'
        : '';
    const transportClass = s.isRemote ? 'remote' : 'local';

    return (
      '<a class="mcp-card" href="/mcp/' +
      esc(s.slug) +
      '" style="--mcp-cat-border:' +
      esc(cs.border || '#3B82F6') +
      ';--mcp-cat-border-dark:' +
      esc(cs.borderDark || cs.border || '#3B82F6') +
      ';--mcp-cat-badge-bg:' +
      esc(cs.badgeBg || '#EFF6FF') +
      ';--mcp-cat-badge-text:' +
      esc(cs.badgeText || '#1D4ED8') +
      ';--mcp-cat-badge-bg-dark:' +
      esc(cs.badgeBgDark || cs.badgeBg || '#EFF6FF') +
      ';--mcp-cat-badge-text-dark:' +
      esc(cs.badgeTextDark || cs.badgeText || '#1D4ED8') +
      '">' +
      '<div class="mcp-card-body">' +
      '<div class="mcp-card-top">' +
      logoHtml(s) +
      '<div class="mcp-card-title-wrap">' +
      '<h2 class="mcp-card-title">' +
      esc(s.name) +
      '</h2>' +
      '<div class="mcp-card-meta">' +
      '<span class="mcp-badge-cat">' +
      esc(s.category) +
      '</span>' +
      stars +
      '</div></div>' +
      '<span class="mcp-badge-transport mcp-badge-transport--' +
      transportClass +
      '">' +
      esc(s.transportBadge || (s.isRemote ? 'Remote' : 'Local')) +
      '</span></div>' +
      '<p class="mcp-card-desc">' +
      esc(s.description) +
      '</p>' +
      '<div class="mcp-tools">' +
      toolHtml +
      '</div></div></a>'
    );
  }

  global.renderMcpServerCard = renderMcpServerCard;
})(typeof window !== 'undefined' ? window : globalThis);
