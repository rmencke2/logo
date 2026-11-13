(function () {
  const form = document.getElementById('mcpCheckForm');
  const submit = document.getElementById('checkSubmit');
  const urlInput = document.getElementById('checkUrl');

  function normalizeCheckUrl(value) {
    let raw = String(value || '').trim().replace(/^['"]|['"]$/g, '');
    if (!raw) return '';
    while (/^https?:\/\/https?:\/\//i.test(raw)) {
      raw = raw.replace(/^https?:\/\//i, '');
    }
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
      raw = 'https://' + raw.replace(/^\/+/, '');
    }
    return raw;
  }

  if (urlInput) {
    const placeCaret = function () {
      if (urlInput.value !== 'https://') return;
      urlInput.setSelectionRange(8, 8);
    };
    urlInput.addEventListener('focus', function () {
      setTimeout(placeCaret, 0);
    });
    urlInput.addEventListener('mouseup', function (event) {
      if (urlInput.value !== 'https://') return;
      event.preventDefault();
      placeCaret();
    });
    urlInput.addEventListener('paste', function (event) {
      const pasted = (event.clipboardData && event.clipboardData.getData('text') || '').trim();
      if (!/^https?:\/\//i.test(pasted)) return;
      const current = urlInput.value || '';
      const start = urlInput.selectionStart || 0;
      const end = urlInput.selectionEnd || 0;
      const joined = current.slice(0, start) + pasted + current.slice(end);
      const next = normalizeCheckUrl(joined);
      if (next === joined) return;
      event.preventDefault();
      urlInput.value = next;
      urlInput.setSelectionRange(next.length, next.length);
    });
  }

  document.querySelectorAll('.check-trial').forEach(function (trialForm) {
    trialForm.addEventListener('submit', function () {
      const action = trialForm.getAttribute('action') || '';
      const clean = action.split('?')[0];
      if (clean && clean !== action) trialForm.setAttribute('action', clean);
      const button = trialForm.querySelector('button[type="submit"]');
      if (button) {
        button.disabled = true;
        button.textContent = 'Trying…';
      }
    });
  });

  if (!form || !submit) return;

  const prepareUrl = function () {
    if (!urlInput) return;
    const next = normalizeCheckUrl(urlInput.value);
    if (next) urlInput.value = next;
  };

  submit.addEventListener('click', prepareUrl);
  form.addEventListener('submit', function () {
    prepareUrl();
    const action = form.getAttribute('action') || '/mcp/check';
    if (action.indexOf('token=') !== -1 || action.indexOf('?') !== -1) {
      form.setAttribute('action', '/mcp/check');
    }
    submit.disabled = true;
    submit.textContent = 'Checking…';
  });
})();
