/**
 * Live WebMCP scan UI — start scan, poll progress, render scorecard.
 */
(function () {
  'use strict';

  const form = document.getElementById('webmcpScanForm');
  const live = document.getElementById('scanLive');
  const report = document.getElementById('scanReport');
  const errEl = document.getElementById('scanFormError');
  const submitBtn = document.getElementById('scanSubmitBtn');

  let pollTimer = null;
  let startedAt = 0;

  function coerceHttpsUrl(input) {
    let raw = String(input || '').trim();
    if (!raw) return '';
    raw = raw.replace(/^['"]|['"]$/g, '');
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
      raw = `https://${raw.replace(/^\/+/, '')}`;
    }
    return raw;
  }

  function showError(msg) {
    if (!errEl) return;
    errEl.hidden = !msg;
    errEl.textContent = msg || '';
  }

  function setTimer() {
    const el = document.getElementById('scanLiveTimer');
    if (!el || !startedAt) return;
    el.textContent = `${Math.max(0, Math.round((Date.now() - startedAt) / 1000))}s`;
  }

  function renderProgress(scan) {
    if (!live) return;
    live.hidden = false;
    const p = scan.progress || {};
    document.getElementById('scanLiveHost').textContent = scan.host || scan.url || '—';
    document.getElementById('scanLiveMsg').textContent = p.message || scan.status || 'Scanning…';
    const pages = p.pages_scanned || 0;
    const total = p.pages_total || 6;
    document.getElementById('scanLivePages').textContent = `${pages} / ${total}`;
    document.getElementById('scanLiveBar').style.width = `${Math.min(100, Math.round((pages / total) * 100))}%`;
    document.getElementById('scanStatTools').textContent = String(p.tools_detected || scan.result?.tool_count || 0);
    document.getElementById('scanStatPages').textContent = String(pages);
    document.getElementById('scanStatCrashes').textContent = String(p.crashes || 0);
    if (p.elapsed_ms) {
      document.getElementById('scanLiveTimer').textContent = `${Math.round(p.elapsed_ms / 1000)}s`;
    } else {
      setTimer();
    }
  }

  function renderReport(scan) {
    if (!report) return;
    report.hidden = false;
    const card = scan.scorecard || {};
    const result = scan.result || {};
    document.getElementById('scanGrade').textContent = card.readiness || card.grade || '—';
    document.getElementById('scanGradeLabel').textContent = card.label || 'Scan complete';
    document.getElementById('scanGradeMeta').textContent =
      `${card.score != null ? `${card.score}/100 · ` : ''}${result.tool_count || 0} tools · ${result.pages_scanned || 0} pages · scored ${card.graded_at || 'today'}`;

    const banner = document.getElementById('scanBanner');
    if (scan.status === 'failed') {
      banner.className = 'webmcp-scan__banner is-bad';
      banner.textContent = scan.error || 'Scan failed. Check the URL and try again.';
    } else if (scan.published) {
      banner.className = 'webmcp-scan__banner is-ok';
      banner.innerHTML = `${card.summary ? `${card.summary}<br/><br/>` : ''}Listed in the Influzer directory${scan.newsletter_subscribed ? ' · report emailed + newsletter signup saved' : ' · report emailed'}. <a href="/webmcp/sites/${scan.host}">View listing</a>`;
    } else {
      banner.className = 'webmcp-scan__banner';
      banner.textContent =
        card.summary || 'Scan finished, but no tools were detected — fix registration and rescan. A report was emailed if address was provided.';
    }

    const findings = document.getElementById('scanFindings');
    findings.innerHTML = '';
    (card.findings || []).forEach((f) => {
      const li = document.createElement('li');
      li.dataset.tone = f.tone || 'warn';
      li.textContent = f.text;
      findings.appendChild(li);
    });

    const tools = document.getElementById('scanTools');
    tools.innerHTML = '';
    (result.tools || []).slice(0, 12).forEach((t) => {
      const span = document.createElement('span');
      span.className = 'webmcp-chip';
      span.textContent = t.name;
      tools.appendChild(span);
    });
    if ((result.tool_count || 0) > 12) {
      const more = document.createElement('span');
      more.className = 'webmcp-note';
      more.textContent = `+${result.tool_count - 12} more`;
      tools.appendChild(more);
    }

    // Per-tool notes under chips
    let notesEl = document.getElementById('scanToolNotes');
    if (!notesEl) {
      notesEl = document.createElement('ul');
      notesEl.id = 'scanToolNotes';
      notesEl.className = 'webmcp-scan__findings';
      tools.insertAdjacentElement('afterend', notesEl);
    }
    notesEl.innerHTML = '';
    (card.tool_notes || []).slice(0, 8).forEach((n) => {
      const li = document.createElement('li');
      li.dataset.tone = n.status === 'strong' ? 'good' : n.status === 'ok' ? 'warn' : 'bad';
      const code = document.createElement('code');
      code.textContent = n.name;
      li.appendChild(code);
      li.appendChild(document.createTextNode(` — ${n.headline}`));
      notesEl.appendChild(li);
    });

    let nextEl = document.getElementById('scanNextActions');
    if (!nextEl) {
      nextEl = document.createElement('ol');
      nextEl.id = 'scanNextActions';
      nextEl.className = 'webmcp-scan__next';
      notesEl.insertAdjacentElement('afterend', nextEl);
    }
    nextEl.innerHTML = '';
    (card.next_actions || []).forEach((a) => {
      const li = document.createElement('li');
      li.textContent = a.text;
      nextEl.appendChild(li);
    });

    const actions = document.getElementById('scanReportActions');
    actions.innerHTML = '';
    if (scan.published && scan.host) {
      const a = document.createElement('a');
      a.className = 'webmcp-btn webmcp-btn--primary';
      a.href = `/webmcp/sites/${scan.host}`;
      a.textContent = 'Open directory listing';
      actions.appendChild(a);
    }
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'webmcp-btn webmcp-btn--ghost';
    again.textContent = 'Scan another site';
    again.addEventListener('click', () => {
      report.hidden = true;
      live.hidden = true;
      form.hidden = false;
      submitBtn.disabled = false;
    });
    actions.appendChild(again);

    const journeys = result.journeys || [];
    const journeyWrap = document.getElementById('scanJourneys');
    const journeyList = document.getElementById('scanJourneyList');
    if (journeys.length) {
      journeyWrap.hidden = false;
      journeyList.innerHTML = '';
      journeys.forEach((j) => {
        const li = document.createElement('li');
        li.textContent = j.prompt;
        if (j.recommended) {
          const tag = document.createElement('span');
          tag.className = 'webmcp-badge webmcp-badge--live';
          tag.textContent = 'Recommended';
          li.prepend(tag);
          li.prepend(document.createTextNode(' '));
        }
        journeyList.appendChild(li);
      });
    } else {
      journeyWrap.hidden = true;
    }
  }

  async function renderReportWithStarter(scan) {
    renderReport(scan);
    if (scan.status !== 'completed' || !scan.id) {
      renderStarter(null);
      return;
    }
    const starter = await fetchStarter(scan.id);
    renderStarter(starter);
  }

  async function fetchScan(id) {
    const res = await fetch(`/api/webmcp/v1/scans/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || data.error || 'Scan not found');
    return data.scan;
  }

  async function fetchStarter(id) {
    const res = await fetch(`/api/webmcp/v1/scans/${encodeURIComponent(id)}/starter`, {
      headers: { Accept: 'application/json' },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) return null;
    return data.starter;
  }

  function renderStarter(starter) {
    const wrap = document.getElementById('scanStarter');
    if (!wrap || !starter) {
      if (wrap) wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const meta = document.getElementById('scanStarterMeta');
    if (meta) {
      meta.textContent = `${starter.tool_count} suggested tool(s) · estimated grade after install: ${starter.estimated_grade_after || 'R2'}`;
    }

    const toolsEl = document.getElementById('scanStarterTools');
    if (toolsEl) {
      toolsEl.innerHTML = '';
      (starter.tools_suggested || []).forEach((t) => {
        const li = document.createElement('li');
        li.dataset.tone = 'good';
        const code = document.createElement('code');
        code.textContent = t.name;
        li.appendChild(code);
        li.appendChild(document.createTextNode(` (${t.kind}) — ${t.description}`));
        toolsEl.appendChild(li);
      });
    }

    const stepsEl = document.getElementById('scanStarterSteps');
    if (stepsEl) {
      stepsEl.innerHTML = '';
      (starter.install_steps || []).forEach((step) => {
        const li = document.createElement('li');
        li.textContent = step;
        stepsEl.appendChild(li);
      });
    }

    const codeEl = document.getElementById('scanStarterCode');
    if (codeEl) codeEl.textContent = starter.starter_js || '';

    const copyBtn = document.getElementById('scanStarterCopy');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(starter.starter_js || '');
          copyBtn.textContent = 'Copied';
          setTimeout(() => {
            copyBtn.textContent = 'Copy code';
          }, 1600);
        } catch {
          copyBtn.textContent = 'Copy failed';
        }
      };
    }
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function poll(id) {
    stopPoll();
    pollTimer = setInterval(async () => {
      try {
        setTimer();
        const scan = await fetchScan(id);
        renderProgress(scan);
        if (scan.status === 'completed' || scan.status === 'failed') {
          stopPoll();
          renderProgress(scan);
          renderReportWithStarter(scan);
          submitBtn.disabled = false;
          const url = new URL(window.location.href);
          url.searchParams.set('scan', id);
          window.history.replaceState({}, '', url);
        }
      } catch (err) {
        stopPoll();
        showError(err.message || 'Polling failed');
        submitBtn.disabled = false;
      }
    }, 900);
  }

  async function startScan(payload) {
    showError('');
    submitBtn.disabled = true;
    report.hidden = true;
    startedAt = Date.now();
    live.hidden = false;
    document.getElementById('scanLiveHost').textContent = payload.url;
    document.getElementById('scanLiveMsg').textContent = 'Request received — scan starting…';
    document.getElementById('scanLiveBar').style.width = '5%';

    const res = await fetch('/api/webmcp/v1/scans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      showError(data.message || data.error || 'Could not start scan');
      submitBtn.disabled = false;
      return;
    }
    form.hidden = true;
    renderProgress(data.scan);
    poll(data.scan.id);
  }

  if (form) {
    const urlInput = document.getElementById('scanUrl');
    if (urlInput) {
      urlInput.addEventListener('blur', () => {
        const next = coerceHttpsUrl(urlInput.value);
        if (next) urlInput.value = next;
      });
    }
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const email = document.getElementById('scanEmail').value.trim();
      let url = coerceHttpsUrl(document.getElementById('scanUrl').value);
      if (urlInput) urlInput.value = url;
      const relationship = document.getElementById('scanRelationship').value;
      const newsletter = document.getElementById('scanNewsletter').checked;
      const honey = form.querySelector('[name="company_website"]')?.value;
      if (!email || !url) {
        showError('Email and site URL are required.');
        return;
      }
      startScan({ email, url, relationship, newsletter, company_website: honey || '' }).catch((err) => {
        showError(err.message || 'Scan failed to start');
        submitBtn.disabled = false;
      });
    });
  }

  const initial = window.__WEBMCP_SCAN_INITIAL__;
  if (initial) {
    startedAt = Date.now();
    form.hidden = true;
    live.hidden = false;
    fetchScan(initial)
      .then((scan) => {
        renderProgress(scan);
        if (scan.status === 'completed' || scan.status === 'failed') renderReportWithStarter(scan);
        else poll(initial);
      })
      .catch((err) => {
        form.hidden = false;
        showError(err.message || 'Could not resume scan');
      });
  }
})();
