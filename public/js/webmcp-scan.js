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
    document.getElementById('scanGrade').textContent = card.grade || '—';
    document.getElementById('scanGradeLabel').textContent = card.label || 'Scan complete';
    document.getElementById('scanGradeMeta').textContent =
      `${result.tool_count || 0} tools · ${result.pages_scanned || 0} pages · graded ${card.graded_at || 'today'}`;

    const banner = document.getElementById('scanBanner');
    if (scan.published) {
      banner.className = 'webmcp-scan__banner is-ok';
      banner.innerHTML = `Listed in the Influzer directory${scan.newsletter_subscribed ? ' · newsletter signup saved' : ''}. <a href="/webmcp/sites/${scan.host}">View listing</a>`;
    } else if (scan.status === 'failed') {
      banner.className = 'webmcp-scan__banner is-bad';
      banner.textContent = scan.error || 'Scan failed. Check the URL and try again.';
    } else {
      banner.className = 'webmcp-scan__banner';
      banner.textContent = 'Scan finished, but no tools were detected — fix registration and rescan.';
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

  async function fetchScan(id) {
    const res = await fetch(`/api/webmcp/v1/scans/${encodeURIComponent(id)}`, {
      headers: { Accept: 'application/json' },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || data.error || 'Scan not found');
    return data.scan;
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
          renderReport(scan);
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
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const email = document.getElementById('scanEmail').value.trim();
      const url = document.getElementById('scanUrl').value.trim();
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
        if (scan.status === 'completed' || scan.status === 'failed') renderReport(scan);
        else poll(initial);
      })
      .catch((err) => {
        form.hidden = false;
        showError(err.message || 'Could not resume scan');
      });
  }
})();
