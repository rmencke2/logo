/**
 * Homepage registry interactions:
 * - live filter of top-server rows
 * - category chips
 * - server count-up (DOM-only)
 * Theme/nav live in registry.js
 */
(function () {
  const body = document.body;
  if (!body.classList.contains('home-page')) return;

  const searchInput = document.getElementById('homeMcpSearch');
  const heading = document.getElementById('homeServersHeading');
  const rows = Array.from(document.querySelectorAll('.home-server-row'));
  const emptyEl = document.getElementById('homeServerEmpty');
  const emptyQuery = document.getElementById('homeEmptyQuery');
  const countEl = document.getElementById('homeServerCount');
  const defaultHeading = heading ? heading.textContent : 'Top servers this week';

  function filterServers(query) {
    const q = String(query || '').trim().toLowerCase();
    let visible = 0;
    rows.forEach((row) => {
      const hay = row.getAttribute('data-search') || '';
      const match = !q || hay.includes(q);
      row.hidden = !match;
      if (match) visible += 1;
    });
    if (heading) {
      heading.textContent = q ? `Results for “${String(query).trim()}”` : defaultHeading;
    }
    if (emptyEl) {
      emptyEl.classList.toggle('is-visible', visible === 0);
    }
    if (emptyQuery) {
      emptyQuery.textContent = String(query || '').trim();
    }
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => filterServers(searchInput.value));
  }

  document.querySelectorAll('.home-hero__chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-query') || '';
      if (searchInput) {
        searchInput.value = q;
        searchInput.focus();
      }
      filterServers(q);
    });
  });

  // Count-up: write textContent in rAF only — never drive via framework state.
  if (countEl) {
    const target = Number(countEl.getAttribute('data-target') || countEl.textContent.replace(/,/g, '')) || 0;
    const dur = 1400;
    const start = performance.now();
    const fmt = (n) => n.toLocaleString('en-US');
    countEl.textContent = '0';
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      countEl.textContent = fmt(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Sync footer language selector with hidden i18n select if present
  const footerLang = document.getElementById('homeLanguageSelector');
  const hiddenLang = document.getElementById('languageSelector');
  if (footerLang && hiddenLang) {
    footerLang.value = hiddenLang.value || 'en';
    footerLang.addEventListener('change', () => {
      hiddenLang.value = footerLang.value;
      hiddenLang.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
})();
