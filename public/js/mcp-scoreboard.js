(function () {
  const table = document.getElementById('handshakeBoard');
  if (!table) return;
  const rows = Array.from(table.querySelectorAll('.board-row'));
  const pills = Array.from(document.querySelectorAll('.board-stat[data-filter]'));

  function apply(status) {
    rows.forEach((row) => {
      const match = !status || row.getAttribute('data-status') === status;
      row.hidden = !match;
    });
    pills.forEach((pill) => {
      pill.classList.toggle('is-active', (pill.getAttribute('data-filter') || '') === status);
    });
    const url = new URL(window.location.href);
    if (status) url.searchParams.set('status', status);
    else url.searchParams.delete('status');
    window.history.replaceState({}, '', url);
  }

  pills.forEach((pill) => {
    pill.addEventListener('click', (event) => {
      event.preventDefault();
      apply(pill.getAttribute('data-filter') || '');
    });
  });
})();
