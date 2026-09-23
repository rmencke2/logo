(function () {
  const form = document.getElementById('mcpSubmitForm');
  if (!form) return;

  const btn = document.getElementById('mcpSubmitBtn');
  const statusEl = document.getElementById('mcpSubmitStatus');
  const guestCallout = document.getElementById('mcpAccountCalloutGuest');
  const userCallout = document.getElementById('mcpAccountCalloutUser');
  const linksHint = document.getElementById('mcpSubmitLinksHint');
  const linksHintDefault =
    (linksHint && linksHint.textContent) ||
    'Provide at least one MCP server URL so we can verify it (GitHub, docs, or primary/install).';

  const URL_FIELDS = ['github_url', 'docs_url', 'primary_url'];

  function parseToolLines(raw) {
    return String(raw || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidHttpUrl(url) {
    if (!url) return true;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function fieldLabel(name) {
    return form.querySelector(`[name="${name}"]`)?.closest('.mcp-submit-field') || null;
  }

  function clearFieldErrors() {
    form.querySelectorAll('.mcp-submit-field.is-invalid').forEach((el) => {
      el.classList.remove('is-invalid');
      const input = el.querySelector('input, select, textarea');
      if (input) input.removeAttribute('aria-invalid');
    });
    form.querySelectorAll('.mcp-submit-field-error').forEach((el) => el.remove());
    if (linksHint) {
      linksHint.classList.remove('is-error');
      linksHint.textContent = linksHintDefault;
    }
  }

  function setFieldError(name, message) {
    const label = fieldLabel(name);
    const input = form.querySelector(`[name="${name}"]`);
    if (input) input.setAttribute('aria-invalid', 'true');
    if (!label) return;
    label.classList.add('is-invalid');
    if (!label.querySelector('.mcp-submit-field-error')) {
      const err = document.createElement('p');
      err.className = 'mcp-submit-field-error';
      err.textContent = message;
      label.appendChild(err);
    }
  }

  function validateClient(fd) {
    clearFieldErrors();
    const errors = [];
    let firstInvalid = null;

    function fail(name, message) {
      errors.push(message);
      setFieldError(name, message);
      if (!firstInvalid) firstInvalid = form.querySelector(`[name="${name}"]`);
    }

    const email = String(fd.get('submitter_email') || '').trim();
    const serverName = String(fd.get('server_name') || '').trim();
    const description = String(fd.get('description') || '').trim();
    const category = String(fd.get('category') || '').trim();
    const transport = String(fd.get('transport') || '').trim();
    const githubUrl = String(fd.get('github_url') || '').trim();
    const docsUrl = String(fd.get('docs_url') || '').trim();
    const primaryUrl = String(fd.get('primary_url') || '').trim();
    const tools = parseToolLines(fd.get('tools'));

    if (!email || !isValidEmail(email)) fail('submitter_email', 'A valid submitter email is required.');
    if (!serverName) fail('server_name', 'Server name is required.');
    if (!description || description.length < 20) {
      fail('description', 'Description must be at least 20 characters.');
    }
    if (!category) fail('category', 'Please select a valid category.');
    if (!transport) fail('transport', 'Please select a valid transport type.');

    if (githubUrl && !isValidHttpUrl(githubUrl)) fail('github_url', 'GitHub URL must be a valid http(s) link.');
    if (docsUrl && !isValidHttpUrl(docsUrl)) fail('docs_url', 'Docs URL must be a valid http(s) link.');
    if (primaryUrl && !isValidHttpUrl(primaryUrl)) {
      fail('primary_url', 'Primary URL must be a valid http(s) link.');
    }
    if (!githubUrl && !docsUrl && !primaryUrl) {
      const message = 'Provide at least one MCP server URL (GitHub, docs, or primary/install).';
      errors.push(message);
      URL_FIELDS.forEach((name) => setFieldError(name, message));
      if (linksHint) {
        linksHint.classList.add('is-error');
        linksHint.textContent = message;
      }
      if (!firstInvalid) firstInvalid = form.querySelector('[name="github_url"]');
    }

    if (!tools.length) fail('tools', 'Add at least one tool (one tool name per line).');

    return { ok: errors.length === 0, errors, firstInvalid };
  }

  async function initAuthState() {
    try {
      const res = await fetch('/auth/me', { credentials: 'include' });
      if (!res.ok) return;
      const user = await res.json();
      if (guestCallout) guestCallout.hidden = true;
      if (userCallout) userCallout.hidden = false;

      const emailInput = form.querySelector('[name="submitter_email"]');
      const nameInput = form.querySelector('[name="submitter_name"]');
      if (emailInput && user.email && !emailInput.value) emailInput.value = user.email;
      if (nameInput && user.name && !nameInput.value) nameInput.value = user.name;
    } catch {
      // guest state is fine
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    statusEl.textContent = '';
    statusEl.classList.remove('is-error', 'is-success');

    const fd = new FormData(form);
    const client = validateClient(fd);
    if (!client.ok) {
      statusEl.textContent = client.errors[0] || 'Please fix the highlighted fields.';
      statusEl.classList.add('is-error');
      if (client.firstInvalid && typeof client.firstInvalid.focus === 'function') {
        client.firstInvalid.focus();
      }
      return;
    }

    const body = {
      submitter_email: fd.get('submitter_email'),
      submitter_name: fd.get('submitter_name'),
      server_name: fd.get('server_name'),
      suggested_slug: fd.get('suggested_slug'),
      description: fd.get('description'),
      category: fd.get('category'),
      transport: fd.get('transport'),
      github_url: fd.get('github_url'),
      docs_url: fd.get('docs_url'),
      primary_url: fd.get('primary_url'),
      setup_instructions: fd.get('setup_instructions'),
      additional_notes: fd.get('additional_notes'),
      tools: fd.get('tools'),
      stars: fd.get('stars'),
      official: fd.get('official') === '1',
      website: fd.get('website'),
    };

    btn.disabled = true;
    try {
      const res = await fetch('/api/mcp/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Submission failed.');
      }
      let message = data.message || 'Submission received. Thank you!';
      if (data.hasAccount) {
        message += ' View status at /mcp/my-listings.';
      }
      statusEl.textContent = message;
      statusEl.classList.add('is-success');
      form.reset();
      clearFieldErrors();
      initAuthState();
    } catch (err) {
      statusEl.textContent = err.message || 'Submission failed. Please try again.';
      statusEl.classList.add('is-error');
    } finally {
      btn.disabled = false;
    }
  });

  initAuthState();
})();
