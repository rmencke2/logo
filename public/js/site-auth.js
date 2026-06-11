/**
 * Site-wide header auth: login link, user menu, session state.
 */
(function () {
  const authRoot = document.getElementById('siteHeaderAuth');
  if (!authRoot) return;

  const guestEl = document.getElementById('siteHeaderAuthGuest');
  const userEl = document.getElementById('siteHeaderAuthUser');
  const userMenu = document.getElementById('siteHeaderUserMenu');
  const userTrigger = document.getElementById('siteHeaderUserTrigger');
  const userNameEl = document.getElementById('siteHeaderUserName');
  const userEmailEl = document.getElementById('siteHeaderUserEmail');
  const userAvatarEl = document.getElementById('siteHeaderUserAvatar');
  const adminLink = document.getElementById('siteHeaderAdminLink');
  const logoutBtn = document.getElementById('siteHeaderLogoutBtn');

  function loginUrl() {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    return `/login?redirect=${redirect}`;
  }

  function setGuest() {
    if (guestEl) guestEl.hidden = false;
    if (userEl) userEl.hidden = true;
  }

  function setUser(user, isAdmin) {
    if (guestEl) guestEl.hidden = true;
    if (userEl) userEl.hidden = false;
    const label = user.name || user.email || 'Account';
    if (userNameEl) userNameEl.textContent = label;
    if (userEmailEl) userEmailEl.textContent = user.email || '';
    if (userAvatarEl) {
      if (user.avatarUrl) {
        userAvatarEl.style.backgroundImage = `url(${user.avatarUrl})`;
        userAvatarEl.textContent = '';
      } else {
        userAvatarEl.style.backgroundImage = '';
        userAvatarEl.textContent = (label.charAt(0) || 'U').toUpperCase();
      }
    }
    if (adminLink) adminLink.hidden = !isAdmin;
  }

  async function refreshAuth() {
    try {
      const res = await fetch('/auth/me', { credentials: 'include' });
      if (!res.ok) {
        setGuest();
        return;
      }
      const data = await res.json();
      let isAdmin = false;
      try {
        const adminRes = await fetch('/admin/api/check', { credentials: 'include' });
        if (adminRes.ok) {
          const adminData = await adminRes.json();
          isAdmin = !!adminData.isAdmin;
        }
      } catch (_err) {
        isAdmin = false;
      }
      setUser(data.user, isAdmin);
    } catch (_err) {
      setGuest();
    }
  }

  if (userTrigger && userMenu) {
    userTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.classList.toggle('is-open');
    });
    document.addEventListener('click', () => userMenu.classList.remove('is-open'));
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
      } catch (_err) {
        /* ignore */
      }
      window.location.href = '/';
    });
  }

  const loginLink = document.getElementById('siteHeaderLoginLink');
  if (loginLink) {
    loginLink.addEventListener('click', (e) => {
      if (loginLink.getAttribute('href') === '#') {
        e.preventDefault();
        window.location.href = loginUrl();
      }
    });
  }

  refreshAuth();
})();
