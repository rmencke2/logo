/**
 * High-precision source-safety checks for MCP listings.
 *
 * This is not a SkillSpector clone and not a "safe to install" badge.
 * It flags tool-poisoning / hidden-instruction patterns in text we already
 * store (submissions + live tools/list), so junk is reviewed instead of
 * published quietly.
 */

const ZERO_WIDTH_RE = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/;
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/;
const DATA_URI_RE = /data:(?:text|application)\//i;
const JS_URI_RE = /javascript\s*:/i;
const INJECTION_RE =
  /\b(ignore(?:\s+all)?\s+previous\s+instructions|you are now|system prompt|before using this tool,?\s*(?:please\s+)?(?:ignore|disregard)|do not follow (?:the )?(?:user|developer))\b/i;
const LONG_BASE64_RE = /(?:[A-Za-z0-9+/]{80,}={0,2})/;
const MIXED_SCRIPT_RE = /(?=.*[A-Za-z])(?=.*[\u0400-\u04FF])/;

function clipExcerpt(text, max = 120) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function pushFinding(findings, finding) {
  findings.push({
    id: finding.id,
    severity: finding.severity,
    title: finding.title,
    field: finding.field,
    excerpt: clipExcerpt(finding.excerpt || ''),
  });
}

function scanText(text, field) {
  const findings = [];
  const value = String(text || '');
  if (!value) return findings;

  if (ZERO_WIDTH_RE.test(value)) {
    pushFinding(findings, {
      id: 'hidden-unicode',
      severity: 'high',
      title: 'Hidden or bidirectional Unicode in text',
      field,
      excerpt: value,
    });
  }
  if (HTML_COMMENT_RE.test(value)) {
    pushFinding(findings, {
      id: 'html-comment',
      severity: 'high',
      title: 'HTML comment in tool or listing text',
      field,
      excerpt: value,
    });
  }
  if (DATA_URI_RE.test(value) || JS_URI_RE.test(value)) {
    pushFinding(findings, {
      id: 'suspicious-uri',
      severity: 'high',
      title: 'Embedded data: or javascript: URI',
      field,
      excerpt: value,
    });
  }
  if (INJECTION_RE.test(value)) {
    pushFinding(findings, {
      id: 'instruction-override',
      severity: 'high',
      title: 'Instruction-override language in a description',
      field,
      excerpt: value,
    });
  }
  if (LONG_BASE64_RE.test(value.replace(/\s+/g, ''))) {
    pushFinding(findings, {
      id: 'opaque-payload',
      severity: 'medium',
      title: 'Long opaque base64-like payload in text',
      field,
      excerpt: value,
    });
  }
  if (MIXED_SCRIPT_RE.test(value) && field.startsWith('tools[')) {
    pushFinding(findings, {
      id: 'mixed-script',
      severity: 'medium',
      title: 'Mixed Latin/Cyrillic characters (possible homoglyph)',
      field,
      excerpt: value,
    });
  }
  return findings;
}

function scanTools(tools) {
  const findings = [];
  (Array.isArray(tools) ? tools : []).forEach((tool, index) => {
    const name = tool?.name || '';
    const description = tool?.description || '';
    findings.push(...scanText(name, `tools[${index}].name`));
    findings.push(...scanText(description, `tools[${index}].description`));
  });
  return findings;
}

function scanListingText({ description, setupInstructions, additionalNotes, tools } = {}) {
  const findings = [
    ...scanText(description, 'description'),
    ...scanText(setupInstructions, 'setupInstructions'),
    ...scanText(additionalNotes, 'additionalNotes'),
    ...scanTools(tools),
  ];
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  return {
    scannedAt: new Date().toISOString(),
    highCount,
    mediumCount,
    findings,
  };
}

function stripHiddenUnicode(text) {
  return String(text || '').replace(ZERO_WIDTH_RE, '');
}

function sanitizeTool(tool) {
  if (!tool || typeof tool !== 'object') return tool;
  return {
    ...tool,
    name: stripHiddenUnicode(tool.name || ''),
    description: stripHiddenUnicode(tool.description || ''),
  };
}

function sanitizeTools(tools) {
  return (Array.isArray(tools) ? tools : []).map(sanitizeTool);
}

module.exports = {
  scanText,
  scanTools,
  scanListingText,
  stripHiddenUnicode,
  sanitizeTool,
  sanitizeTools,
};
