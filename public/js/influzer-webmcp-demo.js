/**
 * Interactive demo console + filmable video tour for Influzer WebMCP tools.
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
    tourRoot: document.getElementById('webmcp-tour'),
    tourStart: document.getElementById('webmcp-tour-start'),
    tourNext: document.getElementById('webmcp-tour-next'),
    tourSkip: document.getElementById('webmcp-tour-skip'),
    tourStop: document.getElementById('webmcp-tour-stop'),
    tourKicker: document.getElementById('webmcp-tour-kicker'),
    tourHeading: document.getElementById('webmcp-tour-heading'),
    tourSay: document.getElementById('webmcp-tour-say'),
    tourDo: document.getElementById('webmcp-tour-do'),
    tourBar: document.getElementById('webmcp-tour-bar'),
    tourOutput: document.getElementById('webmcp-tour-output'),
  };

  const PRESETS = {
    get_influzer_overview: {},
    get_webmcp_directory_stats: {},
    search_webmcp_sites: { q: 'chat', limit: 5 },
    get_webmcp_site: { host: 'influzer.ai', include_schemas: false },
    search_webmcp_tools: { q: 'search', kind: 'answer', limit: 8 },
    search_mcp_servers: { q: 'browser', scope: 'top', limit: 5 },
    get_mcp_server: { slug: 'playwright' },
    get_best_mcp_client: { slug: 'claude' },
    list_best_mcp_clients: {},
    list_latest_insights: { limit: 3 },
    navigate_influzer: { path: '/webmcp' },
  };

  const TOUR_SCENES = [
    {
      title: 'Detect WebMCP on this page',
      say: 'First we check whether the browser exposes document.modelContext — native via the origin trial, or Influzer’s demo polyfill.',
      do: 'Read Status and Mode in the hero. Then list tools with getTools().',
      async run() {
        const state = window.__INFLUZER_WEBMCP__ || {};
        const tools = await listTools();
        return {
          status: state.ok ? 'ready' : 'unavailable',
          mode: state.native ? 'native' : state.polyfill ? 'polyfill' : 'none',
          tool_count: tools.length,
          tools: tools.map((t) => t.name),
        };
      },
    },
    {
      title: 'Orient the agent',
      say: 'Agents start with an overview: what Influzer is, and which URLs matter for MCP vs WebMCP.',
      do: 'executeTool(get_influzer_overview)',
      tool: 'get_influzer_overview',
      args: {},
    },
    {
      title: 'Search the WebMCP directory',
      say: 'Now the agent searches websites that already expose browser tools — same shape as a catalog lookup.',
      do: 'executeTool(search_webmcp_sites, { q: "chat", limit: 5 })',
      tool: 'search_webmcp_sites',
      args: { q: 'chat', limit: 5 },
    },
    {
      title: 'Recommend MCP servers for Claude',
      say: 'WebMCP can also surface Influzer’s editorial guides — here, Best MCP servers for Claude with starter stacks.',
      do: 'executeTool(get_best_mcp_client, { slug: "claude" })',
      tool: 'get_best_mcp_client',
      args: { slug: 'claude' },
    },
    {
      title: 'Open a server detail profile',
      say: 'Finally, pull install details for one server. On /mcp/{slug} pages, get_current_mcp_server and copy_mcp_connection work from page context.',
      do: 'executeTool(get_mcp_server, { slug: "playwright" })',
      tool: 'get_mcp_server',
      args: { slug: 'playwright' },
    },
  ];

  let tourIndex = 0;
  let tourActive = false;

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

  async function executeNamed(name, args) {
    const tools = await listTools();
    const tool = tools.find((t) => t.name === name);
    if (!tool) throw new Error(`Tool not found: ${name}`);
    // Native WebMCP requires the 2nd arg as a JSON *string* (objects throw
    // UnknownError: Failed to parse input arguments). Polyfill accepts both.
    const payload = typeof args === 'string' ? args : JSON.stringify(args ?? {});
    const raw = await document.modelContext.executeTool(tool, payload);
    return normalizeExecuteResult(raw);
  }

  function normalizeExecuteResult(raw) {
    if (raw == null) return raw;
    if (typeof raw !== 'string') return raw;
    try {
      let parsed = JSON.parse(raw);
      // Some native builds double-encode the tool result payload.
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch (_) {
          /* keep first parse */
        }
      }
      return parsed;
    } catch (_) {
      return raw;
    }
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
      const result = await executeNamed(name, args);
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

  function renderTourScene() {
    const scene = TOUR_SCENES[tourIndex];
    if (!scene) return;
    if (els.tourKicker) {
      els.tourKicker.textContent = `Scene ${tourIndex + 1} of ${TOUR_SCENES.length}`;
    }
    if (els.tourHeading) els.tourHeading.textContent = scene.title;
    if (els.tourSay) els.tourSay.textContent = scene.say;
    if (els.tourDo) els.tourDo.textContent = scene.do;
    if (els.tourBar) {
      els.tourBar.style.width = `${((tourIndex + 1) / TOUR_SCENES.length) * 100}%`;
    }
    if (els.tourNext) {
      els.tourNext.textContent =
        tourIndex === TOUR_SCENES.length - 1 ? 'Run final scene' : 'Run this scene';
    }
  }

  function startTour() {
    tourActive = true;
    tourIndex = 0;
    if (els.tourRoot) {
      els.tourRoot.hidden = false;
      els.tourRoot.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (els.tourOutput) {
      els.tourOutput.textContent = 'Press “Run this scene” and narrate the Say line while it executes.';
    }
    renderTourScene();
    log('Video tour started');
  }

  function stopTour() {
    tourActive = false;
    if (els.tourRoot) els.tourRoot.hidden = true;
    log('Video tour stopped');
  }

  async function runTourScene() {
    if (!tourActive || tourIndex >= TOUR_SCENES.length) {
      startTour();
      return;
    }
    const scene = TOUR_SCENES[tourIndex];
    if (!scene) return;

    if (els.tourNext) els.tourNext.disabled = true;
    if (els.tourOutput) els.tourOutput.textContent = 'Running scene…';

    if (scene.tool && els.toolSelect) {
      els.toolSelect.value = scene.tool;
      onToolChange();
      if (els.args) els.args.value = pretty(scene.args || {});
    }

    try {
      let result;
      if (typeof scene.run === 'function') {
        result = await scene.run();
      } else {
        log(`tour executeTool(${scene.tool})`);
        result = await executeNamed(scene.tool, scene.args || {});
        if (els.output) els.output.textContent = pretty(result);
      }
      if (els.tourOutput) els.tourOutput.textContent = pretty(result);
      log(`Tour scene OK: ${scene.title}`);

      if (tourIndex < TOUR_SCENES.length - 1) {
        tourIndex += 1;
        renderTourScene();
      } else {
        tourIndex = TOUR_SCENES.length;
        if (els.tourNext) els.tourNext.textContent = 'Replay tour';
        if (els.tourOutput) {
          els.tourOutput.textContent =
            `${pretty(result)}\n\n— Tour complete. Next: /webmcp/setup for launch steps, or /webmcp/submit to list your site.`;
        }
      }
    } catch (err) {
      if (els.tourOutput) els.tourOutput.textContent = String(err && err.stack ? err.stack : err);
      log(`Tour scene FAIL: ${err.message || err}`);
    } finally {
      if (els.tourNext) els.tourNext.disabled = false;
    }
  }

  function skipTourScene() {
    if (!tourActive) return;
    if (tourIndex < TOUR_SCENES.length - 1) {
      tourIndex += 1;
      renderTourScene();
      if (els.tourOutput) els.tourOutput.textContent = 'Skipped. Run the next scene when ready.';
    } else {
      stopTour();
    }
  }

  function wireTour() {
    if (els.tourStart) els.tourStart.addEventListener('click', startTour);
    if (els.tourNext) els.tourNext.addEventListener('click', runTourScene);
    if (els.tourSkip) els.tourSkip.addEventListener('click', skipTourScene);
    if (els.tourStop) els.tourStop.addEventListener('click', stopTour);

    const params = new URLSearchParams(window.location.search);
    if (params.get('tour') === '1' || params.get('tour') === 'true') {
      startTour();
    }
  }

  function init() {
    if (els.toolSelect) els.toolSelect.addEventListener('change', onToolChange);
    if (els.run) els.run.addEventListener('click', runSelected);
    if (els.refresh) els.refresh.addEventListener('click', refresh);
    wirePresets();
    wireTour();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
