/**
 * MCP server detail — copy install / endpoint to clipboard.
 */
(function () {
  function flashCopied(btn) {
    const original = btn.getAttribute('data-label') || btn.textContent;
    btn.setAttribute('data-label', original);
    btn.textContent = 'Copied ✓';
    setTimeout(() => {
      btn.textContent = btn.getAttribute('data-label') || 'Copy';
    }, 1800);
  }

  document.querySelectorAll('[data-copy-install]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.getAttribute('data-copy-text') || '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        flashCopied(btn);
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        flashCopied(btn);
      }
    });
  });
})();
