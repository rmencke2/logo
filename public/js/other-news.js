(function () {
  document.querySelectorAll('[data-other-news-subscribe]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const emailInput = form.querySelector('input[type="email"]');
      const hpInput = form.querySelector('.other-news-hp');
      const statusEl = form.querySelector('.other-news-newsletter__status');
      const submitBtn = form.querySelector('button[type="submit"]');
      if (!emailInput || !statusEl || !submitBtn) return;

      const email = String(emailInput.value || '').trim();
      statusEl.textContent = '';
      statusEl.classList.remove('is-error', 'is-success');

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        statusEl.textContent = 'Please enter a valid email address.';
        statusEl.classList.add('is-error');
        return;
      }

      submitBtn.disabled = true;
      try {
        const response = await fetch('/api/newsletter/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            source: 'in-other-news',
            website: hpInput ? hpInput.value : '',
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Subscription failed.');
        statusEl.textContent = data.message || "You're in!";
        statusEl.classList.add('is-success');
        emailInput.value = '';
      } catch (err) {
        statusEl.textContent = err.message || 'Subscription failed.';
        statusEl.classList.add('is-error');
      } finally {
        submitBtn.disabled = false;
      }
    });
  });
})();
