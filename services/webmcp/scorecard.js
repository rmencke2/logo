'use strict';

/**
 * Heuristic scorecard for scanned WebMCP sites.
 */

function hasConstrainedInput(schema) {
  if (!schema || typeof schema !== 'object') return false;
  const props = schema.properties || {};
  const keys = Object.keys(props);
  if (!keys.length && Array.isArray(schema.required) && schema.required.length) return true;
  for (const key of keys) {
    const p = props[key] || {};
    if (p.enum || p.minimum != null || p.maximum != null || p.minLength != null || p.maxLength != null || p.pattern) {
      return true;
    }
    if (p.type && p.type !== 'string') return true;
    if (p.description && String(p.description).length > 8) return true;
  }
  return keys.length > 0;
}

function gradeFromScore(score) {
  if (score >= 92) return { grade: 'A+', label: 'Excellent' };
  if (score >= 86) return { grade: 'A', label: 'Excellent' };
  if (score >= 80) return { grade: 'A-', label: 'Very good' };
  if (score >= 74) return { grade: 'B+', label: 'Good' };
  if (score >= 68) return { grade: 'B', label: 'Good' };
  if (score >= 60) return { grade: 'B-', label: 'Fair' };
  if (score >= 50) return { grade: 'C', label: 'Needs work' };
  if (score >= 35) return { grade: 'D', label: 'Weak' };
  return { grade: 'F', label: 'Not ready' };
}

