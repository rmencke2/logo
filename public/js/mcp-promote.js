(function () {
  const form = document.getElementById('promoteForm');
  const status = document.getElementById('promoteStatus');
  const submit = document.getElementById('promoteSubmit');
  const copyBtn = document.getElementById('prospectsCopy');
  const tsvEl = document.getElementById('prospectsTsv');
  const copyStatus = document.getElementById('prospectsCopyStatus');

  if (copyBtn && tsvEl) {
    copyBtn.addEventListener('click', async () => {
      const text = tsvEl.value || '';
      if (!text) return;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          tsvEl.hidden = false;
          tsvEl.focus();
          tsvEl.select();
          document.execCommand('copy');
          tsvEl.hidden = true;
        }
        copyBtn.textContent = 'Copied';
        if (copyStatus) copyStatus.textContent = 'TSV copied — paste into a sheet or CRM for outreach.';
        setTimeout(() => {
          copyBtn.textContent = 'Copy TSV';
        }, 2000);
      } catch {
        copyBtn.textContent = 'Copy failed';
      }
    });
  }

  if (!form) return;

  try {
    const params = new URLSearchParams(window.location.search || '');
    const slug = (params.get('slug') || '').trim();
    if (slug && form.elements.namedItem('slug') && !form.elements.namedItem('slug').value) {
      form.elements.namedItem('slug').value = slug;
    }
  } catch {
    /* ignore */
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    submit.disabled = true;
    status.textContent = 'Starting checkout…';
    try {
      const res = await fetch('/api/v1/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        status.textContent = json.error || 'Could not start checkout.';
        submit.disabled = false;
        return;
      }
      if (json.checkout_url) {
        window.location.href = json.checkout_url;
        return;
      }
      status.textContent =
        'Request saved. We will invoice hello@influzer.ai — set STRIPE_SECRET_KEY on the server for instant Checkout.';
    } catch {
      status.textContent = 'Network error. Email hello@influzer.ai.';
      submit.disabled = false;
    }
  });
})();
