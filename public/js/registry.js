/**
 * Shared registry chrome: theme toggle + mobile nav.
 * Works on .home-page and .registry-page bodies.
 */
(function () {
  const body = document.body;
  if (!body.classList.contains('home-page') && !body.classList.contains('registry-page')) return;

  const themeBtn = document.getElementById('homeThemeToggle');
  const nav = document.getElementById('siteHeader');
  const navToggle = document.getElementById('navMenuToggle');
  const THEME_KEY = 'influzer-home-theme';
  let themeAnimTimer = null;

  try {
    if (localStorage.getItem(THEME_KEY) === 'dark') {
      body.classList.add('dark');
      if (themeBtn) themeBtn.textContent = '☀';
    }
  } catch (_) {
    /* ignore */
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      body.classList.add('theme-anim');
      const dark = body.classList.toggle('dark');
      themeBtn.textContent = dark ? '☀' : '☾';
      try {
        localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
      } catch (_) {
        /* ignore */
      }
      clearTimeout(themeAnimTimer);
      themeAnimTimer = setTimeout(() => body.classList.remove('theme-anim'), 350);
    });
  }

  if (nav && navToggle) {
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('is-open') && !nav.contains(e.target)) {
        nav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
})();
