/**
 * Insights index — category pill filter (featured card stays visible).
 */
(function () {
  const filters = document.getElementById('insightsFilters');
  const grid = document.getElementById('insightsGrid');
  const empty = document.getElementById('insightsEmpty');
  if (!filters || !grid) return;

  const cards = Array.from(grid.querySelectorAll('.insights-card'));

  function apply(cat) {
    let visible = 0;
    cards.forEach((card) => {
      const cats = (card.dataset.cats || '').split(',').filter(Boolean);
      const show = cat === 'All' || cats.includes(cat);
      card.classList.toggle('is-hidden', !show);
      if (show) visible += 1;
    });
    if (empty) empty.hidden = visible > 0 || cards.length === 0;
  }

  filters.addEventListener('click', (e) => {
    const btn = e.target.closest('.insights-pill');
    if (!btn) return;
    filters.querySelectorAll('.insights-pill').forEach((b) => {
      b.classList.toggle('is-active', b === btn);
    });
    apply(btn.dataset.cat || 'All');
  });
})();
