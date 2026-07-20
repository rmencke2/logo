/**
 * Article reactions + comments (ported from previous inline blog-post script).
 */
(function () {
  const cfg = window.__ARTICLE_FEEDBACK__;
  if (!cfg || !cfg.slug) return;

  const section = document.querySelector('.feedback-section');
  if (!section) return;

  const slug = cfg.slug;
  const reactionButtons = section.querySelectorAll('.reaction-btn');
  const commentForm = document.querySelector('#commentForm');
  const commentName = document.querySelector('#commentName');
  const commentBody = document.querySelector('#commentBody');
  const commentStatus = document.querySelector('#commentStatus');
  const commentSubmit = document.querySelector('#commentSubmit');
  const commentList = document.querySelector('#commentList');
  const commentWebsite = document.querySelector('#commentWebsite');
  const storedNameKey = 'influzer:commenter-name';
  const hasTurnstile = Boolean(cfg.hasTurnstile);

  try {
    const storedName = localStorage.getItem(storedNameKey);
    if (storedName && commentName) commentName.value = storedName;
  } catch (_) {
    /* ignore */
  }

  function setStatus(message, type) {
    if (!commentStatus) return;
    commentStatus.textContent = message || '';
    commentStatus.style.color = type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '';
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]),
    );
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return '';
    }
  }

  function renderReactions(data) {
    const counts = (data && data.reactions) || { up: 0, down: 0 };
    const userReaction = data && data.userReaction;
    section.querySelectorAll('[data-count]').forEach((el) => {
      const key = el.getAttribute('data-count');
      el.textContent = counts[key] != null ? counts[key] : 0;
    });
    reactionButtons.forEach((btn) => {
      const r = btn.getAttribute('data-reaction');
      const active = userReaction === r;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      btn.classList.toggle('is-up', active && r === 'up');
      btn.classList.toggle('is-down', active && r === 'down');
    });
  }

  function renderComments(comments) {
    if (!commentList) return;
    commentList.innerHTML = '';
    if (!comments || comments.length === 0) {
      const p = document.createElement('p');
      p.id = 'commentsEmpty';
      p.style.cssText = 'font-size:14px;color:var(--hp-muted2);';
      p.textContent = 'Be the first to share your thoughts.';
      commentList.appendChild(p);
      return;
    }
    comments.forEach((c) => {
      const wrapper = document.createElement('div');
      wrapper.style.cssText =
        'padding:14px 0;border-top:1px solid var(--hp-border);font-size:14px;';
      wrapper.innerHTML =
        '<div style="font-size:12.5px;color:var(--hp-muted2);margin-bottom:6px;"><strong style="color:var(--hp-text);">' +
        escapeHtml(c.name) +
        '</strong> · ' +
        escapeHtml(formatDate(c.created_at)) +
        '</div><div style="line-height:1.55;white-space:pre-wrap;color:var(--hp-near);">' +
        escapeHtml(c.comment) +
        '</div>';
      commentList.appendChild(wrapper);
    });
  }

  async function loadFeedback() {
    try {
      const res = await fetch('/api/blog/' + encodeURIComponent(slug) + '/feedback', {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return;
      const data = await res.json();
      renderReactions(data);
      renderComments(data.comments);
    } catch (_) {
      /* ignore */
    }
  }

  async function toggleReaction(reaction) {
    try {
      const res = await fetch('/api/blog/' + encodeURIComponent(slug) + '/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ reaction }),
      });
      if (!res.ok) return;
      const data = await res.json();
      renderReactions(data);
    } catch (_) {
      /* ignore */
    }
  }

  reactionButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleReaction(btn.getAttribute('data-reaction'));
    });
  });

  if (commentForm) {
    commentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = commentName.value.trim();
      const comment = commentBody.value.trim();
      const honeypot = commentWebsite ? commentWebsite.value.trim() : '';
      if (name.length < 2 || comment.length < 2) {
        setStatus('Please add your name and a comment.', 'error');
        return;
      }
      if (honeypot) {
        setStatus('Spam check failed.', 'error');
        return;
      }
      let turnstileToken = '';
      if (hasTurnstile) {
        turnstileToken =
          window.turnstile && typeof window.turnstile.getResponse === 'function'
            ? window.turnstile.getResponse()
            : '';
        if (!turnstileToken) {
          setStatus('Please complete the anti-spam check.', 'error');
          return;
        }
      }
      commentSubmit.disabled = true;
      setStatus('Posting...', '');
      try {
        const res = await fetch('/api/blog/' + encodeURIComponent(slug) + '/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ name, comment, turnstileToken }),
        });
        const data = await res.json();
        if (!res.ok) {
          setStatus((data && data.error) || 'Something went wrong.', 'error');
        } else {
          try {
            localStorage.setItem(storedNameKey, name);
          } catch (_) {
            /* ignore */
          }
          commentBody.value = '';
          setStatus('Thanks for your comment.', 'success');
          renderComments(data.comments);
          if (hasTurnstile && window.turnstile && typeof window.turnstile.reset === 'function') {
            window.turnstile.reset();
          }
        }
      } catch (_) {
        setStatus('Network error. Please try again.', 'error');
      } finally {
        commentSubmit.disabled = false;
      }
    });
  }

  loadFeedback();
})();
