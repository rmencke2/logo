(function () {
  const form = document.getElementById('homeNewsletterForm');
  if (!form) return;

  const emailEl = document.getElementById('homeNewsletterEmail');
  const submitEl = document.getElementById('homeNewsletterSubmit');
  const statusEl = document.getElementById('homeNewsletterStatus');
  const hpEl = document.getElementById('homeNewsletterWebsite');
  const card = document.getElementById('newsletter');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!emailEl || !submitEl) return;

    const email = String(emailEl.value || '').trim();
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.classList.remove('is-error', 'is-success');
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (statusEl) {
        statusEl.textContent = 'Please enter a valid email address.';
        statusEl.classList.add('is-error');
      }
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
      if (card) card.classList.add('is-subscribed');
      emailEl.value = '';
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = err.message || 'Subscription failed. Please try again.';
        statusEl.classList.add('is-error');
      }
    } finally {
      submitEl.disabled = false;
    }
  });
})();
