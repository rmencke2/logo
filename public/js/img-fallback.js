// Image error fallbacks without inline onerror handlers (script-src-attr 'none').
(function () {
  if (window.__influzerImgFallback) return;
  window.__influzerImgFallback = true;

  document.addEventListener(
    'error',
    function (event) {
      const img = event.target;
      if (!img || img.tagName !== 'IMG') return;

      if (img.dataset.fallback && img.dataset.fallbackUsed !== '1') {
        img.dataset.fallbackUsed = '1';
        img.src = img.dataset.fallback;
        return;
      }

      if (img.classList.contains('mcp-logo-img')) {
        img.classList.add('is-hidden');
        const fallback = img.parentElement && img.parentElement.querySelector('.mcp-logo-fallback');
        if (fallback) fallback.classList.add('is-visible');
        return;
      }

      if (img.dataset.hideOnError === '1') {
        img.style.display = 'none';
        const next = img.nextElementSibling;
        if (next) next.style.display = 'grid';
      }
    },
    true,
  );
})();
