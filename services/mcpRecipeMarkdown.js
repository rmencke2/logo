/**
 * Safe Markdown rendering for MCP Recipes.
 * Escapes HTML first; only allows a small Markdown subset. No raw HTML, no embeds.
 */

const SECRET_PATTERNS = [
  {
    id: 'aws-access-key',
    re: /\bAKIA[0-9A-Z]{16}\b/,
    message: 'Looks like an AWS access key ID. Remove credentials before submitting.',
  },
  {
    id: 'aws-secret',
    re: /\b(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[:=]\s*['"]?[A-Za-z0-9/+=]{30,}/i,
    message: 'Looks like an AWS secret key. Remove credentials before submitting.',
  },
  {
    id: 'github-pat',
    re: /\bghp_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    message: 'Looks like a GitHub personal access token. Remove credentials before submitting.',
  },
  {
    id: 'slack-token',
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    message: 'Looks like a Slack token. Remove credentials before submitting.',
  },
  {
    id: 'openai-key',
    re: /\bsk-[A-Za-z0-9]{20,}\b/,
    message: 'Looks like an API secret key. Remove credentials before submitting.',
  },
  {
    id: 'private-key',
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    message: 'Looks like a private key block. Remove credentials before submitting.',
  },
  {
    id: 'generic-secret-assign',
    re: /\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|password|passwd|client_secret)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    message: 'Looks like a hardcoded secret assignment. Use placeholders (e.g. YOUR_API_KEY) instead.',
  },
  {
    id: 'bearer-token',
    re: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i,
    message: 'Looks like a Bearer token. Remove credentials before submitting.',
  },
];

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function validateExternalUrl(url, { allowEmpty = true } = {}) {
  if (url == null || String(url).trim() === '') {
    return allowEmpty ? { ok: true, url: '' } : { ok: false, error: 'URL is required.' };
  }
  const trimmed = String(url).trim();
  if (!isSafeHttpUrl(trimmed)) {
    return { ok: false, error: 'Only http:// or https:// URLs are allowed.' };
  }
  return { ok: true, url: trimmed };
}

function detectSecrets(text) {
  const value = String(text || '');
  const hits = [];
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.re.test(value)) {
      hits.push({ id: pattern.id, message: pattern.message });
    }
  }
  return hits;
}

function scanPayloadForSecrets(parts) {
  const hits = [];
  const seen = new Set();
  for (const part of parts) {
    for (const hit of detectSecrets(part)) {
      if (!seen.has(hit.id)) {
        seen.add(hit.id);
        hits.push(hit);
      }
    }
  }
  return hits;
}

/**
 * Render a limited Markdown subset to safe HTML.
 * Unsupported constructs remain escaped plain text.
 */
function renderSafeMarkdown(source) {
  const raw = String(source || '').replace(/\r\n/g, '\n');
  if (!raw.trim()) return '';

  const codeBlocks = [];
  let text = raw.replace(/```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: String(lang || '').slice(0, 32), code: code.replace(/\n$/, '') });
    return `\n%%CODEBLOCK_${idx}%%\n`;
  });

  text = escapeHtml(text);

  // Inline code
  text = text.replace(/`([^`\n]+)`/g, '<code class="recipe-md__code">$1</code>');

  // Links [text](url) — http(s) only
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const decoded = href
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    if (!isSafeHttpUrl(decoded)) {
      return label;
    }
    return `<a href="${escapeHtml(decoded)}" rel="noopener noreferrer" target="_blank">${label}</a>`;
  });

  // Bold / italic
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

  const lines = text.split('\n');
  const out = [];
  let inUl = false;
  let inOl = false;
  let inP = false;

  function closeLists() {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  }

  function closeP() {
    if (inP) {
      out.push('</p>');
      inP = false;
    }
  }

  for (const line of lines) {
    const codeMatch = line.trim().match(/^%%CODEBLOCK_(\d+)%%$/);
    if (codeMatch) {
      closeP();
      closeLists();
      const block = codeBlocks[Number(codeMatch[1])];
      const langClass = block.lang ? ` language-${escapeHtml(block.lang)}` : '';
      out.push(
        `<pre class="recipe-md__pre"><code class="recipe-md__codeblock${langClass}">${escapeHtml(block.code)}</code></pre>`,
      );
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeP();
      closeLists();
      const level = heading[1].length;
      out.push(`<h${level} class="recipe-md__h">${heading[2]}</h${level}>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.+)$/);
    if (ul) {
      closeP();
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul class="recipe-md__ul">');
        inUl = true;
      }
      out.push(`<li>${ul[1]}</li>`);
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      closeP();
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol class="recipe-md__ol">');
        inOl = true;
      }
      out.push(`<li>${ol[1]}</li>`);
      continue;
    }

    if (!line.trim()) {
      closeP();
      closeLists();
      continue;
    }

    closeLists();
    if (!inP) {
      out.push('<p class="recipe-md__p">');
      inP = true;
      out.push(line);
    } else {
      out.push('<br />');
      out.push(line);
    }
  }

  closeP();
  closeLists();
  return out.join('\n');
}

module.exports = {
  escapeHtml,
  isSafeHttpUrl,
  validateExternalUrl,
  detectSecrets,
  scanPayloadForSecrets,
  renderSafeMarkdown,
  SECRET_PATTERNS,
};
