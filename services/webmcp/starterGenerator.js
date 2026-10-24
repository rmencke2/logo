'use strict';

/**
 * Heuristic WebMCP starter kit generator from scan results.
 * Produces copy-paste JS + install steps (no LLM).
 */

function slugifyToolName(input, fallback = 'tool') {
  const base = String(input || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return /^[a-z]/.test(base) ? base : `_${base || fallback}`.slice(0, 49);
}

function uniqueName(base, used) {
  let name = slugifyToolName(base);
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let i = 2;
  while (used.has(`${name}_${i}`)) i += 1;
  name = `${name}_${i}`;
  used.add(name);
  return name;
}

function jsonLiteral(value) {
  return JSON.stringify(value, null, 2);
}

function textResult(payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: 'text', text }],
    structuredContent: typeof payload === 'string' ? { text: payload } : payload,
  };
}

function inferSiteProfile(host = '', signals = {}, pages = []) {
  const hay = `${host} ${signals.headings?.join(' ') || ''} ${pages.map((p) => p.title).join(' ')}`.toLowerCase();
  if (/devpost|hackathon|challenge/.test(hay)) return 'hackathons';
  if (/shop|cart|checkout|product|store|ecommerce|e-commerce/.test(hay)) return 'ecommerce';
  if (/docs|documentation|api reference/.test(hay)) return 'docs';
  if (/book|calendar|schedule|appointment/.test(hay)) return 'booking';
  return 'general';
}

function pickNavPaths(signals = {}) {
  const paths = [];
  const seen = new Set();
  for (const link of signals.nav_links || []) {
    const path = link.path || '/';
    if (seen.has(path)) continue;
    seen.add(path);
    paths.push({ path, label: link.text || path });
    if (paths.length >= 12) break;
  }
  if (!paths.length) paths.push({ path: '/', label: 'Home' });
  return paths;
}

function buildSuggestedTools({ host, canonical_url, tools = [], site_signals = {}, pages = [] }) {
  const used = new Set((tools || []).map((t) => t.name));
  const profile = inferSiteProfile(host, site_signals, pages);
  const navPaths = pickNavPaths(site_signals);
  const suggested = [];

  const metaDescription =
    pages.find((p) => p.description)?.description ||
    pages.find((p) => p.title)?.title ||
    `Public website at ${host}`;

  suggested.push({
    name: uniqueName('get_site_overview', used),
    kind: 'answer',
    description: `Return a read-only overview of ${host}: title, description, key headings, and canonical URL.`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    outputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        headings: { type: 'array', items: { type: 'string' } },
        canonical_url: { type: 'string' },
      },
    },
    impl: 'overview',
    meta: { metaDescription, headings: site_signals.headings || [] },
  });

  if (navPaths.length >= 2) {
    const pathEnum = navPaths.map((p) => p.path);
    suggested.push({
      name: uniqueName('navigate_to', used),
      kind: 'act',
      description: `Navigate this browser tab to a first-party path on ${host}.`,
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            enum: pathEnum,
            description: 'Same-origin path to open in this tab.',
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, navigated_to: { type: 'string' } },
      },
      impl: 'navigate',
      meta: { paths: pathEnum },
    });
  }

  const search = (site_signals.search_inputs || [])[0];
  if (search) {
    const searchName =
      profile === 'hackathons' ? uniqueName('search_hackathons', used) : uniqueName('search_site', used);
    suggested.push({
      name: searchName,
      kind: 'act',
      description:
        profile === 'hackathons'
          ? `Search hackathons on ${host} by keyword (navigates to results).`
          : `Run a site search on ${host} by keyword (navigates to results).`,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 1, description: 'Search keywords.' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, query: { type: 'string' }, url: { type: 'string' } },
      },
      impl: 'search',
      meta: {
        inputName: search.name,
        profile,
        searchPath: search.page_url || '/',
        param: /search/i.test(search.name) ? 'search' : 'q',
      },
    });
  }

  for (const form of (site_signals.forms || []).filter((f) => !f.has_declarative_tool).slice(0, 2)) {
    const label = form.legend || form.id || 'form';
    const toolName = uniqueName(`submit_${label}`, used);
    const properties = {};
    const required = [];
    for (const field of form.fields || []) {
      properties[field.name] = {
        type: field.type === 'number' ? 'number' : field.type === 'boolean' ? 'boolean' : 'string',
        description: field.placeholder || field.name,
      };
      if (field.required) required.push(field.name);
    }
    suggested.push({
      name: toolName,
      kind: 'transact',
      description: `Fill and submit the "${label}" form on ${host}. Review values before calling in production.`,
      inputSchema: {
        type: 'object',
        properties,
        required: required.length ? required : undefined,
        additionalProperties: false,
      },
      outputSchema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, submitted: { type: 'boolean' } },
      },
      impl: 'form',
      meta: { formId: form.id, page_url: form.page_url, fields: form.fields || [] },
    });
  }

  if (profile === 'hackathons' && host.includes('devpost')) {
    suggested.push({
      name: uniqueName('open_hackathons_directory', used),
      kind: 'act',
      description: 'Open the Devpost hackathons directory in this tab.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, navigated_to: { type: 'string' } },
      },
      impl: 'navigate_fixed',
      meta: { path: '/hackathons' },
    });
    suggested.push({
      name: uniqueName('open_webmcp_challenge', used),
      kind: 'act',
      description: 'Open the OpenAI WebMCP Challenge submission page on Devpost.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      outputSchema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, navigated_to: { type: 'string' } },
      },
      impl: 'navigate_external',
      meta: { url: 'https://webmcp.devpost.com/' },
    });
  }

  return suggested;
}

