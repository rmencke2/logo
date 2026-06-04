(function () {
  const form = document.getElementById('homeNewsletterForm');
  if (!form) return;

  const emailEl = document.getElementById('homeNewsletterEmail');
  const submitEl = document.getElementById('homeNewsletterSubmit');
  const statusEl = document.getElementById('homeNewsletterStatus');
  const hpEl = document.getElementById('homeNewsletterWebsite');

  const SUCCESS_MSG = "You're in! First issue arrives Thursday.";

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!emailEl || !submitEl || !statusEl) return;

    const email = String(emailEl.value || '').trim();
    statusEl.textContent = '';
    statusEl.classList.remove('is-error', 'is-success');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      statusEl.textContent = 'Please enter a valid email address.';
      statusEl.classList.add('is-error');
      emailEl.focus();
      return;
    }

    submitEl.disabled = true;
    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          source: 'home-newsletter-card',
          website: hpEl ? hpEl.value : '',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Subscription failed. Please try again.');
      }
      statusEl.textContent = SUCCESS_MSG;
      statusEl.classList.add('is-success');
      emailEl.value = '';
    } catch (err) {
      statusEl.textContent = err.message || 'Subscription failed. Please try again.';
      statusEl.classList.add('is-error');
    } finally {
      submitEl.disabled = false;
    }
  });
})();
