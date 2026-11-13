(function () {
  const form = document.getElementById('mcpCheckForm');
  const submit = document.getElementById('checkSubmit');
  if (!form || !submit) return;

  form.addEventListener('submit', () => {
    const action = form.getAttribute('action') || '/mcp/check';
    if (action.indexOf('token=') !== -1 || action.indexOf('?') !== -1) {
      form.setAttribute('action', '/mcp/check');
    }
    submit.disabled = true;
    submit.textContent = 'Checking…';
  });
})();
