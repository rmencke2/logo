(function () {
  const form = document.getElementById('mcpEditListingForm');
  if (!form) return;

  const originalSlug = form.dataset.slug;
  const btn = document.getElementById('mcpEditSaveBtn');
  const statusEl = document.getElementById('mcpEditStatus');
  const alertEl = document.getElementById('mcpEditAlert');

  function toolsToText(tools) {
    return (tools || [])
      .map((t) => (t.description ? `${t.name} — ${t.description}` : t.name))
      .join('\n');
  }

  function parseToolsText(raw) {
    return String(raw || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const sep = line.includes(' — ') ? ' — ' : line.includes(' - ') ? ' - ' : null;
        if (sep) {
          const [name, ...rest] = line.split(sep);
          return { name: name.trim(), description: rest.join(sep).trim() };
        }
        return { name: line, description: '' };
      });
  }

  async function loadListing() {
    try {
      const res = await fetch(`/api/mcp/my-listings/${encodeURIComponent(originalSlug)}`, {
        credentials: 'include',
      });
      if (res.status === 401) {
        window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
        return;
      }
      if (!res.ok) throw new Error('Could not load listing');
      const data = await res.json();
      const server = data.server;

      const catSelect = document.getElementById('editCategory');
      catSelect.innerHTML = data.categories
        .map((c) => `<option value="${c}">${c}</option>`)
        .join('');

      document.getElementById('editServerName').value = server.serverName || '';
      document.getElementById('editSlug').value = server.slug || '';
      document.getElementById('editDescription').value = server.description || '';
      document.getElementById('editCategory').value = server.category || 'Dev Tools';
      document.getElementById('editTransport').value = server.transport || 'unknown';
      document.getElementById('editEndpoint').value = server.mcpEndpoint || '';
      document.getElementById('editInstallCommand').value = server.installCommand || '';
      document.getElementById('editGithubUrl').value = server.githubUrl || '';
      document.getElementById('editDocsUrl').value = server.docsUrl || '';
      document.getElementById('editStars').value = server.stars || 0;
      document.getElementById('editOfficial').checked = Boolean(server.official);
      document.getElementById('editTools').value = toolsToText(server.tools || []);

      alertEl.innerHTML = `Live at <a href="${server.pageUrl}">${server.pageUrl}</a>. Changes are reviewed on save and appear immediately in the directory.`;
      alertEl.classList.add('is-success');
    } catch (err) {
      alertEl.textContent = err.message || 'Failed to load listing';
      alertEl.classList.add('is-error');
      form.hidden = true;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    statusEl.textContent = '';
    statusEl.classList.remove('is-error', 'is-success');

    const tools = parseToolsText(document.getElementById('editTools').value);
    if (!tools.length) {
      statusEl.textContent = 'Add at least one tool.';
      statusEl.classList.add('is-error');
      return;
    }

    const newSlug = document.getElementById('editSlug').value.trim();
    if (newSlug !== originalSlug && !confirm(`Change slug from "${originalSlug}" to "${newSlug}"? The old URL will stop working.`)) {
      return;
    }

    const body = {
      serverName: document.getElementById('editServerName').value.trim(),
      slug: newSlug,
      description: document.getElementById('editDescription').value.trim(),
      category: document.getElementById('editCategory').value,
      transport: document.getElementById('editTransport').value,
      mcpEndpoint: document.getElementById('editEndpoint').value.trim(),
      installCommand: document.getElementById('editInstallCommand').value.trim(),
      githubUrl: document.getElementById('editGithubUrl').value.trim(),
      docsUrl: document.getElementById('editDocsUrl').value.trim(),
      stars: document.getElementById('editStars').value,
      official: document.getElementById('editOfficial').checked,
      tools,
    };

    btn.disabled = true;
    try {
      const res = await fetch(`/api/mcp/my-listings/${encodeURIComponent(originalSlug)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      statusEl.textContent = data.message || 'Saved.';
      statusEl.classList.add('is-success');
      if (data.slug && data.slug !== originalSlug) {
        window.location.replace(`/mcp/my-listings/${encodeURIComponent(data.slug)}`);
      }
    } catch (err) {
      statusEl.textContent = err.message || 'Save failed';
      statusEl.classList.add('is-error');
    } finally {
      btn.disabled = false;
    }
  });

  loadListing();
})();
