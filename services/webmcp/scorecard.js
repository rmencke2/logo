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

  return {
    host: host || null,
    score,
    grade,
    label,
    stars,
    findings,
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
  suggestJourneys,
  gradeFromScore,
  hasConstrainedInput,
};