function renderToolExecute(tool) {
  switch (tool.impl) {
    case 'overview':
      return `      async execute() {
        const headings = ${jsonLiteral(tool.meta.headings)}.length
          ? ${jsonLiteral(tool.meta.headings)}
          : Array.from(document.querySelectorAll('h1,h2'))
              .map((el) => (el.textContent || '').trim())
              .filter(Boolean)
              .slice(0, 8);
        const payload = {
          host: ${jsonLiteral(tool.meta.host || '')} || window.location.host,
          title: document.title || '',
          description: document.querySelector('meta[name="description"]')?.content || ${jsonLiteral(tool.meta.metaDescription || '')},
          headings,
          canonical_url: window.location.href,
        };
        return textResult(payload);
      }`;
    case 'navigate':
      return `      async execute({ path } = {}) {
        const allowed = ${jsonLiteral(tool.meta.paths)};
        const next = String(path || '').trim();
        if (!allowed.includes(next)) {
          throw new Error('path must be one of: ' + allowed.join(', '));
        }
        window.location.assign(next);
        return textResult({ ok: true, navigated_to: next });
      }`;
    case 'search':
      return `      async execute({ query } = {}) {
        const q = String(query || '').trim();
        if (!q) throw new Error('query is required');
        const url = new URL(window.location.origin + ${jsonLiteral(tool.meta.searchPath || '/')});
        url.search = '';
        url.searchParams.set(${jsonLiteral(tool.meta.param || 'q')}, q);
        window.location.assign(url.toString());
        return textResult({ ok: true, query: q, url: url.toString() });
      }`;
    case 'form':
      return `      async execute(args = {}) {
        const form = ${tool.meta.formId ? `document.getElementById(${jsonLiteral(tool.meta.formId)})` : 'document.querySelector("form")'};
        if (!form) throw new Error('Form not found on this page');
        const data = args || {};
        for (const field of ${jsonLiteral(tool.meta.fields)}) {
          const el = form.querySelector('[name="' + field.name + '"]');
          if (!el || data[field.name] == null) continue;
          if (el.type === 'checkbox') el.checked = Boolean(data[field.name]);
          else el.value = String(data[field.name]);
        }
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
        return textResult({ ok: true, submitted: true });
      }`;
    case 'navigate_fixed':
      return `      async execute() {
        const path = ${jsonLiteral(tool.meta.path)};
        window.location.assign(path);
        return textResult({ ok: true, navigated_to: path });
      }`;
    case 'navigate_external':
      return `      async execute() {
        const href = ${jsonLiteral(tool.meta.url)};
        window.location.assign(href);
        return textResult({ ok: true, navigated_to: href });
      }`;
    default:
      return `      async execute() {
        return textResult({ ok: true, tool: ${jsonLiteral(tool.name)} });
      }`;
  }
}

