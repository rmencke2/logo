/**
 * Homepage registry interactions:
 * - live filter of top-server rows
 * - category chips
 * Theme/nav live in registry.js
 *
 * Do not animate hero stats (e.g. reset to "0" then count up) — that CLS
 * alone fails PageSpeed Agentic Browsing (needs CLS &lt; ~0.1).
 */
(function () {
  const body = document.body;
  if (!body.classList.contains('home-page')) return;

  const searchInput = document.getElementById('homeMcpSearch');
  const heading = document.getElementById('homeServersHeading');
  const rows = Array.from(document.querySelectorAll('.home-server-row'));
  const emptyEl = document.getElementById('homeServerEmpty');
  const emptyQuery = document.getElementById('homeEmptyQuery');
  const defaultHeading = 'Top servers this week';

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
