(function () {
  const form = document.getElementById('mcpSubmitForm');
  if (!form) return;

  const btn = document.getElementById('mcpSubmitBtn');
  const statusEl = document.getElementById('mcpSubmitStatus');
  const guestCallout = document.getElementById('mcpAccountCalloutGuest');
  const userCallout = document.getElementById('mcpAccountCalloutUser');

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
