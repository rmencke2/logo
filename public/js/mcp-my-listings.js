(function () {
  const root = document.getElementById('mcpMyListingsRoot');
  if (!root) return;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statusBadge(status) {
    if (status === 'published') {
      return '<span class="mcp-listing-badge mcp-listing-badge--published">Published</span>';
    }
    return '<span class="mcp-listing-badge mcp-listing-badge--pending">Under review</span>';
  }

  async function loadListings() {
    root.innerHTML = '<div class="mcp-submit-status">Loading your listings…</div>';
    try {
      const res = await fetch('/api/mcp/my-listings', { credentials: 'include' });
      if (res.status === 401) {
        window.location.href = `/login?redirect=${encodeURIComponent('/mcp/my-listings')}`;
        return;
      }
      if (!res.ok) throw new Error('Failed to load listings');
      const data = await res.json();
      const listings = data.listings || [];

      if (!listings.length) {
        root.innerHTML = `
          <div class="mcp-account-callout">
            <h2>No listings yet</h2>
            <p>Submit a server while logged in to link it to your account. After approval, you can edit the listing here anytime.</p>
            <p><a class="mcp-account-callout__btn" href="/mcp/submit">Submit an MCP server</a></p>
          </div>`;
        return;
      }

      let html = `<div class="mcp-listings-table-wrap"><table class="mcp-listings-table">
        <thead><tr><th>Server</th><th>Category</th><th>Status</th><th></th></tr></thead><tbody>`;
      for (const row of listings) {
        const date = row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : '';
        const action = row.status === 'published'
          ? `<a class="mcp-listing-edit-link" href="${escapeHtml(row.editUrl)}">Edit listing</a>`
          : '<span class="mcp-listing-muted">Editable after approval</span>';
        const nameCell = row.pageUrl
          ? `<a href="${escapeHtml(row.pageUrl)}">${escapeHtml(row.name)}</a>`
          : escapeHtml(row.name);
        html += `<tr>
          <td><strong>${nameCell}</strong><br><span class="mcp-listing-muted">${escapeHtml(row.slug)}${date ? ` · ${date}` : ''}</span></td>
          <td>${escapeHtml(row.category)}</td>
          <td>${statusBadge(row.status)}</td>
          <td>${action}</td>
        </tr>`;
      }
      html += '</tbody></table></div>';
      root.innerHTML = html;
    } catch (err) {
      root.innerHTML = `<div class="mcp-submit-status is-error">${escapeHtml(err.message)}</div>`;
    }
  }

  loadListings();
})();
