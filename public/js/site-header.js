/**
 * Shared site header: mobile nav + Tools dropdown.
 */
(function () {
  function initSiteHeader() {
    const header = document.getElementById('siteHeader');
    const toggle = document.getElementById('navMenuToggle');
    const nav = document.getElementById('mainSiteNav');
    const dropdown = document.getElementById('toolsDropdown');
    const dropdownBtn = document.getElementById('toolsDropdownBtn');

    if (!header) return;

    document.body.classList.add('site-header-active');

    if (toggle && nav) {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !header.classList.contains('is-nav-open');
        header.classList.toggle('is-nav-open', open);
        toggle.setAttribute('aria-expanded', open);
      });

      nav.querySelectorAll('a').forEach((a) => {
        a.addEventListener('click', () => {
          header.classList.remove('is-nav-open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });

      document.addEventListener('click', (e) => {
        if (header.classList.contains('is-nav-open') && !header.contains(e.target)) {
          header.classList.remove('is-nav-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && header.classList.contains('is-nav-open')) {
          header.classList.remove('is-nav-open');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    }

    if (dropdown && dropdownBtn) {
      dropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !dropdown.classList.contains('is-open');
        dropdown.classList.toggle('is-open', open);
        dropdownBtn.setAttribute('aria-expanded', open);
      });

      document.addEventListener('click', () => {
        dropdown.classList.remove('is-open');
        dropdownBtn.setAttribute('aria-expanded', 'false');
      });

      dropdown.addEventListener('click', (e) => e.stopPropagation());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSiteHeader);
  } else {
    initSiteHeader();
  }
})();
