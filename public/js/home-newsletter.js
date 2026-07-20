/**
 * Registry newsletter forms — supports multiple cards via [data-newsletter-form].
 */
(function () {
  document.querySelectorAll('[data-newsletter-form]').forEach((form) => {
    const card = form.closest('.home-nl');
    const emailEl = form.querySelector('input[type="email"]');
    const submitEl = form.querySelector('button[type="submit"]');
    const statusEl = form.querySelector('[data-newsletter-status]');
    const hpEl = form.querySelector('.home-nl__hp');
    const source = (card && card.getAttribute('data-newsletter-source')) || 'registry-newsletter';

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!emailEl || !submitEl) return;

      const email = String(emailEl.value || '').trim();
      if (statusEl) {
        statusEl.textContent = '';
        statusEl.classList.remove('is-error');
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
            source,
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
  });
})();
