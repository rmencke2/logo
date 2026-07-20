/**
 * Article page — share button.
 */
(function () {
  const btn = document.getElementById('articleShareBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const url = window.location.href;
    const title = document.title;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch (_) {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(url);
      const prev = btn.textContent;
      btn.textContent = 'Copied ✓';
      setTimeout(() => {
        btn.textContent = prev;
      }, 1800);
    } catch (_) {
      /* ignore */
    }
  });
})();