function buildScorecard({ tools = [], pagesScanned = 0, crashes = 0, host }) {
  const findings = [];
  let score = 40;
  const toolCount = tools.length;
  const pagesWithTools = new Set(tools.map((t) => t.page_url || '/')).size;
  const withInput = tools.filter((t) => hasConstrainedInput(t.input_schema || t.inputSchema)).length;
  const withOutput = tools.filter((t) => t.output_schema || t.outputSchema).length;
  const clearNames = tools.filter((t) => /^[a-z][a-z0-9_:-]{2,64}$/i.test(String(t.name || ''))).length;
  const kinds = { answer: 0, act: 0, transact: 0, unknown: 0 };
  for (const t of tools) {
    const k = String(t.kind || 'unknown');
    kinds[k] = (kinds[k] || 0) + 1;
  }

  if (toolCount === 0) {
    findings.push({ tone: 'bad', text: 'No WebMCP tools detected on scanned pages' });
    score = Math.max(5, score - 35);
  } else {
    findings.push({ tone: 'good', text: `${toolCount} tool${toolCount === 1 ? '' : 's'} detected` });
    score += Math.min(30, toolCount * 4);
  }

  if (clearNames === toolCount && toolCount > 0) {
    findings.push({ tone: 'good', text: 'Clear tool names' });
    score += 6;
  } else if (toolCount > 0) {
    findings.push({ tone: 'warn', text: 'Some tool names are unclear or non-idiomatic' });
  }

  if (toolCount > 0 && withInput >= Math.ceil(toolCount * 0.6)) {
    findings.push({ tone: 'good', text: 'Good input constraints / descriptions on most tools' });
    score += 10;
  } else if (toolCount > 0) {
    findings.push({ tone: 'warn', text: 'Input schemas are thin — add property descriptions and constraints' });
  }

  if (toolCount > 0 && withOutput === 0) {
    findings.push({ tone: 'bad', text: 'No result/output schemas on any tool' });
    score -= 8;
  } else if (withOutput > 0) {
    findings.push({ tone: 'good', text: `Output schemas present on ${withOutput} tool${withOutput === 1 ? '' : 's'}` });
    score += 8;
  }

  if (pagesScanned <= 1 || pagesWithTools <= 1) {
    if (toolCount > 0) {
      findings.push({ tone: 'bad', text: 'Single-page coverage only — register tools on key routes too' });
      score -= 6;
    }
  } else {
    findings.push({
      tone: 'good',
      text: `Tools observed across ${pagesWithTools} pages (${pagesScanned} scanned)`,
    });
    score += 8;
  }

  if (crashes > 0) {
    findings.push({ tone: 'bad', text: `${crashes} page crash${crashes === 1 ? '' : 'es'} during scan` });
    score -= Math.min(20, crashes * 8);
  } else {
    findings.push({ tone: 'good', text: 'No page crashes during scan' });
    score += 4;
  }

  if (kinds.act > 0 || kinds.transact > 0) {
    findings.push({
      tone: 'good',
      text: `Includes actionable tools (act: ${kinds.act}, transact: ${kinds.transact})`,
    });
    score += 4;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const { grade, label } = gradeFromScore(score);
  const stars = Math.max(1, Math.min(5, Math.round(score / 20)));
  const toolNotes = buildPerToolNotes(tools);
  const nextActions = buildNextActions({ tools, withOutput, pagesWithTools, pagesScanned, crashes });
  const summary = buildSummary({ grade, label, toolCount, withOutput, pagesWithTools, host });

  return {
    host: host || null,
    score,
    grade,
    label,
    stars,
    summary,
    findings,
    tool_notes: toolNotes,
    next_actions: nextActions,
    metrics: {
      tool_count: toolCount,
      pages_scanned: pagesScanned,
      pages_with_tools: pagesWithTools,
      crashes,
      tools_with_input_constraints: withInput,
      tools_with_output_schema: withOutput,
      kinds,
    },
    graded_at: new Date().toISOString().slice(0, 10),
  };
}

function buildPerToolNotes(tools = []) {
  return tools.map((t) => {
    const schema = t.input_schema || t.inputSchema || {};
    const hasOut = Boolean(t.output_schema || t.outputSchema);
    const constrained = hasConstrainedInput(schema);
    const issues = [];
    const wins = [];
    if (!hasOut) issues.push('Add an outputSchema so agents know the return shape');
    else wins.push('Has output schema');
    if (!constrained) issues.push('Tighten inputSchema (descriptions, enums, bounds)');
    else wins.push('Useful input constraints');
    if (!t.description || String(t.description).length < 24) {
      issues.push('Expand the description with when/why to call this tool');
    } else {
      wins.push('Clear description');
    }
    if (/navigate|path/i.test(t.name) && !(schema.properties?.path?.enum || schema.properties?.path?.pattern)) {
      issues.push('Constrain path with enum or pattern, not prose alone');
    }
    const status = issues.length === 0 ? 'strong' : hasOut && constrained ? 'ok' : 'improve';
    return {
      name: t.name,
      kind: t.kind || 'unknown',
      page_url: t.page_url || '/',
      status,
      headline:
        status === 'strong'
          ? 'Ready for agents'
          : status === 'ok'
            ? 'Solid — one upgrade left'
            : issues[0],
      wins,
      issues,
    };
  });
}

function buildNextActions({ tools, withOutput, pagesWithTools, pagesScanned, crashes }) {
  const actions = [];
  if (tools.length && withOutput < tools.length) {
    actions.push({
      priority: 1,
      text: `Add outputSchema to ${tools.length - withOutput} tool${tools.length - withOutput === 1 ? '' : 's'} so agents stop guessing return shapes.`,
    });
  }
  if (pagesWithTools <= 1 && tools.length) {
    actions.push({
      priority: 2,
      text: 'Register tools on more than one route (home, product, checkout, docs) for real multi-page coverage.',
    });
  }
  if (crashes > 0) {
    actions.push({
      priority: 1,
      text: 'Fix page crashes seen during the scan before promoting this listing.',
    });
  }
  actions.push({
    priority: 3,
    text: 'Add 2–3 suggested agent journeys on your site (or reuse Influzer’s demo pattern) so testers know what to ask.',
  });
  if (pagesScanned >= 1) {
    actions.push({
      priority: 4,
      text: 'Rescan after changes to refresh your Influzer verified listing and grade.',
    });
  }
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

function buildSummary({ grade, label, toolCount, withOutput, pagesWithTools, host }) {
  if (!toolCount) {
    return `${host || 'This site'} did not expose detectable WebMCP tools on the pages we scanned. Register document.modelContext tools and rescan.`;
  }
  const schemaBit =
    withOutput === 0
      ? 'The biggest gap: no output schemas — agents must guess return shapes.'
      : withOutput < toolCount
        ? `Output schemas cover ${withOutput}/${toolCount} tools — finish the rest for A-tier reliability.`
        : 'Output schemas look complete — strong agent ergonomics.';
  const coverageBit =
    pagesWithTools <= 1
      ? 'Coverage is still concentrated on a single page surface.'
      : `Tools appeared across ${pagesWithTools} pages.`;
  return `${label} (${grade}). We found ${toolCount} tool${toolCount === 1 ? '' : 's'}. ${schemaBit} ${coverageBit}`;
}

function suggestJourneys(tools = [], host = '') {
  const names = tools.map((t) => t.name);
  const journeys = [];
  if (names.some((n) => /stats|overview|about/i.test(n))) {
    journeys.push({
      recommended: true,
      prompt: `Give me an overview of ${host || 'this site'} and the current directory or product stats using the available WebMCP tools.`,
    });
  }
  const searchTool = tools.find((t) => /search/i.test(t.name));
  if (searchTool) {
    journeys.push({
      recommended: journeys.length === 0,
      prompt: `Use ${searchTool.name} to find a few relevant results, then summarize hosts or names you discover.`,
    });
  }
  const nav = tools.find((t) => /navigate|open|goto/i.test(t.name));
  if (nav) {
    journeys.push({
      recommended: false,
      prompt: `List recent content if available, then use ${nav.name} to open a useful first-party path.`,
    });
  }
  if (!journeys.length && tools[0]) {
    journeys.push({
      recommended: true,
      prompt: `Call ${tools[0].name} and explain what an agent can do next on this site.`,
    });
  }
  return journeys.slice(0, 3);
}

module.exports = {
  buildScorecard,
  buildPerToolNotes,
  buildNextActions,
  suggestJourneys,
  gradeFromScore,
  hasConstrainedInput,
};