function renderStarterJs({ host, canonical_url, toolsSuggested }) {
  const hostLiteral = jsonLiteral(host);
  const blocks = toolsSuggested.map((tool) => {
    const outputSchemaBlock = tool.outputSchema
      ? `\n      outputSchema: ${jsonLiteral(tool.outputSchema)},`
      : '';
    return `    await document.modelContext.registerTool({
      name: ${jsonLiteral(tool.name)},
      description: ${jsonLiteral(tool.description)},${outputSchemaBlock}
      inputSchema: ${jsonLiteral(tool.inputSchema)},
${renderToolExecute(tool)}
    });`;
  });

  return `/**
 * WebMCP starter kit for ${host}
 * Generated by Influzer.ai — https://www.influzer.ai/webmcp/submit
 *
 * Install: paste before </body> or bundle into your site JS.
 * Spec: https://github.com/webmachinelearning/webmcp
 */
(function () {
  'use strict';

  function textResult(payload) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    return {
      content: [{ type: 'text', text }],
      structuredContent: typeof payload === 'string' ? { text: payload } : payload,
    };
  }

  async function registerTools() {
    if (!document.modelContext || typeof document.modelContext.registerTool !== 'function') {
      console.warn('[webmcp-starter] document.modelContext.registerTool unavailable');
      return;
    }

${blocks.join('\n\n')}

    console.info('[webmcp-starter] registered ${toolsSuggested.length} tools for ' + ${hostLiteral});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => registerTools().catch(console.error));
  } else {
    registerTools().catch(console.error);
  }
})();
`;
}

function buildInstallSteps({ host, existingToolCount, toolsSuggested }) {
  const steps = [
    'Copy webmcp-starter.js into your project (or paste the script block before </body> on each page that should expose tools).',
    'Ensure the script loads on key routes (home, search, primary flows) — not only the landing page.',
    'Test in ChatGPT in-app browser or Chrome with chrome://flags/#enable-webmcp-testing enabled.',
    'In DevTools, run: await document.modelContext.getTools() — you should see ' +
      `${toolsSuggested.length} tool(s).`,
    `Rescan at https://www.influzer.ai/webmcp/submit to refresh your Influzer listing and Agent Readiness grade.`,
  ];
  if (existingToolCount > 0) {
    steps.unshift(
      `This site already exposes ${existingToolCount} WebMCP tool(s). Merge these starter tools with your existing registerTool() calls — do not duplicate names.`,
    );
  } else {
    steps.unshift(`No WebMCP tools were detected on ${host} during the scan — this starter creates an initial agent surface.`);
  }
  return steps;
}

function estimateGradeAfter({ toolsSuggested, existingToolCount, pagesScanned }) {
  const total = toolsSuggested.length + existingToolCount;
  if (total >= 4 && pagesScanned >= 2) return 'R3';
  if (total >= 2) return 'R2';
  return 'R1';
}

/**
 * @param {object} scanResult - completed scan payload (+ optional scorecard)
 * @returns {object} starter kit
 */
function buildWebmcpStarter(scanResult = {}) {
  const host = scanResult.host || 'example.com';
  const canonical_url = scanResult.canonical_url || `https://${host}/`;
  const existingTools = scanResult.tools || [];
  const site_signals = scanResult.site_signals || {};
  const pages = scanResult.pages || [];

  const toolsSuggested = buildSuggestedTools({
    host,
    canonical_url,
    tools: existingTools,
    site_signals,
    pages,
  });

  for (const t of toolsSuggested) {
    if (t.impl === 'overview') t.meta.host = host;
  }

  const starter_js = renderStarterJs({ host, canonical_url, toolsSuggested });
  const install_steps = buildInstallSteps({
    host,
    existingToolCount: existingTools.length,
    toolsSuggested,
  });
  const estimated_grade_after = estimateGradeAfter({
    toolsSuggested,
    existingToolCount: existingTools.length,
    pagesScanned: scanResult.pages_scanned || pages.length,
  });

  return {
    host,
    canonical_url,
    generated_at: new Date().toISOString(),
    existing_tool_count: existingTools.length,
    tools_suggested: toolsSuggested.map(({ name, description, kind, inputSchema, outputSchema }) => ({
      name,
      description,
      kind,
      input_schema: inputSchema,
      output_schema: outputSchema || null,
    })),
    tool_count: toolsSuggested.length,
    estimated_grade_after,
    install_steps,
    starter_js,
    html_snippet: `<script>\n${starter_js}\n</script>`,
    payment: {
      required: false,
      product: 'webmcp_starter_kit',
      note: 'Stripe checkout can gate starter_js delivery — currently included free during beta.',
    },
  };
}

module.exports = {
  buildWebmcpStarter,
  buildSuggestedTools,
  slugifyToolName,
  inferSiteProfile,
};
