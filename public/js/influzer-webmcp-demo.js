/**
 * Interactive demo console for Influzer WebMCP tools.
 * Works with native document.modelContext or the Influzer demo polyfill.
 */
(function () {
  'use strict';

  const els = {
    status: document.getElementById('webmcp-demo-status'),
    mode: document.getElementById('webmcp-demo-mode'),
    toolSelect: document.getElementById('webmcp-demo-tool'),
    args: document.getElementById('webmcp-demo-args'),
    schema: document.getElementById('webmcp-demo-schema'),
    run: document.getElementById('webmcp-demo-run'),
    refresh: document.getElementById('webmcp-demo-refresh'),
    output: document.getElementById('webmcp-demo-output'),
    log: document.getElementById('webmcp-demo-log'),
    presets: document.getElementById('webmcp-demo-presets'),
  };

  const PRESETS = {
    get_influzer_overview: {},
    get_webmcp_directory_stats: {},
    search_webmcp_sites: { q: 'chat', limit: 5 },
    get_webmcp_site: { host: 'influzer.ai', include_schemas: false },
    search_webmcp_tools: { q: 'search', kind: 'answer', limit: 8 },
    search_mcp_servers: { q: 'browser', scope: 'top', limit: 5 },
    get_mcp_server: { slug: 'playwright', include_tools: true },
    recommend_agent_stack: {
      goal: 'e-commerce app with cart checkout and Postgres database',
      limit: 5,
      include_tool_details: true,
    },
    list_latest_insights: { limit: 3 },
    navigate_influzer: { path: '/webmcp' },
    open_webmcp_site: { host: 'influzer.ai', path: '/' },
    start_webmcp_listing_scan: {
      url: 'https://www.influzer.ai/webmcp/demo',
      email: 'demo@example.com',
      user_confirmed: true,
      relationship: 'researcher',
      newsletter: false,
    },
    get_webmcp_listing_scan: { scan_id: 'paste-scan-id-here' },
  };

  function log(line) {
    if (!els.log) return;
    const time = new Date().toISOString().slice(11, 19);
    els.log.textContent = `[${time}] ${line}\n${els.log.textContent}`.slice(0, 4000);
  }

  function setStatus(text, ok) {
    if (!els.status) return;
    els.status.textContent = text;
    els.status.dataset.state = ok ? 'ok' : 'warn';
  }

  function pretty(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  async function waitForReady(timeoutMs = 4000) {
    if (window.__INFLUZER_WEBMCP__?.ok) return window.__INFLUZER_WEBMCP__;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(window.__INFLUZER_WEBMCP__ || { ok: false }), timeoutMs);
      document.addEventListener(
        'influzer-webmcp-ready',
        (ev) => {
          clearTimeout(timer);
          resolve(ev.detail || window.__INFLUZER_WEBMCP__);
        },
        { once: true },
      );
    });
  }

  async function listTools() {
    if (!document.modelContext?.getTools) return [];
    return document.modelContext.getTools();
  }

  function fillToolSelect(tools) {
    if (!els.toolSelect) return;
    els.toolSelect.innerHTML = '';
    for (const tool of tools) {
      const opt = document.createElement('option');
      opt.value = tool.name;
      opt.textContent = tool.name;
      els.toolSelect.appendChild(opt);
    }
    if (tools.length) {
      onToolChange();
    }
  }

  function onToolChange() {
    const name = els.toolSelect?.value;
    const tools = window.__WEBMCP_DEMO_TOOLS__ || [];
    const tool = tools.find((t) => t.name === name);
    if (els.schema) {
      els.schema.textContent = pretty(tool?.inputSchema || { type: 'object' });
    }
    if (els.args && name in PRESETS) {
      els.args.value = pretty(PRESETS[name]);
    } else if (els.args && !els.args.value.trim()) {
      els.args.value = '{\n}\n';
    }
  }

  async function refresh() {
    const state = await waitForReady();
    const tools = await listTools();
    window.__WEBMCP_DEMO_TOOLS__ = tools;

    if (els.mode) {
      if (state?.native) els.mode.textContent = 'Native WebMCP (document.modelContext)';
      else if (state?.polyfill) els.mode.textContent = 'Demo polyfill (local-only Model Context)';
      else els.mode.textContent = 'Unavailable';
    }

    if (!tools.length) {
      setStatus('No tools registered yet. Reload the page or check the console.', false);
      fillToolSelect([]);
      return;
    }

    setStatus(`${tools.length} tool${tools.length === 1 ? '' : 's'} ready`, true);
    fillToolSelect(tools);
    log(`Discovered ${tools.length} tools via getTools()`);
  }

  async function runSelected() {
    const name = els.toolSelect?.value;
    if (!name) return;
    let args = {};
    try {
      args = els.args?.value?.trim() ? JSON.parse(els.args.value) : {};
    } catch (err) {
      els.output.textContent = `Invalid JSON arguments: ${err.message}`;
      return;
    }

    els.run.disabled = true;
    els.output.textContent = 'Running…';
    log(`executeTool(${name}, ${JSON.stringify(args)})`);
    try {
      const tools = await listTools();
      const tool = tools.find((t) => t.name === name) || { name };
      const result = await document.modelContext.executeTool(tool, args);
      els.output.textContent = pretty(result);
      log(`OK ${name}`);
    } catch (err) {
      els.output.textContent = String(err && err.stack ? err.stack : err);
      log(`FAIL ${name}: ${err.message || err}`);
    } finally {
      els.run.disabled = false;
    }
  }

  function wirePresets() {
    if (!els.presets) return;
    els.presets.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-preset]');
      if (!btn) return;
      const name = btn.getAttribute('data-preset');
      if (!els.toolSelect) return;
      els.toolSelect.value = name;
      onToolChange();
      if (PRESETS[name]) els.args.value = pretty(PRESETS[name]);
    });
  }

  function init() {
    if (els.toolSelect) els.toolSelect.addEventListener('change', onToolChange);
    if (els.run) els.run.addEventListener('click', runSelected);
    if (els.refresh) els.refresh.addEventListener('click', refresh);
    wirePresets();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
