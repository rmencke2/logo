/**
 * WebMCP setup guide — copy demo URL.
 */
(function () {
  'use strict';

  const btn = document.getElementById('webmcpSetupCopyDemo');
  const code = document.getElementById('webmcpSetupDemoUrl');
  if (!btn || !code) return;

  btn.addEventListener('click', async () => {
    const text = code.textContent.trim();
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    const prev = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => {
      btn.textContent = prev;
    }, 1600);
  });
})();
