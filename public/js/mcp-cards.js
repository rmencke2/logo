/**
 * Client-side MCP server card HTML.
 * - renderMcpServerCard: legacy editorial card (topic pages)
 * - renderRegistryDirCard: registry directory grid card
 */
(function (global) {
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function handshakeChip(s) {
    const status = s.quality && s.quality.live_status;
    if (!status || status === 'local_unprobed') return '';
    const color =
      status === 'live_ok' ? '#4f46e5' : status === 'auth_required' ? '#d97706' : '#6b7280';
    return (
      '<span class="mcp-hs-chip" title="MCP handshake — not a SAFE badge">' +
      '<span class="mcp-hs-chip__l">MCP handshake</span>' +
      '<span class="mcp-hs-chip__r" style="background:' +
      color +
      '">' +
      esc(status) +
      '</span></span>'
    );
  }

  function logoHtml(s, opts) {
    const options = opts || {};
    const registry = Boolean(options.registry);
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
        ' alt="" width="38" height="38" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="if(this.dataset.fallback&amp;&amp;!this.dataset.fallbackUsed){this.dataset.fallbackUsed=\'1\';this.src=this.dataset.fallback;return;}this.classList.add(\'is-hidden\');var f=this.parentElement.querySelector(\'.mcp-logo-fallback\');if(f)f.classList.add(\'is-visible\');">'
      : '';
    const fallbackVisible = src ? '' : ' is-visible';
    const initial = esc(s.logoInitial || (s.name || '?').charAt(0).toUpperCase());

    if (registry) {
      const official = Boolean(s.official);
      return (
        '<div class="dir-card__icon' +
        (official ? ' dir-card__icon--official' : '') +
        '"' +
        (official
          ? ''
          : ' style="background:' +
            esc(cs.tileBg || '#f0efe9') +
            ';color:' +
            esc(cs.tileText || '#6d707a') +
            '"') +
        '>' +
        img +
        '<span class="mcp-logo-fallback' +
        fallbackVisible +
        '" aria-hidden="true">' +
        initial +
        '</span></div>'
      );
    }

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
      initial +
      '</span></div></div>'
    );
  }

  function renderMcpServerCard(s) {
    const cs = s.categoryStyle || {};
    const toolList = s.tools || [];
    const tools = toolList.slice(0, 4);
    const extra = toolList.length - tools.length;
    const toolHtml = toolList.length
      ? tools
          .map(
            (t) =>
              '<span class="mcp-tool-pill" title="' +
              esc(t.description || t.name) +
              '">' +
              esc(t.name) +
              '</span>',
          )
          .join('') +
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
      handshakeChip(s) +
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

  function statusGradeLine(s) {
    const quality = (s && s.quality) || {};
    const parts = [];
    if (quality.verification_grade_letter) parts.push(quality.verification_grade_letter);
    if (quality.live_status_label) parts.push(quality.live_status_label);
    return parts.join(' · ');
  }

  function shortText(value, max) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    return text.slice(0, max - 1) + '…';
  }

  function renderRegistryDirCard(s) {
    return (
      '<a class="dir-card" href="/mcp/' +
      esc(s.slug) +
      '">' +
      '<div class="dir-card__name">' +
      esc(s.name) +
      '</div>' +
      '<p class="dir-card__desc">' +
      esc(shortText(s.description, 140)) +
      '</p>' +
      '<div class="dir-card__foot">' +
      '<span class="dir-card__status">' +
      esc(statusGradeLine(s)) +
      '</span>' +
      '<span class="dir-card__cat">' +
      esc(s.category || '') +
      '</span>' +
      '</div></a>'
    );
  }

  global.renderMcpServerCard = renderMcpServerCard;
  global.renderRegistryDirCard = renderRegistryDirCard;
})(typeof window !== 'undefined' ? window : globalThis);
