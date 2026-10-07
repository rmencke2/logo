(function () {
  const form = document.getElementById('probeForm');
  const input = document.getElementById('probeUrl');
  const submit = document.getElementById('probeSubmit');
  const resultEl = document.getElementById('probeResult');
  const resultCode = resultEl && resultEl.querySelector('code');
  const statusEl = document.getElementById('probeStatus');
  if (!form || !input || !resultEl || !resultCode || !statusEl) return;

  function show(payload, label) {
    resultEl.hidden = false;
    resultCode.textContent = JSON.stringify(payload, null, 2);
    statusEl.hidden = false;
    statusEl.textContent = label;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const url = String(input.value || '').trim();
    if (!url) return;
    submit.disabled = true;
    statusEl.hidden = false;
    statusEl.textContent = 'Handshaking…';
    resultEl.hidden = true;
    try {
      const res = await fetch(`/api/v1/probe?url=${encodeURIComponent(url)}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();
      const live = data.live_status || data.error || res.status;
      show(data, `${res.status} · ${live}`);
    } catch (err) {
      show({ ok: false, error: 'network', message: err.message }, 'Request failed');
    } finally {
      submit.disabled = false;
    }
  });
})();
