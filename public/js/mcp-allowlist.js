/**
 * Allowlist / policy pack exports — copy + download.
 */
(function () {
  const statusEl = document.getElementById('allowlistStatusMsg');
  const dataEl = document.getElementById('allowlistPackData');
  if (!dataEl) return;

  let pack;
  try {
    pack = JSON.parse(dataEl.textContent || '{}');
  } catch {
    return;
  }

  function setStatus(message) {
    if (statusEl) statusEl.textContent = message || '';
  }

  function queryString() {
    const filters = pack.filters || {};
    const status = encodeURIComponent((filters.status || []).join(',') || 'live_ok');
    const host = encodeURIComponent(filters.host || 'fixed');
    const maxTools =
      filters.max_tools == null || filters.max_tools === ''
        ? 'any'
        : String(filters.max_tools);
    let q = `status=${status}&host=${host}&max_tools=${encodeURIComponent(maxTools)}`;
    if (filters.usable_only) q += '&usable_only=1';
    return q;
  }

  function packJson() {
    return `${JSON.stringify(pack, null, 2)}\n`;
  }

  function cursorJson() {
    return `${JSON.stringify(pack.cursor || { mcpServers: {} }, null, 2)}\n`;
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`Copied ${label}.`);
    } catch {
      setStatus(`Could not copy ${label}. Select the preview and copy manually.`);
    }
  }

  function download(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || '';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus(`Downloading ${filename || 'export'}…`);
  }

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-copy');
      if (kind === 'cursor') copyText(cursorJson(), 'Cursor mcpServers JSON');
      else if (kind === 'json') copyText(packJson(), 'full pack JSON');
    });
  });

  document.querySelectorAll('[data-download]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-download');
      const q = queryString();
      if (kind === 'cursor') {
        download(`/api/v1/mcp/allowlist?${q}&format=cursor`, 'mcp.allowlist.json');
      } else if (kind === 'csv') {
        download(`/api/v1/mcp/allowlist?${q}&format=csv`, 'influzer-mcp-allowlist.csv');
      } else if (kind === 'md') {
        download(`/api/v1/mcp/allowlist?${q}&format=md`, 'influzer-mcp-allowlist.md');
      }
    });
  });
})();
