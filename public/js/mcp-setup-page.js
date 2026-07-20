/**
 * Our MCP setup — client tabs + copy endpoint.
 */
(function () {
  const tabs = Array.from(document.querySelectorAll('.setup-tab'));
  const panels = Array.from(document.querySelectorAll('.setup-panel'));
  const copyBtn = document.getElementById('copyEndpoint');
  const endpointEl = document.getElementById('setupEndpoint');

  function activate(id) {
    tabs.forEach((tab) => {
      const on = tab.dataset.tab === id;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach((panel) => {
      panel.hidden = panel.id !== 'setup-panel-' + id;
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => activate(tab.dataset.tab));
  });

  if (copyBtn && endpointEl) {
    copyBtn.addEventListener('click', () => {
      const url = endpointEl.textContent.trim();
      const done = () => {
        const prev = copyBtn.textContent;
        copyBtn.textContent = 'Copied ✓';
        setTimeout(() => {
          copyBtn.textContent = prev;
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done).catch(() => {
          /* ignore */
        });
      }
    });
  }
})();
