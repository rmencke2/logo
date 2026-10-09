(function () {
  const form = document.getElementById('promoteForm');
  const status = document.getElementById('promoteStatus');
  const submit = document.getElementById('promoteSubmit');
  if (!form) return;

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
